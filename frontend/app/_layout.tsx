import 'react-native-gesture-handler';
import '../src/crypto/backend';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono/400Regular';
import { Poppins_400Regular } from '@expo-google-fonts/poppins/400Regular';
import { Poppins_500Medium } from '@expo-google-fonts/poppins/500Medium';
import { Poppins_600SemiBold } from '@expo-google-fonts/poppins/600SemiBold';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Image, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { AppErrorBoundary } from '../src/application/app-error-boundary';
import { AppProvider } from '../src/application/app-provider';

export default function RootLayout() {
  const dark = useColorScheme() === 'dark';
  const [loaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    JetBrainsMono_400Regular,
  });
  if (!loaded) {
    return (
      <View
        accessibilityLabel="Opening Jagoo Bahee"
        style={[styles.splash, { backgroundColor: dark ? '#0E0F11' : '#F6F5F2' }]}
      >
        <Image
          accessibilityIgnoresInvertColors
          // Metro resolves bundled image assets through the React Native `require` contract.
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          source={require('../assets/jagoo-app-icon.png')}
          style={styles.splashLogo}
        />
        <Text style={[styles.splashName, { color: dark ? '#F2F1EE' : '#1B1B1D' }]}>
          Jagoo Bahee
        </Text>
      </View>
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

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    backgroundColor: '#F6F5F2',
  },
  splashLogo: {
    width: 132,
    height: 132,
    borderRadius: 66,
  },
  splashName: {
    color: '#1B1B1D',
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
