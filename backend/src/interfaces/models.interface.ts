// ==================== User & Authentication Models ====================

/**
 * User Model
 * Stores user information derived from BIP32/39 wallet
 */
interface UserInterface {
  id: String; // UUID or similar
  publicKey: String; // Derived from BIP32 path - unique identifier
  address: String; // Wallet address derived from public key
  username: String; // User-chosen display name (unique)
  avatarUrl: String;
  bio: String;
  karma: Number; // Aggregate points from posts/comments
  createdAt: Date;
  updatedAt: Date;
  isActive: Boolean;
  isBanned: Boolean;
  bannedUntil: Date;
  bannedReason: String;
}

/**
 * Auth Session Model
 * Tracks JWT tokens and refresh tokens
 */
interface AuthSessionInterface {
  id: String;
  userId: String; // FK to User
  publicKey: String; // For quick lookup
  jwtToken: String; // Current JWT
  refreshToken: String;
  deviceInfo: String; // Browser/device fingerprint
  ipAddress: String;
  createdAt: Date;
  expiresAt: Date;
  lastAccessedAt: Date;
  isRevoked: Boolean;
}

/**
 * Authentication Challenge Model
 * For cryptographic challenge-response during login
 */
interface AuthChallengeInterface {
  id: String;
  publicKey: Buffer; // Stored as raw binary (matches AuthenticationDto.publicKey)
  challenge: String; // Random challenge string (JWT)
  signedData?: Buffer; // Optional: signature returned by client (matches AuthenticationDto.signedData)
  isUsed: Boolean;
}

// ==================== Subreddit Models ====================

/**
 * Subreddit Model
 */
interface SubredditInterface {
  id: String;
  name: String; // Unique, lowercase, no spaces (e.g., "bitcoin")
  displayName: String; // Display version (e.g., "Bitcoin")
  description: String;
  rules: String; // Markdown formatted rules
  iconUrl: String;
  bannerUrl: String;
  createdBy: String; // FK to User (creator)
  createdAt: Date;
  updatedAt: Date;
  memberCount: Number;
  isNSFW: Boolean;
  isPrivate: Boolean; // Private subreddits require approval
  isArchived: Boolean; // No new posts allowed
  settings: {
    allowTextPosts: Boolean;
    allowLinkPosts: Boolean;
    allowImagePosts: Boolean;
    allowVideoPosts: Boolean;
    requirePostApproval: Boolean; // All posts need mod approval
    allowCrossposts: Boolean;
    minimumKarmaToPost: Number;
    minimumAccountAge: Number; // In days
  };
}

/**
 * Subreddit Member Model
 * Tracks user membership in subreddits
 */
interface SubredditMemberInterface {
  id: String;
  subredditId: String; // FK to Subreddit
  userId: String; // FK to User
  joinedAt: Date;
  isMuted: Boolean; // Can't post/comment but can view
  mutedUntil: Date;
  isBanned: Boolean;
  bannedUntil: Date;
  bannedReason: String;
}

// ==================== Role & Permission Models (RBAC/ABAC) ====================

/**
 * Role Model
 * Predefined roles for subreddit management
 */
interface RoleInterface {
  id: String;
  name: String; // e.g., "owner", "admin", "moderator", "contributor"
  subredditId: String; // FK to Subreddit (null for global roles)
  permissions: [String]; // Array of permission names
  isSystemRole: Boolean; // System roles can't be deleted
  createdAt: Date;
}

/**
 * Permission Model
 * Granular permissions for ABAC
 */
interface PermissionInterface {
  id: String;
  name: String; // e.g., "posts.delete", "users.ban", "subreddit.settings"
  resource: String; // Resource type: "post", "comment", "user", "subreddit"
  action: String; // Action: "create", "read", "update", "delete", "moderate"
  description: String;
  isSystemPermission: Boolean;
}

/**
 * User Role Assignment Model
 * Assigns roles to users in specific subreddits
 */
interface UserRoleInterface {
  id: String;
  userId: String; // FK to User
  subredditId: String; // FK to Subreddit
  roleId: String; // FK to Role
  assignedBy: String; // FK to User who assigned this role
  assignedAt: Date;
  expiresAt: Date; // Optional: temporary role assignments
}

/**
 * ABAC Policy Model (if using ABAC)
 * Attribute-based access control rules
 */
interface AbacPolicyInterface {
  id: String;
  name: String;
  subredditId: String; // FK to Subreddit (null for global)
  resource: String; // "post", "comment", etc.
  action: String; // "create", "delete", etc.
  conditions: {
    userAttributes: Object; // e.g., { karma: { $gte: 100 } }
    resourceAttributes: Object; // e.g., { age: { $lte: "24h" } }
    environmentAttributes: Object; // e.g., { time: "business_hours" }
  };
  effect: String; // "allow" or "deny"
  priority: Number; // For conflict resolution
  isActive: Boolean;
  createdAt: Date;
}

