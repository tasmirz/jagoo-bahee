/**
 * A Signal identity, encoded so it can travel on a screen or a piece of paper.
 *
 * ── Why this exists ────────────────────────────────────────────────────────────────
 * Directory search only finds people your server has heard of. Someone on an unrelated
 * server, or reachable only across a mesh, cannot be found by name at all — and the app's
 * answer to that was to ask the user to read out a 64-character hex key and type it into a
 * field that validated `length !== 64`. A working QR generator and scanner already existed
 * in the mesh pairing screen; it had simply never been pointed at an identity.
 *
 * ── Format ─────────────────────────────────────────────────────────────────────────
 * A `jagoo:` URL, symmetric with the server-address QR the welcome flow already scans:
 *
 *     jagoo:signal?k=<identity key, base64url>&n=<display name>&s=<home server>
 *
 * The KEY is the only load-bearing field. Name and server are conveniences for the
 * receiving UI and are treated as untrusted hints — the key is what gets verified, and a
 * scanned name is shown as "claims to be" until the fingerprint is confirmed. Encoding a
 * name that the scanner then trusted would turn a QR code into an impersonation tool.
 *
 * Pure: no I/O, no crypto, no React. Parsing a hostile string must be testable on its own.
 */

export interface SignalIdentityCard {
  /** Raw 32-byte Ed25519 identity key. */
  readonly identityKey: Uint8Array;
  /** Untrusted display hint. Never shown as verified on its own. */
  readonly displayName: string;
  /** Untrusted home-server hint, used to offer "look this person up there". */
  readonly homeServer: string;
}

const base64urlEncode = (value: Uint8Array): string =>
  globalThis
    .btoa(String.fromCharCode(...value))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');

function base64urlDecode(value: string): Uint8Array | null {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/');
  try {
    return Uint8Array.from(globalThis.atob(padded), (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

export function encodeSignalIdentityCard(card: SignalIdentityCard): string {
  const parameters = new URLSearchParams();
  parameters.set('k', base64urlEncode(card.identityKey));
  if (card.displayName) parameters.set('n', card.displayName);
  if (card.homeServer) parameters.set('s', card.homeServer);
  return `jagoo:signal?${parameters.toString()}`;
}

/**
 * Parse a scanned string. Returns null for ANYTHING that is not a well-formed card —
 * including a valid-looking one whose key is the wrong length, because a truncated key that
 * silently became a contact would be a contact nobody can reach and nobody can verify.
 */
export function parseSignalIdentityCard(value: string): SignalIdentityCard | null {
  const trimmed = value.trim();
  const match = /^jagoo:(?:\/\/)?signal\?(.+)$/i.exec(trimmed);
  if (!match) return null;
  const parameters = new URLSearchParams(match[1]);
  const key = parameters.get('k');
  if (!key) return null;
  const identityKey = base64urlDecode(key);
  if (!identityKey || identityKey.length !== 32) return null;
  return {
    identityKey,
    displayName: (parameters.get('n') ?? '').trim().slice(0, 80),
    homeServer: (parameters.get('s') ?? '').trim(),
  };
}
