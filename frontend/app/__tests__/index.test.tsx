import AsyncStorage from '@react-native-async-storage/async-storage';
import renderer, { act } from 'react-test-renderer';
import Home from '../index';
import { featureDestinations } from '../../src/features/catalog';
import type { HomeNode } from '../../src/data/node-config';
import { queryClient } from '../../src/data';

const savedNode: HomeNode = {
  baseUrl: 'http://192.168.1.20:3000',
  savedAtMs: 1_700_000_000_000,
  discovery: {
    status: 'ok',
    node: {
      serverId: `jbs1${'a'.repeat(52)}`,
      serverKey: 'AA==',
      displayName: 'Dhaka home node',
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
  },
};

const originalFetch = globalThis.fetch;

beforeAll(() => {
  globalThis.fetch = jest.fn().mockRejectedValue(new Error('offline in test'));
});

afterAll(() => {
  queryClient.clear();
  globalThis.fetch = originalFetch;
});

afterEach(() => {
  queryClient.clear();
});

async function renderHome(): Promise<renderer.ReactTestRenderer> {
  let view!: renderer.ReactTestRenderer;
  await act(async () => {
    view = renderer.create(<Home />);
    await Promise.resolve();
  });
  return view;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('jb.home-node.v1', JSON.stringify(savedNode));
});

describe('Home', () => {
  it('asks for a home server when this device has none', async () => {
    await AsyncStorage.clear();
    const view = await renderHome();
    expect(
      view.root.findAllByProps({ accessibilityLabel: 'Home server address' }),
    ).not.toHaveLength(0);
    act(() => view.unmount());
  });

  it('renders the ambient trust and reach shell for a saved node', async () => {
    const view = await renderHome();
    expect(
      view.root.findAllByProps({ accessibilityLabel: 'Network reach: Constrained' }),
    ).not.toHaveLength(0);
    expect(view.root.findAllByProps({ accessibilityLabel: 'Profile' })).not.toHaveLength(0);
    act(() => view.unmount());
  });

  it.each(featureDestinations)(
    'opens the $title destination from the app shell',
    async ({ title, id }) => {
      const view = await renderHome();
      act(() => {
        view.root.findByProps({ accessibilityLabel: 'Profile' }).props.onPress();
      });
      act(() => {
        view.root.findByProps({ accessibilityLabel: `Open ${title}` }).props.onPress();
      });
      expect(
        view.root.findAll(
          (node) => node.props.accessibilityRole === 'header' && node.props.children === title,
        ),
      ).not.toHaveLength(0);
      if (id === 'proofs') {
        expect(view.root.findAllByProps({ accessibilityLabel: 'Back' })).not.toHaveLength(0);
      }
      act(() => view.unmount());
    },
  );
});
