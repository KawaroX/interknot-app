import type { RecordModel } from 'pocketbase';
import type {
  Author,
  CommentItem,
  PostDetail,
  PostSummary,
  SystemMessage,
} from '$lib/types';

export const mapAuthor = (record: RecordModel | undefined | null, baseUrl: string) => {
  if (!record) {
    return {
      id: 'unknown',
      name: '匿名',
    } satisfies Author;
  }

  const avatar = record.get?.('avatar') ?? record.avatar;
  const avatarUrl = avatar
    ? `${baseUrl}/api/files/${record.collectionId}/${record.id}/${avatar}`
    : undefined;

  return {
    id: record.id,
    name: record.get?.('name') ?? record.name ?? '匿名',
    avatarUrl,
    level: record.get?.('level') ?? record.level ?? null,
  } satisfies Author;
};

export const mapPostSummary = (
  record: RecordModel,
  baseUrl: string,
): PostSummary => {
  const cover = record.get?.('cover') ?? record.cover;
  const coverUrl = cover
    ? `${baseUrl}/api/files/${record.collectionId}/${record.id}/${cover}`
    : null;

  const authorRecord = record.expand?.author as RecordModel | undefined;
  const createdAt = record.created ?? new Date().toISOString();
  const editedRaw = record.get?.('edited_at') ?? record.edited_at;
  const editedAt =
    typeof editedRaw === 'string' && editedRaw.trim() ? editedRaw : undefined;

  return {
    id: record.id,
    title: record.get?.('title') ?? record.title ?? '',
    body: record.get?.('body') ?? record.body ?? '',
    coverUrl,
    ipRegion: record.get?.('ip_region') ?? record.ip_region ?? undefined,
    tags: record.get?.('tags') ?? record.tags ?? [],
    author: mapAuthor(authorRecord, baseUrl),
    likeCount: record.get?.('like_count') ?? record.like_count ?? 0,
    commentCount: record.get?.('comment_count') ?? record.comment_count ?? 0,
    viewCount: record.get?.('view_count') ?? record.view_count ?? 0,
    reportCount: record.get?.('report_count') ?? record.report_count ?? 0,
    moderationStatus:
      record.get?.('moderation_status') ?? record.moderation_status ?? 'active',
    createdAt,
    editedAt: editedAt ?? createdAt,
  };
};

export const mapComment = (
  record: RecordModel,
  baseUrl: string,
): CommentItem => {
  const authorRecord = record.expand?.author as RecordModel | undefined;
  return {
    id: record.id,
    body: record.get?.('body') ?? record.body ?? '',
    author: mapAuthor(authorRecord, baseUrl),
    reportCount: record.get?.('report_count') ?? record.report_count ?? 0,
    moderationStatus:
      record.get?.('moderation_status') ?? record.moderation_status ?? 'active',
    createdAt: record.created ?? new Date().toISOString(),
    ipRegion: record.get?.('ip_region') ?? record.ip_region ?? undefined,
  };
};

export const mapPostDetail = (
  record: RecordModel,
  comments: RecordModel[],
  baseUrl: string,
): PostDetail => {
  const summary = mapPostSummary(record, baseUrl);
  return {
    ...summary,
    comments: comments.map((comment) => mapComment(comment, baseUrl)),
  };
};

export const mapSystemMessage = (
  record: RecordModel,
  baseUrl: string,
): SystemMessage => {
  const actorRecord = record.expand?.actor as RecordModel | undefined;
  const postRecord = record.expand?.post as RecordModel | undefined;
  const commentRecord = record.expand?.comment as RecordModel | undefined;
  return {
    id: record.id,
    title: record.get?.('title') ?? record.title ?? '',
    body: record.get?.('body') ?? record.body ?? '',
    status:
      (record.get?.('status') ?? record.status ?? 'unread') as SystemMessage['status'],
    messageType: (record.get?.('message_type') ?? record.message_type ?? 'system') as
      | 'system'
      | 'like'
      | 'comment',
    actor: actorRecord ? mapAuthor(actorRecord, baseUrl) : undefined,
    targetType: (record.get?.('target_type') ?? record.target_type) as
      | 'post'
      | 'comment'
      | undefined,
    postId: record.get?.('post') ?? record.post ?? null,
    postTitle: postRecord?.get?.('title') ?? postRecord?.title ?? undefined,
    commentId: record.get?.('comment') ?? record.comment ?? null,
    commentBody: commentRecord?.get?.('body') ?? commentRecord?.body ?? undefined,
    createdAt: record.created ?? new Date().toISOString(),
  };
};
