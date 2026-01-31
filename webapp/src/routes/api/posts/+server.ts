import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';
import { getAdminPb } from '$lib/server/pbAdmin';
import { getOptionalUserFromRequest, getUserFromRequest } from '$lib/server/auth';
import { runModeration } from '$lib/server/moderation';
import { verifyInvite } from '$lib/server/invite';
import { checkPostLimits } from '$lib/server/userRateLimit';
import { fileToDataUrl } from '$lib/server/files';
import { lookupIpRegion, resolveClientIp } from '$lib/server/ipRegion';
import { mapPostSummary } from '$lib/server/mappers';
import { createSystemMessage } from '$lib/server/systemMessages';
import { applyRejectPenalty } from '$lib/server/moderationActions';
import {
  POST_BODY_MAX,
  POST_COVER_MAX_BYTES,
  POST_GIF_MAX_BYTES,
  POST_TITLE_MAX_UNITS,
  getGraphemeCount,
  getTitleUnits,
} from '$lib/validation';

const baseUrl = env.PUBLIC_PB_URL || 'http://localhost:8090';
const HOT_SCORE_THRESHOLD_MIN = 1.5;
const HOT_SCORE_LIMIT = 10;
const HOT_SCORE_SCAN = 50;
const HOT_SCORE_OUTLIER_MULT = 3;

