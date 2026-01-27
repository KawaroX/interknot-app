export type Author = {
  id: string;
  name: string;
  avatarUrl?: string;
  level?: number | null;
};

export type PostSummary = {
  id: string;
  title: string;
  body: string;
  coverUrl?: string | null;
  aiReason?: string;
  author: Author;
  tags?: string[];
  likeCount: number;
  commentCount: number;
  viewCount: number;
  reportCount: number;
  moderationStatus: string;
  createdAt: string;
  editedAt?: string;
  ipRegion?: string;
  likedByViewer?: boolean;
  authorFollowedByViewer?: boolean;
  readByViewer?: boolean;
};

export type CommentItem = {
  id: string;
  body: string;
  author: Author;
  reportCount: number;
  moderationStatus: string;
  createdAt: string;
  ipRegion?: string;
  reportedByViewer?: boolean;
};

export type PostDetail = PostSummary & {
  comments: CommentItem[];
  likedByViewer?: boolean;
  reportedByViewer?: boolean;
  authorFollowedByViewer?: boolean;
  readByViewer?: boolean;
};

export type FollowedUser = Author & {
  followedAt: string;
};

export type SystemMessage = {
  id: string;
  title: string;
  body: string;
  status: 'unread' | 'read' | 'actioned' | 'hidden';
  messageType?: 'system' | 'like' | 'comment';
  actor?: Author;
  targetType?: 'post' | 'comment';
  postId?: string | null;
  postTitle?: string;
  commentId?: string | null;
  commentBody?: string;
  createdAt: string;
};

export type ModerationQueueItem = {
  id: string;
  targetType: 'post' | 'comment';
  title?: string;
  body: string;
  coverUrl?: string | null;
  aiReason?: string;
  author: Author;
  createdAt: string;
  moderationStatus: string;
  reviewRequested: boolean;
  reportCount: number;
  reports?: Array<{ reason: string; detail?: string; createdAt: string }>;
  postId?: string;
  postTitle?: string;
};

export type InviteItem = {
  id: string;
  code: string;
  enabled: boolean;
  usedBy?: Author;
  usedAt?: string | null;
  createdAt: string;
};

export type LegalDocument = {
  key: 'terms_of_service' | 'usage_policy';
  title: string;
  body: string;
  version: string;
  updatedAt?: string;
};
