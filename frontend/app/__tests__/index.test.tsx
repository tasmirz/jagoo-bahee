import * as mockReact from 'react';
import { Image, Text, Text as mockTextComponent } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import BootstrapRoute from '../index';
import { useApp } from '../../src/application/app-provider';
import { queryClient } from '../../src/data';
import type { HomeNode } from '../../src/data/node-config';
import { featureDestinations } from '../../src/features/catalog';
import { FeatureScreen } from '../../src/features/forum';
import { CommunityCreateScreen } from '../../src/features/communities';
import { palettes } from '../../src/design-system';
import type { ForumSessionSummary } from '../../src/signer';

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { readonly href: string }) => {
    return mockReact.createElement(mockTextComponent, {
      accessibilityLabel: `Redirect to ${href}`,
    });
  },
  // `PageHeader` asks the router whether it can go back before deciding to draw a back control.
  useRouter: () => ({ canGoBack: () => false, back: () => undefined, push: () => undefined }),
}));

jest.mock('../../src/application/app-provider', () => ({
  useApp: jest.fn(),
}));

const mockUseApp = useApp as jest.MockedFunction<typeof useApp>;
const savedNode: HomeNode = {
  baseUrl: 'http://192.168.1.20:3000',
  transport: 'direct',
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

/**
 * `PageHeader` reads real safe-area insets, which only exist under a provider. Production gets
 * one from `app-provider`; a bare `renderer.create` has to supply its own or every screen that
 * uses the shared header throws instead of rendering.
 */
const TEST_INSETS = initialWindowMetrics ?? {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
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

const signedIn: ForumSessionSummary = {
  configured: true,
  unlocked: true,
  authenticated: true,
  signedOut: false,
  identityId: `jb1${'b'.repeat(52)}`,
};

function appValue(
  homeNode: HomeNode | null | undefined,
  session: ForumSessionSummary | null = signedIn,
) {
  return {
    activeProfileId: 'legacy',
    colors: palettes.light,
    connectHomeNode: jest.fn(async () => undefined),
    disconnectHomeNode: jest.fn(async () => undefined),
    forgetIdentityProfile: jest.fn(async () => undefined),
    homeNode,
    identityProfiles: [],
    locale: 'en' as const,
    reach: 'constrained' as const,
    refreshHomeNode: jest.fn(async () => undefined),
    refreshSession: jest.fn(async () => undefined),
    session,
    signOut: jest.fn(async () => undefined),
    scope: null,
    setLocale: jest.fn(async () => undefined),
    setThemePreference: jest.fn(async () => undefined),
    switchIdentity: jest.fn(async () => undefined),
    themeMode: 'light' as const,
    themePreference: 'system' as const,
  };
}

describe('bootstrap route', () => {
  it('starts the recovery-safe identity flow on a new device', async () => {
    mockUseApp.mockReturnValue(appValue(null));
    let view!: renderer.ReactTestRenderer;
    await act(async () => {
      view = renderer.create(<BootstrapRoute />);
    });
    expect(
      view.root.findAll(
        (node) => node.props.accessibilityRole === 'header' && node.props.children === 'Start with an identity',
      ),
    ).not.toHaveLength(0);
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

  it('waits for the launch restore instead of flashing onboarding at a signed-in device', async () => {
    mockUseApp.mockReturnValue(appValue(savedNode, null));
    let view!: renderer.ReactTestRenderer;
    await act(async () => {
      view = renderer.create(<BootstrapRoute />);
    });
    expect(view.root.findAllByProps({ accessibilityLabel: 'Opening Jagoo Bahee' })).not.toHaveLength(0);
    expect(view.root.findAllByProps({ accessibilityLabel: 'Redirect to /(tabs)' })).toHaveLength(0);
    act(() => view.unmount());
  });

  it('shows the mark and the app name at launch, and no progress bar', async () => {
    mockUseApp.mockReturnValue(appValue(savedNode, null));
    let view!: renderer.ReactTestRenderer;
    await act(async () => {
      view = renderer.create(<BootstrapRoute />);
    });
    // A determinate-looking bar over an indeterminate wait misreports progress, and the OS
    // splash this replaces never had one.
    expect(view.root.findAllByProps({ accessibilityRole: 'progressbar' })).toHaveLength(0);
    expect(view.root.findAllByType(Image)).not.toHaveLength(0);
    expect(
      view.root.findAllByType(Text).some((node) => node.props.children === 'Jagoo Bahee'),
    ).toBe(true);
    act(() => view.unmount());
  });

  it('offers sign-in, not registration, when the vault is configured but locked', async () => {
    mockUseApp.mockReturnValue(
      appValue(savedNode, {
        configured: true,
        unlocked: false,
        authenticated: false,
        signedOut: true,
        identityId: `jb1${'b'.repeat(52)}`,
      }),
    );
    let view!: renderer.ReactTestRenderer;
    await act(async () => {
      view = renderer.create(<BootstrapRoute />);
    });
    expect(
      view.root.findAll(
        (node) =>
          node.props.accessibilityRole === 'header' && node.props.children === 'Unlock your identity',
      ),
    ).not.toHaveLength(0);
    expect(view.root.findAllByProps({ accessibilityLabel: 'Redirect to /(tabs)' })).toHaveLength(0);
    act(() => view.unmount());
  });
});

describe('feature destinations', () => {
  it.each(featureDestinations)('renders the $title workspace', async (feature) => {
    let view!: renderer.ReactTestRenderer;
    await act(async () => {
      view = renderer.create(
        <QueryClientProvider client={queryClient}>
          <SafeAreaProvider initialMetrics={TEST_INSETS}>
            <FeatureScreen
              colors={palettes.light}
              mode="light"
              feature={feature}
              homeNode={savedNode}
              onBack={() => undefined}
            />
          </SafeAreaProvider>
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

describe('CommunityCreateScreen', () => {
  it('renders the create-community header and form fields', async () => {
    let view!: renderer.ReactTestRenderer;
    await act(async () => {
      view = renderer.create(
        <QueryClientProvider client={queryClient}>
          <SafeAreaProvider initialMetrics={TEST_INSETS}>
            <CommunityCreateScreen
              colors={palettes.light}
              mode="light"
              homeNode={savedNode}
              onBack={() => undefined}
              onCreated={() => undefined}
            />
          </SafeAreaProvider>
        </QueryClientProvider>,
      );
      await Promise.resolve();
    });
    expect(
      view.root.findAll(
        (node) =>
          node.props.accessibilityRole === 'header' && node.props.children === 'Create a community',
      ),
    ).not.toHaveLength(0);
    act(() => view.unmount());
  });
});

