// Core data types matching backend schemas

export interface User {
  _id: string;
  authId: string;
  username: string;
  displayName?: string;
  bio?: string;
  avatar?: string;
  avatarUrl?: string;
  banner?: string;
  karma: number;
  postKarma?: number;
  commentKarma?: number;
  createdAt: string;
  updatedAt?: string;
}

export interface Subreddit {
  _id: string;
  name: string;
  displayName: string;
  description?: string;
  icon?: string;
  banner?: string;
  iconAttachmentId?: string;
  bannerAttachmentId?: string;
  theme?: {
    primaryColor?: string;
    backgroundColor?: string;
  };
  creatorId: string;
  memberCount: number;
  postCount: number;
  isNsfw: boolean;
  isPrivate: boolean;
  rules?: string[];
  createdAt: string;
  updatedAt?: string;
}

export interface Post {
  _id: string;
  subredditId: string;
  authorId: string;
  title: string;
  type: "text" | "link" | "image" | "video";
  content?: string;
  url?: string;
  attachmentIds?: string[];
  flairText?: string;
  flairColor?: string;
  isNsfw: boolean;
  isSpoiler: boolean;
  isLocked: boolean;
  upvotes: number;
  downvotes: number;
  score: number;
  commentCount: number;
  userSignature: string;
  contentHash: string;
  serverAcknowledgement?: string;
  editHistory?: Array<{
    timestamp: string;
    contentHash: string;
    signature: string;
  }>;
  createdAt: string;
  updatedAt?: string;
  author?: User;
  subreddit?: Subreddit;
  verified?: boolean;
}

export interface Comment {
  _id: string;
  postId: string;
  authorId: string;
  parentId?: string;
  path: string;
  depth: number;
  content: string;
  upvotes: number;
  downvotes: number;
  score: number;
  replyCount: number;
  userSignature: string;
  contentHash: string;
  serverAcknowledgement?: string;
  isDeleted: boolean;
  deletionSignature?: string;
  editHistory?: Array<{
    timestamp: string;
    contentHash: string;
    signature: string;
  }>;
  createdAt: string;
  updatedAt?: string;
  author?: User;
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

export interface Notification {
  _id: string;
  userId: string;
  type: "mention" | "reply" | "award" | "follow" | "mod_action";
  fromUserId?: string;
  contentId?: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface Message {
  _id: string;
  senderId: string;
  recipientId: string;
  subject?: string;
  content: string;
  attachmentIds: string[];
  parentMessageId?: string;
  senderSignature: string;
  read: boolean;
  createdAt: string;
  updatedAt: string;
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
  role: "member" | "moderator" | "admin";
  isBanned: boolean;
  banReason?: string;
  banExpires?: string;
  joinedAt: string;
}

// API Response types
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  skip: number;
}

// Verification types
export interface VerificationResult {
  verified: boolean;
  contentHash: string;
  signature: string;
  publicKey: string;
  timestamp: string;
  error?: string;
}

// Form types
export interface CreatePostForm {
  subredditId: string;
  title: string;
  type: "text" | "link" | "image" | "video";
  content?: string;
  url?: string;
  attachmentIds?: string[];
  flairText?: string;
  isNsfw?: boolean;
  isSpoiler?: boolean;
}

export interface CreateCommentForm {
  postId: string;
  parentId?: string;
  content: string;
}

export interface CreateSubredditForm {
  name: string;
  displayName: string;
  description?: string;
  isNsfw?: boolean;
  isPrivate?: boolean;
}

// UI State types
export interface ToastMessage {
  id: string;
  type: "success" | "error" | "info" | "warning";
  message: string;
  duration?: number;
}

export interface ModalState {
  isOpen: boolean;
  type?: string;
  data?: object;
}
