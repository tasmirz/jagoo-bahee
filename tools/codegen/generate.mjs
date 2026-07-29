#!/usr/bin/env node
/**
 * Contract code generation.
 *
 * `proto/` is the single source of truth (AR-10). This script produces:
 *   1. TypeScript message types from *.proto, via buf + ts-proto
 *   2. The domain registry table in TypeScript, Rust and Python, from registry.yaml
 *
 * RG-02: hand-maintained duplicates of a contract in any language are forbidden.
 * `--check` regenerates into a temp directory and diffs, so a hand-edited generated
 * file fails CI (INF-34, build log L-01).
 *
 *   pnpm proto:gen      regenerate in place
 *   pnpm proto:check    verify the committed output matches
 */

import { execFileSync } from 'node:child_process';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  statSync,
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHECK = process.argv.includes('--check');
// Registry-only changes do not need protoc/Buf. This keeps a contract-policy correction
// reviewable when generated protobuf sources are already current, while the default still
// regenerates every artefact and CI continues to use the full path.
const REGISTRY_ONLY = process.argv.includes('--registry-only');

const REGISTRY_YAML = join(ROOT, 'proto', 'jagoo', 'v1', 'registry.yaml');
const OUT = {
  ts: join(ROOT, 'packages', 'sdk-ts', 'src', 'gen', 'registry.ts'),
  rust: join(ROOT, 'crates', 'jb-core', 'src', 'gen', 'registry.rs'),
  python: join(ROOT, 'tools', 'vectors', 'gen', 'registry.py'),
};

const BANNER_LINES = [
  'GENERATED FILE — DO NOT EDIT.',
  '',
  'Source:    proto/jagoo/v1/registry.yaml',
  'Regenerate: pnpm proto:gen',
  '',
  'RG-02: the registry is generated into each language. Hand-maintained duplicates are',
  'forbidden and caught by `pnpm proto:check`, which regenerates and diffs.',
];

// ── validation ────────────────────────────────────────────────────────────────

const PLANES = new Set(['FORUM', 'SIGNAL']);
const PRIORITIES = new Set(['BROADCAST', 'DIRECT', 'CHECKIN', 'BULK']);
const SCOPE_KINDS = new Set(['COMMUNITY', 'CHANNEL', 'NONE']);
const GATES = new Set(['CREDENTIAL', 'NULLIFIER', 'POW']);
const KEY_ALGS = new Set(['ED25519', 'ML_DSA_44', 'FALCON_512']);

/** PC-01: class 0–2 budgets are hard ceilings, enforced at construction. */
const CLASS_BUDGET = { BROADCAST: 512, DIRECT: 1024, CHECKIN: 512 };
// ADR-013: ML-KEM-768's 1088-byte encapsulation makes the frozen session-init body
// physically impossible inside the ordinary DIRECT ceiling. Only this bootstrap domain
// receives the exception; every subsequent Signal message stays within 1024 bytes.
const DOMAIN_BUDGET = { 'jb:message:session:v1': 2048 };

