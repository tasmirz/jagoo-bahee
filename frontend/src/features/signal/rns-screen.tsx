import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import type { AppPalette, ReachState, ThemeMode } from '../../design-system';
import { AppHeader, Button, Screen, SectionHeader, StatusBanner, WorkProgress } from '../../design-system';
import { radius, spacing, type as typography } from '../../design-system';
import { publishSignalDirectoryProfile, signalSessionSummary } from '../../signer/signal';
import {
  deleteSignalContact,
  loadSignalContacts,
  drainSignalLxmf,
  markSignalContactMessaged,
  searchSignalDirectory,
  sendSignalLxmf,
  setSignalContactFollowed,
  signalRnsStatus,
  startSignalRns,
  stopSignalRns,
  saveSignalContactFromDirectory,
  verifySignalContact,
  type SignalContact,
  type SignalDirectoryProfile,
} from '.';
import type { RnsStatus } from '../../../modules/jagoo-rns';

const DEFAULT_INDEX = process.env.EXPO_PUBLIC_SIGNAL_INDEX_URL ?? '';

function hexBytes(value: string): Uint8Array {
  if (!/^[0-9a-f]{32}$/i.test(value)) throw new Error('LXMF returned an invalid destination.');
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (pair) => Number.parseInt(pair, 16));
}

