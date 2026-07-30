import Ionicons from '@expo/vector-icons/Ionicons';
import * as Crypto from 'expo-crypto';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import { Clipboard, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Button, Screen, StatusBanner } from '../../design-system';
import type { HomeNode } from '../../data/node-config';
import { discoverHomeNode } from '../../data/node-config';
import {
  configureClientTransport,
  type ClientTransport,
} from '../../data/request';
import {
  createForumIdentity,
  deleteForumIdentityVault,
  importForumIdentity,
  registerForumIdentity,
  signInForumIdentity,
} from '../../signer';
import {
  authenticateSignalIdentity,
  createSignalIdentity,
  publishSignalDirectoryProfile,
  publishSignalPrekeys,
  registerSignalIdentity,
  signalSessionSummary,
} from '../../signer/signal';
import { markSignalBackupOwed } from '../../features/signal/storage';
import type { IdentityProfile } from '../../data/identity-profiles';
import { radius, spacing, type as typography, type AppPalette } from '../../design-system';

type Step =
  | 'welcome'
  | 'server'
  | 'confirm'
  | 'identity'
  | 'protection'
  | 'backup'
  | 'register'
  | 'messaging'
  | 'username'
  | 'ready';
type IdentityMode = 'create' | 'restore';
type Protection = 'device' | 'password' | 'salt';

const steps: readonly Step[] = [
  'welcome',
  'server',
  'confirm',
  'identity',
  'protection',
  'backup',
  'register',
  'messaging',
  'username',
  'ready',
];

