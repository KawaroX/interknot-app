import { json } from '@sveltejs/kit';
import { getAdminPb } from '$lib/server/pbAdmin';
import { getUserFromRequest } from '$lib/server/auth';
import { createSystemMessage } from '$lib/server/systemMessages';

export const POST = async ({ params, request }) => {
  try {
    const { user } = await getUserFromRequest(request);
    const admin = await getAdminPb();

    const key = `${user.id}_${params.id}`;
    let liked = false;
    let postAuthorId: string | null = null;

    try {
      const post = await admin.collection('posts').getOne(params.id);
      postAuthorId = (post.get?.('author') ?? post.author ?? null) as string | null;
    } catch (err) {
      console.error('like_post_fetch_failed', err);
    }

    try {
      const existing = await admin
        .collection('likes')
        .getFirstListItem(`like_key = "${key}"`);
      await admin.collection('likes').delete(existing.id);
      liked = false;
    } catch (err) {
      const status =
        err && typeof err === 'object' && 'status' in err
          ? Number((err as { status?: number }).status ?? 500)
          : 500;
      if (status !== 404) {
        throw err;
      }
      await admin.collection('likes').create({
        like_key: key,
        user: user.id,
        post: params.id,
      });
      liked = true;
    }

    let likeCount = 0;
    try {
      const list = await admin.collection('likes').getList(1, 1, {
        filter: `post = "${params.id}"`,
      });
      likeCount = list.totalItems;
      await admin.collection('posts').update(params.id, {
        like_count: likeCount,
      });
    } catch (err) {
      console.error('like_count_update_failed', err);
    }

    if (liked && postAuthorId && postAuthorId !== user.id) {
      try {
        await createSystemMessage({
          admin,
          userId: postAuthorId,
          title: '收到点赞',
          body: '',
          messageType: 'like',
          actorId: user.id,
          targetType: 'post',
          postId: params.id,
        });
      } catch (err) {
        console.error('like_message_create_failed', err);
      }
    }

    return json({ liked, likeCount });
  } catch (err) {
    const status =
      err && typeof err === 'object' && 'status' in err
        ? Number((err as { status?: number }).status ?? 500)
        : 500;
    const detail = err instanceof Error ? err.message : 'like_failed';
    console.error('like_failed', err);
    return json({ error: 'like_failed', detail }, { status });
  }
};
