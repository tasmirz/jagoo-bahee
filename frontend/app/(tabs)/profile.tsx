import { useRouter } from 'expo-router';
import { useApp } from '../../src/application/app-provider';
import { ProfileScreen } from '../../src/features/forum';
import { AppScene } from '../../src/ui/scene';

export default function ProfileRoute() {
  const router = useRouter();
  const { colors, reach, setThemePreference, themeMode } = useApp();
  return (
    <AppScene colors={colors}>
      <ProfileScreen
        colors={colors}
        onOpenFeature={(feature) =>
          router.push(
            feature.id === 'proofs'
              ? '/proofs'
              : { pathname: '/feature/[featureId]', params: { featureId: feature.id } },
          )
        }
        onOpenNetwork={() => router.push('/network')}
        onThemeChange={() => void setThemePreference(themeMode === 'dark' ? 'light' : 'dark')}
        reach={reach}
        themeMode={themeMode}
      />
    </AppScene>
  );
}
