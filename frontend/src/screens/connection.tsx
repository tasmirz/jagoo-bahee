import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { certificateStatus, listAuditCertificates, type StoredAuditCertificate } from '../audit';
import {
  sortByScope,
  useFederationAlerts,
  useFederationPeers,
  useFederations,
  useNodeTreeHead,
  type FederationPeer,
} from '../data/node';
import { translate, type Locale, type MessageKey } from '../i18n';
import type { HomeNode } from '../data/node-config';
import type { AppPalette } from '../theme';
import { radius, spacing, type as typography } from '../theme';
import {
  Button,
  Divider,
  EmptyState,
  IconButton,
  ReachPill,
  Screen,
  Seal,
  StatusBanner,
  type ReachState,
} from '../ui/primitives';

export function HomeServerSetupScreen({
  colors,
  onConnect,
}: {
  readonly colors: AppPalette;
  readonly onConnect: (address: string) => Promise<void>;
}) {
  const { width } = useWindowDimensions();
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const connect = async () => {
    setBusy(true);
    setError('');
    try {
      await onConnect(address);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not connect to that server.');
    } finally {
      setBusy(false);
    }
  };
  const wide = width >= 760;
  return (
    <Screen colors={colors} bottomInset={0}>
      <View style={[styles.onboarding, wide ? styles.onboardingWide : null]}>
        <LinearGradient
          colors={[colors.ember, colors.constrained]}
          end={{ x: 1, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={[styles.onboardingHero, wide ? styles.onboardingHeroWide : null]}
        >
          <View style={styles.wordmark}>
            <View style={styles.wordmarkSeal}>
              <View style={[styles.wordmarkHole, { backgroundColor: colors.ember }]} />
            </View>
            <Text style={[typography.h2, { color: colors.onAccent }]}>Jagoo Bahee</Text>
          </View>
          <View style={styles.heroCopy}>
            <Text style={[typography.display, styles.heroTitle, { color: colors.onAccent }]}>
              Your people.{'\n'}Your server.
            </Text>
            <Text style={[typography.bodyLarge, styles.heroBody, { color: colors.onAccent }]}>
              Connect to a home node you trust. Your app discovers its audit and anti-abuse services
              without sending your identity anywhere else.
            </Text>
          </View>
          <View style={styles.trustRail}>
            {[
              ['shield-checkmark-outline', 'Signed actions'],
              ['library-outline', 'Independent proofs'],
              ['radio-outline', 'Local-first reach'],
            ].map(([icon, label]) => (
              <View key={label} style={styles.trustItem}>
                <Ionicons name={icon as 'radio-outline'} size={17} color={colors.onAccent} />
                <Text style={[typography.caption, { color: colors.onAccent }]}>{label}</Text>
              </View>
            ))}
          </View>
        </LinearGradient>

        <View style={[styles.setupPanel, wide ? styles.setupPanelWide : null]}>
          <View style={styles.setupContent}>
            <Text style={[typography.overline, { color: colors.ember }]}>First connection</Text>
            <Text style={[typography.h1, { color: colors.text }]}>Find your home server</Text>
            <Text style={[typography.body, { color: colors.text2 }]}>
              Ask the server operator for its local address. A private LAN address is expected.
            </Text>
            <View style={styles.fieldGroup}>
              <Text style={[typography.label, { color: colors.text }]}>Server address</Text>
              <View
                style={[
                  styles.addressField,
                  {
                    backgroundColor: colors.surface2,
                    borderColor: error ? colors.blackout : colors.border,
                  },
                ]}
              >
                <Ionicons name="server-outline" size={19} color={colors.text2} />
                <TextInput
                  accessibilityLabel="Home server address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  onChangeText={setAddress}
                  onSubmitEditing={() => void connect()}
                  placeholder="192.168.1.20:3000"
                  placeholderTextColor={colors.text3}
                  returnKeyType="go"
                  style={[typography.bodyLarge, styles.addressInput, { color: colors.text }]}
                  value={address}
                />
              </View>
              {error ? (
                <Text
                  accessibilityRole="alert"
                  style={[typography.caption, { color: colors.blackout }]}
                >
                  {error}
                </Text>
              ) : (
                <Text style={[typography.caption, { color: colors.text2 }]}>
                  HTTP is allowed on your local network. Use HTTPS for public addresses.
                </Text>
              )}
            </View>
            <Button
              colors={colors}
              disabled={busy || !address.trim()}
              icon="arrow-forward"
              label={busy ? 'Checking server…' : 'Connect to server'}
              onPress={() => void connect()}
            />
            <View style={styles.privateNote}>
              <Ionicons name="eye-off-outline" size={17} color={colors.verified} />
              <Text style={[typography.caption, styles.flex, { color: colors.text2 }]}>
                Saved only on this device. Your Forum identity remains separate.
              </Text>
            </View>
          </View>
        </View>
      </View>
    </Screen>
  );
}

function ServiceRow({
  colors,
  icon,
  title,
  address,
  available,
}: {
  readonly colors: AppPalette;
  readonly icon: 'library-outline' | 'keypad-outline' | 'git-network-outline';
  readonly title: string;
  readonly address: string;
  readonly available: boolean;
}) {
  return (
    <View style={styles.serviceRow}>
      <View style={[styles.serviceIcon, { backgroundColor: colors.surface2 }]}>
        <Ionicons name={icon} size={19} color={available ? colors.verified : colors.constrained} />
      </View>
      <View style={styles.flex}>
        <Text style={[typography.label, { color: colors.text }]}>{title}</Text>
        <Text numberOfLines={1} style={[typography.mono, { color: colors.text2 }]}>
          {address}
        </Text>
      </View>
      <View
        accessibilityLabel={available ? 'Available' : 'Unavailable'}
        style={[
          styles.availability,
          { backgroundColor: available ? colors.verified : colors.constrained },
        ]}
      />
    </View>
  );
}

/**
 * One federated peer.
 *
 * ── Colour is never the sole carrier of meaning ────────────────────────────────────
 * Trust and reachability each carry a TEXT label as well as an icon and a tint, because a
 * user with a colour-vision difference, on a washed-out screen in daylight, must be able to
 * tell a `TRUSTED` peer from a brand-new one. The scopes are listed narrowest-first, the
 * same order the node itself prefers (TP-01), so "same ISP" is what the eye lands on —
 * that is the address that still works when the gateway drops.
 */
function PeerRow({
  colors,
  locale,
  peer,
}: {
  readonly colors: AppPalette;
  readonly locale: Locale;
  readonly peer: FederationPeer;
}) {
  const trustLabel = translate(locale, TRUST_LABEL[peer.trust] ?? 'trustUnknown');
  const endpoints = sortByScope(peer.endpoints);
  const tint =
    peer.trust === 'TRUSTED'
      ? colors.verified
      : peer.trust === 'NORMAL'
        ? colors.ember
        : colors.constrained;
  return (
    <View
      accessibilityLabel={`${peer.displayName || peer.serverId}, ${trustLabel}, ${peer.vouchCount} vouches`}
      style={styles.serviceRow}
    >
      <View style={[styles.serviceIcon, { backgroundColor: colors.surface2 }]}>
        <Ionicons color={tint} name="git-network-outline" size={19} />
      </View>
      <View style={styles.flex}>
        <Text style={[typography.label, { color: colors.text }]}>
          {peer.displayName || peer.serverId.slice(0, 18)}
        </Text>
        <Text numberOfLines={1} selectable style={[typography.mono, { color: colors.text2 }]}>
          {peer.serverId}
        </Text>
        <View style={styles.peerTags}>
          {/* The trust level, as words. Never only a colour. */}
          <Text style={[typography.caption, { color: tint }]}>{trustLabel}</Text>
          {peer.vouchCount > 0 ? (
            <Text style={[typography.caption, { color: colors.text3 }]}>
              {translate(locale, 'vouches', { count: String(peer.vouchCount) })}
            </Text>
          ) : null}
          {endpoints.map((endpoint) => (
            <Text
              key={`${peer.serverId}-${endpoint.uri}`}
              style={[typography.caption, { color: colors.text3 }]}
            >
              {translate(locale, SCOPE_LABEL[endpoint.scope] ?? 'reachGlobal')}
            </Text>
          ))}
          {endpoints.length === 0 ? (
            // FD-12: a node behind CGNAT advertises nothing and still federates fully. That
            // is a normal deployment, so it must not read as a fault.
            <Text style={[typography.caption, { color: colors.text3 }]}>outbound-only</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const TRUST_LABEL: Readonly<Record<string, MessageKey>> = {
  PROBATION: 'trustProbation',
  NORMAL: 'trustNormal',
  TRUSTED: 'trustTrusted',
  UNSPECIFIED: 'trustUnknown',
};

const SCOPE_LABEL: Readonly<Record<string, MessageKey>> = {
  LAN: 'reachLan',
  ISP_LOCAL: 'reachIspLocal',
  NATIONAL: 'reachNational',
  GLOBAL: 'reachGlobal',
  MESH: 'reachMesh',
  RETICULUM: 'reachReticulum',
};

export function NetworkScreen({
  colors,
  homeNode,
  reach,
  locale = 'en',
  onBack,
  onChangeServer,
}: {
  readonly colors: AppPalette;
  readonly homeNode: HomeNode;
  readonly reach: ReachState;
  readonly locale?: Locale;
  readonly onBack: () => void;
  readonly onChangeServer: () => void;
}) {
  const federations = useFederations(homeNode.baseUrl);
  const peerDirectory = useFederationPeers(homeNode.baseUrl);
  const treeHeadQuery = useNodeTreeHead(homeNode.baseUrl);
  const alertQuery = useFederationAlerts(homeNode.baseUrl);
  const auditLogs = homeNode.discovery.services.auditLogs;
  const mcaptcha = homeNode.discovery.services.mcaptcha;
  // Every one of these renders from cache when the request fails, which is the whole point:
  // the peer list is most needed exactly when it cannot be refreshed.
  const federationPeers = peerDirectory.data?.value.items ?? [];
  const treeHead = treeHeadQuery.data?.value ?? null;
  const alerts = alertQuery.data?.value.items ?? [];
  const legacyServices = federations.data?.value.items ?? [];
  return (
    <Screen colors={colors}>
      <View style={[styles.detailHeader, { borderBottomColor: colors.border }]}>
        <IconButton colors={colors} icon="arrow-back" label="Back" onPress={onBack} />
        <Text accessibilityRole="header" style={[typography.h2, { color: colors.text }]}>
          Network & services
        </Text>
        <ReachPill colors={colors} state={reach} />
      </View>
      <View style={styles.contentColumn}>
        <View style={styles.nodeHero}>
          <Text style={[typography.overline, { color: colors.ember }]}>Home server</Text>
          <Text style={[typography.h1, { color: colors.text }]}>
            {homeNode.discovery.node.displayName}
          </Text>
          <Text selectable style={[typography.mono, { color: colors.text2 }]}>
            {homeNode.baseUrl}
          </Text>
          <Seal
            colors={colors}
            label={`${homeNode.discovery.node.serverId.slice(0, 15)}…`}
            state={reach === 'connected' ? 'synced' : 'queued'}
          />
        </View>

        <Text style={[typography.h2, styles.sectionTitle, { color: colors.text }]}>
          Independent services
        </Text>
        <View style={[styles.serviceList, { borderColor: colors.border }]}>
          {auditLogs.length === 0 ? (
            <>
              <ServiceRow
                address="Not advertised by this node"
                available={false}
                colors={colors}
                icon="library-outline"
                title="Audit log"
              />
              <Divider colors={colors} />
            </>
          ) : null}
          {auditLogs.map((service) => (
            <View key={service.id}>
              <ServiceRow
                address={service.address}
                available={service.available}
                colors={colors}
                icon="library-outline"
                title="Audit log"
              />
              <Divider colors={colors} />
            </View>
          ))}
          {mcaptcha.length === 0 ? (
            <ServiceRow
              address="Not advertised by this node"
              available={false}
              colors={colors}
              icon="keypad-outline"
              title="mCaptcha"
            />
          ) : null}
          {mcaptcha.map((service, index) => (
            <View key={service.id}>
              <ServiceRow
                address={service.address}
                available={service.available}
                colors={colors}
                icon="keypad-outline"
                title="mCaptcha"
              />
              {index < mcaptcha.length - 1 ? <Divider colors={colors} /> : null}
            </View>
          ))}
        </View>

        <Text style={[typography.h2, styles.sectionTitle, { color: colors.text }]}>
          {translate(locale, 'federatedNodes')}
        </Text>
        {treeHead ? (
          <Text style={[typography.caption, { color: colors.text2 }]}>
            {translate(locale, 'logSize', { count: String(treeHead.treeSize) })}
          </Text>
        ) : null}
        {federationPeers.length > 0 ? (
          <View style={[styles.serviceList, { borderColor: colors.border }]}>
            {federationPeers.map((peer, index) => (
              <View key={peer.serverId}>
                <PeerRow colors={colors} locale={locale} peer={peer} />
                {index < federationPeers.length - 1 ? <Divider colors={colors} /> : null}
              </View>
            ))}
          </View>
        ) : (
          <StatusBanner
            body={translate(locale, 'noPeersBody')}
            colors={colors}
            icon="git-network-outline"
            title={translate(locale, 'noPeers')}
          />
        )}

        {alerts.length > 0 ? (
          <>
            <Text style={[typography.h2, styles.sectionTitle, { color: colors.text }]}>
              {translate(locale, 'peerAlerts')}
            </Text>
            {alerts.map((alert) => (
              <StatusBanner
                body={`${alert.subject} — ${alert.detail}`}
                colors={colors}
                icon="warning-outline"
                key={alert.id}
                title={alert.code}
              />
            ))}
          </>
        ) : null}

        {legacyServices.length > 0 ? (
          <>
            <Text style={[typography.h2, styles.sectionTitle, { color: colors.text }]}>
              Operator-configured links
            </Text>
            <View style={[styles.serviceList, { borderColor: colors.border }]}>
              {legacyServices.map((service, index) => (
                <View key={service.id}>
                  <ServiceRow
                    address={service.address}
                    available={service.available}
                    colors={colors}
                    icon="git-network-outline"
                    title={service.id}
                  />
                  {index < legacyServices.length - 1 ? <Divider colors={colors} /> : null}
                </View>
              ))}
            </View>
          </>
        ) : null}

        <View style={styles.pageActions}>
          <Button
            colors={colors}
            label="Change home server"
            onPress={onChangeServer}
            variant="secondary"
          />
        </View>
      </View>
    </Screen>
  );
}

export function ProofVaultScreen({
  colors,
  homeNode,
  onBack,
}: {
  readonly colors: AppPalette;
  readonly homeNode: HomeNode;
  readonly onBack: () => void;
}) {
  const [records, setRecords] = useState<readonly StoredAuditCertificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState<string | null>(null);
  const [results, setResults] = useState<
    Readonly<Record<string, { readonly status: string; readonly reason: string | null }>>
  >({});
  useEffect(() => {
    void listAuditCertificates().then((items) => {
      setRecords(items);
      setLoading(false);
    });
  }, []);

  const check = async (record: StoredAuditCertificate) => {
    setChecking(record.certificate.identifier);
    try {
      const result = await certificateStatus(homeNode.baseUrl, record.certificate);
      setResults((current) => ({
        ...current,
        [record.certificate.identifier]: {
          status: result.status,
          reason: result.reason,
        },
      }));
    } catch (error) {
      setResults((current) => ({
        ...current,
        [record.certificate.identifier]: {
          status: 'unreachable',
          reason: error instanceof Error ? error.message : 'Status check failed',
        },
      }));
    } finally {
      setChecking(null);
    }
  };

  return (
    <Screen colors={colors}>
      <View style={[styles.detailHeader, { borderBottomColor: colors.border }]}>
        <IconButton colors={colors} icon="arrow-back" label="Back" onPress={onBack} />
        <Text accessibilityRole="header" style={[typography.h2, { color: colors.text }]}>
          Proofs & acknowledgements
        </Text>
        <View style={{ width: 44 }} />
      </View>
      <View style={styles.contentColumn}>
        <View style={styles.proofIntro}>
          <View style={[styles.proofSeal, { backgroundColor: colors.verified }]}>
            <Ionicons name="shield-checkmark" size={27} color={colors.onAccent} />
          </View>
          <View style={styles.flex}>
            <Text style={[typography.h1, { color: colors.text }]}>Your receipts survive</Text>
            <Text style={[typography.body, { color: colors.text2 }]}>
              Each certificate keeps the exact request, the node signature, and independent delivery
              results.
            </Text>
          </View>
        </View>
        {loading ? (
          <ActivityIndicator color={colors.ember} style={styles.loader} />
        ) : records.length === 0 ? (
          <EmptyState
            body="Publish a post or identity certificate. Its signed acknowledgement will appear here automatically."
            colors={colors}
            icon="shield-checkmark-outline"
            title="No proofs stored yet"
          />
        ) : (
          records.map((record) => {
            const identifier = record.certificate.identifier;
            const delivered = record.deliveries.filter((item) => item.delivered).length;
            const status = results[identifier];
            return (
              <View
                key={identifier}
                style={[
                  styles.proofCard,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <View style={styles.proofCardHeader}>
                  <Seal colors={colors} label="node receipt verified" />
                  <Text style={[typography.caption, { color: colors.text2 }]}>
                    {new Date(record.storedAtMs).toLocaleString()}
                  </Text>
                </View>
                <Text selectable style={[typography.mono, { color: colors.text }]}>
                  {identifier}
                </Text>
                <Text style={[typography.caption, { color: colors.text2 }]}>
                  {delivered > 0
                    ? `${delivered} independent audit ${delivered === 1 ? 'copy' : 'copies'}`
                    : 'Saved on this device · forwarding pending'}
                </Text>
                {status ? (
                  <StatusBanner
                    body={status.reason ?? 'The acknowledged content is present.'}
                    colors={colors}
                    icon={status.status === 'online' ? 'checkmark-circle' : 'alert-circle-outline'}
                    title={`Server reports: ${status.status}`}
                    tone={status.status === 'online' ? 'verified' : 'warning'}
                  />
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  disabled={checking === identifier}
                  onPress={() => void check(record)}
                  style={({ pressed }) => [
                    styles.verifyAction,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.surface2,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <Ionicons name="pulse-outline" size={18} color={colors.ember} />
                  <Text style={[typography.label, { color: colors.text }]}>
                    {checking === identifier ? 'Checking…' : 'Ask server for status'}
                  </Text>
                </Pressable>
              </View>
            );
          })
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  onboarding: { flex: 1, minHeight: 720 },
  onboardingWide: { flexDirection: 'row', minHeight: 620 },
  onboardingHero: {
    minHeight: 360,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  onboardingHeroWide: { flex: 1.08, minHeight: 620, padding: spacing.xxl },
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  wordmarkSeal: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: '#FFF9F5',
    padding: 7,
  },
  wordmarkHole: { flex: 1, borderRadius: radius.pill },
  heroCopy: { marginVertical: spacing.xxl, maxWidth: 520 },
  heroTitle: { fontSize: 38, lineHeight: 44, letterSpacing: -0.8 },
  heroBody: { marginTop: spacing.md, maxWidth: 480, opacity: 0.94 },
  trustRail: { gap: spacing.sm },
  trustItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  setupPanel: { flex: 1, padding: spacing.lg, justifyContent: 'center' },
  setupPanelWide: { flex: 0.92, paddingHorizontal: spacing.xxl },
  setupContent: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: spacing.sm },
  fieldGroup: { marginVertical: spacing.sm, gap: spacing.xs },
  addressField: {
    minHeight: 56,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  addressInput: { flex: 1, minWidth: 0 },
  privateNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  detailHeader: {
    minHeight: 64,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  contentColumn: { width: '100%', maxWidth: 760, alignSelf: 'center' },
  nodeHero: { paddingHorizontal: spacing.md, paddingTop: spacing.xl, gap: spacing.xs },
  sectionTitle: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
  },
  serviceList: {
    marginHorizontal: spacing.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  peerTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  serviceRow: {
    minHeight: 72,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  serviceIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  availability: { width: 9, height: 9, borderRadius: radius.pill },
  pageActions: { padding: spacing.md, marginTop: spacing.md },
  proofIntro: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xl,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  proofSeal: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loader: { marginTop: spacing.xxl },
  proofCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    gap: spacing.sm,
  },
  proofCardHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  verifyAction: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
});