export function WelcomeFlow({
  colors,
  identityProfiles = [],
  onComplete,
}: {
  readonly colors: AppPalette;
  /** Used to recognise a restored phrase as an identity this device already stores. */
  readonly identityProfiles?: readonly IdentityProfile[];
  readonly onComplete: (
    address: string,
    options: {
      readonly transport: ClientTransport;
      readonly vaultId: string;
      readonly identityId: string;
    },
  ) => Promise<void>;
}) {
  const newVaultId = useMemo(
    () =>
      Crypto.randomUUID?.()?.replaceAll('-', '') ||
      `vault_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`,
    [],
  );
  // Which vault the flow actually ended up writing to. A restore that turns out to be an
  // identity this device already holds moves back into that identity's own vault instead of
  // leaving a duplicate profile behind for the same 24 words.
  const [vaultId, setVaultId] = useState(newVaultId);
  const [step, setStep] = useState<Step>('welcome');
  const [candidate, setCandidate] = useState<HomeNode | null>(null);
  const [mode, setMode] = useState<IdentityMode>('create');
  const [protection, setProtection] = useState<Protection>('device');
  const [address, setAddress] = useState('');
  const [transport, setTransport] = useState<ClientTransport>('direct');
  const [phrase, setPhrase] = useState('');
  const [password, setPassword] = useState('');
  const [recoverySalt, setRecoverySalt] = useState('');
  const [identityId, setIdentityId] = useState('');
  const [signalIdentityId, setSignalIdentityId] = useState('');
  const [username, setUsername] = useState('');
  const [wordCheck, setWordCheck] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // `welcome` is not a numbered step — it is the cover — so the dots and the count both
  // run over `steps.slice(1)`. The label used to say "of 7" against an 8-entry array.
  const numberedSteps = steps.slice(1);
  const stepNumber = Math.max(1, numberedSteps.indexOf(step) + 1);
  const backupWords = useMemo(() => phrase.trim().split(/\s+/), [phrase]);
  const confirmIndex = backupWords.length === 24 ? 6 : 0;
  const requiresPassword = protection !== 'device';

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const chooseServer = (nextAddress = address) =>
    run(async () => {
      const found = await discoverHomeNode(nextAddress, transport);
      configureClientTransport(found.transport);
      setTransport(found.transport);
      setCandidate(found);
      setStep('confirm');
    });

  const createOrRestore = () =>
    run(async () => {
      const appPassword = requiresPassword ? password : undefined;
      const salt = protection === 'salt' ? recoverySalt : '';
      if (mode === 'create') {
        const created = await createForumIdentity(appPassword, salt, newVaultId);
        setVaultId(newVaultId);
        setPhrase(created.recoveryPhrase);
        setIdentityId(created.identityId);
        setStep('backup');
        return;
      }
      let restoredId = await importForumIdentity(phrase, appPassword, salt, newVaultId);
      let restoredVaultId = newVaultId;
      const known = identityProfiles.find(
        (profile) => profile.identityId === restoredId && profile.vaultId !== newVaultId,
      );
      if (known) {
        // The phrase is authoritative, so re-importing it into the existing vault rewrites
        // that vault with the same key under whatever protection was just chosen. Without
        // this, restoring produced a second profile for one identity every single time.
        await deleteForumIdentityVault(newVaultId);
        restoredId = await importForumIdentity(phrase, appPassword, salt, known.vaultId);
        restoredVaultId = known.vaultId;
      }
      setVaultId(restoredVaultId);
      setIdentityId(restoredId);
      if (!candidate) throw new Error('Choose a home server first.');
      // A restored identity is one the node most likely already knows: authenticate, and
      // only fall back to the registration step if that fails. Landing on "Register with your
      // server" after typing a correct recovery phrase is what made signing in
      // indistinguishable from signing up.
      try {
        await signInForumIdentity(candidate.baseUrl, candidate.discovery.services.auditLogs);
        setPhrase('');
        setStep('messaging');
      } catch {
        setStep('register');
      }
    });

  const register = () =>
    run(async () => {
      if (!candidate) throw new Error('Choose a home server first.');
      if (mode === 'create') {
        await registerForumIdentity(candidate.baseUrl, candidate.discovery.services.auditLogs);
      } else {
        await signInForumIdentity(candidate.baseUrl, candidate.discovery.services.auditLogs);
      }
      setStep('messaging');
    });

  /**
   * Create the SIGNAL identity, here, in the same flow — and keep it a separate secret.
   *
   * Messaging used to require finding "Signal identity" three taps into a tab most people
   * never opened, then five more manual steps before anyone could reach you. Doing it here
   * is a sequencing change, not a linkage: ADR-012 requires two independent mnemonics
   * (`bip85.ts` deliberately exposes no function that takes one seed and yields both), a
   * separate SecureStore root, and no record that stores the two together. Nothing written
   * here associates this key with the Forum key — they are created one after the other, in
   * the same minute, and that is all.
   *
   * Prekeys matter as much as the key: without them nobody can open a conversation with
   * you, so an identity published without them is discoverable and unreachable.
   */
  const createMessaging = () =>
    run(async () => {
      if (!candidate) throw new Error('Choose a home server first.');
      const audits = candidate.discovery.services.auditLogs;
      const existing = await signalSessionSummary();
      if (!existing.configured) {
        // The Signal vault takes the same protection choice as the Forum one, but its
        // passphrase policy differs — empty is allowed, 1 to 7 characters is refused
        // (`signer/signal.ts`), where Forum requires 8 or more. Passing the Forum password
        // through satisfies both; device-lock passes an empty string, which is valid here.
        const created = await createSignalIdentity(requiresPassword ? password : '', protection === 'salt' ? recoverySalt : '');
        setSignalIdentityId(created.identityId);
        await markSignalBackupOwed();
      } else {
        setSignalIdentityId(existing.identityId ?? '');
      }
      await registerSignalIdentity(candidate.baseUrl, audits);
      await authenticateSignalIdentity(candidate.baseUrl);
      await publishSignalPrekeys(candidate.baseUrl, audits);
      setStep('username');
    });

  const claimUsername = () =>
    run(async () => {
      if (!candidate) throw new Error('Choose a home server first.');
      const name = username.trim();
      if (!name) throw new Error('Choose a name people can search for.');
      await publishSignalDirectoryProfile(
        candidate.baseUrl,
        {
          displayName: name,
          discoverable: true,
          languages: ['bn', 'en'],
          revision: BigInt(Date.now()),
        },
        candidate.discovery.services.auditLogs,
      );
      setStep('ready');
    });

  const finish = () =>
    run(async () => {
      if (!candidate) throw new Error('Choose a home server first.');
      await onComplete(candidate.baseUrl, {
        transport: candidate.transport,
        vaultId,
        identityId,
      });
    });

  return (
    <Screen colors={colors} bottomInset={spacing.xxl}>
      <LinearGradient colors={[colors.ember, colors.constrained]} style={styles.hero}>
        <View style={styles.brandRow}>
          <View style={[styles.seal, { borderColor: colors.onAccent }]} />
          <Text style={[typography.h2, { color: colors.onAccent }]}>Jagoo Bahee</Text>
        </View>
        <Text style={[typography.display, styles.heroTitle, { color: colors.onAccent }]}>Your voice,{`\n`}kept by you.</Text>
        <Text style={[typography.bodyLarge, { color: colors.onAccent }]}>A local identity, a server you choose, and proof you can carry.</Text>
      </LinearGradient>

      <View style={styles.progress} accessibilityLabel={`Step ${stepNumber} of ${numberedSteps.length}`}>
        {numberedSteps.map((item, index) => <View key={item} style={[styles.progressDot, { backgroundColor: index < stepNumber ? colors.ember : colors.border }]} />)}
      </View>
      <View style={styles.content}>
        {error ? <StatusBanner colors={colors} icon="alert-circle-outline" title="Try again" body={error} tone="danger" /> : null}

        {step === 'welcome' ? <WelcomeStep colors={colors} onCreate={() => { setMode('create'); setStep('server'); }} onRestore={() => { setMode('restore'); setStep('server'); }} /> : null}
        {step === 'server' ? <ServerStep address={address} busy={busy} colors={colors} transport={transport} onAddress={(value) => { setAddress(value); if (/\.onion(?::\d+)?(?:\/|$)/i.test(value)) setTransport('tor'); }} onTransport={setTransport} onChoose={chooseServer} /> : null}
        {step === 'confirm' && candidate ? <ConfirmStep candidate={candidate} colors={colors} onContinue={() => setStep('identity')} onBack={() => setStep('server')} /> : null}
        {step === 'identity' ? <IdentityStep colors={colors} mode={mode} phrase={phrase} onPhrase={setPhrase} onContinue={() => setStep('protection')} onChangeMode={() => { setMode(mode === 'create' ? 'restore' : 'create'); setPhrase(''); }} /> : null}
        {step === 'protection' ? <ProtectionStep colors={colors} protection={protection} password={password} salt={recoverySalt} onProtection={setProtection} onPassword={setPassword} onSalt={setRecoverySalt} onContinue={createOrRestore} busy={busy} /> : null}
        {step === 'backup' ? <BackupStep colors={colors} phrase={phrase} confirmIndex={confirmIndex} wordCheck={wordCheck} onWordCheck={setWordCheck} onContinue={() => { setPhrase(''); setStep('register'); }} /> : null}
        {step === 'register' ? <RegisterStep busy={busy} colors={colors} identityId={identityId} candidate={candidate} mode={mode} onRegister={register} onOffline={() => setStep('messaging')} /> : null}
        {step === 'messaging' ? <MessagingStep busy={busy} colors={colors} signalIdentityId={signalIdentityId} onContinue={createMessaging} onSkip={() => setStep('ready')} /> : null}
        {step === 'username' ? <UsernameStep busy={busy} colors={colors} signalIdentityId={signalIdentityId} username={username} onUsername={setUsername} onClaim={claimUsername} onSkip={() => setStep('ready')} /> : null}
        {step === 'ready' ? <ReadyStep colors={colors} candidate={candidate} identityId={identityId} mode={mode} busy={busy} onFinish={finish} /> : null}
      </View>
    </Screen>
  );
}

