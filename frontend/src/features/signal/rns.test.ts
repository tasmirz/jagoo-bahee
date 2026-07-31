import { fileSystemPath, parseRnsTcpEndpoints } from './rns';

describe('Signal RNS bootstrap parsing', () => {
  it('accepts only explicit TCP relay endpoints', () => {
    expect(parseRnsTcpEndpoints(['tcp://relay.example:4242', 'https://not-rns.example', 'tcp://missing-port'])).toEqual([
      { kind: 'tcp', host: 'relay.example', port: 4242, enabled: true },
    ]);
  });
});

/**
 * `FileSystem.documentDirectory` is a URI, and the Reticulum runtime calls `os.makedirs` on
 * whatever it is handed. Passing the URI through made Python read `file:///data/...` as a
 * RELATIVE path whose first component is `file:`, resolve it against `/`, and fail with
 * "[Errno 30] Read-only file system: 'file:'" — an error naming the root filesystem for a
 * directory inside the app's own private storage.
 */
describe('fileSystemPath', () => {
  it('strips the scheme Expo puts on its directories', () => {
    expect(fileSystemPath('file:///data/user/0/com.jagoobahee.app/files/jagoo-signal-rns')).toBe(
      '/data/user/0/com.jagoobahee.app/files/jagoo-signal-rns',
    );
  });

  it('produces an absolute path, which is the property Python checks', () => {
    expect(fileSystemPath('file:///data/user/0/pkg/files/x').startsWith('/')).toBe(true);
    expect(fileSystemPath('file:///data/user/0/pkg/files/x')).not.toContain('://');
  });

  it('decodes percent-encoding rather than passing "%20" to the filesystem', () => {
    expect(fileSystemPath('file:///data/My%20Files/rns')).toBe('/data/My Files/rns');
  });

  it('leaves a plain path alone, so calling it twice is safe', () => {
    expect(fileSystemPath('/data/user/0/pkg/files/rns')).toBe('/data/user/0/pkg/files/rns');
  });

  it('does not throw on malformed encoding', () => {
    // A lone '%' is not valid percent-encoding; the raw path is better than an exception on
    // the one call that decides whether the mesh transport can start at all.
    expect(fileSystemPath('file:///data/100%/rns')).toBe('/data/100%/rns');
  });
});
