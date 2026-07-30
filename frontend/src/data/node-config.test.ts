import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  discoverHomeNode,
  loadHomeNode,
  normaliseNodeAddress,
  saveHomeNode,
  type NodeDiscovery,
} from './node-config';

const discovery: NodeDiscovery = {
  status: 'ok',
  node: {
    serverId: `jbs1${'a'.repeat(52)}`,
    serverKey: 'AA==',
    displayName: 'Local node',
    requestedAddress: 'http://192.168.1.20:3000',
    localAddresses: ['http://192.168.1.20:3000'],
  },
  services: {
    auditLogs: [
      {
        id: 'audit-log-1',
        kind: 'audit-log',
        address: 'http://192.168.1.20:3100',
        host: '192.168.1.20',
        port: 3100,
        available: true,
      },
    ],
    mcaptcha: [],
  },
  endpoints: {
    federations: '/federations',
    verify: '/verify',
    status: '/status',
  },
};

describe('home-node discovery', () => {
  const originalFetch = globalThis.fetch;

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    await AsyncStorage.clear();
  });

  it('normalises the local_ip:port form shown by onboarding', () => {
    expect(normaliseNodeAddress('192.168.1.20:3000')).toBe('http://192.168.1.20:3000');
    expect(() => normaliseNodeAddress('ftp://192.168.1.20')).toThrow('must use HTTP or HTTPS');
  });

  it('calls /health, retains auxiliary services and persists the selected node', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => discovery,
    });
    const node = await discoverHomeNode('192.168.1.20:3000');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://192.168.1.20:3000/health',
      { headers: { Accept: 'application/json' } },
    );
    expect(node.discovery.services.auditLogs[0]?.port).toBe(3100);

    await saveHomeNode(node);
    await expect(loadHomeNode()).resolves.toEqual(node);
  });
});
