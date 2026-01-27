import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';
import { getAdminPb } from '$lib/server/pbAdmin';
import { getUserFromRequest } from '$lib/server/auth';
import { runModeration } from '$lib/server/moderation';
import { verifyInvite } from '$lib/server/invite';
import { checkCommentLimits } from '$lib/server/userRateLimit';
import { mapComment } from '$lib/server/mappers';
import { createSystemMessage } from '$lib/server/systemMessages';
import { applyRejectPenalty } from '$lib/server/moderationActions';
import { COMMENT_MAX, getGraphemeCount } from '$lib/validation';
import { lookupIpRegion, resolveClientIp } from '$lib/server/ipRegion';

const baseUrl = env.PUBLIC_PB_URL || 'http://localhost:8090';

let cachedCommentFields: Set<string> | null = null;

const getCommentFields = async (admin: Awaited<ReturnType<typeof getAdminPb>>) => {
  if (cachedCommentFields) return cachedCommentFields;
  try {
    const collection = await admin.collections.getOne('comments');
    cachedCommentFields = new Set((collection?.fields ?? []).map((field) => field.name));
  } catch (err) {
    console.error('comment_fields_lookup_failed', err);
    cachedCommentFields = new Set();
  }
  return cachedCommentFields;
};

export const POST = async ({ params, request, getClientAddress }) => {
  try {
    const { user } = await getUserFromRequest(request);
    const admin = await getAdminPb();
    const commentFields = await getCommentFields(admin);
    const payload = await request.json();
    const body = String(payload?.body ?? '').trim();

    if (!body) {
      return json({ error: 'body_missing' }, { status: 400 });
    }

    if (getGraphemeCount(body) > COMMENT_MAX) {
      return json({ error: 'body_too_long' }, { status: 400 });
    }

    const inviteRequired = (env.PUBLIC_INVITE_REQUIRED || '').toLowerCase() === 'true';
    if (inviteRequired) {
      const invite = await verifyInvite(admin, user);
      if (!invite.ok) {
        return json({ error: invite.reason }, { status: 403 });
      }
    }

    const canPost = user.get?.('can_post') ?? user.can_post;
    if (canPost === false) {
      return json({ error: 'can_post_disabled' }, { status: 403 });
    }

    const limits = await checkCommentLimits(admin, user.id);
    if (!limits.allowed) {
      return json({ 
        error: limits.reason, 
        detail: limits.message,
        retryAfter: limits.retryAfter 
      }, { status: 429 });
    }

    const clientIp = resolveClientIp(request, getClientAddress);
    const ipRegion = commentFields.has('ip_region')
      ? await lookupIpRegion(clientIp, request)
      : '';
    const record = await admin.collection('comments').create({
      post: params.id,
      author: user.id,
      body,
      moderation_status: 'pending_ai',
      review_requested: false,
      ...(commentFields.has('ip_address') && clientIp ? { ip_address: clientIp } : {}),
      ...(commentFields.has('ip_region') && ipRegion ? { ip_region: ipRegion } : {}),
    });

    void (async () => {
      try {
        const moderation = await runModeration(body, []);
        const status = moderation.allowed ? 'active' : 'rejected';
        const aiReason = moderation.allowed
          ? ''
          : moderation.reason ?? '内容可能违反社区规范';
        const adminPb = await getAdminPb();
        await adminPb.collection('comments').update(record.id, {
          moderation_status: status,
          ai_reason: aiReason,
        });

        if (!moderation.allowed) {
          await applyRejectPenalty({ admin: adminPb, userId: user.id, delta: 1 });
        }

        if (status === 'active') {
          try {
            const post = await adminPb.collection('posts').getOne(params.id);
            const commentCount =
              ((post as { get?: (key: string) => unknown })
                .get?.('comment_count') ??
                (post as { comment_count?: number }).comment_count ??
                0) + 1;
            await adminPb.collection('posts').update(params.id, {
              comment_count: commentCount,
            });

            const postAuthorId = (post.get?.('author') ?? post.author) as string | undefined;
            if (postAuthorId && postAuthorId !== user.id) {
              try {
                await createSystemMessage({
                  admin: adminPb,
                  userId: postAuthorId,
                  title: '收到评论',
                  body,
                  messageType: 'comment',
                  actorId: user.id,
                  targetType: 'comment',
                  commentId: record.id,
                  postId: params.id,
                });
              } catch (err) {
                console.error('comment_message_create_failed', err);
              }
            }
          } catch (err) {
            console.error('comment_count_update_failed', err);
          }
        } else {
          const reason = moderation.reason ? `原因：${moderation.reason}` : '原因：内容可能违反社区规范';
          await createSystemMessage({
            admin: adminPb,
            userId: user.id,
            title: '评论审核未通过',
            body: `你的评论未通过审核，可申请复查。${reason}`,
            targetType: 'comment',
            commentId: record.id,
            postId: params.id,
          });
        }
      } catch (err) {
        console.error('comment_moderation_failed', err);
        const adminPb = await getAdminPb();
        await adminPb.collection('comments').update(record.id, {
          moderation_status: 'pending_review',
          ai_reason: '',
        });
        await createSystemMessage({
          admin: adminPb,
          userId: user.id,
          title: '评论审核暂时失败',
          body: '你的评论暂时无法完成审核，可申请复查。',
          targetType: 'comment',
          commentId: record.id,
          postId: params.id,
        });
      }
    })();

    return json({
      comment: mapComment(record, baseUrl),
      moderation: { status: 'pending_ai' },
    });
  } catch (err) {
    const status =
      err && typeof err === 'object' && 'status' in err
        ? Number((err as { status?: number }).status ?? 500)
        : 500;
    const detail = err instanceof Error ? err.message : 'comment_failed';
    console.error('comment_failed', err);
    return json({ error: 'comment_failed', detail }, { status });
  }
};
