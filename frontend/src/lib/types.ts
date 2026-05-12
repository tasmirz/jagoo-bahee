export interface User {
  _id: string;
  authId?: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  avatar?: string;
  banner?: string;
  bio?: string;
  karma?: number;
  postKarma: number;
  commentKarma: number;
  createdAt: string;
  updatedAt: string;
}

export interface Subreddit {
  _id: string;
  name: string;
  displayName: string;
  description: string;
  rules?: string | string[];
  iconAttachmentId?: string;
  bannerAttachmentId?: string;
  createdBy: string | User;
  creatorId?: string;
  memberCount: number;
  postCount?: number; // Backend might need to provide this or it's calculated
  isPrivate: boolean;
  isNsfw?: boolean;
  isArchived: boolean;
  icon?: string;
  banner?: string;
  theme?: {
    primary: string;
    accent: string;
    background: string;
    foreground: string;
  };
  isJoined?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PostType = "text" | "link" | "image" | "video" | "poll" | "crosspost";

export interface Post {
  _id: string;
  subredditId: string | Subreddit;
  authorId: string | User;
  author?: User;
  subreddit?: Subreddit;
  title: string;
  type: PostType;
  content?: string;
  url?: string;
  attachmentIds: string[];
  poll?: {
    question: string;
    options: string[];
    multiple?: boolean;
    closesAt?: string;
  };
  crosspostId?: string;
  flair?: string;
  flairText?: string;
  flairColor?: string;
  isNsfw?: boolean;
  isSpoiler?: boolean;
  isLocked?: boolean;
  upvotes?: number;
  downvotes?: number;
  userSignature: string;
  authorPublicKey?: string;
  contentHash: string;
  serverAcknowledgement?: string;
  editHistory?: Array<{ timestamp: string; contentHash: string; signature: string }>;
  statusFlags: string; // BigInt serialized as string
  score: number;
  upvoteCount: number;
  downvoteCount: number;
  commentCount: number;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
  verified?: boolean;
}

export interface Comment {
  _id: string;
  postId: string;
  authorId: string | User;
  author?: User;
  parentId?: string;
  content: string;
  attachmentIds: string[];
  userSignature: string;
  contentHash: string;
  serverAcknowledgement?: string;
  isDeleted?: boolean;
  deletionSignature?: string;
  editHistory?: Array<{ timestamp: string; contentHash: string; signature: string }>;
  statusFlags: string;
  score: number;
  upvoteCount: number;
  downvoteCount: number;
  replyCount: number;
  depth: number;
  path: string;
  createdAt: string;
  updatedAt: string;
  replies?: Comment[];
  verified?: boolean;
}

export interface Vote {
  _id: string;
  userId: string;
  targetId: string;
  targetType: "post" | "comment";
  delta: 1 | -1;
  createdAt: string;
}

export interface Award {
  _id: string;
  name: string;
  description?: string;
  icon: string;
  coinCost: number;
  isPremium: boolean;
  subredditId?: string;
  createdAt: string;
}

export interface Message {
  _id: string;
  senderId: string | User;
  recipientId: string | User;
  subject?: string;
  content: string;
  contentHash: string;
  attachmentIds: string[];
  parentMessageId?: string;
  senderSignature: string;
  isRead: boolean;
  readAt?: string;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  _id: string;
  userId: string | User;
  type: string;
  actorId?: string | User;
  fromUserId?: string;
  targetId?: string;
  targetType?: string;
  contentId?: string;
  message: string;
  isRead: boolean;
  read?: boolean;
  readAt?: string;
  createdAt: string;
}

export interface ModLog {
  _id: string;
  subredditId: string;
  moderatorId: string;
  action: string;
  targetId: string;
  targetType: string;
  reason?: string;
  moderatorSignature: string;
  createdAt: string;
}

export interface SubredditMember {
  _id: string;
  subredditId: string;
  userId: string;
  role?: "member" | "moderator" | "admin";
  isBanned?: boolean;
  banReason?: string;
  banExpires?: string;
  joinedAt?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  skip: number;
}

export interface VerificationResult {
  verified: boolean;
  contentHash: string;
  signature: string;
  publicKey: string;
  timestamp: string;
  error?: string;
}

export interface ToastMessage {
  id: string;
  type: "success" | "error" | "info" | "warning";
  message: string;
  duration?: number;
}
