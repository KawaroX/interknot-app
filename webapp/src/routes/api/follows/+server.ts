import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';
import type { RecordModel } from 'pocketbase';
import { getAdminPb } from '$lib/server/pbAdmin';
import { getUserFromRequest } from '$lib/server/auth';
import { mapAuthor } from '$lib/server/mappers';

const baseUrl = env.PUBLIC_PB_URL || 'http://localhost:8090';

export const GET = async ({ request }) => {
  const { user } = await getUserFromRequest(request);
  const admin = await getAdminPb();

  const records = await admin.collection('follows').getFullList({
    filter: `follower = "${user.id}"`,
    sort: '-created',
    expand: 'followed',
  });

  const items = records.map((record) => {
    const followed = record.expand?.followed as RecordModel | undefined;
    return {
      ...mapAuthor(followed, baseUrl),
      followedAt: record.created ?? new Date().toISOString(),
    };
  });

  return json({ items });
};

export const POST = async ({ request }) => {
  try {
    const { user } = await getUserFromRequest(request);
    const admin = await getAdminPb();
    const payload = await request.json();

    const targetUserId = String(payload?.targetUserId ?? '').trim();
    const action = String(payload?.action ?? 'follow');

    if (!targetUserId) {
      return json({ error: 'target_missing' }, { status: 400 });
    }
    if (targetUserId === user.id) {
      return json({ error: 'self_follow' }, { status: 400 });
    }

    const key = `${user.id}_${targetUserId}`;

    if (action === 'unfollow') {
      try {
        const existing = await admin
          .collection('follows')
          .getFirstListItem(`follow_key = "${key}"`);
        await admin.collection('follows').delete(existing.id);
      } catch (err) {
        const status =
          err && typeof err === 'object' && 'status' in err
            ? Number((err as { status?: number }).status ?? 500)
            : 500;
        if (status !== 404) {
          throw err;
        }
      }
      return json({ following: false });
    }

    try {
      await admin.collection('follows').create({
        follower: user.id,
        followed: targetUserId,
        follow_key: key,
      });
    } catch (err) {
      const status =
        err && typeof err === 'object' && 'status' in err
          ? Number((err as { status?: number }).status ?? 500)
          : 500;
      if (status !== 400) {
        throw err;
      }
    }

    return json({ following: true });
  } catch (err) {
    const status =
      err && typeof err === 'object' && 'status' in err
        ? Number((err as { status?: number }).status ?? 500)
        : 500;
    const detail = err instanceof Error ? err.message : 'follow_failed';
    console.error('follow_failed', err);
    return json({ error: 'follow_failed', detail }, { status });
  }
};
