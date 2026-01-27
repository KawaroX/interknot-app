import { json } from '@sveltejs/kit';
import type { RecordModel } from 'pocketbase';
import type PocketBase from 'pocketbase';
import { env } from '$env/dynamic/public';
import { getAdminPb } from '$lib/server/pbAdmin';
import { getUserFromRequest } from '$lib/server/auth';
import { mapAuthor } from '$lib/server/mappers';
import type { ModerationQueueItem } from '$lib/types';

const baseUrl = env.PUBLIC_PB_URL || 'http://localhost:8090';
const allowedStatuses = new Set([
  'pending_review',
  'hidden',
  'rejected',
  'pending_ai',
  'active',
]);

const isModerator = (user: RecordModel) => {
  const role = (user.get?.('role') ?? user.role ?? 'user') as string;
  return role === 'moderator' || role === 'admin';
};

const parseLimit = (value: string | null) => {
  const raw = Number(value ?? '50');
  if (!Number.isFinite(raw)) return 50;
  return Math.min(Math.max(Math.trunc(raw), 1), 200);
};

const buildFilter = (status: string, reviewRequested: string) => {
  const filters: string[] = [];
  if (status !== 'all') {
    filters.push(`moderation_status = "${status}"`);
  }
  if (reviewRequested !== 'all') {
    filters.push(`review_requested = ${reviewRequested === 'true'}`);
  }
  return filters.join(' && ');
};

const buildCoverUrl = (record: RecordModel) => {
  const cover = record.get?.('cover') ?? record.cover;
  return cover ? `${baseUrl}/api/files/${record.collectionId}/${record.id}/${cover}` : null;
};

const mapPostItem = (record: RecordModel): ModerationQueueItem => {
  const authorRecord = record.expand?.author as RecordModel | undefined;
  const aiReason = (record.get?.('ai_reason') ?? record.ai_reason ?? '') as string;
  return {
    id: record.id,
    targetType: 'post',
    title: record.get?.('title') ?? record.title ?? '',
    body: record.get?.('body') ?? record.body ?? '',
    coverUrl: buildCoverUrl(record),
    aiReason: aiReason || undefined,
    author: mapAuthor(authorRecord, baseUrl),
    createdAt: record.created ?? new Date().toISOString(),
    moderationStatus: record.get?.('moderation_status') ?? record.moderation_status ?? 'active',
    reviewRequested: Boolean(
      record.get?.('review_requested') ?? record.review_requested ?? false,
    ),
    reportCount: record.get?.('report_count') ?? record.report_count ?? 0,
  };
};

const mapCommentItem = (record: RecordModel): ModerationQueueItem => {
  const authorRecord = record.expand?.author as RecordModel | undefined;
  const postRecord = record.expand?.post as RecordModel | undefined;
  const aiReason = (record.get?.('ai_reason') ?? record.ai_reason ?? '') as string;
  return {
    id: record.id,
    targetType: 'comment',
    body: record.get?.('body') ?? record.body ?? '',
    author: mapAuthor(authorRecord, baseUrl),
    aiReason: aiReason || undefined,
    createdAt: record.created ?? new Date().toISOString(),
    moderationStatus: record.get?.('moderation_status') ?? record.moderation_status ?? 'active',
    reviewRequested: Boolean(
      record.get?.('review_requested') ?? record.review_requested ?? false,
    ),
    reportCount: record.get?.('report_count') ?? record.report_count ?? 0,
    postId: (record.get?.('post') ?? record.post ?? '') as string,
    postTitle: postRecord?.get?.('title') ?? postRecord?.title ?? '',
  };
};

type ReportEntry = {
  reason: string;
  detail?: string;
  createdAt: string;
};

const fetchReports = async (payload: {
  admin: PocketBase;
  targetType: 'post' | 'comment';
  targetIds: string[];
}) => {
  const { admin, targetType, targetIds } = payload;
  if (targetIds.length === 0) return new Map<string, ReportEntry[]>();
  const field = targetType === 'post' ? 'post' : 'comment';
  const filter = `${targetIds.map((id) => `${field} = "${id}"`).join(' || ')}`;
  try {
    const records = await admin.collection('reports').getFullList({
      filter: `target_type = "${targetType}" && status = "pending" && (${filter})`,
      sort: '-created',
    });
    const map = new Map<string, ReportEntry[]>();
    for (const record of records) {
      const targetId = (record.get?.(field) ?? (record as Record<string, unknown>)[field]) as
        | string
        | undefined;
      if (!targetId) continue;
      const reasonDetail =
        (record.get?.('reason_detail') ?? record.reason_detail ?? '') as string;
      const fallbackReason = (record.get?.('reason') ?? record.reason ?? '') as string;
      let reason = fallbackReason;
      let detail = reasonDetail;
      if (!detail) {
        const separatorIndex = fallbackReason.indexOf('：');
        const asciiIndex = fallbackReason.indexOf(':');
        const splitIndex = separatorIndex === -1 ? asciiIndex : separatorIndex;
        if (splitIndex > 0) {
          reason = fallbackReason.slice(0, splitIndex).trim();
          detail = fallbackReason.slice(splitIndex + 1).trim();
        }
      }
      const entry: ReportEntry = {
        reason: reason || '其他',
        detail: detail || undefined,
        createdAt: record.created ?? new Date().toISOString(),
      };
      const existing = map.get(targetId) ?? [];
      existing.push(entry);
      map.set(targetId, existing);
    }
    return map;
  } catch (err) {
    console.error('report_queue_fetch_failed', err);
    return new Map<string, ReportEntry[]>();
  }
};

