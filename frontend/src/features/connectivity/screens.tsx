import { useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { verifyAuditCertificate } from '@jagoo/sdk';
import { certificateStatus, listAuditCertificates, type StoredAuditCertificate } from '../../audit';
import {
  sortByScope,
  useFederationAlerts,
  useFederationPeers,
  useFederations,
  useNodeTreeHead,
  type FederationPeer,
} from '../../data/node';
import { translate, type Locale, type MessageKey } from '../../i18n';
import { resolveServices, type HomeNode, type ServiceEndpoint } from '../../data/node-config';
import type { ServiceAddressSource, ServiceKind } from '../../data/service-address';
import {
  loadServiceOverrides,
  setServiceOverride,
  type ServiceOverrides,
} from '../../data/service-overrides';
import type { IdentityProfile } from '../../data/identity-profiles';
import type { AppPalette, ThemeMode } from '../../design-system';
import { radius, spacing, type as typography } from '../../design-system';
import {
  Button,
  Divider,
  EmptyState,
  Page,
  PageHeader,
  Screen,
  Seal,
  StatusBanner,
  WorkProgress,
  type ReachState,
} from '../../design-system';

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
            <View style={[styles.wordmarkSeal, { backgroundColor: colors.ember }]}>
              <View style={[styles.wordmarkHole, { backgroundColor: colors.bg }]} />
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
  locale,
}: {
  readonly colors: AppPalette;
  readonly icon: 'library-outline' | 'keypad-outline' | 'git-network-outline' | 'cloud-outline';
  readonly title: string;
  readonly address: string;
  readonly available: boolean;
  readonly locale?: Locale;
}) {
  const state = translate(
    locale ?? 'en',
    available ? 'serviceAvailable' : 'serviceUnavailable',
  );
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
        {/*
          Reachability carries TEXT, not just the tinted dot beside it. A washed-out screen in
          daylight and a colour-vision difference both erase a green/amber distinction, and this
          is the row someone reads precisely when something is already not working.
        */}
        <Text style={[typography.caption, { color: available ? colors.verified : colors.constrained }]}>
          {state}
        </Text>
      </View>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={[
          styles.availability,
          { backgroundColor: available ? colors.verified : colors.constrained },
        ]}
      />
    </View>
  );
}

const SERVICE_ICONS: Readonly<Record<ServiceKind, 'library-outline' | 'keypad-outline' | 'cloud-outline' | 'git-network-outline'>> = {
  'audit-log': 'library-outline',
  mcaptcha: 'keypad-outline',
  blob: 'cloud-outline',
  federation: 'git-network-outline',
};

const SERVICE_TITLES: Readonly<Record<ServiceKind, MessageKey>> = {
  'audit-log': 'serviceAuditLog',
  mcaptcha: 'serviceMcaptcha',
  blob: 'serviceBlob',
  federation: 'federatedNodes',
};

const SOURCE_LABELS: Readonly<Record<ServiceAddressSource, MessageKey>> = {
  override: 'serviceSourceOverride',
  'node-host': 'serviceSourceNodeHost',
  advertised: 'serviceSourceAdvertised',
};

/**
 * One editable service address.
 *
 * ── Why the override lives here and not in onboarding ──────────────────────────────────
 * Someone connecting under a shutdown must not be asked to hand-configure three service URLs
 * before they can post. A wrong value typed there is indistinguishable from the server being
 * down, and the person least able to tell the difference is the one being onboarded. This is
 * settings: it is reached deliberately, by someone who already has a working connection and has
 * seen a specific service fail.
 */
