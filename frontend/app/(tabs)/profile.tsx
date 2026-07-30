import { useRouter } from 'expo-router';
import { useApp } from '../../src/application/app-provider';
import { YouScreen } from '../../src/features/profile/you-screen';
import { useNodeDocument } from '../../src/data/node';

export default function ProfileRoute() {
  const router = useRouter();
  const { colors, locale, reach, setLocale, setThemePreference, signOut, themeMode, homeNode } =
    useApp();
  // Operator-only rows are hidden entirely for a non-operator rather than shown as a fake or
  // disabled control (`Plans/12` §7.1) — a cheap probe against an admin-gated route decides.
  const operatorProbe = useNodeDocument<{ readonly identities: number }>(
    homeNode?.baseUrl ?? null,
    homeNode ? '/v1/admin/summary' : null,
    { retry: 0 },
  );
  if (!homeNode) return null;
  return (
    <YouScreen
      colors={colors}
      mode={themeMode}
      reach={reach}
      locale={locale}
      onOpenNetwork={() => router.push('/network')}
      onLocaleChange={() => void setLocale(locale === 'bn' ? 'en' : 'bn')}
      onThemeChange={() => void setThemePreference(themeMode === 'dark' ? 'light' : 'dark')}
      onOpenSaved={() => router.push('/saved' as never)}
      onOpenNotifications={() => router.push('/notifications' as never)}
      onOpenIdentity={() => router.push({ pathname: '/feature/[featureId]', params: { featureId: 'identity' } })}
      onOpenProofs={() => router.push('/proofs')}
      onOpenOperator={
        operatorProbe.data
          ? () => router.push({ pathname: '/feature/[featureId]', params: { featureId: 'admin' } })
          : undefined
      }
      /*
        No navigation. `signOut` locks the vault and flips `session`, and the tab layout's
        `useSessionGate` renders the sign-in screen in place of the tabs on the next paint.
        The previous `router.dismissAll()` dispatched `POP_TO_TOP` from the root stack's
        FIRST route, which no navigator can handle — React Native logged an error and the
        `replace('/')` behind it was left deciding a security boundary by route resolution.
      */
      onSignOut={() => void signOut()}
    />
  );
}
