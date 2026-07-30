import { useLocalSearchParams, useRouter } from 'expo-router';
import { useApp } from '../../src/application/app-provider';
import { featureDestinations } from '../../src/features/catalog';
import { FeatureScreen } from '../../src/features/forum';
import { AppScene } from '../../src/design-system';
import { EmptyState, Screen } from '../../src/design-system';

export default function FeatureRoute() {
  const router = useRouter();
  const { featureId } = useLocalSearchParams<{ readonly featureId: string }>();
  const { colors, homeNode, themeMode } = useApp();
  const feature = featureDestinations.find((item) => item.id === featureId);
  if (!homeNode) return null;
  return (
    <AppScene colors={colors}>
      {feature ? (
        <FeatureScreen
          colors={colors}
          mode={themeMode}
          feature={feature}
          homeNode={homeNode}
          onBack={() => router.back()}
        />
      ) : (
        <Screen colors={colors}>
          <EmptyState
            colors={colors}
            icon="compass-outline"
            title="Feature not found"
            body="This link points to a feature this version of Jagoo Bahee does not know."
            action="Return to profile"
            onAction={() => router.replace('/(tabs)/profile')}
          />
        </Screen>
      )}
    </AppScene>
  );
}
