// Flat ESLint config for the whole workspace.
//
// The architectural rules below are NOT style preferences — each one is a gate from Plans/:
//   AR-01  the core depends on nothing but its own ports          (P0-G6)
//   AR-02  core/domain is pure: deterministic, no I/O, no clock, no random
//   AR-05  the ingress pipeline MUST NOT switch on domain
//   SG-01  no private key in a variable outside the signer boundary
//   NFR-M03 no branch on transport ID outside the transport layer
//
// Enforced in CI by lint, not by discipline. See CLAUDE.md §5.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import importX from 'eslint-plugin-import-x';

// ── Flat-config hazard, learned the hard way (build log L-09) ────────────────────────
// Flat config does NOT merge a rule's options across blocks: the LAST matching block wins
// outright. A later, broader block that sets `no-restricted-imports` therefore ERASES the
// patterns a narrower earlier block set — silently, with no warning and no lint failure.
//
// That is exactly what happened here: the broad signer block matched `backend/src/**` and
// wiped out the AR-01 driver/framework restrictions on `core/domain`, so P0-G6's core
// claim was false while the config *looked* correct.
//
// The fix is compositional. Patterns are declared once below and each block spreads in
// every pattern set that applies to it, with the most specific block LAST.
// `import-boundary.spec.ts` lints a real violating file and fails if any of this regresses.

/** SG-01 — raw key material is reachable only from the signer directories. */
const SIGNER_PATTERNS = [
  {
    group: ['**/signer/internal/**', '**/signer/keys/**', '@jagoo/sdk/signer/internal'],
    message:
      'SG-01: raw key material is reachable only from packages/sdk-ts/src/signer/ and frontend/src/signer/.',
  },
];

/** AR-01 — the core declares ports; adapters implement them. */
const CORE_PATTERNS = [
  {
    group: ['@nestjs/*', 'mongodb', 'mongoose', 'ioredis', 'redis', '@aws-sdk/*', 'fastify'],
    message:
      'AR-01: the core declares ports; adapters implement them. Framework and driver types stay in adapters/. See ADR-002.',
  },
  {
    group: ['**/adapters/**', '**/composition/**'],
    message: 'AR-01: adapters depend on the core, never the reverse.',
  },
];

/** AR-05 / NFR-M03 — the registry dispatches; transports are substitutable. */
const CORE_SYNTAX = [
  {
    selector: 'SwitchStatement[discriminant.property.name="domain"]',
    message:
      'AR-05: no switch on domain in the core. Register a DomainHandler and let DomainRegistry dispatch.',
  },
  {
    selector: 'SwitchStatement[discriminant.name="domain"]',
    message:
      'AR-05: no switch on domain in the core. Register a DomainHandler and let DomainRegistry dispatch.',
  },
  {
    selector: 'SwitchStatement[discriminant.property.name="transportId"]',
    message:
      'NFR-M03: no branch on transport ID outside the transport layer. Every Transport is substitutable (Liskov).',
  },
];

/** Modules the pure domain layer must never reach for. */
const IMPURE_MODULES = [
  'mongodb',
  'mongoose',
  'ioredis',
  'redis',
  '@aws-sdk/*',
  'fastify',
  'express',
  '@nestjs/*',
  // ADR-007: the federation gRPC runtime is an ADAPTER concern. `core/domain` decides who
  // may federate and what a peer may push; it must never learn what a channel is.
  '@grpc/*',
  'nice-grpc',
  'nice-grpc-common',
  'node:fs',
  'node:net',
  'node:http',
  'node:https',
  'node:dns',
  'fs',
  'net',
  'http',
  'https',
  'dns',
];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/node_modules/**',
      '**/.expo/**',
      '**/src/gen/**', // generated from proto/ — never hand-edited (AR-10, build log L-01)
      '**/coverage/**',
      'crates/**',
      'tools/vectors/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    plugins: { 'import-x': importX },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },

  // ── SG-01: the signer boundary ────────────────────────────────────────────
  // No code outside the signer may hold a private key in a variable. In React Native
  // this lint rule replaces the Web Worker isolation the Plans assume — see ADR-003 §5.
  //
  // BROADEST FIRST. The two core blocks below re-declare these patterns because a later
  // block replaces rather than merges — see the note at the top of this file.
  {
    files: ['packages/sdk-ts/src/**/*.ts', 'backend/src/**/*.ts', 'frontend/src/**/*.ts'],
    ignores: ['packages/sdk-ts/src/signer/**', 'frontend/src/signer/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: SIGNER_PATTERNS }],
    },
  },

  // ── AR-01: the whole core is framework-free ───────────────────────────────
  {
    files: ['backend/src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [...SIGNER_PATTERNS, ...CORE_PATTERNS] }],
      // AR-05 / NFR-M02: the pipeline looks the handler up in the registry.
      // A switch on domain means the Open/Closed abstraction has failed.
      'no-restricted-syntax': ['error', ...CORE_SYNTAX],
    },
  },

  // ── AR-01 / AR-02: core/domain is pure ────────────────────────────────────
  // Deterministic given its inputs. No clock reads, no random, no I/O — those are
  // injected ports. This is what makes the validation pipeline and the path selector
  // unit-testable with no infrastructure.
  //
  // MOST SPECIFIC, THEREFORE LAST. It spreads in every pattern set that also applies.
  {
    files: ['backend/src/core/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...SIGNER_PATTERNS,
            ...CORE_PATTERNS,
            {
              group: IMPURE_MODULES,
              message:
                'AR-01/AR-02: core/domain is pure. Drivers, frameworks, and I/O belong in adapters/ behind a port.',
            },
            {
              group: ['**/features/**', '../app/**'],
              message:
                'AR-01: the core depends on nothing but its own ports. Adapters depend on the core, never the reverse.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: 'AR-02: inject the Clock port. core/domain must be deterministic.' },
        { name: 'fetch', message: 'AR-02: core/domain performs no I/O.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'AR-02: inject the RandomSource port.' },
        { object: 'Date', property: 'now', message: 'AR-02: inject the Clock port.' },
      ],
      'no-restricted-syntax': [
        'error',
        ...CORE_SYNTAX,
        {
          selector: 'NewExpression[callee.name="Date"]',
          message: 'AR-02: inject the Clock port. core/domain must be deterministic given its inputs.',
        },
      ],
    },
  },

  // Tests may reach for whatever they need to construct a scenario.
  {
    files: ['**/*.spec.ts', '**/*.test.ts', '**/test/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
      'no-restricted-globals': 'off',
      'no-restricted-properties': 'off',
      'no-restricted-syntax': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
