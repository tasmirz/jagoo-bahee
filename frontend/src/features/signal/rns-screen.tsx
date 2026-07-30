import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import type { AppPalette, ReachState } from '../../design-system';
import { AppHeader, Button, Screen, SectionHeader, StatusBanner } from '../../design-system';
import { radius, spacing, type as typography } from '../../design-system';
import { signalSessionSummary } from '../../signer/signal';
import {
  loadSignalContacts,
  drainSignalLxmf,
  searchSignalDirectory,
  sendSignalLxmf,
  setSignalContactFollowed,
  signalRnsStatus,
  startSignalRns,
  stopSignalRns,
  saveSignalContact,
  type SignalContact,
  type SignalDirectoryProfile,
} from '.';
import type { RnsStatus } from '../../../modules/jagoo-rns';

const DEFAULT_INDEX = process.env.EXPO_PUBLIC_SIGNAL_INDEX_URL ?? '';

function toContact(profile: SignalDirectoryProfile): SignalContact {
  return {
    identityId: profile.id,
    displayName: profile.displayName,
    lxmfDestinationHash: profile.lxmfDestinationHash,
    rnsPublicKey: profile.rnsPublicKey,
    followed: false,
    messagedAtMs: null,
    savedAtMs: Date.now(),
  };
}

export function RnsSignalScreen({ colors, reach }: { readonly colors: AppPalette; readonly reach: ReachState }) {
  const [indexUrl, setIndexUrl] = useState(DEFAULT_INDEX);
  const [status, setStatus] = useState<RnsStatus | null>(null);
  const [directory, setDirectory] = useState<readonly SignalDirectoryProfile[]>([]);
  const [contacts, setContacts] = useState<readonly SignalContact[]>([]);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState<SignalDirectoryProfile | null>(null);
  const [inbox, setInbox] = useState<readonly { readonly id: string; readonly sourceHash: string; readonly content: string; readonly title: string }[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [nextStatus, nextContacts] = await Promise.all([signalRnsStatus(), loadSignalContacts()]);
    setStatus(nextStatus);
    setContacts(nextContacts);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (operation: () => Promise<void>) => {
    try {
      setBusy(true);
      await operation();
    } catch (error) {
      Alert.alert('Signal transport', error instanceof Error ? error.message : 'Operation failed');
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  const start = (rnode = false) =>
    run(async () => {
      const session = await signalSessionSummary();
      if (!session.unlocked) throw new Error('Create or unlock your separate Signal identity first.');
      if (!indexUrl.trim()) throw new Error('Enter the Signal index address.');
      const next = await startSignalRns(indexUrl.trim(), {
        includeAutoInterface: true,
        ...(rnode ? { rnode: { kind: 'rnode_ble', device: 'auto', enabled: true } as const } : {}),
      });
      setStatus(next);
      if (next.error) throw new Error(next.error);
    });

  const find = () =>
    run(async () => {
      if (!indexUrl.trim()) throw new Error('Enter the Signal index address.');
      setDirectory(await searchSignalDirectory(indexUrl.trim(), query));
    });

  const follow = (profile: SignalDirectoryProfile) =>
    run(async () => {
      const existing = contacts.find((contact) => contact.identityId === profile.id);
      const contact = existing ?? toContact(profile);
      await setSignalContactFollowed(contact.identityId, !contact.followed);
      if (!existing) {
        // Persist the discovered address before changing its follow state.
        await saveSignalContact({ ...contact, followed: true });
      }
    });

  const send = () =>
    run(async () => {
      if (!selected) throw new Error('Choose a saved Signal contact.');
      if (!message.trim()) throw new Error('Write a message first.');
      await sendSignalLxmf({ destinationHash: selected.lxmfDestinationHash, content: message.trim() });
      setMessage('');
    });

  const receive = () =>
    run(async () => {
      const messages = await drainSignalLxmf();
      setInbox((current) => [...messages, ...current]);
    });

  const state = status?.state ?? 'stopped';
  return (
    <Screen colors={colors}>
      <AppHeader colors={colors} reach={reach} title="Signal mesh" />
      <View style={styles.body}>
        <StatusBanner
          colors={colors}
          icon={state === 'running' ? 'radio-outline' : state === 'failed' ? 'alert-circle-outline' : 'information-circle-outline'}
          tone={state === 'running' ? 'verified' : state === 'failed' ? 'danger' : 'neutral'}
          title={state === 'running' ? 'LXMF transport running' : 'Signal transport is local'}
          body={
            state === 'running'
              ? `Destination ${status?.destinationHash?.slice(0, 12) ?? ''}…`
              : 'Forum posts and forum identity are never used by this transport.'
          }
        />
        <SectionHeader colors={colors} title="Transport" />
        <TextInput
          accessibilityLabel="Signal index URL"
          autoCapitalize="none"
          autoCorrect={false}
          value={indexUrl}
          onChangeText={setIndexUrl}
          placeholder="https://signal-index.example"
          placeholderTextColor={colors.text3}
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
        />
        <Text style={[typography.caption, { color: colors.text2 }]}>TCP relay works online; Wi-Fi AutoInterface works nearby. BLE/RNode is enabled in Android builds when a radio is paired.</Text>
        <View style={styles.actions}>
          <Button colors={colors} system="signal" label={busy ? 'Working…' : 'Start RNS'} onPress={start} disabled={busy} icon="radio-outline" />
          <Button colors={colors} system="signal" variant="secondary" label="Start BLE RNode" onPress={() => start(true)} disabled={busy} icon="bluetooth-outline" />
          <Button colors={colors} variant="secondary" label="Stop" onPress={() => void run(stopSignalRns)} disabled={busy || state === 'stopped'} />
        </View>
        <SectionHeader colors={colors} title="Discover people" action="Search" onAction={find} />
        <TextInput
          accessibilityLabel="Search Signal directory"
          value={query}
          onChangeText={setQuery}
          placeholder="Name or contact claim"
          placeholderTextColor={colors.text3}
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
        />
        {directory.map((profile) => {
          const contact = contacts.find((row) => row.identityId === profile.id);
          return (
            <View key={profile.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[typography.label, { color: colors.text }]}>{profile.displayName}</Text>
              {profile.bio ? <Text style={[typography.body, { color: colors.text2 }]}>{profile.bio}</Text> : null}
              <View style={styles.actions}>
                <Button colors={colors} system="signal" variant="secondary" label={contact?.followed ? 'Unfollow' : 'Follow'} onPress={() => follow(profile)} />
                <Button colors={colors} system="signal" variant="ghost" label="Message" onPress={() => setSelected(profile)} />
              </View>
            </View>
          );
        })}
        <SectionHeader colors={colors} title={`Saved contacts (${contacts.length})`} />
        {selected ? <Text style={[typography.caption, { color: colors.signal }]}>Sending securely to {selected.displayName}</Text> : null}
        <TextInput
          accessibilityLabel="LXMF message"
          multiline
          value={message}
          onChangeText={setMessage}
          placeholder="Choose a contact, then write an LXMF message"
          placeholderTextColor={colors.text3}
          style={[styles.input, styles.message, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
        />
        <Button colors={colors} system="signal" label="Send LXMF" onPress={send} disabled={busy || !selected} icon="send-outline" />
        <SectionHeader colors={colors} title="Received LXMF" action="Refresh" onAction={receive} />
        {inbox.length === 0 ? <Text style={[typography.caption, { color: colors.text2 }]}>No new direct messages on this device.</Text> : null}
        {inbox.map((item) => (
          <View key={item.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[typography.label, { color: colors.text }]}>{item.title || item.sourceHash.slice(0, 12)}</Text>
            <Text style={[typography.body, { color: colors.text2 }]}>{item.content}</Text>
          </View>
        ))}
        <Text style={[typography.caption, { color: colors.text2 }]}>Follows, saved contacts, and broadcast delivery rules stay only on this device. A mesh packet is stored or alerted only after it matches a local follow.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.sm, padding: spacing.md },
  input: { ...typography.body, borderWidth: 1, borderRadius: radius.md, minHeight: 48, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  message: { minHeight: 92, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  card: { borderWidth: 1, borderRadius: radius.md, gap: spacing.xs, padding: spacing.sm },
});
