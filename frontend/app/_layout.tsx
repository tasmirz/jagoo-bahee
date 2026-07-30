import 'react-native-gesture-handler';
import '../src/crypto/backend';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono/400Regular';
import { Poppins_400Regular } from '@expo-google-fonts/poppins/400Regular';
import { Poppins_500Medium } from '@expo-google-fonts/poppins/500Medium';
import { Poppins_600SemiBold } from '@expo-google-fonts/poppins/600SemiBold';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useColorScheme } from 'react-native';
import { AppErrorBoundary } from '../src/application/app-error-boundary';
import { AppProvider } from '../src/application/app-provider';
import { SplashScreen } from '../src/design-system';

export default function RootLayout() {
  const dark = useColorScheme() === 'dark';
  const [loaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    JetBrainsMono_400Regular,
  });
  // Before the fonts resolve there is no `AppProvider` and therefore no palette, so the
  // two theme colours are passed literally. They are the `bg`/`text` values of
  // `tokens.ts` and the `splash.backgroundColor` pair in `app.json`; all three must agree
  // or the launch flickers at each handoff.
  if (!loaded) {
    return (
      <SplashScreen
        backgroundColor={dark ? '#0E0F11' : '#F6F5F2'}
        textColor={dark ? '#F2F1EE' : '#1B1B1D'}
      />
    );
  }
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppErrorBoundary>
        <AppProvider>
          <Stack
            screenOptions={{
              animation: 'slide_from_right',
              gestureEnabled: true,
              contentStyle: { backgroundColor: 'transparent' },
              headerShown: false,
            }}
          >
            <Stack.Screen name="(tabs)" options={{ animation: 'fade', animationDuration: 180 }} />
            <Stack.Screen name="composer" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          </Stack>
        </AppProvider>
      </AppErrorBoundary>
    </GestureHandlerRootView>
  );
}
