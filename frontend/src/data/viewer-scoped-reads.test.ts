/**
 * Every `/v1/me/*` read must ask for the viewer, or it is answered 401 and rendered as empty.
 *
 * ── The defect this pins ────────────────────────────────────────────────────────────
 * `useNodeDocument` sends the bearer token only when the call passes `{ viewer: true }`. On
 * the node, `/v1/me/*` goes through `actor()` — the STRICT form, which throws 401 without a
 * token — while `/v1/communities/:id` goes through `optionalActor()` and simply omits its
 * viewer fields. So a missing `viewer: true` fails silently in the shape of an empty list:
 * `OfflineApi` falls back to the (empty) cache, `items` is `[]`, and the screen renders
 * "nothing here" to someone who has things there.
 *
 * That is exactly what "I joined this community and it still offers me Join" was:
 * `/v1/me/communities` was fetched anonymously, `joinedIds` was always empty, and no row in
 * the directory could ever show as joined. `/v1/me/saved` had the same bug beside it.
 *
 * A per-screen unit test would not have caught it — each screen renders perfectly well with
 * an empty list. The invariant is about the CALL, so it is checked over the source.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');

function sourceFiles(directory: string): readonly string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) return [];
    return [path];
  });
}

/** The argument text of every `useNodeDocument(...)` call in a file, parentheses balanced. */
function useNodeDocumentCalls(source: string): readonly string[] {
  const calls: string[] = [];
  const opener = /useNodeDocument\s*(?:<[^(]*>)?\s*\(/g;
  let match = opener.exec(source);
  while (match !== null) {
    let depth = 1;
    let index = match.index + match[0].length;
    while (index < source.length && depth > 0) {
      if (source[index] === '(') depth += 1;
      else if (source[index] === ')') depth -= 1;
      index += 1;
    }
    calls.push(source.slice(match.index + match[0].length, index - 1));
    match = opener.exec(source);
  }
  return calls;
}

describe('viewer-scoped reads', () => {
  const files = sourceFiles(SRC);

  it('finds the screens that read the node at all', () => {
    // A scanner that silently matched nothing would pass for ever. This is the control.
    expect(files.filter((file) => useNodeDocumentCalls(readFileSync(file, 'utf8')).length > 0))
      .not.toHaveLength(0);
  });

  it('passes viewer: true to every /v1/me/ read', () => {
    const offenders = files.flatMap((file) =>
      useNodeDocumentCalls(readFileSync(file, 'utf8'))
        .filter((call) => call.includes('/v1/me/') && !/viewer\s*:\s*true/.test(call))
        .map((call) => `${file}: ${call.replace(/\s+/g, ' ').trim()}`),
    );
    expect(offenders).toEqual([]);
  });

  it('rejects a call that omits it', () => {
    // The gate, made to fail on purpose: the scanner must actually see the violation.
    const violating = "const x = useNodeDocument<Page>(baseUrl, '/v1/me/communities');";
    const compliant =
      "const x = useNodeDocument<Page>(baseUrl, '/v1/me/communities', { viewer: true });";
    const flagged = (source: string) =>
      useNodeDocumentCalls(source).some(
        (call) => call.includes('/v1/me/') && !/viewer\s*:\s*true/.test(call),
      );
    expect(flagged(violating)).toBe(true);
    expect(flagged(compliant)).toBe(false);
  });
});
