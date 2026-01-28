import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';
import { getAdminPb } from '$lib/server/pbAdmin';
import { fileToDataUrl } from '$lib/server/files';
import { mapPostDetail, mapPostSummary } from '$lib/server/mappers';
import { getOptionalUserFromRequest, getUserFromRequest } from '$lib/server/auth';
import { runModeration } from '$lib/server/moderation';
import { verifyInvite } from '$lib/server/invite';
import { createSystemMessage } from '$lib/server/systemMessages';
import { applyRejectPenalty } from '$lib/server/moderationActions';
import {
  POST_BODY_MAX,
  POST_COVER_MAX_BYTES,
  POST_TITLE_MAX_UNITS,
  getGraphemeCount,
  getTitleUnits,
} from '$lib/validation';

const baseUrl = env.PUBLIC_PB_URL || 'http://localhost:8090';

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

export const GET = async ({ params, request }) => {
  const admin = await getAdminPb();
  const post = await admin.collection('posts').getOne(params.id, {
    expand: 'author',
  });

  const currentView = post.get?.('view_count') ?? post.view_count ?? 0;
  const nextView = currentView + 1;
  await admin.collection('posts').update(params.id, {
    view_count: nextView,
  });
  post.view_count = nextView;

  const comments = await admin.collection('comments').getFullList({
    filter: `post = "${params.id}" && moderation_status = "active"`,
    sort: 'created',
    expand: 'author',
  });

  const user = await getOptionalUserFromRequest(request);
  let likedByViewer = false;
  let reportedByViewer = false;
  let reportedCommentIds = new Set<string>();
  let authorFollowedByViewer = false;
  let readByViewer = false;

  if (user) {
    readByViewer = true;
    const key = `${user.id}_${params.id}`;
    try {
      await admin.collection('likes').getFirstListItem(`like_key = "${key}"`);
      likedByViewer = true;
    } catch (err) {
      const status =
        err && typeof err === 'object' && 'status' in err
          ? Number((err as { status?: number }).status ?? 500)
          : 500;
      if (status !== 404) {
        console.error('like_lookup_failed', err);
      }
    }

    const authorId = (post.get?.('author') ?? post.author) as string | undefined;
    if (authorId) {
      const followKey = `${user.id}_${authorId}`;
      try {
        await admin.collection('follows').getFirstListItem(`follow_key = "${followKey}"`);
        authorFollowedByViewer = true;
      } catch (err) {
        const status =
          err && typeof err === 'object' && 'status' in err
            ? Number((err as { status?: number }).status ?? 500)
            : 500;
        if (status !== 404) {
          console.error('follow_lookup_failed', err);
        }
      }
    }

    const readKey = `${user.id}_${params.id}`;
    try {
      await admin.collection('post_reads').create({
        post: params.id,
        user: user.id,
        read_key: readKey,
      });
    } catch (err) {
      const status =
        err && typeof err === 'object' && 'status' in err
          ? Number((err as { status?: number }).status ?? 500)
          : 500;
      if (status !== 400) {
        console.error('post_read_create_failed', err);
      }
    }

    try {
      await admin
        .collection('reports')
        .getFirstListItem(
          `target_type = "post" && post = "${params.id}" && reporter = "${user.id}"`,
        );
      reportedByViewer = true;
    } catch (err) {
      const status =
        err && typeof err === 'object' && 'status' in err
          ? Number((err as { status?: number }).status ?? 500)
          : 500;
      if (status !== 404) {
        console.error('post_report_lookup_failed', err);
      }
    }

    if (comments.length > 0) {
      const commentFilter = comments
        .map((comment) => `comment = "${comment.id}"`)
        .join(' || ');
      const reportFilter =
        `target_type = "comment" && reporter = "${user.id}" && (${commentFilter})`;
      try {
        const reports = await admin.collection('reports').getFullList({
          filter: reportFilter,
        });
        reportedCommentIds = new Set(
          reports
            .map((report) => report.get?.('comment') ?? report.comment)
            .filter((id): id is string => Boolean(id)),
        );
      } catch (err) {
        console.error('comment_report_lookup_failed', err);
      }
    }
  }

  const detail = mapPostDetail(post, comments, baseUrl);
  const postDetail = {
    ...detail,
    likedByViewer,
    reportedByViewer,
    authorFollowedByViewer,
    readByViewer,
    comments: detail.comments.map((comment) => ({
      ...comment,
      reportedByViewer: reportedCommentIds.has(comment.id),
    })),
  };

  return json({
    post: postDetail,
  });
};

export const DELETE = async ({ params, request }) => {
  try {
    const { user } = await getUserFromRequest(request);
    const admin = await getAdminPb();
    const post = await admin.collection('posts').getOne(params.id);
    const authorId = post.get?.('author') ?? post.author;

    if (authorId !== user.id) {
      return json({ error: 'not_author' }, { status: 403 });
    }

    await admin.collection('posts').update(params.id, {
      moderation_status: 'hidden',
    });
    return json({ ok: true });
  } catch (err) {
    const status =
      err && typeof err === 'object' && 'status' in err
        ? Number((err as { status?: number }).status ?? 500)
        : 500;
    const detail = err instanceof Error ? err.message : 'delete_failed';
    console.error('post_delete_failed', err);
    return json({ error: 'delete_failed', detail }, { status });
  }
};