function EditableServiceRow({
  colors,
  endpoint,
  locale,
  onSave,
}: {
  readonly colors: AppPalette;
  readonly endpoint: ServiceEndpoint;
  readonly locale: Locale;
  readonly onSave: (kind: ServiceKind, address: string | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(endpoint.address);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const title = translate(locale, SERVICE_TITLES[endpoint.kind]);

  const commit = async (value: string | null) => {
    setBusy(true);
    setError('');
    try {
      await onSave(endpoint.kind, value);
      setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That address could not be used.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <ServiceRow
        address={endpoint.address}
        available={endpoint.available}
        colors={colors}
        icon={SERVICE_ICONS[endpoint.kind]}
        locale={locale}
        title={title}
      />
      <View style={styles.serviceMetaRow}>
        <Text style={[typography.caption, { color: colors.text2 }]}>
          {translate(locale, SOURCE_LABELS[endpoint.source])}
        </Text>
        <Pressable
          accessibilityHint={translate(locale, 'serviceEditHelp')}
          accessibilityLabel={translate(locale, 'serviceEditTitle', { service: title })}
          accessibilityRole="button"
          hitSlop={12}
          onPress={() => {
            setDraft(endpoint.address);
            setError('');
            setEditing((value) => !value);
          }}
          style={styles.serviceEditButton}
        >
          <Text style={[typography.caption, { color: colors.link }]}>
            {translate(locale, 'serviceEdit')}
          </Text>
        </Pressable>
      </View>
      {endpoint.source !== 'advertised' && endpoint.advertisedAddress !== endpoint.address ? (
        <Text style={[typography.caption, styles.serviceAdvertised, { color: colors.text2 }]}>
          {translate(locale, 'serviceAdvertisedWas', { address: endpoint.advertisedAddress })}
        </Text>
      ) : null}
      {editing ? (
        <View style={styles.serviceEditor}>
          <TextInput
            accessibilityLabel={translate(locale, 'serviceEditTitle', { service: title })}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            inputMode="url"
            onChangeText={setDraft}
            placeholder="192.168.1.20:9000"
            placeholderTextColor={colors.text2}
            style={[
              styles.serviceInput,
              typography.mono,
              { backgroundColor: colors.surface2, borderColor: colors.border, color: colors.text },
            ]}
            value={draft}
          />
          {error ? (
            <Text
              accessibilityLiveRegion="polite"
              style={[typography.caption, { color: colors.constrained }]}
            >
              {error}
            </Text>
          ) : null}
          <View style={styles.serviceEditActions}>
            <Button
              colors={colors}
              disabled={busy}
              label={translate(locale, 'serviceSave')}
              onPress={() => void commit(draft)}
            />
            <Button
              colors={colors}
              disabled={busy}
              label={translate(locale, 'serviceReset')}
              onPress={() => void commit(null)}
              variant="ghost"
            />
            <Button
              colors={colors}
              disabled={busy}
              label={translate(locale, 'serviceCancel')}
              onPress={() => setEditing(false)}
              variant="ghost"
            />
          </View>
        </View>
      ) : null}
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
  activeProfileId,
  colors,
  homeNode,
  identityProfiles,
  reach,
  locale = 'en',
  onBack,
  onAddIdentity,
  onChangeServer,
  onMesh,
  mode,
  onSwitchIdentity,
}: {
  readonly activeProfileId: string | null;
  readonly colors: AppPalette;
  readonly homeNode: HomeNode;
  readonly identityProfiles: readonly IdentityProfile[];
  readonly reach: ReachState;
  readonly locale?: Locale;
  /** Required by the shared `PageHeader`, whose frosted surface follows the theme. */
  readonly mode: ThemeMode;
  readonly onBack: () => void;
  readonly onAddIdentity: () => void;
  readonly onChangeServer: () => void;
  readonly onMesh: () => void;
  readonly onSwitchIdentity: (vaultId: string) => Promise<void>;
}) {
  const federations = useFederations(homeNode.baseUrl);
  const peerDirectory = useFederationPeers(homeNode.baseUrl);
  const treeHeadQuery = useNodeTreeHead(homeNode.baseUrl);
  const alertQuery = useFederationAlerts(homeNode.baseUrl);
  // Overrides load asynchronously, so the first paint shows discovery's answer and swaps to the
  // user's the moment it arrives. Blocking the whole screen on AsyncStorage would make the most
  // diagnostic page in the app the slowest one to appear.
  const [overrides, setOverrides] = useState<ServiceOverrides>({});
  useEffect(() => {
    let live = true;
    void loadServiceOverrides().then((stored) => {
      if (live) setOverrides(stored);
    });
    return () => {
      live = false;
    };
  }, []);
  const services = resolveServices(homeNode, overrides);
  const saveOverride = async (kind: ServiceKind, address: string | null) => {
    setOverrides(await setServiceOverride(kind, address));
  };
  // Every one of these renders from cache when the request fails, which is the whole point:
  // the peer list is most needed exactly when it cannot be refreshed.
  const federationPeers = peerDirectory.data?.value.items ?? [];
  const treeHead = treeHeadQuery.data?.value ?? null;
  const alerts = alertQuery.data?.value.items ?? [];
  const legacyServices = federations.data?.value.items ?? [];
  return (
    <View style={styles.flex}>
      <PageHeader colors={colors} mode={mode} onBack={onBack} reach={reach} title="Network & services" />
      <Page colors={colors}>
        <Button
          colors={colors}
          label="Open offline relay"
          onPress={onMesh}
          variant="secondary"
        />
        <View style={styles.nodeHero}>
          <Text style={[typography.overline, { color: colors.ember }]}>Home server</Text>
          <Text style={[typography.h1, { color: colors.text }]}>
            {homeNode.discovery.node.displayName}
          </Text>
          <Text selectable style={[typography.mono, { color: colors.text2 }]}>
            {homeNode.baseUrl}
          </Text>
          <View style={styles.transportBadge}>
            <Ionicons
              color={homeNode.transport === 'tor' ? colors.verified : colors.text2}
              name={homeNode.transport === 'tor' ? 'shield-checkmark-outline' : 'globe-outline'}
              size={16}
            />
            <Text style={[typography.caption, { color: colors.text2 }]}>
              {homeNode.transport === 'tor' ? 'Embedded Tor · no direct fallback' : 'Direct network'}
            </Text>
          </View>
          <Seal
            colors={colors}
            label={`${homeNode.discovery.node.serverId.slice(0, 15)}…`}
            state={reach === 'connected' ? 'synced' : 'queued'}
          />
        </View>

        <View style={styles.sectionHeadingRow}>
          <Text style={[typography.h2, { color: colors.text }]}>Identities</Text>
          <Pressable
            accessibilityRole="button"
            onPress={onAddIdentity}
            style={styles.inlineAction}
          >
            <Ionicons color={colors.ember} name="add" size={18} />
            <Text style={[typography.label, { color: colors.ember }]}>Add identity</Text>
          </Pressable>
        </View>
        <Text style={[typography.body, styles.sectionBody, { color: colors.text2 }]}>
          Each identity keeps its own key vault and home server. Switching locks the current vault.
        </Text>
        <View style={[styles.serviceList, { borderColor: colors.border }]}>
          {identityProfiles.map((profile, index) => {
            const selected = profile.vaultId === activeProfileId;
            return (
              <View key={profile.vaultId}>
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  disabled={selected}
                  onPress={() => void onSwitchIdentity(profile.vaultId)}
                  style={styles.identityRow}
                >
                  <Ionicons
                    color={selected ? colors.ember : colors.text2}
                    name={selected ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                  />
                  <View style={styles.flex}>
                    <Text style={[typography.label, { color: colors.text }]}>{profile.label}</Text>
                    <Text numberOfLines={1} style={[typography.mono, { color: colors.text2 }]}>
                      {profile.identityId ?? profile.vaultId}
                    </Text>
                    <Text numberOfLines={1} style={[typography.caption, { color: colors.text2 }]}>
                      {profile.homeNode.discovery.node.displayName} ·{' '}
                      {profile.homeNode.transport === 'tor' ? 'Tor' : 'direct'}
                    </Text>
                  </View>
                  {selected ? (
                    <Text style={[typography.caption, { color: colors.verified }]}>Active</Text>
                  ) : (
                    <Ionicons color={colors.text2} name="swap-horizontal" size={18} />
                  )}
                </Pressable>
                {index < identityProfiles.length - 1 ? <Divider colors={colors} /> : null}
              </View>
            );
          })}
        </View>

        <Text style={[typography.h2, styles.sectionTitle, { color: colors.text }]}>
          Independent services
        </Text>
        <View style={[styles.serviceList, { borderColor: colors.border }]}>
          {(['audit-log', 'mcaptcha', 'blob'] as const).flatMap((kind, groupIndex, kinds) => {
            const endpoints =
              kind === 'audit-log'
                ? services.auditLogs
                : kind === 'mcaptcha'
                  ? services.mcaptcha
                  : services.blobs;
            const last = groupIndex === kinds.length - 1;
            // A service the node never mentioned still gets a row and an edit control. Silence
            // from the node is the case where a manual address is MOST likely to be the only way
            // through, so hiding the row would remove the fix exactly when it is needed.
            if (endpoints.length === 0) {
              return [
                <View key={kind}>
                  <EditableServiceRow
                    colors={colors}
                    endpoint={{
                      kind,
                      id: `${kind}-unadvertised`,
                      address: translate(locale, 'serviceNotAdvertised'),
                      advertisedAddress: '',
                      available: false,
                      source: 'advertised',
                    }}
                    locale={locale}
                    onSave={saveOverride}
                  />
                  {last ? null : <Divider colors={colors} />}
                </View>,
              ];
            }
            return endpoints.map((endpoint, index) => (
              <View key={endpoint.id}>
                <EditableServiceRow
                  colors={colors}
                  endpoint={endpoint}
                  locale={locale}
                  onSave={saveOverride}
                />
                {last && index === endpoints.length - 1 ? null : <Divider colors={colors} />}
              </View>
            ));
          })}
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
      </Page>
    </View>
  );
}

export function ProofVaultScreen({
  colors,
  homeNode,
  mode,
  onBack,
}: {
  readonly colors: AppPalette;
  readonly homeNode: HomeNode;
  /** Required by the shared `PageHeader`, whose frosted surface follows the theme. */
  readonly mode: ThemeMode;
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
    <View style={styles.flex}>
      <PageHeader colors={colors} mode={mode} onBack={onBack} title="Proofs & acknowledgements" />
      <Page colors={colors}>
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
          <WorkProgress colors={colors} label="Loading saved proofs" />
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
            const held = verifyAuditCertificate(record.certificate).valid;
            return (
              <View
                key={identifier}
                style={[
                  styles.proofCard,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <View style={styles.proofCardHeader}>
                  {/*
                   * Recomputed here, offline, from the stored certificate — not asserted.
                   * A proof vault whose badges are decorative is the one place in the app
                   * where a false claim does the most damage, because this screen is what
                   * a person opens to check whether their evidence still holds.
                   */}
                  <Seal
                    colors={colors}
                    state={held ? 'synced' : 'failed'}
                    label={held ? 'node receipt verified' : 'receipt did not verify'}
                  />
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
      </Page>
    </View>
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
  // Gutter-free by contract from here down — `Page` owns the screen's inline inset.
  nodeHero: { paddingTop: spacing.md, gap: spacing.xs },
  transportBadge: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  sectionHeadingRow: {
    paddingTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  inlineAction: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  identityRow: {
    minHeight: 84,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionTitle: { paddingTop: spacing.md },
  sectionBody: {},
  serviceList: {
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
  serviceMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  // 44pt minimum on the tap target. This control is reached by someone whose service is already
  // failing, often one-handed on a bad connection; a 20pt caption-sized hit area is a second
  // failure on top of the first.
  serviceEditButton: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  serviceAdvertised: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  serviceEditor: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  serviceInput: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
  },
  // Wraps rather than truncating: Bangla labels are materially longer than the English, and
  // "সার্ভারের ঠিকানা ব্যবহার করুন" must not become an ellipsis on a 320pt phone.
  serviceEditActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pageActions: { marginTop: spacing.xs },
  proofIntro: {
    paddingVertical: spacing.md,
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
  proofCard: {
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
