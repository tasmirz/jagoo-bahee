import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Button, Screen, StatusBanner } from '../../design-system';
import type { HomeNode } from '../../data/node-config';
import { discoverHomeNode } from '../../data/node-config';
import { createForumIdentity, importForumIdentity, registerForumIdentity } from '../../signer';
import { radius, spacing, type as typography, type AppPalette } from '../../theme';

type Step = 'welcome' | 'server' | 'confirm' | 'identity' | 'protection' | 'backup' | 'register' | 'ready';
type IdentityMode = 'create' | 'restore';
type Protection = 'device' | 'password' | 'salt';

const steps: readonly Step[] = ['welcome', 'server', 'confirm', 'identity', 'protection', 'backup', 'register', 'ready'];

export function WelcomeFlow({
  colors,
  onComplete,
}: {
  readonly colors: AppPalette;
  readonly onComplete: (address: string) => Promise<void>;
}) {
  const [step, setStep] = useState<Step>('welcome');
  const [candidate, setCandidate] = useState<HomeNode | null>(null);
  const [mode, setMode] = useState<IdentityMode>('create');
  const [protection, setProtection] = useState<Protection>('device');
  const [address, setAddress] = useState('');
  const [phrase, setPhrase] = useState('');
  const [password, setPassword] = useState('');
  const [recoverySalt, setRecoverySalt] = useState('');
  const [identityId, setIdentityId] = useState('');
  const [wordCheck, setWordCheck] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const stepNumber = Math.max(1, steps.indexOf(step));
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
      const found = await discoverHomeNode(nextAddress);
      setCandidate(found);
      setStep('confirm');
    });

  const createOrRestore = () =>
    run(async () => {
      const appPassword = requiresPassword ? password : undefined;
      const salt = protection === 'salt' ? recoverySalt : '';
      if (mode === 'create') {
        const created = await createForumIdentity(appPassword, salt);
        setPhrase(created.recoveryPhrase);
        setIdentityId(created.identityId);
        setStep('backup');
      } else {
        const restoredId = await importForumIdentity(phrase, appPassword, salt);
        setIdentityId(restoredId);
        setStep('register');
      }
    });

  const register = () =>
    run(async () => {
      if (!candidate) throw new Error('Choose a home server first.');
      await registerForumIdentity(candidate.baseUrl, candidate.discovery.services.auditLogs);
      setStep('ready');
    });

  const finish = () =>
    run(async () => {
      if (!candidate) throw new Error('Choose a home server first.');
      await onComplete(candidate.baseUrl);
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

      <View style={styles.progress} accessibilityLabel={`Step ${stepNumber} of 7`}>
        {steps.slice(1).map((item, index) => <View key={item} style={[styles.progressDot, { backgroundColor: index < stepNumber ? colors.ember : colors.border }]} />)}
      </View>
      <View style={styles.content}>
        {error ? <StatusBanner colors={colors} icon="alert-circle-outline" title="Try again" body={error} tone="danger" /> : null}

        {step === 'welcome' ? <WelcomeStep colors={colors} onCreate={() => { setMode('create'); setStep('server'); }} onRestore={() => { setMode('restore'); setStep('server'); }} /> : null}
        {step === 'server' ? <ServerStep address={address} busy={busy} colors={colors} onAddress={setAddress} onChoose={chooseServer} /> : null}
        {step === 'confirm' && candidate ? <ConfirmStep candidate={candidate} colors={colors} onContinue={() => setStep('identity')} onBack={() => setStep('server')} /> : null}
        {step === 'identity' ? <IdentityStep colors={colors} mode={mode} phrase={phrase} onPhrase={setPhrase} onContinue={() => setStep('protection')} onChangeMode={() => { setMode(mode === 'create' ? 'restore' : 'create'); setPhrase(''); }} /> : null}
        {step === 'protection' ? <ProtectionStep colors={colors} protection={protection} password={password} salt={recoverySalt} onProtection={setProtection} onPassword={setPassword} onSalt={setRecoverySalt} onContinue={createOrRestore} busy={busy} /> : null}
        {step === 'backup' ? <BackupStep colors={colors} phrase={phrase} confirmIndex={confirmIndex} wordCheck={wordCheck} onWordCheck={setWordCheck} onContinue={() => { setPhrase(''); setStep('register'); }} /> : null}
        {step === 'register' ? <RegisterStep busy={busy} colors={colors} identityId={identityId} candidate={candidate} onRegister={register} onOffline={() => setStep('ready')} /> : null}
        {step === 'ready' ? <ReadyStep colors={colors} candidate={candidate} identityId={identityId} busy={busy} onFinish={finish} /> : null}
      </View>
    </Screen>
  );
}