function WelcomeStep({ colors, onCreate, onRestore }: { readonly colors: AppPalette; readonly onCreate: () => void; readonly onRestore: () => void }) {
  return <View style={styles.stack}><Text accessibilityRole="header" style={[typography.h1, { color: colors.text }]}>Start with an identity</Text><Text style={[typography.body, { color: colors.text2 }]}>Your recovery phrase and keys stay on this device. A server can host your community, but it cannot recreate your identity.</Text><Button colors={colors} label="Create a new identity" icon="arrow-forward" onPress={onCreate} /><Button colors={colors} label="I already have an identity" variant="secondary" onPress={onRestore} /><Text style={[typography.caption, { color: colors.text2 }]}>You can change language and appearance later. The first task is simply making your identity recoverable.</Text></View>;
}

function ServerStep({ address, busy, colors, transport, onAddress, onTransport, onChoose }: { readonly address: string; readonly busy: boolean; readonly colors: AppPalette; readonly transport: ClientTransport; readonly onAddress: (value: string) => void; readonly onTransport: (value: ClientTransport) => void; readonly onChoose: (address?: string) => void }) {
  const [scanning, setScanning] = useState(false);
  const [transportOpen, setTransportOpen] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const configured = process.env.EXPO_PUBLIC_NODE_URL?.trim();
  const configuredOnion = process.env.EXPO_PUBLIC_TOR_NODE_URL?.trim();
  const local = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://127.0.0.1:3000';
  const suggestions = [
    ...(configured ? [{ label: 'Configured community server', address: configured }] : []),
    ...(configuredOnion ? [{ label: 'Configured onion server', address: configuredOnion }] : []),
    { label: Platform.OS === 'android' ? 'Android emulator host' : 'This device’s development host', address: local },
  ].filter((item, index, rows) => rows.findIndex((row) => row.address === item.address) === index);
  const scanAddress = (data: string) => {
    setScanning(false);
    try {
      const parsed = new URL(data);
      const value = parsed.protocol === 'jagoo:' ? parsed.searchParams.get('url') ?? '' : data;
      onAddress(value);
      if (value) onChoose(value);
    } catch {
      onAddress(data);
      onChoose(data);
    }
  };
  return <View style={styles.stack}>
    <Text accessibilityRole="header" style={[typography.h1, { color: colors.text }]}>Choose a home server</Text>
    <Text style={[typography.body, { color: colors.text2 }]}>Use your own node or one shared by your community. Its server key and advertised services are verified before registration.</Text>
    <Text style={[typography.label, { color: colors.text }]}>Available on this installation</Text>
    {suggestions.map((item) => <Pressable accessibilityRole="button" key={item.address} onPress={() => { if (/\.onion(?::\d+)?(?:\/|$)/i.test(item.address)) onTransport('tor'); onChoose(item.address); }} style={[styles.serverRow, { borderColor: colors.border, backgroundColor: colors.surface }]}><Ionicons color={colors.ember} name={/\.onion/i.test(item.address) ? 'lock-closed-outline' : 'server-outline'} size={20} /><View style={styles.flex}><Text style={[typography.label, { color: colors.text }]}>{item.label}</Text><Text selectable style={[typography.mono, { color: colors.text2 }]}>{item.address}</Text></View><Ionicons color={colors.text2} name="chevron-forward" size={18} /></Pressable>)}
    <Text style={[typography.label, { color: colors.text }]}>My server</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Choose client transport" accessibilityState={{ expanded: transportOpen }} onPress={() => setTransportOpen((value) => !value)} style={[styles.transportSelect, { borderColor: colors.border, backgroundColor: colors.surface }]}><Ionicons color={transport === 'tor' ? colors.verified : colors.text2} name={transport === 'tor' ? 'shield-checkmark-outline' : 'globe-outline'} size={20} /><View style={styles.flex}><Text style={[typography.caption, { color: colors.text2 }]}>Connect with</Text><Text style={[typography.label, { color: colors.text }]}>{transport === 'tor' ? 'Embedded Tor' : 'Direct network'}</Text></View><Ionicons color={colors.text2} name={transportOpen ? 'chevron-up' : 'chevron-down'} size={18} /></Pressable>
    {transportOpen ? <View accessibilityRole="menu" style={[styles.transportMenu, { borderColor: colors.border, backgroundColor: colors.surface }]}>{([['direct', 'Direct network', 'Use the device network normally.', 'globe-outline'], ['tor', 'Embedded Tor', 'Route requests with Nitro Tor. Required for .onion.', 'shield-checkmark-outline']] as const).map(([id, title, body, icon]) => <Pressable accessibilityRole="menuitem" accessibilityState={{ selected: transport === id }} key={id} onPress={() => { onTransport(id); setTransportOpen(false); }} style={[styles.transportOption, { backgroundColor: transport === id ? colors.surface2 : colors.surface }]}><Ionicons color={transport === id ? colors.ember : colors.text2} name={icon} size={20} /><View style={styles.flex}><Text style={[typography.label, { color: colors.text }]}>{title}</Text><Text style={[typography.caption, { color: colors.text2 }]}>{body}</Text></View>{transport === id ? <Ionicons color={colors.ember} name="checkmark" size={20} /> : null}</Pressable>)}</View> : null}
    <TextInput accessibilityLabel="Home server address" autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="192.168.1.20:3000" placeholderTextColor={colors.text3} style={[styles.input, typography.bodyLarge, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.text }]} value={address} onChangeText={onAddress} onSubmitEditing={() => onChoose()} />
    <View style={styles.actionRow}><View style={styles.flex}><Button colors={colors} disabled={busy || !address.trim()} label={busy ? 'Checking server…' : 'Check this server'} onPress={() => onChoose()} /></View><Button colors={colors} icon="qr-code-outline" label="Scan QR" onPress={() => void (permission?.granted ? setScanning(true) : requestPermission().then((result) => setScanning(result.granted)))} variant="secondary" /></View>
    {scanning ? <View style={[styles.scanner, { borderColor: colors.border }]}><CameraView barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={({ data }) => scanAddress(data)} style={StyleSheet.absoluteFill} /><Button colors={colors} label="Cancel scan" onPress={() => setScanning(false)} variant="secondary" /></View> : null}
    <StatusBanner colors={colors} icon="eye-off-outline" title="Server choice stays on this device" body={transport === 'tor' ? 'Jagoo starts Tor inside the native app and never retries this connection directly.' : 'Jagoo stores the verified server address locally. You can replace it later from Network.'} />
  </View>;
}