function ageLabel(atMs: number): string {
  if (!atMs) return 'never';
  const minutes = Math.max(0, Math.round((Date.now() - atMs) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}

export function RnsSignalScreen({
  colors,
  reach,
  mode,
  onBack,
  indexUrl: initialIndexUrl = DEFAULT_INDEX,
}: {
  readonly colors: AppPalette;
  readonly reach: ReachState;
  readonly mode?: ThemeMode;
  readonly onBack?: () => void;
  readonly indexUrl?: string;
}) {
  const [indexUrl, setIndexUrl] = useState(initialIndexUrl);
  const [status, setStatus] = useState<RnsStatus | null>(null);
  const [directory, setDirectory] = useState<readonly SignalDirectoryProfile[]>([]);
  const [directoryNotice, setDirectoryNotice] = useState<{ readonly refreshedAtMs: number; readonly detail: string } | null>(null);
  const [contacts, setContacts] = useState<readonly SignalContact[]>([]);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState<SignalDirectoryProfile | SignalContact | null>(null);
  const [inbox, setInbox] = useState<readonly { readonly id: string; readonly sourceHash: string; readonly content: string; readonly title: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [workLabel, setWorkLabel] = useState('');
  const [profileName, setProfileName] = useState('');
  const [profileBio, setProfileBio] = useState('');
  const [profileNotice, setProfileNotice] = useState('');

  const refresh = useCallback(async () => {
    const [nextStatus, nextContacts] = await Promise.all([signalRnsStatus(), loadSignalContacts()]);
    setStatus(nextStatus);
    setContacts(nextContacts);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (label: string, operation: () => Promise<void>) => {
    try {
      setBusy(true);
      setWorkLabel(label);
      await operation();
    } catch (error) {
      Alert.alert('Signal transport', error instanceof Error ? error.message : 'Operation failed');
    } finally {
      setBusy(false);
      setWorkLabel('');
      await refresh();
    }
  };

  const start = (rnode = false) =>
    run(rnode ? 'Starting Bluetooth RNode transport…' : 'Starting Wi-Fi and TCP transport…', async () => {
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
    run('Searching the Signal directory…', async () => {
      if (!indexUrl.trim()) throw new Error('Enter the Signal index address.');
      const result = await searchSignalDirectory(indexUrl.trim(), query);
      setDirectory(result.profiles);
      // "Nobody matched" and "the index is unreachable" must not look the same on screen.
      setDirectoryNotice(
        result.source === 'cache'
          ? { refreshedAtMs: result.refreshedAtMs, detail: result.notice ?? '' }
          : null,
      );
    });

  /**
   * Save a discovered identity so it survives the network going away.
   *
   * This is the whole point of the screen: after this returns, the identity key and the
   * signed delivery address are on the device, and messaging this person needs no index.
   */
  const saveContact = (profile: SignalDirectoryProfile, followed = false) =>
    run('Saving contact to this device…', async () => {
      const { verdict } = await saveSignalContactFromDirectory(profile, { followed });
      if (verdict.ok) return;
      // Saving an identity the index could not prove is the user's call, not ours — but it
      // must be a decision they made, and the record stays marked unverified either way.
      await new Promise<void>((resolve) => {
        Alert.alert(
          'Identity not proven',
          `${verdict.reason}\n\nYou can still save ${profile.displayName || profile.id}, but this device cannot confirm the address belongs to them.`,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve() },
            {
              text: 'Save unverified',
              onPress: () => {
                void saveSignalContactFromDirectory(profile, { allowUnverified: true, followed })
                  .then(() => resolve())
                  .catch(() => resolve());
              },
            },
          ],
        );
      });
    });

  const follow = (profile: SignalDirectoryProfile) =>
    run('Saving follow on this device…', async () => {
      const existing = contacts.find((contact) => contact.identityId === profile.id);
      if (!existing) {
        // Persist the discovered identity before recording a follow against it.
        const { verdict } = await saveSignalContactFromDirectory(profile, { followed: true });
        if (!verdict.ok) throw new Error(`${verdict.reason} Save this contact explicitly to keep it anyway.`);
        return;
      }
      await setSignalContactFollowed(existing.identityId, !existing.followed);
    });

  const removeContact = (contact: SignalContact) =>
    run('Removing saved contact…', async () => {
      await deleteSignalContact(contact.identityId);
      setSelected((current) =>
        current && 'identityId' in current && current.identityId === contact.identityId ? null : current,
      );
    });

  const send = () =>
    run('Encrypting and queuing LXMF message…', async () => {
      if (!selected) throw new Error('Choose a saved Signal contact.');
      if (!message.trim()) throw new Error('Write a message first.');
      const selectedId = 'identityId' in selected ? selected.identityId : selected.id;
      const saved = contacts.find((contact) => contact.identityId === selectedId);
      if (!saved) {
        throw new Error('Save this contact first — a message needs an identity this device holds.');
      }
      // Re-verify against the stored bytes, not against what the index said when it was saved.
      const verdict = verifySignalContact(saved);
      if (!verdict.ok && saved.verifiedAtMs !== null) {
        throw new Error(`This saved contact no longer verifies: ${verdict.reason}`);
      }
      await sendSignalLxmf({ destinationHash: saved.lxmfDestinationHash, content: message.trim() });
      await markSignalContactMessaged(saved.identityId);
      setMessage('');
    });

  const receive = () =>
    run('Checking the local LXMF inbox…', async () => {
      const messages = await drainSignalLxmf();
      setInbox((current) => [...messages, ...current]);
    });

  const publishProfile = () =>
    run('Signing your searchable Signal profile…', async () => {
      if (!profileName.trim()) throw new Error('Choose a username first.');
      if (!indexUrl.trim()) throw new Error('Enter the Signal index address.');
      const session = await signalSessionSummary();
      if (!session.unlocked) throw new Error('Create or unlock your Signal identity first.');
      if (!session.authenticated) throw new Error('Register and authenticate your Signal identity first.');
      const current = status?.state === 'running' ? status : await startSignalRns(indexUrl.trim());
      if (!current.destinationHash) throw new Error(current.error ?? 'Start RNS before publishing a profile.');
      await publishSignalDirectoryProfile(
        indexUrl.trim(),
        {
          displayName: profileName.trim(),
          bio: profileBio.trim(),
          discoverable: true,
          languages: ['en', 'bn'],
          revision: BigInt(Date.now()),
          lxmfDestinationHash: hexBytes(current.destinationHash),
        },
      );
      setProfileNotice(`${profileName.trim()} · ${session.identityId ?? current.destinationHash}`);
      setDirectory((await searchSignalDirectory(indexUrl.trim(), profileName.trim())).profiles);
    });

  const state = status?.state ?? 'stopped';
  return (
    <Screen colors={colors}>
      <AppHeader colors={colors} mode={mode} onBack={onBack} reach={reach} title="Signal mesh" />
      <View style={styles.body}>
        {busy ? <WorkProgress colors={colors} label={workLabel || 'Working…'} /> : null}
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
          <Button colors={colors} system="signal" label="Start RNS" loading={busy && workLabel.includes('Wi-Fi')} onPress={start} disabled={busy} icon="radio-outline" />
          <Button colors={colors} system="signal" variant="secondary" label="Start BLE RNode" loading={busy && workLabel.includes('Bluetooth')} onPress={() => start(true)} disabled={busy} icon="bluetooth-outline" />
          <Button colors={colors} variant="secondary" label="Stop" onPress={() => void run('Stopping RNS…', stopSignalRns)} disabled={busy || state === 'stopped'} />
        </View>
        <SectionHeader colors={colors} title="Public Signal profile" />
        <Text style={[typography.caption, { color: colors.text2 }]}>
          Your username is paired with a server codename derived from this separate Signal identity.
        </Text>
        <TextInput
          accessibilityLabel="Signal username"
          value={profileName}
          onChangeText={setProfileName}
          maxLength={80}
          placeholder="Username"
          placeholderTextColor={colors.text3}
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
        />
        <TextInput
          accessibilityLabel="Signal profile bio"
          value={profileBio}
          onChangeText={setProfileBio}
          maxLength={500}
          placeholder="How people should recognize you"
          placeholderTextColor={colors.text3}
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
        />
        <Button colors={colors} system="signal" label="Publish username" loading={busy && workLabel.includes('profile')} onPress={publishProfile} disabled={busy || !profileName.trim()} icon="person-add-outline" />
        {profileNotice ? <StatusBanner colors={colors} icon="checkmark-circle-outline" title="Searchable profile published" body={profileNotice} tone="verified" /> : null}
        <SectionHeader colors={colors} title="Discover people" action="Search" onAction={find} />
        <TextInput
          accessibilityLabel="Search Signal directory"
          value={query}
          onChangeText={setQuery}
          placeholder="Name or contact claim"
          placeholderTextColor={colors.text3}
          style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
        />
        {directoryNotice ? (
          <StatusBanner
            colors={colors}
            icon="cloud-offline-outline"
            tone="warning"
            title="Showing contacts saved on this device"
            body={`The index is unreachable, so these are the profiles this device already knew. Last refreshed ${ageLabel(directoryNotice.refreshedAtMs)}.`}
          />
        ) : null}
        {directory.map((profile) => {
          const contact = contacts.find((row) => row.identityId === profile.id);
          return (
            <View key={profile.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[typography.label, { color: colors.text }]}>{profile.displayName}</Text>
              <Text selectable style={[typography.mono, { color: colors.signal }]}>{profile.codename || profile.id}</Text>
              {profile.bio ? <Text style={[typography.body, { color: colors.text2 }]}>{profile.bio}</Text> : null}
              {contact ? (
                <Text style={[typography.caption, { color: colors.text2 }]}>
                  ✓ Saved on this device — reachable without the index
                </Text>
              ) : null}
              <View style={styles.actions}>
                <Button
                  colors={colors}
                  system="signal"
                  label={contact ? 'Saved' : 'Save contact'}
                  icon={contact ? 'checkmark-circle-outline' : 'bookmark-outline'}
                  disabled={busy || Boolean(contact)}
                  onPress={() => saveContact(profile)}
                />
                <Button colors={colors} system="signal" variant="secondary" label={contact?.followed ? 'Unfollow' : 'Follow'} onPress={() => follow(profile)} />
                <Button colors={colors} system="signal" variant="ghost" label="Message" onPress={() => setSelected(contact ?? profile)} />
              </View>
            </View>
          );
        })}
        <SectionHeader colors={colors} title={`Saved contacts (${contacts.length})`} />
        <Text style={[typography.caption, { color: colors.text2 }]}>
          Saved contacts carry the other person’s identity key and the delivery address that key signed, so
          messaging them keeps working with the index — and the internet — gone.
        </Text>
        {contacts.length === 0 ? (
          <Text style={[typography.caption, { color: colors.text2 }]}>
            No contacts saved yet. Search above and choose “Save contact” while you still have a connection.
          </Text>
        ) : null}
        {contacts.map((contact) => (
          <View key={contact.identityId} style={[styles.contactRow, { borderBottomColor: colors.border }]}>
            <View style={styles.flex}>
              <Text numberOfLines={1} style={[typography.label, { color: colors.text }]}>{contact.displayName}</Text>
              <Text numberOfLines={1} style={[typography.mono, { color: colors.text3 }]}>{contact.identityId}</Text>
              {/* Shape and words carry the state, never colour alone. */}
              <Text style={[typography.caption, { color: contact.verifiedAtMs === null ? colors.constrained : colors.text2 }]}>
                {contact.verifiedAtMs === null
                  ? '⚠ Unverified — this device cannot prove the address is theirs'
                  : `✓ Identity verified on this device · saved ${ageLabel(contact.savedAtMs)}`}
              </Text>
            </View>
            <Button colors={colors} system="signal" variant="ghost" label="Message" onPress={() => setSelected(contact)} />
            <Button
              colors={colors}
              variant="ghost"
              label="Remove"
              accessibilityLabel={`Remove ${contact.displayName || contact.identityId} from saved contacts`}
              onPress={() => removeContact(contact)}
            />
          </View>
        ))}
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
  contactRow: { minHeight: 64, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1, minWidth: 0 },
});
