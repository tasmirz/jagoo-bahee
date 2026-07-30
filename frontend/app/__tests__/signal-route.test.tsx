import * as mockReact from 'react';
import { Text as mockTextComponent } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import SignalTabRoute from '../(tabs)/signal';
import { useApp } from '../../src/application/app-provider';
import { palettes } from '../../src/design-system';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('../../src/application/app-provider', () => ({
  useApp: jest.fn(),
}));

jest.mock('../../src/features/signal', () => ({
  SignalHomeScreen: ({ onMesh }: { readonly onMesh: () => void }) =>
    mockReact.createElement(mockTextComponent, {
      accessibilityRole: 'button',
      onPress: onMesh,
      children: 'Signal ready',
    }),
}));

jest.mock('../../src/design-system', () => {
  const actual = jest.requireActual('../../src/design-system');
  return {
    ...actual,
    AppScene: ({ children }: mockReact.PropsWithChildren) => children,
  };
});

const mockUseApp = useApp as jest.MockedFunction<typeof useApp>;

describe('Signal tab route', () => {
  it('imports the router hook and opens the independent LXMF surface without crashing', async () => {
    mockUseApp.mockReturnValue({
      activeProfileId: 'forum',
      colors: palettes.dark,
      connectHomeNode: jest.fn(),
      disconnectHomeNode: jest.fn(),
      homeNode: {
        baseUrl: 'http://10.0.2.2:3000',
        transport: 'direct',
        savedAtMs: 1,
        discovery: {
          status: 'ok',
          node: {
            serverId: `jbs1${'a'.repeat(52)}`,
            serverKey: 'AA==',
            displayName: 'Test node',
            requestedAddress: 'http://10.0.2.2:3000',
            localAddresses: [],
          },
          services: { auditLogs: [], mcaptcha: [] },
          endpoints: { federations: '/federations', verify: '/verify', status: '/status' },
        },
      },
      identityProfiles: [],
      locale: 'en',
      reach: 'connected',
      refreshHomeNode: jest.fn(),
      refreshSession: jest.fn(),
      session: {
        configured: true,
        unlocked: true,
        authenticated: true,
        signedOut: false,
      },
      signOut: jest.fn(),
      scope: null,
      setLocale: jest.fn(),
      setThemePreference: jest.fn(),
      switchIdentity: jest.fn(),
      themeMode: 'dark',
      themePreference: 'dark',
    });

    let view!: renderer.ReactTestRenderer;
    await act(async () => {
      view = renderer.create(<SignalTabRoute />);
    });
    act(() => view.root.findByProps({ accessibilityRole: 'button' }).props.onPress());
    expect(mockPush).toHaveBeenCalledWith('/signal/mesh');
    act(() => view.unmount());
  });
});