export const PATCH = async ({ params, request }) => {
  try {
    const { user } = await getUserFromRequest(request);
    const admin = await getAdminPb();
    const postFields = await getPostFields(admin);
    const post = await admin.collection('posts').getOne(params.id);
    const authorId = post.get?.('author') ?? post.author;

    if (authorId !== user.id) {
      return json({ error: 'not_author' }, { status: 403 });
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

    const form = await request.formData();
    const title = String(form.get('title') ?? '').trim();
    const body = String(form.get('body') ?? '').trim();
    const tagsRaw = String(form.get('tags') ?? '[]');
    const coverFile = form.get('cover');

    const existingTitle = String(post.get?.('title') ?? post.title ?? '').trim();
    const existingBody = String(post.get?.('body') ?? post.body ?? '').trim();
    const existingTagsRaw = post.get?.('tags') ?? post.tags ?? [];

    if (!title || !body) {
      return json({ error: 'title_or_body_missing' }, { status: 400 });
    }

    let tags: string[] = [];
    try {
      const parsed = JSON.parse(tagsRaw);
      if (Array.isArray(parsed)) {
        tags = parsed.map(String).map((tag) => tag.trim()).filter(Boolean).slice(0, 10);
      }
    } catch (err) {
      // Ignore invalid tags
    }

    const normalizeTags = (input: unknown) =>
      Array.isArray(input)
        ? input.map(String).map((tag) => tag.trim()).filter(Boolean).slice(0, 10)
        : [];
    const existingTags = normalizeTags(existingTagsRaw);
    const tagsChanged = existingTags.join('|') !== tags.join('|');

    if (getTitleUnits(title) > POST_TITLE_MAX_UNITS) {
      return json({ error: 'title_too_long' }, { status: 400 });
    }

    if (getGraphemeCount(body) > POST_BODY_MAX) {
      return json({ error: 'body_too_long' }, { status: 400 });
    }

    if (coverFile instanceof File && coverFile.size > POST_COVER_MAX_BYTES) {
      return json({ error: 'cover_too_large' }, { status: 400 });
    }

    const coverChanged = coverFile instanceof File && coverFile.size > 0;
    const contentChanged = title !== existingTitle || body !== existingBody || coverChanged;
    const images: string[] = [];
    if (coverChanged) {
      images.push(await fileToDataUrl(coverFile as File));
    }

    const payload = new FormData();
    payload.set('title', title);
    payload.set('body', body);
    if (tagsChanged) {
      payload.set('tags', JSON.stringify(tags));
    }
    if (contentChanged) {
      payload.set('moderation_status', 'pending_ai');
      payload.set('review_requested', 'false');
      payload.set('ai_reason', '');
      if (postFields.has('edited_at')) {
        payload.set('edited_at', new Date().toISOString());
      }
    }
    if (coverChanged) {
      payload.set('cover', coverFile as File);
    }

    let record;
    try {
      record = await admin.collection('posts').update(params.id, payload);
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
        coverError?.detail ?? payloadMessage ?? (err instanceof Error ? err.message : 'post_update_failed');
      console.error('post_update_failed', err);
      return json({ error: coverError?.error ?? 'post_update_failed', detail }, { status });
    }

    if (contentChanged) {
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
            const reason = moderation.reason
              ? `原因：${moderation.reason}`
              : '原因：内容可能违反社区规范';
            await createSystemMessage({
              admin: adminPb,
              userId: user.id,
              title: '内容审核未通过',
              body: `你的帖子《${title}》修改后未通过审核，可申请复查。${reason}`,
              targetType: 'post',
              postId: record.id,
            });
          }
        } catch (err) {
          console.error(
            'post_update_moderation_failed',
            { postId: record.id, userId: user.id },
            err,
          );
          const adminPb = await getAdminPb();
          await adminPb.collection('posts').update(record.id, {
            moderation_status: 'pending_review',
            ai_reason: '',
          });
          await createSystemMessage({
            admin: adminPb,
            userId: user.id,
            title: '内容审核暂时失败',
            body: `你的帖子《${title}》修改后暂时无法完成审核，可申请复查。`,
            targetType: 'post',
            postId: record.id,
          });
        }
      })();
    }

    const moderationStatus =
      (record.get?.('moderation_status') ??
        (record as { moderation_status?: string }).moderation_status ??
        'active') as string;

    return json({
      post: mapPostSummary(record, baseUrl),
      moderation: {
        status: contentChanged ? 'pending_ai' : moderationStatus,
      },
    });
  } catch (err) {
    const status =
      err && typeof err === 'object' && 'status' in err
        ? Number((err as { status?: number }).status ?? 500)
        : 500;
    const detail = err instanceof Error ? err.message : 'update_failed';
    console.error('post_update_failed', err);
    return json({ error: 'update_failed', detail }, { status });
  }
};
