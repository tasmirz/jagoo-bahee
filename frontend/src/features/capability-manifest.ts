/**
 * Frontend ownership for every signed action. A capability is not considered shipped merely
 * because an endpoint exists: it needs a contextual entry point and an operation state.
 */
export type CapabilityPlane = 'forum' | 'signal';

export interface CapabilityManifestEntry {
  readonly domain: string;
  readonly plane: CapabilityPlane;
  readonly surface: string;
  readonly route: string;
}

const forum = (domain: string, surface: string, route: string): CapabilityManifestEntry => ({
  domain, plane: 'forum', surface, route,
});
const signal = (domain: string, surface: string, route: string): CapabilityManifestEntry => ({
  domain, plane: 'signal', surface, route,
});

export const capabilityManifest: readonly CapabilityManifestEntry[] = [
  forum('jb:post:create:v1', 'Adaptive post composer', '/(tabs)/create'),
  forum('jb:post:update:v1', 'Edit post', '/post/[contentId]/edit'),
  forum('jb:post:delete:v1', 'Post action sheet', '/post/[contentId]'),
  forum('jb:comment:create:v1', 'Reply composer', '/post/[contentId]'),
  forum('jb:comment:update:v1', 'Comment action sheet', '/post/[contentId]'),
  forum('jb:comment:delete:v1', 'Comment action sheet', '/post/[contentId]'),
  forum('jb:vote:cast:v1', 'Post and comment vote control', '/post/[contentId]'),
  forum('jb:community:create:v1', 'Community creation wizard', '/community/create'),
  forum('jb:community:update:v1', 'Community settings', '/community/[communityId]/settings'),
  forum('jb:community:archive:v1', 'Community danger zone', '/community/[communityId]/settings'),
  forum('jb:membership:join:v1', 'Community header', '/community/[communityId]'),
  forum('jb:membership:leave:v1', 'Community header', '/community/[communityId]'),
  forum('jb:mod:action:v1', 'Contextual moderation sheet', '/community/[communityId]/moderation'),
  forum('jb:report:create:v1', 'Report sheet', '/post/[contentId]'),
  forum('jb:report:resolve:v1', 'Report queue', '/community/[communityId]/moderation/reports'),
  forum('jb:role:define:v1', 'Role editor', '/community/[communityId]/settings/roles'),
  forum('jb:role:assign:v1', 'Member detail', '/community/[communityId]/members'),
  forum('jb:role:revoke:v1', 'Member detail', '/community/[communityId]/members'),
  forum('jb:profile:update:v1', 'Edit profile', '/settings/profile'),
  forum('jb:social:follow:v1', 'Public identity profile', '/identity/[keyId]'),
  forum('jb:social:block:v1', 'Identity and message actions', '/identity/[keyId]'),
  forum('jb:social:save:v1', 'Save action and saved list', '/saved'),
  forum('jb:prefs:feed:v1', 'Feed preferences', '/settings/feed'),
  forum('jb:award:give:v1', 'Award sheet', '/post/[contentId]/awards'),
  forum('jb:award:type:v1', 'Award catalogue', '/operator/awards'),
  forum('jb:attachment:claim:v1', 'Attachment tray', '/(tabs)/create'),
  forum('jb:message:forum:v1', 'Forum conversation', '/inbox/[threadId]'),
  forum('jb:label:emit:v1', 'Label action', '/community/[communityId]/moderation'),
  forum('jb:key:certify:forum:v1', 'Forum identity registration', '/settings/identity/forum'),
  forum('jb:key:revoke:forum:v1', 'Forum identity security', '/settings/identity/forum'),
  signal('jb:channel:declare:v1', 'Signal studio', '/signal/studio'),
  signal('jb:channel:update:v1', 'Channel settings', '/signal/channel/[channelId]/settings'),
  signal('jb:channel:rotate:v1', 'Channel key rotation', '/signal/channel/[channelId]/settings'),
  signal('jb:channel:retire:v1', 'Channel retirement', '/signal/channel/[channelId]/settings'),
  signal('jb:channel:vouch:v1', 'Channel trust', '/signal/channel/[channelId]/trust'),
  signal('jb:channel:subscribe:v1', 'Channel detail', '/signal/channel/[channelId]'),
  signal('jb:broadcast:emit:v1', 'Broadcast studio', '/signal/studio'),
  signal('jb:broadcast:revoke:v1', 'Broadcast correction', '/signal/studio'),
  signal('jb:checkin:post:v1', 'Crisis check-in', '/signal/crisis'),
  signal('jb:missing:report:v1', 'Missing-person report', '/signal/crisis'),
  signal('jb:resource:report:v1', 'Resource report', '/signal/crisis'),
  signal('jb:message:signal:v1', 'Signal message thread', '/signal/messages/[threadId]'),
  signal('jb:message:session:v1', 'New Signal conversation', '/signal/messages'),
  signal('jb:message:receipt:v1', 'Signal delivery state', '/signal/messages/[threadId]'),
  signal('jb:message:prekeys:v1', 'Signal identity health', '/signal/identity'),
  signal('jb:group:create:v1', 'New Signal group', '/signal/messages'),
  signal('jb:group:update:v1', 'Signal group settings', '/signal/groups/[groupId]'),
  signal('jb:key:certify:signal:v1', 'Signal identity registration', '/signal/identity'),
  signal('jb:key:revoke:signal:v1', 'Signal identity security', '/signal/identity'),
] as const;

export function capabilityForDomain(domain: string): CapabilityManifestEntry | undefined {
  return capabilityManifest.find((entry) => entry.domain === domain);
}