export const GET = async ({ url, request }) => {
  const { user } = await getUserFromRequest(request);
  if (!isModerator(user)) {
    return json({ error: 'forbidden' }, { status: 403 });
  }

  const typeParam = url.searchParams.get('type');
  const type = typeParam === 'post' || typeParam === 'comment' ? typeParam : 'all';
  const statusParam = url.searchParams.get('status') ?? 'pending_review';
  const status = statusParam === 'all' || allowedStatuses.has(statusParam)
    ? statusParam
    : 'pending_review';
  const reviewRequestedParam = url.searchParams.get('reviewRequested');
  const reviewRequested =
    reviewRequestedParam === 'true' || reviewRequestedParam === 'false'
      ? reviewRequestedParam
      : 'all';
  const sourceParam = url.searchParams.get('source');
  const source = sourceParam === 'review' || sourceParam === 'reported' ? sourceParam : 'all';
  const limit = parseLimit(url.searchParams.get('limit'));

  const filter = buildFilter(status, reviewRequested);
  const admin = await getAdminPb();

  const loadPosts = async (filterOverride?: string) => {
    const records = await admin.collection('posts').getList(1, limit, {
      filter: (filterOverride ?? filter) || undefined,
      sort: '-created',
      expand: 'author',
    });
    return records.items.map(mapPostItem);
  };

  const loadComments = async (filterOverride?: string) => {
    const records = await admin.collection('comments').getList(1, limit, {
      filter: (filterOverride ?? filter) || undefined,
      sort: '-created',
      expand: 'author,post',
    });
    return records.items.map(mapCommentItem);
  };

  const mergeItems = (primary: ModerationQueueItem[], extra: ModerationQueueItem[]) => {
    const map = new Map<string, ModerationQueueItem>();
    for (const item of primary) {
      map.set(`${item.targetType}_${item.id}`, item);
    }
    for (const item of extra) {
      const key = `${item.targetType}_${item.id}`;
      if (!map.has(key)) {
        map.set(key, item);
      }
    }
    return Array.from(map.values());
  };

  let items: ModerationQueueItem[] = [];
  const reportedFilter = 'report_count > 0';
  if (type === 'post') {
    if (source === 'review') {
      items = await loadPosts();
    } else if (source === 'reported') {
      items = await loadPosts(reportedFilter);
    } else {
      const [reviewItems, reportedItems] = await Promise.all([
        loadPosts(),
        loadPosts(reportedFilter),
      ]);
      items = mergeItems(reviewItems, reportedItems);
    }
  } else if (type === 'comment') {
    if (source === 'review') {
      items = await loadComments();
    } else if (source === 'reported') {
      items = await loadComments(reportedFilter);
    } else {
      const [reviewItems, reportedItems] = await Promise.all([
        loadComments(),
        loadComments(reportedFilter),
      ]);
      items = mergeItems(reviewItems, reportedItems);
    }
  } else {
    if (source === 'review') {
      const [posts, comments] = await Promise.all([loadPosts(), loadComments()]);
      items = mergeItems(posts, comments);
    } else if (source === 'reported') {
      const [posts, comments] = await Promise.all([
        loadPosts(reportedFilter),
        loadComments(reportedFilter),
      ]);
      items = mergeItems(posts, comments);
    } else {
      const [reviewPosts, reviewComments, reportedPosts, reportedComments] = await Promise.all([
        loadPosts(),
        loadComments(),
        loadPosts(reportedFilter),
        loadComments(reportedFilter),
      ]);
      items = mergeItems(
        mergeItems(reviewPosts, reviewComments),
        mergeItems(reportedPosts, reportedComments),
      );
    }
  }

  const postIds = items.filter((item) => item.targetType === 'post').map((item) => item.id);
  const commentIds = items
    .filter((item) => item.targetType === 'comment')
    .map((item) => item.id);
  const [postReports, commentReports] = await Promise.all([
    fetchReports({ admin, targetType: 'post', targetIds: postIds }),
    fetchReports({ admin, targetType: 'comment', targetIds: commentIds }),
  ]);

  items = items.map((item) => {
    const reports =
      item.targetType === 'post'
        ? postReports.get(item.id) ?? []
        : commentReports.get(item.id) ?? [];
    return {
      ...item,
      reportCount: reports.length,
      reports: reports.length ? reports : undefined,
    };
  });

  items = items
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);

  return json({ items });
};
