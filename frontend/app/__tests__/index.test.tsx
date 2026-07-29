import * as mockReact from 'react';
import { Text as mockTextComponent } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { QueryClientProvider } from '@tanstack/react-query';
import BootstrapRoute from '../index';
import { useApp } from '../../src/application/app-provider';
import { queryClient } from '../../src/data';
import type { HomeNode } from '../../src/data/node-config';
import { featureDestinations } from '../../src/features/catalog';
import { FeatureScreen } from '../../src/features/forum';
import { palettes } from '../../src/theme';

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { readonly href: string }) => {
    return mockReact.createElement(mockTextComponent, {
      accessibilityLabel: `Redirect to ${href}`,
    });
  },
}));

jest.mock('../../src/application/app-provider', () => ({
  useApp: jest.fn(),
}));

const mockUseApp = useApp as jest.MockedFunction<typeof useApp>;
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
    endpoints: { federations: '/federations', verify: '/verify', status: '/status' },
  },
};

const originalFetch = globalThis.fetch;

beforeAll(() => {
  globalThis.fetch = jest.fn().mockRejectedValue(new Error('offline in test'));
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

afterEach(() => {
  queryClient.clear();
});

function appValue(homeNode: HomeNode | null | undefined) {
  return {
    colors: palettes.light,
    connectHomeNode: jest.fn(async () => undefined),
    disconnectHomeNode: jest.fn(async () => undefined),
    homeNode,
    locale: 'en' as const,
    reach: 'constrained' as const,
    refreshHomeNode: jest.fn(async () => undefined),
    scope: null,
    setLocale: jest.fn(async () => undefined),
    setThemePreference: jest.fn(async () => undefined),
    themeMode: 'light' as const,
    themePreference: 'system' as const,
  };
}

describe('bootstrap route', () => {
  it('asks for a home server on a new device', async () => {
    mockUseApp.mockReturnValue(appValue(null));
    let view!: renderer.ReactTestRenderer;
    await act(async () => {
      view = renderer.create(<BootstrapRoute />);
    });
    expect(view.root.findAllByProps({ accessibilityLabel: 'Home server address' })).not.toHaveLength(
      0,
    );
    act(() => view.unmount());
  });

  it('enters the routed app when a home node is configured', async () => {
    mockUseApp.mockReturnValue(appValue(savedNode));
    let view!: renderer.ReactTestRenderer;
    await act(async () => {
      view = renderer.create(<BootstrapRoute />);
    });
    expect(
      view.root.findAllByProps({ accessibilityLabel: 'Redirect to /(tabs)' }),
    ).not.toHaveLength(0);
    act(() => view.unmount());
  });
});

describe('feature destinations', () => {
  it.each(featureDestinations)('renders the $title workspace', async (feature) => {
    let view!: renderer.ReactTestRenderer;
    await act(async () => {
      view = renderer.create(
        <QueryClientProvider client={queryClient}>
          <FeatureScreen
            colors={palettes.light}
            feature={feature}
            homeNode={savedNode}
            onBack={() => undefined}
          />
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });
    expect(
      view.root.findAll(
        (node) =>
          node.props.accessibilityRole === 'header' && node.props.children === feature.title,
      ),
    ).not.toHaveLength(0);
    act(() => view.unmount());
  });
});
