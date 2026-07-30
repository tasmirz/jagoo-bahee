import { useRouter } from 'expo-router';
import { useApp } from '../../src/application/app-provider';
import { ProfileScreen } from '../../src/features/forum';
import { AppScene } from '../../src/ui/scene';

export default function ProfileRoute() {
  const router = useRouter();
  const { colors, locale, reach, setLocale, setThemePreference, themeMode } = useApp();
  return (
    <AppScene colors={colors}>
      <ProfileScreen
        colors={colors}
        locale={locale}
        onOpenFeature={(feature) =>
          router.push(
            feature.id === 'proofs'
              ? '/proofs'
              : { pathname: '/feature/[featureId]', params: { featureId: feature.id } },
          )
        }
        onOpenNetwork={() => router.push('/network')}
        onLocaleChange={() => void setLocale(locale === 'bn' ? 'en' : 'bn')}
        onThemeChange={() => void setThemePreference(themeMode === 'dark' ? 'light' : 'dark')}
        reach={reach}
        themeMode={themeMode}
      />
    </AppScene>
  );
}