// ==================== Post Models ====================

/**
 * Post Model
 */
interface PostInterface {
  id: String;
  subredditId: String; // FK to Subreddit
  authorId: String; // FK to User
  title: String;
  type: String; // "text", "link", "image", "video", "crosspost"
  content: String; // For text posts (markdown)
  url: String; // For link posts
  mediaUrl: String; // For image/video posts
  thumbnailUrl: String;
  crosspostId: String; // FK to Post (if crosspost)
  flair: String; // Post flair
  isNSFW: Boolean;
  isSpoiler: Boolean;
  isPinned: Boolean; // Pinned to top of subreddit
  isLocked: Boolean; // No new comments
  isArchived: Boolean; // No new interactions
  isRemoved: Boolean; // Removed by moderators
  removalReason: String;
  removedBy: String; // FK to User (moderator)
  createdAt: Date;
  updatedAt: Date;
  editedAt: Date;
  score: Number; // Upvotes - downvotes
  upvoteCount: Number;
  downvoteCount: Number;
  commentCount: Number;
  viewCount: Number;
  reportCount: Number;
}

/**
 * Post Flair Model
 * Available flairs for posts in a subreddit
 */
interface PostFlairInterface {
  id: String;
  subredditId: String; // FK to Subreddit
  text: String;
  backgroundColor: String;
  textColor: String;
  isModOnly: Boolean; // Only mods can assign this flair
  createdAt: Date;
}

// ==================== Comment Models ====================

/**
 * Comment Model
 * Nested comments using parent-child relationship
 */
interface CommentInterface {
  id: String;
  postId: String; // FK to Post
  subredditId: String; // FK to Subreddit (denormalized for queries)
  authorId: String; // FK to User
  parentId: String; // FK to Comment (null for top-level comments)
  content: String; // Markdown
  depth: Number; // Nesting level (0 for top-level)
  path: String; // Materialized path: "id1/id2/id3" for nested queries
  isEdited: Boolean;
  editedAt: Date;
  isRemoved: Boolean;
  removalReason: String;
  removedBy: String; // FK to User (moderator)
  isCollapsed: Boolean; // Collapsed by default (e.g., downvoted)
  createdAt: Date;
  updatedAt: Date;
  score: Number;
  upvoteCount: Number;
  downvoteCount: Number;
  replyCount: Number;
  reportCount: Number;
}

// ==================== Vote Models ====================

/**
 * Vote Model
 * Tracks user votes on posts and comments
 */
interface VoteInterface {
  id: String;
  userId: String; // FK to User
  targetId: String; // FK to Post or Comment
  targetType: String; // "post" or "comment"
  voteType: String; // "upvote" or "downvote"
  createdAt: Date;
  updatedAt: Date;
}

// Composite index on (userId, targetId, targetType) for uniqueness

// ==================== Report & Moderation Models ====================

/**
 * Report Model
 * User reports on posts/comments
 */
interface ReportInterface {
  id: String;
  reporterId: String; // FK to User
  targetId: String; // FK to Post or Comment
  targetType: String; // "post" or "comment"
  subredditId: String; // FK to Subreddit
  reason: String; // "spam", "harassment", "misinformation", etc.
  description: String; // Additional context from reporter
  status: String; // "pending", "reviewed", "resolved", "dismissed"
  reviewedBy: String; // FK to User (moderator)
  reviewedAt: Date;
  actionTaken: String; // "removed", "warned", "banned", "none"
  createdAt: Date;
}

/**
 * Mod Log Model
 * Tracks all moderator actions for transparency
 */
interface ModLogInterface {
  id: String;
  subredditId: String; // FK to Subreddit
  moderatorId: String; // FK to User
  action: String; // "remove_post", "ban_user", "lock_thread", etc.
  targetType: String; // "post", "comment", "user"
  targetId: String;
  reason: String;
  details: Object; // Additional action-specific data
  createdAt: Date;
}

/**
 * Mod Queue Model
 * Items requiring moderator review
 */
interface ModQueueInterface {
  id: String;
  subredditId: String; // FK to Subreddit
  itemId: String; // FK to Post or Comment
  itemType: String; // "post" or "comment"
  reason: String; // Why it's in queue: "reported", "automod", "new_account"
  status: String; // "pending", "approved", "removed"
  assignedTo: String; // FK to User (moderator)
  reviewedBy: String; // FK to User
  reviewedAt: Date;
  createdAt: Date;
}