function validate(rows) {
  const seen = new Set();
  const errors = [];

  for (const r of rows) {
    const at = `domain "${r.domain}"`;
    if (!r.domain || !/^jb:[a-z]+:[a-z:]+:v\d+$/.test(r.domain)) {
      errors.push(`${at}: malformed domain string`);
    }
    if (seen.has(r.domain)) errors.push(`${at}: duplicate row`);
    seen.add(r.domain);

    if (!PLANES.has(r.plane)) errors.push(`${at}: plane must be FORUM or SIGNAL (SEP-03)`);
    if (!PRIORITIES.has(r.priority)) errors.push(`${at}: unknown priority ${r.priority}`);
    if (!SCOPE_KINDS.has(r.scope_kind)) errors.push(`${at}: unknown scope_kind ${r.scope_kind}`);
    if (typeof r.idempotent !== 'boolean') errors.push(`${at}: idempotent must be a boolean`);
    if (r.requires_certificate != null && typeof r.requires_certificate !== 'boolean') {
      errors.push(`${at}: requires_certificate must be a boolean when present`);
    }
    if (r.federate != null && typeof r.federate !== 'boolean') {
      errors.push(`${at}: federate must be a boolean when present`);
    }
    if (r.requires_certificate === false && r.body !== 'jagoo.v1.KeyCertificate') {
      errors.push(`${at}: only KeyCertificate may opt out of the prior-certificate check`);
    }
    if (!r.body?.startsWith('jagoo.v1.')) errors.push(`${at}: body must be a jagoo.v1.* message`);

    for (const g of r.requires ?? []) {
      if (!GATES.has(g)) errors.push(`${at}: unknown anti-abuse gate ${g}`);
    }
    for (const a of r.key_algs ?? []) {
      if (!KEY_ALGS.has(a)) errors.push(`${at}: unknown key_alg ${a}`);
    }

    // KY-05 / AUTH-27: constrained-transport classes must use a 64-byte signature.
    if (r.priority !== 'BULK' && !(r.key_algs ?? []).every((a) => a === 'ED25519')) {
      errors.push(`${at}: KY-05 — ${r.priority} priority requires a 64-byte signature (ED25519)`);
    }

    // PC-01: the declared ceiling may not exceed the class budget.
    const budget = DOMAIN_BUDGET[r.domain] ?? CLASS_BUDGET[r.priority];
    if (budget && r.max_bytes > budget) {
      errors.push(
        `${at}: PC-01 — max_bytes ${r.max_bytes} exceeds the ${r.priority} budget of ${budget}`,
      );
    }

    // SEP-03 is structural: a SIGNAL-plane domain must never be reachable from a
    // FORUM body namespace and vice versa. The check that catches the realistic
    // mistake is a plane/priority mismatch on crisis traffic.
    if (r.domain.includes(':checkin:') && r.credit_cost !== 0) {
      errors.push(`${at}: CR-01/AB-08 — check-in must cost zero credits`);
    }
    if (r.domain.includes(':checkin:') && (r.requires ?? []).length > 0) {
      errors.push(`${at}: CR-01 — check-in must require no credential`);
    }
  }

  if (errors.length) {
    console.error('registry.yaml failed validation:\n' + errors.map((e) => `  · ${e}`).join('\n'));
    process.exit(1);
  }
  return rows;
}

// ── emitters ──────────────────────────────────────────────────────────────────

const banner = (comment) => BANNER_LINES.map((l) => (l ? `${comment} ${l}` : comment)).join('\n');

function emitTs(rows) {
  const entries = rows
    .map(
      (r) => `  {
    domain: '${r.domain}',
    plane: '${r.plane}',
    body: '${r.body}',
    priority: '${r.priority}',
    idempotent: ${r.idempotent},
    scopeKind: '${r.scope_kind}',
    keyAlgs: [${(r.key_algs ?? []).map((a) => `'${a}'`).join(', ')}],
    maxBytes: ${r.max_bytes},
    creditCost: ${r.credit_cost},${
      r.credit_cost_per_mb != null ? `\n    creditCostPerMb: ${r.credit_cost_per_mb},` : ''
    }
    requires: [${(r.requires ?? []).map((g) => `'${g}'`).join(', ')}],
    requiresCertificate: ${r.requires_certificate !== false},
    federate: ${r.federate !== false},
    permission: '${r.permission ?? ''}',
  },`,
    )
    .join('\n');

  return `${banner('//')}

export type RegistryPlane = 'FORUM' | 'SIGNAL';
export type RegistryPriority = 'BROADCAST' | 'DIRECT' | 'CHECKIN' | 'BULK';
export type RegistryScopeKind = 'COMMUNITY' | 'CHANNEL' | 'NONE';
export type RegistryGate = 'CREDENTIAL' | 'NULLIFIER' | 'POW';
export type RegistryKeyAlg = 'ED25519' | 'ML_DSA_44' | 'FALCON_512';

export interface DomainSpec {
  readonly domain: string;
  readonly plane: RegistryPlane;
  readonly body: string;
  readonly priority: RegistryPriority;
  readonly idempotent: boolean;
  readonly scopeKind: RegistryScopeKind;
  readonly keyAlgs: readonly RegistryKeyAlg[];
  readonly maxBytes: number;
  readonly creditCost: number;
  readonly creditCostPerMb?: number;
  readonly requires: readonly RegistryGate[];
  /** Step 10 policy. Only a self-validating KeyCertificate may set this false. */
  readonly requiresCertificate: boolean;
  /** Step 19 policy. False keeps privacy-sensitive projections node-local. */
  readonly federate: boolean;
  readonly permission: string;
}

export const DOMAIN_SPECS: readonly DomainSpec[] = [
${entries}
] as const;

const BY_DOMAIN: ReadonlyMap<string, DomainSpec> = new Map(
  DOMAIN_SPECS.map((s) => [s.domain, s]),
);

/** RG-01: a domain absent from the registry is rejected with UNKNOWN_DOMAIN. */
export function lookupDomain(domain: string): DomainSpec | null {
  return BY_DOMAIN.get(domain) ?? null;
}

export function domainsForPlane(plane: RegistryPlane): readonly DomainSpec[] {
  return DOMAIN_SPECS.filter((s) => s.plane === plane);
}
`;
}

