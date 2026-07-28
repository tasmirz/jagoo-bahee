/**
 * T0.17 / P0-G4 — THE v1 REGRESSION. This is the bug the rebuild exists to foreclose.
 *
 * ── What went wrong in v1 ────────────────────────────────────────────────────────────
 * v1's verifier accepted a signature that was valid over EITHER of two canonical forms:
 * the current one, and a "legacy" one that omitted `url`, `attachment_ids` and `poll`.
 * The fallback existed so old clients kept working. Its effect was that a signature the
 * user produced over a plain text post ALSO validated a post carrying an attacker-chosen
 * URL and arbitrary attachments — and the verification UI showed a green check on the
 * forgery, because the signature really did verify against one of the accepted forms.
 *
 * The user signed "Hello world". The network showed "Hello world" plus a link to
 * evil.example, with a valid-signature badge and the user's name on it.
 *
 * ── Why the fix is structural, not a patch ───────────────────────────────────────────
 * The defect was not a bad comparison — it was accepting more than one canonical form.
 * EN-02 permits exactly one form per version. A verifier that cannot parse a version
 * rejects it and never guesses. That is why `canonicalBytes` has no options, no legacy
 * branch, and no fallback chain: there is nothing to fall back TO.
 *
 * The body bytes are opaque to the envelope encoder, so this test works at the level that
 * actually matters — two different bodies produce two different signed byte strings, and
 * a signature over one cannot be lifted onto the other.
 *
 * Specification: Plans/02-CONTRACTS-CORE.md §2, CLAUDE.md §4.1
 */

import { describe, expect, it } from 'vitest';
import { canonicalBytes } from '../core/canonical.js';
import { contentIdFromCanonical } from '../core/content-id.js';
import { derivePublicKey, sign, verify } from '../crypto/ed25519.js';
import { envelope } from './fixtures.js';

const SEED = new Uint8Array(32).fill(23);
const PUBLIC_KEY = derivePublicKey(SEED);

/** A PostCreate body carrying only a title — what the user actually wrote. */
const sparse = { ...envelope('field-omission-sparse'), author_key: PUBLIC_KEY };
/** The same title, plus an attacker-appended `url` field — what v1 would have shown. */
const populated = { ...envelope('field-omission-populated'), author_key: PUBLIC_KEY };

describe('field-omission signature confusion (P0-G4) — the v1 regression', () => {
  it('the populated body is a strict superset of the sparse one', () => {
    // The attack shape: same leading bytes, extra fields appended. If the encoder ever
    // grew a "tolerate trailing fields" mode, this is the input that would exploit it.
    expect(populated.body.length).toBeGreaterThan(sparse.body.length);
    expect(populated.body.slice(0, sparse.body.length)).toEqual(sparse.body);
  });

  it('the two bodies produce different canonical bytes and content IDs', () => {
    const cs = canonicalBytes(sparse);
    const cp = canonicalBytes(populated);
    expect(cs).not.toEqual(cp);
    expect(contentIdFromCanonical(cs)).not.toBe(contentIdFromCanonical(cp));
  });

  it('a signature over the sparse body does NOT verify the populated body', () => {
    // In v1 this assertion was `true`. That is the whole bug, in one line.
    const signature = sign(canonicalBytes(sparse), SEED);

    expect(verify(signature, canonicalBytes(sparse), PUBLIC_KEY)).toBe(true);
    expect(verify(signature, canonicalBytes(populated), PUBLIC_KEY)).toBe(false);
  });

  it('nor does a signature over the populated body verify the sparse one', () => {
    const signature = sign(canonicalBytes(populated), SEED);

    expect(verify(signature, canonicalBytes(populated), PUBLIC_KEY)).toBe(true);
    expect(verify(signature, canonicalBytes(sparse), PUBLIC_KEY)).toBe(false);
  });

  it('truncating the signed bytes does not verify either — there is no legacy form', () => {
    // Guards the specific v1 shape: "try the shorter encoding too". There must be no
    // prefix of the canonical bytes that a signature over the full bytes also validates.
    const full = canonicalBytes(populated);
    const signature = sign(full, SEED);

    for (const cut of [1, 2, 8, 16]) {
      expect(verify(signature, full.slice(0, full.length - cut), PUBLIC_KEY)).toBe(false);
    }
  });
});
