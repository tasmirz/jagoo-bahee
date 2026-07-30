/**
 * Choosing who to message, by name.
 *
 * ── What this replaces ─────────────────────────────────────────────────────────────
 * A `TextField` labelled "Recipient Signal key (hex)" that validated `length !== 64`. To
 * start a conversation you had to obtain 64 hexadecimal characters out of band and type
 * them in. Every piece needed to do better already existed and was wired to nothing that
 * could reach this screen: a signed directory with a `?q=` search, an offline-first cache
 * that reports its own staleness, a device-local contact store with per-record
 * verification, and a QR generator and scanner used for mesh pairing.
 *
 * ── Three ways to find someone, in the order they usually work ────────────────────
 *   1. People already saved on this device — works in a blackout, needs nothing.
 *   2. Search this server and the servers it federates with — profiles arrive as ordinary
 *      envelopes, so a peer's users are searchable here without a dedicated RPC.
 *   3. Scan their code — the answer when someone is on an unrelated server, or when there
 *      is no server at all.
 *
 * Every row shows a fingerprint next to the name. Names are first-come per server and can
 * repeat across the federation, so the name narrows the search and the fingerprint is what
 * identifies. Colour never carries the verification state on its own.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  Button,
  EmptyState,
  Fingerprint,
  Row,
  SectionHeader,
  StatusBanner,
  TextField,
  radius,
  size,
  spacing,
  type as typography,
  type AppPalette,
} from '../../design-system';
import { useDebouncedValue } from '../../hooks/use-debounced-value';
import { loadSignalContacts, saveSignalContactFromDirectory, type SignalContact } from './contacts';
import { searchSignalDirectory, type SignalDirectoryProfile } from './directory';
import { parseSignalIdentityCard } from './identity-card';

export interface PickedPerson {
  /** Ed25519 identity key, hex — what the send path needs. */
  readonly identityKey: string;
  readonly displayName: string;
  readonly identityId: string;
  readonly verified: boolean;
}

const hex = (value: Uint8Array): string =>
  Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');

function PersonRow({
  colors,
  identityId,
  name,
  onPress,
  subtitle,
  verified,
}: {
  readonly colors: AppPalette;
  readonly identityId: string;
  readonly name: string;
  readonly onPress: () => void;
  readonly subtitle?: string;
  readonly verified: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={`Message ${name}`}
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.row, { borderBottomColor: colors.border }]}
    >
      <View style={[styles.avatar, { backgroundColor: colors.surface2 }]}>
        <Text style={[typography.label, { color: colors.signal }]}>
          {[...(name || '?')][0]?.toUpperCase() ?? '?'}
        </Text>
      </View>
      <View style={styles.flex}>
        <Text numberOfLines={1} style={[typography.label, { color: colors.text }]}>
          {name || 'Unnamed'}
        </Text>
        <Fingerprint colors={colors} value={identityId} />
        {subtitle ? (
          <Text numberOfLines={1} style={[typography.caption, { color: colors.text2 }]}>
            {subtitle}
          </Text>
        ) : null}
        {/*
          Verification state carries an icon AND words. A tinted dot alone is invisible to a
          colour-vision difference and in daylight, and this is the row someone reads when
          deciding whether the person they are about to message is who the name says.
        */}
        <Row gap={spacing.xxs}>
          <Ionicons
            color={verified ? colors.verified : colors.constrained}
            name={verified ? 'shield-checkmark' : 'alert-circle-outline'}
            size={13}
          />
          <Text
            style={[typography.caption, { color: verified ? colors.verified : colors.constrained }]}
          >
            {verified ? 'Identity checked on this device' : 'Not verified yet'}
          </Text>
        </Row>
      </View>
      <Ionicons color={colors.text2} name="chevron-forward" size={18} />
    </Pressable>
  );
}

