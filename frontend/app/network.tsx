import { useRouter } from 'expo-router';
import { useApp } from '../src/application/app-provider';
import { NetworkScreen } from '../src/features/connectivity';
import { AppScene } from '../src/design-system';

export default function NetworkRoute() {
  const router = useRouter();
  const {
    themeMode,
    activeProfileId,
    colors,
    disconnectHomeNode,
    forgetIdentityProfile,
    homeNode,
    identityProfiles,
    locale,
    reach,
    switchIdentity,
  } = useApp();
  if (!homeNode) return null;
  return (
    <AppScene colors={colors}>
      <NetworkScreen
        colors={colors}
        mode={themeMode}
        homeNode={homeNode}
        activeProfileId={activeProfileId}
        identityProfiles={identityProfiles}
        locale={locale}
        onBack={() => router.back()}
        onMesh={() => router.push('/mesh')}
        onAddIdentity={() => router.push('/identity/new' as never)}
        onForgetProfile={forgetIdentityProfile}
        onSwitchIdentity={switchIdentity}
        onChangeServer={() =>
          void disconnectHomeNode().then(() => {
            router.dismissAll();
            router.replace('/');
          })
        }
        reach={reach}
      />
    </AppScene>
  );
}
