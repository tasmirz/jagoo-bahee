export type FeatureArea =
  | 'Identity'
  | 'Community'
  | 'Content'
  | 'Moderation'
  | 'Engagement'
  | 'Privacy'
  | 'Administration';

export interface FeatureDestination {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly area: FeatureArea;
  readonly icon:
    | 'person-outline'
    | 'people-outline'
    | 'document-text-outline'
    | 'shield-checkmark-outline'
    | 'sparkles-outline'
    | 'lock-closed-outline'
    | 'settings-outline';
}

/**
 * P1-G1 coverage registry. Every frozen Forum feature family has a visible destination.
 * Tests assert required IDs here and the Profile directory renders every row.
 */
export const featureDestinations: readonly FeatureDestination[] = [
  {
    id: 'identity',
    title: 'Identity & recovery',
    description: 'Recovery phrase, passphrase, certificates, rotation, revocation and identities.',
    area: 'Identity',
    icon: 'person-outline',
  },
  {
    id: 'profile',
    title: 'Profile & preferences',
    description: 'Profile, karma, follows, blocks, saved content, feed settings and communities.',
    area: 'Identity',
    icon: 'person-outline',
  },
  {
    id: 'communities',
    title: 'Community management',
    description: 'Create, theme, archive, rules, members, roles, bans and statistics.',
    area: 'Community',
    icon: 'people-outline',
  },
  {
    id: 'roles',
    title: 'Roles & permissions',
    description: 'Default and custom roles, assignments and permission inspection.',
    area: 'Community',
    icon: 'people-outline',
  },
  {
    id: 'posts',
    title: 'Posts & comments',
    description: 'All post types, threads, edits, tombstones, attachments, polls and crossposts.',
    area: 'Content',
    icon: 'document-text-outline',
  },
  {
    id: 'search',
    title: 'Search & discovery',
    description: 'Search posts, comments, identities and communities with filters.',
    area: 'Content',
    icon: 'document-text-outline',
  },
  {
    id: 'moderation',
    title: 'Moderation',
    description: 'Queue, reports, actions, appeals, public log and reversible hidden content.',
    area: 'Moderation',
    icon: 'shield-checkmark-outline',
  },
  {
    id: 'labels',
    title: 'Labels & trust',
    description: 'Advisory checks, reasons, attribution and your trusted labellers.',
    area: 'Moderation',
    icon: 'shield-checkmark-outline',
  },
  {
    id: 'awards',
    title: 'Awards',
    description: 'Award types, anonymous giving, messages and received awards.',
    area: 'Engagement',
    icon: 'sparkles-outline',
  },
  {
    id: 'notifications',
    title: 'Notifications',
    description: 'Replies, mentions, awards, moderation and follows with local read state.',
    area: 'Engagement',
    icon: 'sparkles-outline',
  },
  {
    id: 'messaging',
    title: 'Private messages',
    description: 'End-to-end encrypted Forum conversations and blocked-sender controls.',
    area: 'Privacy',
    icon: 'lock-closed-outline',
  },
  {
    id: 'proofs',
    title: 'Proofs & acknowledgements',
    description: 'Stored receipts, signatures, inclusion proofs and consistency history.',
    area: 'Privacy',
    icon: 'lock-closed-outline',
  },
  {
    id: 'admin',
    title: 'Instance administration',
    description: 'Health, statistics, identities, security, IP blocks, labellers and feature bindings.',
    area: 'Administration',
    icon: 'settings-outline',
  },
  {
    id: 'operations',
    title: 'Node operations',
    description: 'Transparency health, metrics, projection recovery and safe diagnostics.',
    area: 'Administration',
    icon: 'settings-outline',
  },
] as const;