function emitRust(rows) {
  const entries = rows
    .map(
      (r) => `    DomainSpec {
        domain: "${r.domain}",
        plane: Plane::${r.plane === 'FORUM' ? 'Forum' : 'Signal'},
        body: "${r.body}",
        priority: Priority::${pascal(r.priority)},
        idempotent: ${r.idempotent},
        scope_kind: ScopeKind::${pascal(r.scope_kind)},
        max_bytes: ${r.max_bytes},
        credit_cost: ${r.credit_cost},
        requires_certificate: ${r.requires_certificate !== false},
        federate: ${r.federate !== false},
    },`,
    )
    .join('\n');

  return `${banner('//')}

#![allow(dead_code)]

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Plane {
    Forum,
    Signal,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Priority {
    Broadcast,
    Direct,
    Checkin,
    Bulk,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScopeKind {
    Community,
    Channel,
    None,
}

#[derive(Debug, Clone, Copy)]
pub struct DomainSpec {
    pub domain: &'static str,
    pub plane: Plane,
    pub body: &'static str,
    pub priority: Priority,
    pub idempotent: bool,
    pub scope_kind: ScopeKind,
    pub max_bytes: u32,
    pub credit_cost: u32,
    pub requires_certificate: bool,
    pub federate: bool,
}

pub const DOMAIN_SPECS: &[DomainSpec] = &[
${entries}
];

/// RG-01: a domain absent from the registry is rejected with UNKNOWN_DOMAIN.
pub fn lookup_domain(domain: &str) -> Option<&'static DomainSpec> {
    DOMAIN_SPECS.iter().find(|s| s.domain == domain)
}
`;
}

function emitPython(rows) {
  const entries = rows
    .map(
      (r) => `    DomainSpec(
        domain="${r.domain}",
        plane="${r.plane}",
        body="${r.body}",
        priority="${r.priority}",
        idempotent=${r.idempotent ? 'True' : 'False'},
        scope_kind="${r.scope_kind}",
        max_bytes=${r.max_bytes},
        credit_cost=${r.credit_cost},
        requires_certificate=${r.requires_certificate !== false ? 'True' : 'False'},
        federate=${r.federate !== false ? 'True' : 'False'},
    ),`,
    )
    .join('\n');

  return `${banner('#')}

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class DomainSpec:
    domain: str
    plane: str
    body: str
    priority: str
    idempotent: bool
    scope_kind: str
    max_bytes: int
    credit_cost: int
    requires_certificate: bool
    federate: bool


DOMAIN_SPECS: list[DomainSpec] = [
${entries}
]

_BY_DOMAIN = {s.domain: s for s in DOMAIN_SPECS}


def lookup_domain(domain: str) -> Optional[DomainSpec]:
    """RG-01: a domain absent from the registry is rejected with UNKNOWN_DOMAIN."""
    return _BY_DOMAIN.get(domain)
`;
}