/**
 * What this server offers, phrased as facts rather than as a count of absences.
 *
 * "0 anti-abuse services" read as a defect on the screen where someone decides whether to
 * trust a server, when in truth every node protects itself with proof of work and mCaptcha
 * is an optional extra almost nobody runs. An audit copy IS worth counting: zero of them
 * genuinely means nothing outside this server witnesses what it publishes.
 */
function describeServerServices(candidate: HomeNode): string {
  const audits = candidate.discovery.services.auditLogs.length;
  const witness =
    audits === 0
      ? 'No independent audit log witnesses this server yet.'
      : `${audits} independent audit log${audits === 1 ? '' : 's'} witness what it publishes.`;
  return `${witness} Spam is limited by proof of work, so you never have to prove who you are.`;
}

function ConfirmStep({ candidate, colors, onContinue, onBack }: { readonly candidate: HomeNode; readonly colors: AppPalette; readonly onContinue: () => void; readonly onBack: () => void }) {
  return <View style={styles.stack}><Text accessibilityRole="header" style={[typography.h1, { color: colors.text }]}>This server is reachable</Text><View style={[styles.detailCard, { borderColor: colors.border, backgroundColor: colors.surface }]}><Text style={[typography.overline, { color: colors.ember }]}>Home server · {candidate.transport === 'tor' ? 'via Tor' : 'direct'}</Text><Text style={[typography.h2, { color: colors.text }]}>{candidate.discovery.node.displayName}</Text><Text selectable style={[typography.mono, { color: colors.text2 }]}>{candidate.baseUrl}</Text><Text selectable style={[typography.mono, { color: colors.text2 }]}>{candidate.discovery.node.serverId}</Text></View><Text style={[typography.body, { color: colors.text2 }]}>{describeServerServices(candidate)}</Text><Button colors={colors} label="Use this server" onPress={onContinue} /><Button colors={colors} label="Choose another" variant="ghost" onPress={onBack} /></View>;
}

