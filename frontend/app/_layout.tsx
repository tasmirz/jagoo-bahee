import '../src/crypto/backend';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono/400Regular';
import { Poppins_400Regular } from '@expo-google-fonts/poppins/400Regular';
import { Poppins_500Medium } from '@expo-google-fonts/poppins/500Medium';
import { Poppins_600SemiBold } from '@expo-google-fonts/poppins/600SemiBold';
import { AppErrorBoundary } from '../src/application/app-error-boundary';
import { AppProvider } from '../src/application/app-provider';

export default function RootLayout() {
  const [loaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    JetBrainsMono_400Regular,
  });
  if (!loaded) return null;
  return (
    <AppErrorBoundary>
      <AppProvider>
        <Stack
          screenOptions={{
            animation: 'fade',
            animationDuration: 180,
            contentStyle: { backgroundColor: 'transparent' },
            headerShown: false,
          }}
        />
      </AppProvider>
    </AppErrorBoundary>
  );
}
