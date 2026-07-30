import { useApp } from '../../src/application/app-provider';
import { RnsSignalScreen } from '../../src/features/signal';
import { AppScene } from '../../src/design-system';

/** Signal is a primary destination, not an item hidden behind the Forum inbox. */
export default function SignalTabRoute() {
  const { colors, reach } = useApp();
  return (
    <AppScene colors={colors}>
      <RnsSignalScreen colors={colors} reach={reach} />
    </AppScene>
  );
}
