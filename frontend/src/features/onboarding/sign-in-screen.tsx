import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  Button,
  Screen,
  StatusBanner,
  radius,
  spacing,
  type as typography,
  type AppPalette,
} from '../../design-system';
import type { HomeNode } from '../../data/node-config';
import {
  importForumIdentity,
  signInForumIdentity,
  unlockForumIdentity,
} from '../../signer';

type Mode = 'unlock' | 'phrase';

/**
 * Signing back in to an identity this device already holds.
 *
 * Before this screen, the only way back after a sign-out was the eight-step onboarding flow,
 * which generated a fresh vault ID and re-ran registration — so "log out, log in" produced a
 * second identity rather than the same one, and pasting a recovery phrase looked identical to
 * signing up. Here the vault is already chosen: unlocking is one tap for a device-lock vault,
 * one password for a protected one, and the recovery phrase is the fallback for a forgotten
 * password rather than the entry point.
 */
export function SignInScreen({
  colors,
  homeNode,
  identityId,
  onSignedIn,
  onChangeServer,
}: {
  readonly colors: AppPalette;
  readonly homeNode: HomeNode;
  /** Shown so the person can confirm which identity they are returning to. */
  readonly identityId?: string;
  readonly onSignedIn: () => Promise<void> | void;
  readonly onChangeServer: () => void;
}) {
  const [mode, setMode] = useState<Mode>('unlock');
  const [password, setPassword] = useState('');
  const [recoverySalt, setRecoverySalt] = useState('');
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const words = phrase.trim() ? phrase.trim().split(/\s+/).length : 0;

  const run = (work: () => Promise<void>) => {
    setBusy(true);
    setError('');
    void (async () => {
      try {
        await work();
        setPassword('');
        setPhrase('');
        await onSignedIn();
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : 'Sign in failed. Please try again.',
        );
      } finally {
        setBusy(false);
      }
    })();
  };

  // Signing in is unlock-then-authenticate. A node that cannot be reached is not a failed
  // sign-in: the vault is open, the feed reads from cache, and the token is minted on the
  // next launch that finds a network.
  const finish = async () => {
    try {
      await signInForumIdentity(homeNode.baseUrl, homeNode.discovery.services.auditLogs);
    } catch {
      // Deliberately swallowed — see above.
    }
  };

  const unlock = () =>
    run(async () => {
      await unlockForumIdentity(password || undefined, recoverySalt);
      await finish();
    });

  const restore = () =>
    run(async () => {
      if (words !== 24) throw new Error('Enter all 24 words of your recovery phrase.');
      await importForumIdentity(phrase, password || undefined, recoverySalt);
      await finish();
    });

  return (
    <Screen colors={colors} bottomInset={spacing.xxl}>
      <LinearGradient colors={[colors.ember, colors.constrained]} style={styles.hero}>
        <View style={styles.brandRow}>
          <View style={[styles.seal, { borderColor: colors.onAccent }]} />
          <Text style={[typography.h2, { color: colors.onAccent }]}>Jagoo Bahee</Text>
        </View>
        <Text style={[typography.display, styles.heroTitle, { color: colors.onAccent }]}>
          Welcome back.
        </Text>
        <Text style={[typography.bodyLarge, { color: colors.onAccent }]}>
          Your identity is still on this device. Nothing was sent anywhere.
        </Text>
      </LinearGradient>

      <View style={styles.content}>
        {error ? (
          <StatusBanner
            colors={colors}
            icon="alert-circle-outline"
            title="Could not sign in"
            body={error}
            tone="danger"
          />
        ) : null}

        <View style={[styles.detailCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Text style={[typography.overline, { color: colors.ember }]}>
            Home server · {homeNode.transport === 'tor' ? 'via Tor' : 'direct'}
          </Text>
          <Text style={[typography.h2, { color: colors.text }]}>
            {homeNode.discovery.node.displayName}
          </Text>
          {identityId ? (
            <Text selectable style={[typography.mono, { color: colors.text2 }]}>
              {identityId}
            </Text>
          ) : null}
        </View>

        {mode === 'unlock' ? (
          <>
            <Text accessibilityRole="header" style={[typography.h1, { color: colors.text }]}>
              Unlock your identity
            </Text>
            <Text style={[typography.body, { color: colors.text2 }]}>
              If you protected this device with an app password, enter it. If you chose device
              lock only, just continue.
            </Text>
            <TextInput
              accessibilityLabel="App password"
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setPassword}
              placeholder="App password (leave empty for device lock)"
              placeholderTextColor={colors.text3}
              secureTextEntry
              style={[
                styles.input,
                typography.body,
                { borderColor: colors.border, backgroundColor: colors.surface, color: colors.text },
              ]}
              value={password}
            />
            <Button
              colors={colors}
              disabled={busy}
              icon="lock-open-outline"
              label={busy ? 'Signing in…' : 'Sign in'}
              onPress={unlock}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setMode('phrase');
                setError('');
              }}
              style={styles.linkRow}
            >
              <Ionicons color={colors.ember} name="key-outline" size={18} />
              <Text style={[typography.label, { color: colors.ember }]}>
                Use my recovery phrase instead
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text accessibilityRole="header" style={[typography.h1, { color: colors.text }]}>
              Sign in with your recovery phrase
            </Text>
            <Text style={[typography.body, { color: colors.text2 }]}>
              Your 24 words are checked on this device and never sent to a server. The same
              phrase always returns the same identity, so this signs you back in — it does not
              create a new account.
            </Text>
            <TextInput
              accessibilityLabel="24-word recovery phrase"
              autoCapitalize="none"
              autoCorrect={false}
              multiline
              onChangeText={setPhrase}
              placeholder="word 1 word 2 … word 24"
              placeholderTextColor={colors.text3}
              style={[
                styles.phraseInput,
                typography.body,
                { borderColor: colors.border, backgroundColor: colors.surface, color: colors.text },
              ]}
              value={phrase}
            />
            <Text style={[typography.caption, { color: colors.text2 }]}>
              {words ? `${words} words entered` : 'Enter all 24 words in order.'}
            </Text>
            <TextInput
              accessibilityLabel="Recovery salt, if this identity uses one"
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setRecoverySalt}
              placeholder="Recovery salt (only if you chose one)"
              placeholderTextColor={colors.text3}
              secureTextEntry
              style={[
                styles.input,
                typography.body,
                { borderColor: colors.border, backgroundColor: colors.surface, color: colors.text },
              ]}
              value={recoverySalt}
            />
            <Button
              colors={colors}
              disabled={busy || words !== 24}
              label={busy ? 'Signing in…' : 'Sign in'}
              onPress={restore}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setMode('unlock');
                setError('');
              }}
              style={styles.linkRow}
            >
              <Ionicons color={colors.ember} name="arrow-back" size={18} />
              <Text style={[typography.label, { color: colors.ember }]}>Back to unlock</Text>
            </Pressable>
          </>
        )}

        <Button
          colors={colors}
          label="Use a different server"
          onPress={onChangeServer}
          variant="ghost"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { minHeight: 220, padding: spacing.lg, justifyContent: 'space-between' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  seal: { width: 28, height: 28, borderWidth: 5, borderRadius: radius.pill },
  heroTitle: { fontSize: 35, lineHeight: 42, letterSpacing: -0.8 },
  content: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  detailCard: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.xs },
  input: { minHeight: 52, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md },
  phraseInput: {
    minHeight: 140,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    textAlignVertical: 'top',
  },
  linkRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
});