export function PeoplePicker({
  baseUrl,
  colors,
  onPick,
}: {
  readonly baseUrl: string;
  readonly colors: AppPalette;
  readonly onPick: (person: PickedPerson) => void;
}) {
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query, 300);
  const [contacts, setContacts] = useState<readonly SignalContact[]>([]);
  const [results, setResults] = useState<readonly SignalDirectoryProfile[]>([]);
  const [notice, setNotice] = useState('');
  const [stale, setStale] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  useEffect(() => {
    void loadSignalContacts().then(setContacts);
  }, []);

  useEffect(() => {
    const needle = debounced.trim();
    if (!needle) {
      setResults([]);
      setNotice('');
      return;
    }
    let live = true;
    void searchSignalDirectory(baseUrl, needle)
      .then((result) => {
        if (!live) return;
        setResults(result.profiles);
        setStale(result.source === 'cache');
        setNotice(result.notice ?? '');
      })
      .catch((error: Error) => {
        if (live) setNotice(error.message);
      });
    return () => {
      live = false;
    };
  }, [baseUrl, debounced]);

  const pickProfile = async (profile: SignalDirectoryProfile) => {
    // Saving verifies, and returns the verdict rather than throwing: a profile published
    // without mesh binding material is normal and must still be reachable.
    const { contact, verdict } = await saveSignalContactFromDirectory(profile, {
      allowUnverified: true,
    });
    setContacts(await loadSignalContacts());
    onPick({
      identityKey: contact.identityKey,
      displayName: contact.displayName,
      identityId: contact.identityId,
      verified: verdict.ok,
    });
  };

  const needle = query.trim().toLocaleLowerCase();
  const shown = needle
    ? contacts.filter((contact) =>
        `${contact.displayName}\n${contact.identityId}`.toLocaleLowerCase().includes(needle),
      )
    : contacts;
  const known = new Set(contacts.map((contact) => contact.identityId));
  const discovered = results.filter((profile) => !known.has(profile.id));

  return (
    <View style={styles.stack}>
      <TextField
        autoCapitalize="none"
        autoCorrect={false}
        colors={colors}
        label="Search by name"
        onChangeText={setQuery}
        placeholder="Amina"
        value={query}
      />
      <Row gap={spacing.xs} wrap>
        <Button
          colors={colors}
          icon="qr-code-outline"
          label={scanning ? 'Stop scanning' : 'Scan a code'}
          onPress={() =>
            void (scanning
              ? setScanning(false)
              : permission?.granted
                ? setScanning(true)
                : requestPermission().then((result) => setScanning(result.granted)))
          }
          variant="secondary"
        />
      </Row>
      {scanning ? (
        <View style={[styles.camera, { borderColor: colors.border }]}>
          <CameraView
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={(result) => {
              const card = parseSignalIdentityCard(result.data);
              if (!card) {
                setNotice('That code is not a Jagoo Bahee messaging identity.');
                return;
              }
              setScanning(false);
              setNotice('');
              // A scanned name is a claim by whoever made the code, so it is carried but
              // never marked verified. Only an in-person fingerprint check does that.
              onPick({
                identityKey: hex(card.identityKey),
                displayName: card.displayName,
                identityId: '',
                verified: false,
              });
            }}
            style={StyleSheet.absoluteFill}
          />
        </View>
      ) : null}

      {stale ? (
        <StatusBanner
          body="The server is unreachable, so these are the people this device already knew about."
          colors={colors}
          icon="cloud-offline-outline"
          title="Showing saved results"
          tone="warning"
        />
      ) : null}
      {notice && !stale ? (
        <StatusBanner
          body={notice}
          colors={colors}
          icon="warning-outline"
          title="Search"
          tone="warning"
        />
      ) : null}

      {shown.length > 0 ? <SectionHeader colors={colors} title="On this device" /> : null}
      {shown.map((contact) => (
        <PersonRow
          colors={colors}
          identityId={contact.identityId}
          key={contact.identityId}
          name={contact.displayName}
          onPress={() =>
            onPick({
              identityKey: contact.identityKey,
              displayName: contact.displayName,
              identityId: contact.identityId,
              verified: contact.verifiedAtMs !== null,
            })
          }
          verified={contact.verifiedAtMs !== null}
        />
      ))}

      {discovered.length > 0 ? <SectionHeader colors={colors} title="Found on your servers" /> : null}
      {discovered.map((profile) => (
        <PersonRow
          colors={colors}
          identityId={profile.id}
          key={profile.id}
          name={profile.displayName}
          onPress={() => void pickProfile(profile)}
          subtitle={profile.bio}
          verified={false}
        />
      ))}

      {shown.length === 0 && discovered.length === 0 ? (
        <EmptyState
          body={
            needle
              ? 'Nobody by that name here. If they are on another server, ask them to show you their code.'
              : 'Search for someone by name, or scan the code on their device.'
          }
          colors={colors}
          icon="people-outline"
          system="signal"
          title={needle ? 'No one found' : 'Find someone'}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  flex: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 72,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: size.touch,
    height: size.touch,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  camera: {
    height: 280,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
});