// ==================== Notification Models ====================

/**
 * Notification Model
 */
interface NotificationInterface {
  id: String;
  userId: String; // FK to User (recipient)
  type: String; // "comment_reply", "post_reply", "mention", "upvote_milestone", etc.
  actorId: String; // FK to User (who triggered the notification)
  targetId: String; // FK to related Post/Comment
  targetType: String;
  message: String;
  isRead: Boolean;
  createdAt: Date;
  readAt: Date;
}

// ==================== Message/Chat Models ====================

/**
 * Direct Message Model
 */
interface MessageInterface {
  id: String;
  senderId: String; // FK to User
  recipientId: String; // FK to User
  subject: String; // Optional
  content: String; // Markdown
  parentMessageId: String; // FK to Message (for threads)
  isRead: Boolean;
  readAt: Date;
  createdAt: Date;
  isDeleted: Boolean; // Soft delete
}

// ==================== Award/Badge Models ====================

/**
 * Award Type Model
 * Different types of awards users can give
 */
interface AwardTypeInterface {
  id: String;
  name: String; // "Gold", "Silver", "Helpful", etc.
  iconUrl: String;
  cost: Number; // In platform currency/karma
  description: String;
  isActive: Boolean;
  createdAt: Date;
}

/**
 * Award Model
 * Tracks awards given to posts/comments
 */
interface AwardInterface {
  id: String;
  awardTypeId: String; // FK to AwardType
  giverId: String; // FK to User
  targetId: String; // FK to Post or Comment
  targetType: String;
  isAnonymous: Boolean;
  message: String; // Optional message from giver
  createdAt: Date;
}

// ==================== Saved/Bookmarked Content ====================

/**
 * Saved Content Model
 */
interface SavedContentInterface {
  id: String;
  userId: String; // FK to User
  targetId: String; // FK to Post or Comment
  targetType: String;
  category: String; // User-defined categories/folders
  createdAt: Date;
}

// ==================== User Follow/Block Models ====================

/**
 * User Follow Model
 */
interface UserFollowInterface {
  id: String;
  followerId: String; // FK to User
  followingId: String; // FK to User
  createdAt: Date;
}

/**
 * User Block Model
 */
interface UserBlockInterface {
  id: String;
  blockerId: String; // FK to User
  blockedId: String; // FK to User
  reason: String;
  createdAt: Date;
}

// ==================== Search & Feed Models ====================

/**
 * User Feed Preferences Model
 */
interface FeedPreferencesInterface {
  id: String;
  userId: String; // FK to User
  sortBy: String; // "hot", "new", "top", "controversial"
  timeRange: String; // "hour", "day", "week", "month", "year", "all"
  showNSFW: Boolean;
  autoplayVideos: Boolean;
  defaultView: String; // "card", "classic", "compact"
  mutedSubreddits: [String]; // Array of subreddit IDs
  mutedUsers: [String]; // Array of user IDs
  updatedAt: Date;
}

/**
 * Search History Model
 */
interface SearchHistoryInterface {
  id: String;
  userId: String; // FK to User
  query: String;
  filters: Object; // Subreddit, date range, etc.
  resultCount: Number;
  createdAt: Date;
}

// ==================== Analytics Models (Optional) ====================

/**
 * Post Analytics Model
 */
interface PostAnalyticsInterface {
  id: String;
  postId: String; // FK to Post
  date: Date; // Daily aggregation
  views: Number;
  uniqueViews: Number;
  upvotes: Number;
  downvotes: Number;
  comments: Number;
  shares: Number;
  awards: Number;
}

/**
 * Subreddit Analytics Model
 */
interface SubredditAnalyticsInterface {
  id: String;
  subredditId: String; // FK to Subreddit
  date: Date;
  activeUsers: Number;
  newMembers: Number;
  posts: Number;
  comments: Number;
  totalViews: Number;
}

// ==================== Indexes & Relationships ====================

/**
 * Recommended Indexes:
 *
 * User:
 * - publicKey (unique)
 * - username (unique)
 * - address (unique)
 *
 * AuthSession:
 * - userId
 * - publicKey
 * - refreshToken
 *
 * Subreddit:
 * - name (unique)
 *
 * Post:
 * - subredditId, createdAt
 * - authorId, createdAt
 * - score (for trending)
 *
 * Comment:
 * - postId, path
 * - authorId, createdAt
 * - parentId
 *
 * Vote:
 * - (userId, targetId, targetType) unique
 * - targetId, targetType
 *
 * SubredditMember:
 * - (userId, subredditId) unique
 * - subredditId
 *
 * UserRole:
 * - (userId, subredditId, roleId) unique
 * - userId
 * - subredditId
 */
