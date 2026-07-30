import { encodeSignalIdentityCard, parseSignalIdentityCard } from './identity-card';

const key = new Uint8Array(32).fill(9);

describe('Signal identity cards', () => {
  it('round-trips a key, a name and a server', () => {
    const encoded = encodeSignalIdentityCard({
      identityKey: key,
      displayName: 'Amina Rahman',
      homeServer: 'http://192.168.1.20:3000',
    });
    expect(parseSignalIdentityCard(encoded)).toEqual({
      identityKey: key,
      displayName: 'Amina Rahman',
      homeServer: 'http://192.168.1.20:3000',
    });
  });

  it('carries a key with no name or server', () => {
    const card = parseSignalIdentityCard(
      encodeSignalIdentityCard({ identityKey: key, displayName: '', homeServer: '' }),
    );
    expect(card?.identityKey).toEqual(key);
    expect(card?.displayName).toBe('');
  });

  it('survives base64url characters that would break a plain base64 decode', () => {
    // A key whose base64 contains + and / must round-trip, or roughly one identity in
    // several would fail to scan for no reason a user could ever diagnose.
    const awkward = Uint8Array.from({ length: 32 }, (_, index) => (index * 62) % 256);
    const parsed = parseSignalIdentityCard(
      encodeSignalIdentityCard({ identityKey: awkward, displayName: '', homeServer: '' }),
    );
    expect(parsed?.identityKey).toEqual(awkward);
  });

  it('rejects anything that is not a signal card', () => {
    for (const value of [
      '',
      'hello',
      'https://example.com',
      'jagoo:?url=http://node.example', // the server-address card, a different thing
      'jagoo:signal?n=Amina', // no key
    ]) {
      expect([value, parseSignalIdentityCard(value)]).toEqual([value, null]);
    }
  });

  it('rejects a key of the wrong length rather than accepting a truncated one', () => {
    // A short key would produce a contact that cannot be verified and cannot be reached,
    // and the failure would surface much later as "messages never arrive".
    expect(parseSignalIdentityCard('jagoo:signal?k=AAAA')).toBeNull();
  });

  it('bounds a hostile display name', () => {
    const card = parseSignalIdentityCard(
      `jagoo:signal?k=${'CQ'.repeat(1)}&n=${'x'.repeat(500)}`,
    );
    // Key is invalid here, so the whole card is refused — the name never gets a chance to
    // reach a layout.
    expect(card).toBeNull();
    const valid = parseSignalIdentityCard(
      encodeSignalIdentityCard({ identityKey: key, displayName: 'y'.repeat(500), homeServer: '' }),
    );
    expect(valid?.displayName).toHaveLength(80);
  });
});