function WelcomeStep({ colors, onCreate, onRestore }: { readonly colors: AppPalette; readonly onCreate: () => void; readonly onRestore: () => void }) {
  return <View style={styles.stack}><Text accessibilityRole="header" style={[typography.h1, { color: colors.text }]}>Start with an identity</Text><Text style={[typography.body, { color: colors.text2 }]}>Your recovery phrase and keys stay on this device. A server can host your community, but it cannot recreate your identity.</Text><Button colors={colors} label="Create a new identity" icon="arrow-forward" onPress={onCreate} /><Button colors={colors} label="I already have an identity" variant="secondary" onPress={onRestore} /><Text style={[typography.caption, { color: colors.text2 }]}>You can change language and appearance later. The first task is simply making your identity recoverable.</Text></View>;
}

function ServerStep({ address, busy, colors, onAddress, onChoose }: { readonly address: string; readonly busy: boolean; readonly colors: AppPalette; readonly onAddress: (value: string) => void; readonly onChoose: (address?: string) => void }) {
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const configured = process.env.EXPO_PUBLIC_NODE_URL?.trim();
  const local = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://127.0.0.1:3000';
  const suggestions = [
    ...(configured ? [{ label: 'Configured community server', address: configured }] : []),
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
    {suggestions.map((item) => <Pressable accessibilityRole="button" key={item.address} onPress={() => onChoose(item.address)} style={[styles.serverRow, { borderColor: colors.border, backgroundColor: colors.surface }]}><Ionicons color={colors.ember} name="server-outline" size={20} /><View style={styles.flex}><Text style={[typography.label, { color: colors.text }]}>{item.label}</Text><Text selectable style={[typography.mono, { color: colors.text2 }]}>{item.address}</Text></View><Ionicons color={colors.text2} name="chevron-forward" size={18} /></Pressable>)}
    <Text style={[typography.label, { color: colors.text }]}>My server</Text>
    <TextInput accessibilityLabel="Home server address" autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="192.168.1.20:3000" placeholderTextColor={colors.text3} style={[styles.input, typography.bodyLarge, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.text }]} value={address} onChangeText={onAddress} onSubmitEditing={() => onChoose()} />
    <View style={styles.actionRow}><View style={styles.flex}><Button colors={colors} disabled={busy || !address.trim()} label={busy ? 'Checking server…' : 'Check this server'} onPress={() => onChoose()} /></View><Button colors={colors} icon="qr-code-outline" label="Scan QR" onPress={() => void (permission?.granted ? setScanning(true) : requestPermission().then((result) => setScanning(result.granted)))} variant="secondary" /></View>
    {scanning ? <View style={[styles.scanner, { borderColor: colors.border }]}><CameraView barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={({ data }) => scanAddress(data)} style={StyleSheet.absoluteFill} /><Button colors={colors} label="Cancel scan" onPress={() => setScanning(false)} variant="secondary" /></View> : null}
    <StatusBanner colors={colors} icon="eye-off-outline" title="Server choice stays on this device" body="Jagoo stores the verified server address locally. You can replace it later from Network." />
  </View>;
}

function ConfirmStep({ candidate, colors, onContinue, onBack }: { readonly candidate: HomeNode; readonly colors: AppPalette; readonly onContinue: () => void; readonly onBack: () => void }) {
  return <View style={styles.stack}><Text accessibilityRole="header" style={[typography.h1, { color: colors.text }]}>This server is reachable</Text><View style={[styles.detailCard, { borderColor: colors.border, backgroundColor: colors.surface }]}><Text style={[typography.overline, { color: colors.ember }]}>Home server</Text><Text style={[typography.h2, { color: colors.text }]}>{candidate.discovery.node.displayName}</Text><Text selectable style={[typography.mono, { color: colors.text2 }]}>{candidate.baseUrl}</Text><Text selectable style={[typography.mono, { color: colors.text2 }]}>{candidate.discovery.node.serverId}</Text></View><Text style={[typography.body, { color: colors.text2 }]}>It advertises {candidate.discovery.services.auditLogs.length} audit service{candidate.discovery.services.auditLogs.length === 1 ? '' : 's'} and {candidate.discovery.services.mcaptcha.length} anti-abuse service{candidate.discovery.services.mcaptcha.length === 1 ? '' : 's'}.</Text><Button colors={colors} label="Use this server" onPress={onContinue} /><Button colors={colors} label="Choose another" variant="ghost" onPress={onBack} /></View>;
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
  const words = phrase.trim().split(/\s+/);
  const checked = wordCheck.trim().toLowerCase() === words[confirmIndex]?.toLowerCase();
  return <View style={styles.stack}><StatusBanner colors={colors} icon="eye-off-outline" title="Shown once" body="Jagoo Bahee and your server cannot recover this phrase. Save it somewhere private before continuing." tone="warning" /><Text accessibilityRole="header" style={[typography.h1, { color: colors.text }]}>Write down your recovery phrase</Text><View style={[styles.wordGrid, { borderColor: colors.border, backgroundColor: colors.surface }]}>{words.map((word, index) => <Text key={`${word}-${index}`} selectable style={[typography.mono, { color: colors.text }]}>{String(index + 1).padStart(2, '0')}. {word}</Text>)}</View><Text style={[typography.label, { color: colors.text }]}>What is word {confirmIndex + 1}?</Text><TextInput accessibilityLabel={`Recovery word ${confirmIndex + 1}`} autoCapitalize="none" autoCorrect={false} style={[styles.input, typography.body, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.text }]} value={wordCheck} onChangeText={onWordCheck} /><Button colors={colors} disabled={!checked} label="I saved it safely" onPress={onContinue} /></View>;
}