export const GET = async ({ url, request }) => {
  const page = Number(url.searchParams.get('page') ?? '1');
  const perPage = Number(url.searchParams.get('perPage') ?? '30');
  const search = url.searchParams.get('search')?.trim();

  const admin = await getAdminPb();
  const filterParts = ['moderation_status = "active"'];
  if (search) {
    filterParts.push(`(title ~ "${search}" || body ~ "${search}" || tags ~ "${search}" || author.name ~ "${search}")`);
  }

  const postFields = await getPostFields(admin);
  const sortField = postFields.has('edited_at') ? '-edited_at' : '-created';

  const records = await admin.collection('posts').getList(page, perPage, {
    filter: filterParts.join(' && '),
    sort: sortField,
    expand: 'author',
  });

  let hotPostIds = new Set<string>();
  if (postFields.has('hot_score')) {
    try {
      const hotRecords = await admin.collection('posts').getList(1, HOT_SCORE_SCAN, {
        filter: 'moderation_status = "active"',
        sort: '-hot_score',
      });
      const scores = hotRecords.items
        .map((item) => Number(item.get?.('hot_score') ?? item.hot_score ?? 0))
        .filter((score) => Number.isFinite(score))
        .sort((a, b) => a - b);
      const getMedian = (values: number[]) => {
        if (values.length === 0) return 0;
        const mid = Math.floor(values.length / 2);
        return values.length % 2 === 0
          ? (values[mid - 1] + values[mid]) / 2
          : values[mid];
      };
      const median = getMedian(scores);
      const deviations = scores.map((score) => Math.abs(score - median));
      const mad = getMedian(deviations);
      const outlierThreshold = median + HOT_SCORE_OUTLIER_MULT * mad;
      const threshold = Math.max(HOT_SCORE_THRESHOLD_MIN, outlierThreshold);

      const eligible = hotRecords.items
        .filter((item) => {
          const score = Number(item.get?.('hot_score') ?? item.hot_score ?? 0);
          return score >= threshold;
        })
        .slice(0, HOT_SCORE_LIMIT)
        .map((item) => item.id);
      hotPostIds = new Set(eligible);
    } catch (err) {
      console.error('hot_post_lookup_failed', err);
    }
  }

  const user = await getOptionalUserFromRequest(request);
  let likedPostIds = new Set<string>();
  let followedAuthorIds = new Set<string>();
  let readPostIds = new Set<string>();
  if (user && records.items.length > 0) {
    const likeFilter = records.items.map((item) => `post = "${item.id}"`).join(' || ');
    try {
      const likes = await admin.collection('likes').getFullList({
        filter: `user = "${user.id}" && (${likeFilter})`,
      });
      likedPostIds = new Set(
        likes
          .map((like) => like.get?.('post') ?? like.post)
          .filter((id): id is string => Boolean(id)),
      );
    } catch (err) {
      console.error('like_list_lookup_failed', err);
    }

    const authorIds = Array.from(
      new Set(
        records.items
          .map((item) => item.get?.('author') ?? item.author)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    if (authorIds.length > 0) {
      const followFilter = authorIds.map((id) => `followed = "${id}"`).join(' || ');
      try {
        const follows = await admin.collection('follows').getFullList({
          filter: `follower = "${user.id}" && (${followFilter})`,
        });
        followedAuthorIds = new Set(
          follows
            .map((follow) => follow.get?.('followed') ?? follow.followed)
            .filter((id): id is string => Boolean(id)),
        );
      } catch (err) {
        console.error('follow_list_lookup_failed', err);
      }
    }

    const readFilter = records.items.map((item) => `post = "${item.id}"`).join(' || ');
    try {
      const reads = await admin.collection('post_reads').getFullList({
        filter: `user = "${user.id}" && (${readFilter})`,
      });
      readPostIds = new Set(
        reads
          .map((read) => read.get?.('post') ?? read.post)
          .filter((id): id is string => Boolean(id)),
      );
    } catch (err) {
      console.error('post_read_lookup_failed', err);
    }
  }

  const items = records.items.map((item) => ({
    ...mapPostSummary(item, baseUrl),
    likedByViewer: likedPostIds.has(item.id),
    authorFollowedByViewer: followedAuthorIds.has(
      (item.get?.('author') ?? item.author) as string,
    ),
    readByViewer: readPostIds.has(item.id),
    isHot: hotPostIds.has(item.id),
  }));

  const getSortTime = (value?: string) => {
    if (!value) return 0;
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? 0 : time;
  };
  items.sort(
    (a, b) =>
      getSortTime(b.editedAt ?? b.createdAt) - getSortTime(a.editedAt ?? a.createdAt),
  );

  return json({
    items,
    page: records.page,
    perPage: records.perPage,
    totalItems: records.totalItems,
  });
};

let cachedPostFields: Set<string> | null = null;

const getPostFields = async (admin: Awaited<ReturnType<typeof getAdminPb>>) => {
  if (cachedPostFields) return cachedPostFields;
  try {
    const collection = await admin.collections.getOne('posts');
    cachedPostFields = new Set((collection?.fields ?? []).map((field) => field.name));
  } catch (err) {
    console.error('post_fields_lookup_failed', err);
    cachedPostFields = new Set();
  }
  return cachedPostFields;
};

const getFieldError = (err: unknown, field: string) => {
  if (!err || typeof err !== 'object') return null;
  const data = (err as { data?: { data?: Record<string, unknown> } }).data;
  const fieldErrors = data && typeof data === 'object' ? (data as { data?: Record<string, unknown> }).data : null;
  const entry = fieldErrors?.[field];
  if (!entry || typeof entry !== 'object') return null;
  return entry as { code?: string; message?: string };
};

const mapCoverError = (err: unknown) => {
  const fieldError = getFieldError(err, 'cover');
  if (!fieldError) return null;
  const code = String(fieldError.code ?? '').toLowerCase();
  const message = String(fieldError.message ?? 'cover_upload_failed');
  if (code.includes('size') || /size|large|limit/i.test(message)) {
    return { error: 'cover_too_large', detail: message };
  }
  if (code.includes('mime') || code.includes('type') || /mime|type|format/i.test(message)) {
    return { error: 'cover_invalid', detail: message };
  }
  return { error: 'cover_invalid', detail: message };
};

export const POST = async ({ request, getClientAddress }) => {
  const { user } = await getUserFromRequest(request);
  const admin = await getAdminPb();
  const postFields = await getPostFields(admin);

  const form = await request.formData();
  const title = String(form.get('title') ?? '').trim();
  const body = String(form.get('body') ?? '').trim();
  const tagsRaw = String(form.get('tags') ?? '[]');
  const coverFile = form.get('cover');

  if (!title || !body) {
    return json({ error: 'title_or_body_missing' }, { status: 400 });
  }

  let tags: string[] = [];
  try {
    const parsed = JSON.parse(tagsRaw);
    if (Array.isArray(parsed)) {
      tags = parsed.map(String).map(t => t.trim()).filter(Boolean).slice(0, 10); // Max 10 tags
    }
  } catch (e) {
    // Ignore invalid tags
  }

  if (getTitleUnits(title) > POST_TITLE_MAX_UNITS) {
    return json({ error: 'title_too_long' }, { status: 400 });
  }

  if (getGraphemeCount(body) > POST_BODY_MAX) {
    return json({ error: 'body_too_long' }, { status: 400 });
  }

  if (coverFile instanceof File) {
    const isGif = coverFile.type === 'image/gif' || coverFile.name.toLowerCase().endsWith('.gif');
    const maxSize = isGif ? POST_GIF_MAX_BYTES : POST_COVER_MAX_BYTES;
    if (coverFile.size > maxSize) {
      return json({ error: 'cover_too_large', detail: isGif ? 'gif' : 'image' }, { status: 400 });
    }
  }

  const canPost = user.get?.('can_post') ?? user.can_post;
  const rejectCount = Number(user.get?.('reject_count') ?? user.reject_count ?? 0);
  if (canPost === false && rejectCount >= 3) {
    return json({ error: 'can_post_disabled' }, { status: 403 });
  }

  const inviteRequired = (env.PUBLIC_INVITE_REQUIRED || '').toLowerCase() === 'true';
  const shouldVerifyInvite = inviteRequired || canPost === false;
  let inviteOk = false;
  if (shouldVerifyInvite && canPost !== true) {
    const invite = await verifyInvite(admin, user);
    if (!invite.ok) {
      return json({ error: invite.reason }, { status: 403 });
    }
    inviteOk = true;
  }

  if (canPost === false && !inviteOk) {
    return json({ error: 'can_post_disabled' }, { status: 403 });
  }

  const limits = await checkPostLimits(admin, user.id);
  if (!limits.allowed) {
    return json({ 
      error: limits.reason, 
      detail: limits.message,
      retryAfter: limits.retryAfter 
    }, { status: 429 });
  }

  const images: string[] = [];
  if (coverFile instanceof File && coverFile.size > 0) {
    images.push(await fileToDataUrl(coverFile));
  }

  const payload = new FormData();
  payload.set('title', title);
  payload.set('body', body);
  payload.set('tags', JSON.stringify(tags));
  payload.set('author', user.id);
  payload.set('moderation_status', 'pending_ai');
  payload.set('review_requested', 'false');
  if (postFields.has('edited_at')) {
    payload.set('edited_at', new Date().toISOString());
  }
  payload.set('view_count', '0');
  if (coverFile instanceof File && coverFile.size > 0) {
    payload.set('cover', coverFile);
  }

  const clientIp = resolveClientIp(request, getClientAddress);
  if (postFields.has('ip_address') && clientIp) {
    payload.set('ip_address', clientIp);
  }
  if (postFields.has('ip_region')) {
    const ipRegion = await lookupIpRegion(clientIp, request);
    if (ipRegion) {
      payload.set('ip_region', ipRegion);
    }
  }

  let record;
  try {
    record = await admin.collection('posts').create(payload);
  } catch (err) {
    const status =
      err && typeof err === 'object' && 'status' in err
        ? Number((err as { status?: number }).status ?? 500)
        : 500;
    const coverError = mapCoverError(err);
    const payloadMessage =
      err && typeof err === 'object' && 'data' in err
        ? (err as { data?: { message?: string } }).data?.message
        : undefined;
    const detail =
      coverError?.detail ?? payloadMessage ?? (err instanceof Error ? err.message : 'post_create_failed');
    console.error('post_create_failed', err);
    return json({ error: coverError?.error ?? 'post_create_failed', detail }, { status });
  }

  void (async () => {
    try {
      const moderation = await runModeration(`${title}\n${body}`, images);
      const status = moderation.allowed ? 'active' : 'rejected';
      const aiReason = moderation.allowed
        ? ''
        : moderation.reason ?? '内容可能违反社区规范';
      const adminPb = await getAdminPb();
      await adminPb.collection('posts').update(record.id, {
        moderation_status: status,
        ai_reason: aiReason,
      });

      if (!moderation.allowed) {
        await applyRejectPenalty({ admin: adminPb, userId: user.id, delta: 1 });
      }

      if (!moderation.allowed) {
        const reason = moderation.reason ? `原因：${moderation.reason}` : '原因：内容可能违反社区规范';
        await createSystemMessage({
          admin: adminPb,
          userId: user.id,
          title: '内容审核未通过',
          body: `你的帖子《${title}》未通过审核，可申请复查。${reason}`,
          targetType: 'post',
          postId: record.id,
        });
      }
    } catch (err) {
      console.error('post_moderation_failed', { postId: record.id, userId: user.id }, err);
      const adminPb = await getAdminPb();
      await adminPb.collection('posts').update(record.id, {
        moderation_status: 'pending_review',
        ai_reason: '',
      });
      await createSystemMessage({
        admin: adminPb,
        userId: user.id,
        title: '内容审核暂时失败',
        body: `你的帖子《${title}》暂时无法完成审核，可申请复查。`,
        targetType: 'post',
        postId: record.id,
      });
    }
  })();

  return json({
    post: mapPostSummary(record, baseUrl),
    moderation: {
      status: 'pending_ai',
    },
  });
};
