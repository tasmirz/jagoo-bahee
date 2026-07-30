import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import QRCode from 'react-native-qrcode-svg';
import { Priority } from '@jagoo/sdk';
import type { AppPalette, ReachState, ThemeMode } from '../../design-system';
import {
  AppHeader,
  Button,
  EmptyState,
  Pill,
  Screen,
  SectionHeader,
  StatusBanner,
  spacing,
  type as typography,
} from '../../design-system';
import { envelopeBytes, listOutbox, type OutboxRecord } from '../../offline/outbox';
import {
  MeshBloom,
  MeshRouter,
  MeshStore,
  decodeMeshPairing,
  meshEnvelopeFrame,
  type MeshFrame,
} from '../../offline/mesh';
import { NativeMeshTransport } from '../../offline/webrtc';
import {
  loadMeshPreferences,
  meshProbeIntervalMs,
  saveMeshPreferences,
  type MeshPreferences,
} from '../../offline/preferences';
import { verifyCachedMeshCertificate } from '../../offline/certificate-cache';
import {
  createJbPack,
  importJbPack,
  jbpackEnvelopeString,
} from '../../offline/jbpack';

const initialPreferences: MeshPreferences = {
  enabled: false,
  batterySaver: true,
  dataSaver: false,
};

function pairingRole(encoded: string): string | undefined {
  const base64 = encoded
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(encoded.length / 4) * 4, '=');
  const bytes = Uint8Array.from(globalThis.atob(base64), (character) =>
    character.charCodeAt(0),
  );
  return (JSON.parse(new TextDecoder().decode(bytes)) as { readonly role?: string }).role;
}

function pairingNonce(encoded: string): string {
  try {
    return decodeMeshPairing(encoded).nonce;
  } catch {
    return '';
  }
}

const pairingFingerprint = (encoded: string): string =>
  pairingNonce(encoded).slice(0, 11) || 'expired';

/** Not a themed token — see the render-site comment on `styles.qr`. */
const QR_QUIET_ZONE_COLOR = '#F8F7F3';