function IdentityStep({ colors, mode, phrase, onPhrase, onContinue, onChangeMode }: { readonly colors: AppPalette; readonly mode: IdentityMode; readonly phrase: string; readonly onPhrase: (value: string) => void; readonly onContinue: () => void; readonly onChangeMode: () => void }) {
  const restoring = mode === 'restore';
  return <View style={styles.stack}><Text accessibilityRole="header" style={[typography.h1, { color: colors.text }]}>{restoring ? 'Restore your identity' : 'Create a new identity'}</Text><Text style={[typography.body, { color: colors.text2 }]}>{restoring ? 'Paste your 24-word recovery phrase. It is checked locally and is never sent to a server.' : 'Next, choose how this device protects your new local key.'}</Text>{restoring ? <><TextInput accessibilityLabel="24-word recovery phrase" autoCapitalize="none" autoCorrect={false} multiline placeholder="word 1 word 2 … word 24" placeholderTextColor={colors.text3} style={[styles.phraseInput, typography.body, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.text }]} value={phrase} onChangeText={onPhrase} /><Text style={[typography.caption, { color: colors.text2 }]}>{phrase.trim() ? `${phrase.trim().split(/\s+/).length} words entered` : 'Enter all 24 words in order.'}</Text></> : null}<Button colors={colors} disabled={restoring && phrase.trim().split(/\s+/).length !== 24} label={restoring ? 'Continue to protection' : 'Choose protection'} onPress={onContinue} /><Button colors={colors} label={restoring ? 'Create a new identity instead' : 'I already have an identity'} variant="ghost" onPress={onChangeMode} /></View>;
}