const pascal = (s) => s.charAt(0) + s.slice(1).toLowerCase();

// ── run ───────────────────────────────────────────────────────────────────────

function writeOrCheck(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  const rel = relative(ROOT, path);

  if (CHECK) {
    if (!existsSync(path)) {
      console.error(`✗ ${rel} is missing. Run \`pnpm proto:gen\`.`);
      return false;
    }
    if (readFileSync(path, 'utf8') !== content) {
      console.error(`✗ ${rel} is stale or hand-edited. Run \`pnpm proto:gen\` (AR-10).`);
      return false;
    }
    console.log(`✓ ${rel}`);
    return true;
  }

  writeFileSync(path, content, 'utf8');
  console.log(`  wrote ${rel}`);
  return true;
}

function runBuf() {
  const bufBin = process.platform === 'win32' ? 'buf.cmd' : 'buf';
  try {
    execFileSync(bufBin, ['generate'], {
      cwd: ROOT,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
  } catch {
    console.error('✗ `buf generate` failed. Is @bufbuild/buf installed? Run `pnpm install`.');
    process.exit(1);
  }
}

function filesBelow(root, prefix = '') {
  return readdirSync(join(root, prefix))
    .flatMap((name) => {
      const rel = join(prefix, name);
      return statSync(join(root, rel)).isDirectory() ? filesBelow(root, rel) : [rel];
    })
    .sort();
}

/** INF-34: prove the protobuf-generated TypeScript is byte-for-byte current. */
function checkBufOutput() {
  const temp = mkdtempSync(join(tmpdir(), 'jagoo-buf-check-'));
  const bufBin = process.platform === 'win32' ? 'buf.cmd' : 'buf';
  try {
    execFileSync(bufBin, ['generate', '--output', temp], {
      cwd: ROOT,
      stdio: 'pipe',
      shell: process.platform === 'win32',
    });
    const generated = join(temp, 'packages', 'sdk-ts', 'src', 'gen');
    const committed = join(ROOT, 'packages', 'sdk-ts', 'src', 'gen');
    const expectedFiles = filesBelow(generated);
    const committedFiles = filesBelow(committed).filter((path) => path !== 'registry.ts');

    if (
      expectedFiles.length !== committedFiles.length ||
      expectedFiles.some((path, index) => path !== committedFiles[index])
    ) {
      console.error('✗ protobuf-generated file set is stale. Run `pnpm proto:gen`.');
      return false;
    }
    for (const path of expectedFiles) {
      if (!readFileSync(join(generated, path)).equals(readFileSync(join(committed, path)))) {
        console.error(`✗ ${join('packages/sdk-ts/src/gen', path)} is stale or hand-edited.`);
        return false;
      }
    }
    console.log('✓ protobuf-generated TypeScript');
    return true;
  } catch {
    console.error('✗ temporary `buf generate` failed. Is @bufbuild/buf installed?');
    return false;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

function main() {
  const doc = parseYaml(readFileSync(REGISTRY_YAML, 'utf8'));
  const rows = validate(doc.domains ?? []);

  const forum = rows.filter((r) => r.plane === 'FORUM').length;
  const signal = rows.length - forum;
  console.log(`registry: ${rows.length} domains (${forum} FORUM, ${signal} SIGNAL)`);

  if (!CHECK && !REGISTRY_ONLY) runBuf();
  const bufOk = CHECK && !REGISTRY_ONLY ? checkBufOutput() : true;

  const ok = [
    writeOrCheck(OUT.ts, emitTs(rows)),
    writeOrCheck(OUT.rust, emitRust(rows)),
    writeOrCheck(OUT.python, emitPython(rows)),
  ].every(Boolean);

  if (CHECK && (!ok || !bufOk)) process.exit(1);
  if (CHECK) console.log('generated code is in sync with proto/');
}

main();
