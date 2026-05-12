export interface User {
  _id: string;
  username: string;
  avatarUrl?: string;
  bio?: string;
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
  rules?: string;
  iconAttachmentId?: string;
  bannerAttachmentId?: string;
  createdBy: string | User;
  memberCount: number;
  postCount?: number; // Backend might need to provide this or it's calculated
  isPrivate: boolean;
  isArchived: boolean;
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

export type PostType = "text" | "link" | "image" | "video" | "crosspost";

export interface Post {
  _id: string;
  subredditId: string | Subreddit;
  authorId: string | User;
  title: string;
  type: PostType;
  content?: string;
  url?: string;
  attachmentIds: string[];
  crosspostId?: string;
  flair?: string;
  userSignature: string;
  contentHash: string;
  statusFlags: string; // BigInt serialized as string
  score: number;
  upvoteCount: number;
  downvoteCount: number;
  commentCount: number;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  _id: string;
  postId: string;
  authorId: string | User;
  parentId?: string;
  content: string;
  attachmentIds: string[];
  userSignature: string;
  contentHash: string;
  statusFlags: string;
  score: number;
  upvoteCount: number;
  downvoteCount: number;
  replyCount: number;
  depth: number;
  path: string;
  createdAt: string;
  updatedAt: string;
}