function ProtectionStep({ colors, protection, password, salt, busy, onProtection, onPassword, onSalt, onContinue }: { readonly colors: AppPalette; readonly protection: Protection; readonly password: string; readonly salt: string; readonly busy: boolean; readonly onProtection: (value: Protection) => void; readonly onPassword: (value: string) => void; readonly onSalt: (value: string) => void; readonly onContinue: () => void }) {
  const options: readonly [Protection, string, string][] = [['device', 'Device lock only', 'A random vault key stays in your device keystore.'], ['password', 'App password', 'You enter a password to unlock this device.'], ['salt', 'Password + recovery salt', 'An advanced secret changes the identity derived from the phrase.']];
  const valid = protection === 'device' || password.length >= 8;
  return <View style={styles.stack}><Text accessibilityRole="header" style={[typography.h1, { color: colors.text }]}>Protect this device</Text><Text style={[typography.body, { color: colors.text2 }]}>The recovery phrase, app password, and recovery salt are different things. Only the phrase—and any recovery salt—can restore the same identity elsewhere.</Text>{options.map(([id, title, body]) => <Pressable key={id} accessibilityRole="radio" accessibilityState={{ selected: protection === id }} onPress={() => onProtection(id)} style={[styles.option, { borderColor: protection === id ? colors.ember : colors.border, backgroundColor: colors.surface }]}><Ionicons name={protection === id ? 'radio-button-on' : 'radio-button-off'} size={20} color={colors.ember} /><View style={styles.flex}><Text style={[typography.label, { color: colors.text }]}>{title}</Text><Text style={[typography.caption, { color: colors.text2 }]}>{body}</Text></View></Pressable>)}{protection !== 'device' ? <TextInput accessibilityLabel="App password" secureTextEntry placeholder="At least 8 characters" placeholderTextColor={colors.text3} style={[styles.input, typography.body, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.text }]} value={password} onChangeText={onPassword} /> : null}{protection === 'salt' ? <TextInput accessibilityLabel="Recovery salt" secureTextEntry placeholder="Optional recovery salt" placeholderTextColor={colors.text3} style={[styles.input, typography.body, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.text }]} value={salt} onChangeText={onSalt} /> : null}<Button colors={colors} disabled={!valid || busy} label={busy ? 'Securing identity…' : 'Continue'} onPress={onContinue} /></View>;
}

function BackupStep({ colors, phrase, confirmIndex, wordCheck, onWordCheck, onContinue }: { readonly colors: AppPalette; readonly phrase: string; readonly confirmIndex: number; readonly wordCheck: string; readonly onWordCheck: (value: string) => void; readonly onContinue: () => void }) {
  const [copied, setCopied] = useState(false);
  const words = phrase.trim().split(/\s+/);
  const checked = wordCheck.trim().toLowerCase() === words[confirmIndex]?.toLowerCase();
  const copy = () => {
    Clipboard.setString(phrase);
    setCopied(true);
  };
  return <View style={styles.stack}><StatusBanner colors={colors} icon="eye-off-outline" title="Shown once" body="Jagoo Bahee and your server cannot recover this phrase. Save it somewhere private before continuing." tone="warning" /><Text accessibilityRole="header" style={[typography.h1, { color: colors.text }]}>Write down your recovery phrase</Text><Pressable accessibilityRole="button" accessibilityLabel="Copy recovery phrase" onPress={copy} style={[styles.wordGrid, { borderColor: copied ? colors.verified : colors.border, backgroundColor: colors.surface }]}>{words.map((word, index) => <Text key={`${word}-${index}`} selectable style={[typography.mono, { color: colors.text }]}>{String(index + 1).padStart(2, '0')}. {word}</Text>)}<View style={styles.copyHint}><Ionicons name={copied ? 'checkmark-circle' : 'copy-outline'} size={17} color={copied ? colors.verified : colors.ember} /><Text accessibilityLiveRegion="polite" style={[typography.caption, { color: copied ? colors.verified : colors.ember }]}>{copied ? 'Copied to clipboard' : 'Tap to copy all 24 words'}</Text></View></Pressable><Text style={[typography.label, { color: colors.text }]}>What is word {confirmIndex + 1}?</Text><TextInput accessibilityLabel={`Recovery word ${confirmIndex + 1}`} autoCapitalize="none" autoCorrect={false} style={[styles.input, typography.body, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.text }]} value={wordCheck} onChangeText={onWordCheck} /><Button colors={colors} disabled={!checked} label="I saved it safely" onPress={onContinue} /></View>;
}

