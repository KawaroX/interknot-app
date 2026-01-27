import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';
import { getAdminPb } from '$lib/server/pbAdmin';
import { getUserFromRequest } from '$lib/server/auth';
import { REPORT_DETAIL_MAX, getGraphemeCount } from '$lib/validation';

const threshold = Number(env.PUBLIC_REPORT_THRESHOLD ?? '5');

export const POST = async ({ request }) => {
  try {
    const { user } = await getUserFromRequest(request);
    const admin = await getAdminPb();
    const payload = await request.json();

    const targetType = String(payload?.targetType ?? '');
    const postId = String(payload?.postId ?? '');
    const commentId = String(payload?.commentId ?? '');
    const reasonCategory = String(payload?.reasonCategory ?? payload?.reason ?? '').trim();
    const reasonDetail = String(payload?.reasonDetail ?? '').trim();
    const reason = reasonCategory || reasonDetail;

    if (targetType !== 'post' && targetType !== 'comment') {
      return json({ error: 'invalid_target' }, { status: 400 });
    }
    if (targetType === 'post' && !postId) {
      return json({ error: 'post_missing' }, { status: 400 });
    }
    if (targetType === 'comment' && !commentId) {
      return json({ error: 'comment_missing' }, { status: 400 });
    }

    if (!reasonCategory) {
      return json({ error: 'reason_missing' }, { status: 400 });
    }

    if (reasonDetail && getGraphemeCount(reasonDetail) > REPORT_DETAIL_MAX) {
      return json({ error: 'reason_detail_too_long' }, { status: 400 });
    }

    await admin.collection('reports').create({
      target_type: targetType,
      post: targetType === 'post' ? postId : null,
      comment: targetType === 'comment' ? commentId : null,
      reporter: user.id,
      reason,
      reason_detail: reasonDetail,
      status: 'pending',
    });

    const reportFilter =
      targetType === 'post'
        ? `target_type = "post" && post = "${postId}" && status = "pending"`
        : `target_type = "comment" && comment = "${commentId}" && status = "pending"`;

    let reportCount = 0;
    try {
      const list = await admin.collection('reports').getList(1, 1, {
        filter: reportFilter,
      });
      reportCount = list.totalItems;
    } catch (err) {
      console.error('report_count_fetch_failed', err);
    }

    const updates: Record<string, unknown> = { report_count: reportCount };

    if (targetType === 'post') {
      let hidden = false;
      try {
        const post = await admin.collection('posts').getOne(postId);
        const status = post.get?.('moderation_status') ?? post.moderation_status ?? 'active';
        if (reportCount >= threshold && status !== 'pending_review' && status !== 'hidden') {
          updates.moderation_status = 'hidden';
          hidden = true;
        }
        await admin.collection('posts').update(postId, updates);
      } catch (err) {
        console.error('post_report_update_failed', err);
      }
      return json({ reportCount, hidden });
    }

    let hidden = false;
    try {
      const comment = await admin.collection('comments').getOne(commentId);
      const status = comment.get?.('moderation_status') ?? comment.moderation_status ?? 'active';
      if (reportCount >= threshold && status !== 'pending_review' && status !== 'hidden') {
        updates.moderation_status = 'hidden';
        hidden = true;
      }
      await admin.collection('comments').update(commentId, updates);
    } catch (err) {
      console.error('comment_report_update_failed', err);
    }
    return json({ reportCount, hidden });
  } catch (err) {
    const status =
      err && typeof err === 'object' && 'status' in err
        ? Number((err as { status?: number }).status ?? 500)
        : 500;
    const detail = err instanceof Error ? err.message : 'report_failed';
    console.error('report_failed', err);
    return json({ error: 'report_failed', detail }, { status });
  }
};
