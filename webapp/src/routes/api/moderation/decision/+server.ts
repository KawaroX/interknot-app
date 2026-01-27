import { json } from '@sveltejs/kit';
import type { RecordModel } from 'pocketbase';
import type PocketBase from 'pocketbase';
import { getAdminPb } from '$lib/server/pbAdmin';
import { getUserFromRequest } from '$lib/server/auth';
import { createSystemMessage } from '$lib/server/systemMessages';
import { applyRejectPenalty } from '$lib/server/moderationActions';

const isModerator = (user: RecordModel) => {
  const role = (user.get?.('role') ?? user.role ?? 'user') as string;
  return role === 'moderator' || role === 'admin';
};

const decisionStatusMap = {
  approve: 'active',
  reject: 'rejected',
  hide: 'hidden',
} as const;

const previewText = (text: string, limit = 60) => {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}...`;
};

const buildReasonNote = (reason: string) => {
  return reason ? `原因：${reason}` : '';
};

const fetchPendingReports = async (payload: {
  admin: PocketBase;
  targetType: 'post' | 'comment';
  targetId: string;
}) => {
  const { admin, targetType, targetId } = payload;
  const targetField = targetType === 'post' ? 'post' : 'comment';
  try {
    const records = await admin.collection('reports').getFullList({
      filter: `target_type = "${targetType}" && ${targetField} = "${targetId}" && status = "pending"`,
    });
    return records;
  } catch (err) {
    console.error('report_review_lookup_failed', err);
    return [];
  }
};

const markReportsReviewed = async (payload: {
  admin: PocketBase;
  reportIds: string[];
}) => {
  const { admin, reportIds } = payload;
  if (reportIds.length === 0) return;
  await Promise.all(
    reportIds.map((id) =>
      admin.collection('reports').update(id, {
        status: 'reviewed',
      }),
    ),
  );
};

export const POST = async ({ request }) => {
  const { user } = await getUserFromRequest(request);
  if (!isModerator(user)) {
    return json({ error: 'forbidden' }, { status: 403 });
  }

  const payload = await request.json();
  const targetType = String(payload?.targetType ?? '');
  const targetId = String(payload?.targetId ?? '');
  const decision = String(payload?.decision ?? '');
  const reason = String(payload?.reason ?? '').trim();

  if (!targetId || (targetType !== 'post' && targetType !== 'comment')) {
    return json({ error: 'invalid_target' }, { status: 400 });
  }

  if (!(decision in decisionStatusMap)) {
    return json({ error: 'invalid_decision' }, { status: 400 });
  }

  const admin = await getAdminPb();
  const pendingReports = await fetchPendingReports({
    admin,
    targetType: targetType as 'post' | 'comment',
    targetId,
  });
  const pendingReportIds = pendingReports.map((report) => report.id);
  const collection = targetType === 'post' ? 'posts' : 'comments';
  const record = await admin.collection(collection).getOne(targetId, {
    expand: targetType === 'post' ? 'author' : 'author,post',
  });
  const previousStatus = record.get?.('moderation_status') ?? record.moderation_status ?? 'active';
  const nextReportCount =
    pendingReportIds.length > 0
      ? 0
      : Number(record.get?.('report_count') ?? record.report_count ?? 0);

  await admin.collection(collection).update(targetId, {
    moderation_status: decisionStatusMap[decision as keyof typeof decisionStatusMap],
    review_requested: false,
    report_count: nextReportCount,
  });

  if (pendingReportIds.length > 0) {
    try {
      await markReportsReviewed({ admin, reportIds: pendingReportIds });
    } catch (err) {
      console.error('report_review_update_failed', err);
    }
  }

  if (
    targetType === 'comment' &&
    decision === 'approve' &&
    previousStatus !== 'active' &&
    previousStatus !== 'hidden'
  ) {
    const postId = (record.get?.('post') ?? record.post) as string | undefined;
    if (postId) {
      try {
        const post = await admin.collection('posts').getOne(postId);
        const currentCount =
          (post.get?.('comment_count') ?? post.comment_count ?? 0) as number;
        await admin.collection('posts').update(postId, {
          comment_count: currentCount + 1,
        });
      } catch (err) {
        console.error('comment_count_review_update_failed', err);
      }
    }
  }

  if (
    targetType === 'comment' &&
    decision === 'approve' &&
    previousStatus !== 'active' &&
    previousStatus !== 'hidden'
  ) {
    const postId = (record.get?.('post') ?? record.post) as string | undefined;
    const commentAuthorId = (record.get?.('author') ?? record.author) as string | undefined;
    if (postId) {
      try {
        const post = await admin.collection('posts').getOne(postId);
        const postAuthorId = (post.get?.('author') ?? post.author) as string | undefined;
        if (postAuthorId && postAuthorId !== commentAuthorId) {
          await createSystemMessage({
            admin,
            userId: postAuthorId,
            title: '收到评论',
            body: (record.get?.('body') ?? record.body ?? '') as string,
            messageType: 'comment',
            actorId: commentAuthorId,
            targetType: 'comment',
            commentId: record.id,
            postId,
          });
        }
      } catch (err) {
        console.error('comment_review_message_failed', err);
      }
    }
  }

  const authorId = (record.get?.('author') ?? record.author) as string | undefined;
  if (authorId) {
    const aiReason = String(record.get?.('ai_reason') ?? record.ai_reason ?? '').trim();
    const rejectedByAi = previousStatus === 'pending_review' && aiReason;
    if (decision === 'reject' && previousStatus !== 'rejected' && !rejectedByAi) {
      await applyRejectPenalty({ admin, userId: authorId, delta: 1 });
    }
    if (decision === 'approve' && (previousStatus === 'rejected' || rejectedByAi)) {
      await applyRejectPenalty({ admin, userId: authorId, delta: -1 });
    }
    const baseReason = buildReasonNote(reason);
    if (targetType === 'post') {
      const title = record.get?.('title') ?? record.title ?? '';
      if (decision === 'approve') {
        await createSystemMessage({
          admin,
          userId: authorId,
          title: '内容已通过复查',
          body: `你的帖子《${title}》已通过人工审核。`,
          targetType: 'post',
          postId: record.id,
        });
      } else if (decision === 'reject') {
        await createSystemMessage({
          admin,
          userId: authorId,
          title: '内容复查未通过',
          body: `你的帖子《${title}》复查未通过。${baseReason}`,
          targetType: 'post',
          postId: record.id,
        });
      } else {
        const note = baseReason;
        await createSystemMessage({
          admin,
          userId: authorId,
          title: '内容已被隐藏',
          body: `你的帖子《${title}》已被隐藏。${note}`,
          targetType: 'post',
          postId: record.id,
        });
      }
    } else {
      const bodyText = record.get?.('body') ?? record.body ?? '';
      const preview = previewText(bodyText);
      const label = preview ? `你的评论「${preview}」` : '你的评论';
      const postId = (record.get?.('post') ?? record.post) as string | undefined;
      if (decision === 'approve') {
        await createSystemMessage({
          admin,
          userId: authorId,
          title: '评论已通过复查',
          body: `${label}已通过人工审核。`,
          targetType: 'comment',
          commentId: record.id,
          postId,
        });
      } else if (decision === 'reject') {
        await createSystemMessage({
          admin,
          userId: authorId,
          title: '评论复查未通过',
          body: `${label}复查未通过。${baseReason}`,
          targetType: 'comment',
          commentId: record.id,
          postId,
        });
      } else {
        const note = baseReason;
        await createSystemMessage({
          admin,
          userId: authorId,
          title: '评论已被隐藏',
          body: `${label}已被隐藏。${note}`,
          targetType: 'comment',
          commentId: record.id,
          postId,
        });
      }
    }
  }

  return json({ ok: true });
};