export function MeshScreen({
  colors,
  mode,
  reach,
  onBack,
}: {
  readonly colors: AppPalette;
  readonly mode?: ThemeMode;
  readonly reach: ReachState;
  readonly onBack: () => void;
}) {
  const [outbox, setOutbox] = useState<readonly OutboxRecord[]>([]);
  const [preferences, setPreferences] = useState(initialPreferences);
  const [pairing, setPairing] = useState('');
  const [scanning, setScanning] = useState(false);
  const [connected, setConnected] = useState(false);
  const [notice, setNotice] = useState('');
  const wasConnected = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();
  const transport = useRef<NativeMeshTransport | null>(null);
  const store = useMemo(() => new MeshStore(), []);
  const router = useMemo(
    () => new MeshRouter(store, verifyCachedMeshCertificate),
    [store],
  );

  const refresh = async () => setOutbox(await listOutbox());
  useEffect(() => {
    void Promise.all([listOutbox(), loadMeshPreferences()]).then(([rows, saved]) => {
      setOutbox(rows);
      setPreferences(saved);
    });
    return () => transport.current?.close();
  }, []);
  useEffect(() => {
    const cadence = meshProbeIntervalMs(preferences);
    if (!Number.isFinite(cadence)) {
      setConnected(false);
      return undefined;
    }
    const probe = () => {
      const open = transport.current?.available() ?? false;
      setConnected(open);
      if (open && !wasConnected.current && transport.current) {
        const current = transport.current;
        current.send({
          version: 1,
          kind: 'hello',
          peerId: current.peerId,
          nonce: current.pairingNonceValue(),
          maxFrameBytes: current.mtu,
        });
        void router
          .summary(Date.now(), outbox.map((item) => item.contentId))
          .then((summary) => current.available() && current.send(summary));
      }
      wasConnected.current = open;
    };
    probe();
    const timer = setInterval(probe, cadence);
    return () => clearInterval(timer);
  }, [outbox, pairing, preferences, router]);

  const receive = async (frame: MeshFrame) => {
    const current = transport.current;
    if (frame.kind === 'hello') {
      if (!current?.pairingNonceMatches(frame.nonce)) {
        current?.close();
        transport.current = null;
        setConnected(false);
        setNotice('Pairing fingerprint mismatch. The link was closed before any data moved.');
        return;
      }
      if (current?.available()) {
        current.send(
          await router.summary(Date.now(), outbox.map((item) => item.contentId)),
        );
      }
      return;
    }
    if (frame.kind === 'summary') {
      if (!current?.available()) return;
      const remote = new MeshBloom(frame.bloom);
      const stored = await router.missingForPeer(frame);
      stored.forEach((item) =>
        current.send({
          version: 1,
          kind: 'envelope',
          contentId: item.contentId,
          envelope: item.envelope,
          originAtMs: item.originAtMs,
          expiresAtMs: item.expiresAtMs,
          hops: item.hops,
        }),
      );
      outbox
        .filter(
          (item) => item.priority !== Priority.BULK && !remote.has(item.contentId),
        )
        .slice(0, Math.max(0, 128 - stored.length))
        .forEach((item) =>
          current.send(meshEnvelopeFrame(envelopeBytes(item), item.contentId)),
        );
      return;
    }
    if (frame.kind === 'ack') {
      setNotice(`${frame.status}: ${frame.contentId.slice(0, 18)}…`);
      return;
    }
    if (frame.kind !== 'envelope') return;
    const result = await router.receive('qr-peer', frame);
    if (current?.available()) current.send(result.ack);
    setNotice(
      result.ack.status === 'rejected'
        ? `Rejected before storage: ${result.ack.error ?? 'invalid envelope'}`
        : `Verified and ${result.ack.status}: ${frame.contentId.slice(0, 18)}…`,
    );
  };

  const attach = (value: NativeMeshTransport) => {
    transport.current?.close();
    transport.current = value;
    wasConnected.current = false;
    value.subscribe((frame) => void receive(frame));
  };

  const createOffer = async () => {
    const value = new NativeMeshTransport(`device-${Date.now().toString(36)}`);
    attach(value);
    setPairing(await value.createOffer());
    setNotice('Offer ready. The other device scans this QR and returns an answer QR.');
  };

  const acceptPairing = async (encoded: string) => {
    setScanning(false);
    try {
      if (pairingRole(encoded) === 'offer') {
        const value = new NativeMeshTransport(`device-${Date.now().toString(36)}`);
        attach(value);
        setPairing(await value.acceptOffer(encoded));
        setNotice('Answer ready. Let the offering device scan this QR.');
      } else if (transport.current) {
        await transport.current.acceptAnswer(encoded);
        setPairing('');
        setNotice('Pairing answer accepted. Waiting for the local data channel.');
      } else {
        throw new Error('Create an offer before scanning an answer');
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Pairing payload is invalid');
    }
  };

  const sendQueued = () => {
    const available = transport.current;
    if (!available?.available()) {
      setNotice('Pair the devices and wait for the data channel to open.');
      return;
    }
    const eligible = outbox.filter((record) => record.priority !== Priority.BULK);
    eligible.forEach((record) =>
      available.send(meshEnvelopeFrame(envelopeBytes(record), record.contentId)),
    );
    setNotice(`${eligible.length} signed class 0–2 envelope(s) sent for verification.`);
  };

  const updatePreferences = async (next: MeshPreferences) => {
    if (!next.enabled) {
      transport.current?.close();
      transport.current = null;
      setConnected(false);
      setPairing('');
    }
    setPreferences(next);
    await saveMeshPreferences(next);
  };

  const exportPack = async () => {
    const meshRows = await store.list();
    const bytes = createJbPack([
      ...meshRows,
      ...outbox.map((record) => ({
        contentId: record.contentId,
        envelope: jbpackEnvelopeString(envelopeBytes(record)),
      })),
    ]);
    const uri = `${FileSystem.cacheDirectory}jagoo-${Date.now()}.jbpack`;
    await FileSystem.writeAsStringAsync(uri, new TextDecoder().decode(bytes));
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri);
    setNotice(`Exported ${meshRows.length + outbox.length} independently signed envelope(s).`);
  };

  const importPack = async () => {
    const picked = await DocumentPicker.getDocumentAsync({
      type: 'application/json',
      copyToCacheDirectory: true,
    });
    if (picked.canceled) return;
    const content = await FileSystem.readAsStringAsync(picked.assets[0]!.uri);
    const result = await importJbPack(
      new TextEncoder().encode(content),
      store,
      verifyCachedMeshCertificate,
    );
    setNotice(
      `Imported ${result.imported}; ${result.duplicates} duplicate; ${result.rejected} rejected.`,
    );
  };

  return (
    <Screen colors={colors}>
      <AppHeader colors={colors} mode={mode} reach={reach} title="Offline relay" onBack={onBack} />
      <View style={styles.hero}>
        <Text style={[typography.overline, { color: colors.signal }]}>No server path required</Text>
        <Text style={[typography.h1, { color: colors.text }]}>Carry signed work across the gap.</Text>
        <Text style={[typography.body, { color: colors.text2 }]}>
          Pair nearby devices over a host-only WebRTC channel or move a verified .jbpack by hand.
          Forum and Signal identities remain in separate vaults.
        </Text>
      </View>
      <View style={styles.row}>
        <Pill colors={colors} label={connected ? 'mesh open' : 'mesh idle'} selected={connected} />
        <Pill colors={colors} label={`${outbox.length} awaiting receipt`} />
      </View>
      <StatusBanner
        body="Only class 0–2 traffic crosses mesh. Every envelope is checked against the pre-positioned certificate and revocation cache before storage or relay."
        colors={colors}
        icon="shield-checkmark-outline"
        title="Verification happens before relay"
        tone="verified"
      />

      <SectionHeader colors={colors} title="Pair by QR" />
      <View style={styles.row}>
        <Button
          colors={colors}
          disabled={!preferences.enabled}
          label="Create offer"
          onPress={() => void createOffer()}
          system="signal"
        />
        <Button
          colors={colors}
          disabled={!preferences.enabled}
          label="Scan offer or answer"
          onPress={() =>
            void (permission?.granted
              ? setScanning(true)
              : requestPermission().then((result) => setScanning(result.granted)))
          }
          variant="secondary"
        />
      </View>
      {scanning ? (
        <View style={styles.cameraFrame}>
          <CameraView
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={(result) => void acceptPairing(result.data)}
            style={StyleSheet.absoluteFill}
          />
        </View>
      ) : null}
      {pairing ? (
        <View style={styles.pairingBlock}>
          {/* Fixed light background regardless of app theme — a QR code needs light
              quiet-zone contrast against dark modules to scan reliably by camera; this is
              not a themed surface and should not follow `colors.*`. */}
          <View style={[styles.qr, { backgroundColor: QR_QUIET_ZONE_COLOR }]}>
            <QRCode value={pairing} size={224} quietZone={8} />
          </View>
          <Text selectable style={[typography.mono, { color: colors.text }]}>
            Fingerprint {pairingFingerprint(pairing)}
          </Text>
          <Text style={[typography.caption, { color: colors.text2 }]}>
            Confirm this fingerprint is identical on both devices before sending.
          </Text>
        </View>
      ) : null}
      <Button
        colors={colors}
        disabled={!preferences.enabled || !connected}
        label="Send queued emergency traffic"
        onPress={sendQueued}
        system="signal"
      />

      <SectionHeader colors={colors} title="Sneakernet bundle" />
      <View style={styles.row}>
        <Button colors={colors} label="Export .jbpack" onPress={() => void exportPack()} variant="secondary" />
        <Button colors={colors} label="Import .jbpack" onPress={() => void importPack()} variant="secondary" />
      </View>
      <Text style={[typography.caption, { color: colors.text2 }]}>
        Link probes run every{' '}
        {Number.isFinite(meshProbeIntervalMs(preferences))
          ? `${meshProbeIntervalMs(preferences) / 1_000} seconds`
          : 'never while disabled'}
        . Pairing is always a manual, nearby-device action.
      </Text>

      <SectionHeader colors={colors} title="Resource use" />
      <Button
        colors={colors}
        label={preferences.enabled ? 'Mesh enabled' : 'Mesh disabled'}
        onPress={() => void updatePreferences({ ...preferences, enabled: !preferences.enabled })}
        variant="secondary"
      />
      <View style={styles.row}>
        <Button
          colors={colors}
          label={preferences.batterySaver ? 'Battery saver on' : 'Battery saver off'}
          onPress={() =>
            void updatePreferences({ ...preferences, batterySaver: !preferences.batterySaver })
          }
          variant="ghost"
        />
        <Button
          colors={colors}
          label={preferences.dataSaver ? 'Data saver on' : 'Data saver off'}
          onPress={() =>
            void updatePreferences({ ...preferences, dataSaver: !preferences.dataSaver })
          }
          variant="ghost"
        />
      </View>
      {notice ? (
        <StatusBanner body={notice} colors={colors} icon="radio-outline" title="Offline relay status" />
      ) : null}
      {outbox.length === 0 ? (
        <EmptyState
          body="Signed work appears here automatically when a node cannot acknowledge it."
          colors={colors}
          icon="archive-outline"
          title="The outbox is clear"
        />
      ) : null}
      <Button colors={colors} label="Refresh outbox" onPress={() => void refresh()} variant="ghost" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  cameraFrame: { height: 280, overflow: 'hidden' },
  hero: { gap: spacing.sm, paddingVertical: spacing.md },
  pairingBlock: { alignItems: 'center', gap: spacing.sm },
  qr: { alignItems: 'center', padding: spacing.md },
  row: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