/**
 * The Signal identity, created here rather than three taps into a tab nobody opened.
 *
 * The plane separation is stated on the screen instead of being left implicit. Someone is
 * about to publish a name under an identity that is deliberately NOT their forum identity,
 * and if they assume the two are connected they will make the wrong call about what to say
 * under each. CLAUDE.md §6 forbids the UI offering plane linkage; it does not forbid
 * explaining the separation, and explaining it is the only way the choice is informed.
 */
function MessagingStep({ busy, colors, signalIdentityId, onContinue, onSkip }: { readonly busy: boolean; readonly colors: AppPalette; readonly signalIdentityId: string; readonly onContinue: () => void; readonly onSkip: () => void }) {
  return <View style={styles.stack}><Text accessibilityRole="header" style={[typography.h1, { color: colors.text }]}>Set up messaging</Text><Text style={[typography.body, { color: colors.text2 }]}>Messaging uses a second, separate identity — one people are meant to recognise. Your forum posts stay under the pseudonymous identity you just made, and nothing connects the two.</Text><View style={[styles.detailCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>{['Create a separate messaging key', 'Certify it with your server', 'Publish keys so people can reach you'].map((item, index) => <View key={item} style={styles.timelineRow}><Text style={[typography.mono, { color: colors.signal }]}>{index + 1}</Text><Text style={[typography.body, { color: colors.text }]}>{item}</Text></View>)}</View>{signalIdentityId ? <Text selectable style={[typography.mono, { color: colors.text2 }]}>{signalIdentityId}</Text> : null}<Text style={[typography.caption, { color: colors.text2 }]}>This identity has its own 24-word phrase. We will ask you to write it down once you are set up — your forum phrase is the one that matters most, and two at once is two nobody reads.</Text><Button colors={colors} disabled={busy} label={busy ? 'Setting up messaging…' : 'Set up messaging'} onPress={onContinue} /><Button colors={colors} label="Skip for now" variant="ghost" onPress={onSkip} /></View>;
}

/**
 * Claiming the name people will search for.
 *
 * First-come on this server only — another server in the federation can hand the same name
 * to a different key, and no node can prevent that without a naming authority this project
 * rejects. So the fingerprint is shown beside the name from the very first screen that
 * mentions one, and every later surface does the same.
 */
function UsernameStep({ busy, colors, signalIdentityId, username, onUsername, onClaim, onSkip }: { readonly busy: boolean; readonly colors: AppPalette; readonly signalIdentityId: string; readonly username: string; readonly onUsername: (value: string) => void; readonly onClaim: () => void; readonly onSkip: () => void }) {
  return <View style={styles.stack}><Text accessibilityRole="header" style={[typography.h1, { color: colors.text }]}>Pick a name people can find</Text><Text style={[typography.body, { color: colors.text2 }]}>People on your server — and on servers it connects to — can search for this name and start a conversation with you.</Text><TextInput accessibilityLabel="Your messaging name" autoCapitalize="words" autoCorrect={false} maxLength={80} onChangeText={onUsername} placeholder="Amina Rahman" placeholderTextColor={colors.text3} style={[styles.input, typography.bodyLarge, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.text }]} value={username} />{signalIdentityId ? <View style={[styles.detailCard, { borderColor: colors.border, backgroundColor: colors.surface }]}><Text style={[typography.overline, { color: colors.signal }]}>Your messaging fingerprint</Text><Text selectable style={[typography.mono, { color: colors.text2 }]}>{signalIdentityId}</Text><Text style={[typography.caption, { color: colors.text2 }]}>Names can repeat across servers. This never does — it is what proves a person is who their name says.</Text></View> : null}<Text style={[typography.caption, { color: colors.text2 }]}>This name is public and identified. It is not connected to your forum identity, and it should not be a name you post under there.</Text><Button colors={colors} disabled={busy || !username.trim()} label={busy ? 'Publishing…' : 'Claim this name'} onPress={onClaim} /><Button colors={colors} label="Skip for now" variant="ghost" onPress={onSkip} /></View>;
}

function RegisterStep({ busy, colors, identityId, candidate, mode, onRegister, onOffline }: { readonly busy: boolean; readonly colors: AppPalette; readonly identityId: string; readonly candidate: HomeNode | null; readonly mode: IdentityMode; readonly onRegister: () => void; readonly onOffline: () => void }) {
  const restoring = mode === 'restore';
  const stages = restoring
    ? ['Check server policy', 'Authenticate with a signed challenge', 'Cache your publishing credential']
    : ['Check server policy', 'Solve anonymous proof of work', 'Certify your Forum key', 'Authenticate and cache credential'];
  return <View style={styles.stack}><Text accessibilityRole="header" style={[typography.h1, { color: colors.text }]}>{restoring ? 'Sign in to your server' : 'Register with your server'}</Text><Text selectable style={[typography.mono, { color: colors.text2 }]}>{identityId}</Text><Text style={[typography.body, { color: colors.text2 }]}>{restoring ? `This identity could not be reached on ${candidate?.discovery.node.displayName ?? 'your selected node'} a moment ago. Try again, or continue offline and sign in when a path opens.` : `Jagoo will certify your Forum key, complete a signed challenge, and obtain an anonymous publishing credential from ${candidate?.discovery.node.displayName ?? 'your selected node'}.`}</Text><View style={[styles.detailCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>{stages.map((item, index) => <View key={item} style={styles.timelineRow}><Text style={[typography.mono, { color: colors.ember }]}>{index + 1}</Text><Text style={[typography.body, { color: colors.text }]}>{item}</Text></View>)}</View><Button colors={colors} disabled={busy} label={busy ? (restoring ? 'Signing in…' : 'Registering…') : restoring ? 'Try again' : 'Register now'} onPress={onRegister} /><Button colors={colors} label="Finish offline" variant="secondary" onPress={onOffline} /></View>;
}

function ReadyStep({ colors, candidate, identityId, mode, busy, onFinish }: { readonly colors: AppPalette; readonly candidate: HomeNode | null; readonly identityId: string; readonly mode: IdentityMode; readonly busy: boolean; readonly onFinish: () => void }) {
  const restoring = mode === 'restore';
  return <View style={styles.stack}><Ionicons name="shield-checkmark" size={42} color={colors.verified} /><Text accessibilityRole="header" style={[typography.h1, { color: colors.text }]}>{restoring ? 'Welcome back' : 'Your Forum identity is ready'}</Text><Text style={[typography.body, { color: colors.text2 }]}>{restoring ? `You are signed back in to the same identity on ${candidate?.discovery.node.displayName ?? 'your selected server'}. Everything you published with it is still yours.` : `You can now explore communities on ${candidate?.discovery.node.displayName ?? 'your selected server'}. Your Signal identity remains separate and can be set up later.`}</Text><Text selectable style={[typography.mono, { color: colors.text2 }]}>{identityId}</Text><Button colors={colors} disabled={busy} label={busy ? 'Opening Jagoo…' : 'Explore communities'} icon="arrow-forward" onPress={onFinish} /></View>;
}

const styles = StyleSheet.create({
  hero: { minHeight: 260, padding: spacing.lg, justifyContent: 'space-between' }, brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, seal: { width: 28, height: 28, borderWidth: 5, borderRadius: radius.pill }, heroTitle: { fontSize: 35, lineHeight: 42, letterSpacing: -0.8 }, progress: { flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingTop: spacing.lg }, progressDot: { height: 4, flex: 1, borderRadius: radius.pill }, content: { width: '100%', maxWidth: 680, alignSelf: 'center', padding: spacing.lg, gap: spacing.md }, stack: { gap: spacing.md }, copyHint: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingTop: spacing.xs }, input: { minHeight: 52, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md }, phraseInput: { minHeight: 140, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, textAlignVertical: 'top' }, serverRow: { minHeight: 68, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, transportSelect: { minHeight: 68, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, transportMenu: { borderWidth: 1, borderRadius: radius.md, overflow: 'hidden' }, transportOption: { minHeight: 68, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, flex: { flex: 1, minWidth: 180 }, detailCard: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.xs }, option: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }, wordGrid: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs }, timelineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 }, actionRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm }, scanner: { height: 320, borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden', justifyContent: 'flex-end', padding: spacing.md },
});
