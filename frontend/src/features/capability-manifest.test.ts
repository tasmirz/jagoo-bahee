import { capabilityManifest, capabilityForDomain } from './capability-manifest';

describe('capability manifest', () => {
  it('assigns all registered actions to one plane and contextual surface', () => {
    expect(capabilityManifest).toHaveLength(49);
    expect(new Set(capabilityManifest.map((entry) => entry.domain)).size).toBe(49);
    expect(capabilityManifest.every((entry) => entry.route && entry.surface)).toBe(true);
    expect(capabilityForDomain('jb:community:create:v1')?.route).toBe('/community/create');
    expect(capabilityForDomain('jb:broadcast:revoke:v1')?.plane).toBe('signal');
  });
});