function RegisterStep({ busy, colors, identityId, candidate, onRegister, onOffline }: { readonly busy: boolean; readonly colors: AppPalette; readonly identityId: string; readonly candidate: HomeNode | null; readonly onRegister: () => void; readonly onOffline: () => void }) {
  return <View style={styles.stack}><Text accessibilityRole="header" style={[typography.h1, { color: colors.text }]}>Register with your server</Text><Text selectable style={[typography.mono, { color: colors.text2 }]}>{identityId}</Text><Text style={[typography.body, { color: colors.text2 }]}>Jagoo will certify your Forum key, complete a signed challenge, and obtain an anonymous publishing credential from {candidate?.discovery.node.displayName ?? 'your selected node'}.</Text><View style={[styles.detailCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>{['Check server policy', 'Solve anonymous proof of work', 'Certify your Forum key', 'Authenticate and cache credential'].map((item, index) => <View key={item} style={styles.timelineRow}><Text style={[typography.mono, { color: colors.ember }]}>{index + 1}</Text><Text style={[typography.body, { color: colors.text }]}>{item}</Text></View>)}</View><Button colors={colors} disabled={busy} label={busy ? 'Registering…' : 'Register now'} onPress={onRegister} /><Button colors={colors} label="Finish offline" variant="secondary" onPress={onOffline} /></View>;
}

function ReadyStep({ colors, candidate, identityId, busy, onFinish }: { readonly colors: AppPalette; readonly candidate: HomeNode | null; readonly identityId: string; readonly busy: boolean; readonly onFinish: () => void }) {
  return <View style={styles.stack}><Ionicons name="shield-checkmark" size={42} color={colors.verified} /><Text accessibilityRole="header" style={[typography.h1, { color: colors.text }]}>Your Forum identity is ready</Text><Text style={[typography.body, { color: colors.text2 }]}>You can now explore communities on {candidate?.discovery.node.displayName ?? 'your selected server'}. Your Signal identity remains separate and can be set up later.</Text><Text selectable style={[typography.mono, { color: colors.text2 }]}>{identityId}</Text><Button colors={colors} disabled={busy} label={busy ? 'Opening Jagoo…' : 'Explore communities'} icon="arrow-forward" onPress={onFinish} /></View>;
}

const styles = StyleSheet.create({
  hero: { minHeight: 260, padding: spacing.lg, justifyContent: 'space-between' }, brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, seal: { width: 28, height: 28, borderWidth: 5, borderRadius: radius.pill }, heroTitle: { fontSize: 35, lineHeight: 42, letterSpacing: -0.8 }, progress: { flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingTop: spacing.lg }, progressDot: { height: 4, flex: 1, borderRadius: radius.pill }, content: { width: '100%', maxWidth: 680, alignSelf: 'center', padding: spacing.lg, gap: spacing.md }, stack: { gap: spacing.md }, input: { minHeight: 52, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md }, phraseInput: { minHeight: 140, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, textAlignVertical: 'top' }, serverRow: { minHeight: 68, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, flex: { flex: 1, minWidth: 180 }, detailCard: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.xs }, option: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }, wordGrid: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs }, timelineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 }, actionRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm }, scanner: { height: 320, borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden', justifyContent: 'flex-end', padding: spacing.md },
});
