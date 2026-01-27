import type PocketBase from 'pocketbase';

export const checkCommentLimits = async (admin: PocketBase, userId: string) => {
  const now = new Date();
  const cooldownMs = 10 * 1000;
  const tenSecondsAgo = new Date(now.getTime() - cooldownMs);

  const lastComments = await admin.collection('comments').getList(1, 1, {
    filter: `author = "${userId}"`,
    sort: '-created',
  });

  if (lastComments.items.length > 0) {
    const lastCreated = new Date(lastComments.items[0].created);
    if (lastCreated > tenSecondsAgo) {
      const remainingMs = lastCreated.getTime() + cooldownMs - now.getTime();
      return {
        allowed: false,
        reason: 'comment_cooldown',
        message: '评论太快了，请休息一下',
        retryAfter: Math.max(1, Math.ceil(remainingMs / 1000)),
      };
    }
  }

  return { allowed: true };
};

export const checkPostLimits = async (admin: PocketBase, userId: string) => {
  const now = new Date();
  const cooldownMs = 60 * 1000;
  const oneMinuteAgo = new Date(now.getTime() - cooldownMs);
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const toPBDate = (date: Date) => date.toISOString().replace('T', ' ');

  const lastPosts = await admin.collection('posts').getList(1, 1, {
    filter: `author = "${userId}"`,
    sort: '-created',
  });

  if (lastPosts.items.length > 0) {
    const lastCreated = new Date(lastPosts.items[0].created);
    if (lastCreated > oneMinuteAgo) {
      const remainingMs = lastCreated.getTime() + cooldownMs - now.getTime();
      return {
        allowed: false,
        reason: 'post_cooldown',
        message: '发帖太快了，请休息一下',
        retryAfter: Math.max(1, Math.ceil(remainingMs / 1000)),
      };
    }
  }

  const hourlyPosts = await admin.collection('posts').getList(1, 10, {
    filter: `author = "${userId}" && created >= "${toPBDate(oneHourAgo)}"`,
    sort: '-created',
  });

  if (hourlyPosts.items.length >= 10) {
    const oldest = hourlyPosts.items[hourlyPosts.items.length - 1];
    const retryAt = new Date(oldest.created).getTime() + 60 * 60 * 1000;
    const retryAfter = Math.max(1, Math.ceil((retryAt - now.getTime()) / 1000));
    return {
      allowed: false,
      reason: 'post_hourly_limit',
      message: '每小时最多发布 10 篇帖子',
      retryAfter,
    };
  }

  const dailyPosts = await admin.collection('posts').getList(1, 100, {
    filter: `author = "${userId}" && created >= "${toPBDate(oneDayAgo)}"`,
    sort: '-created',
  });

  if (dailyPosts.items.length >= 100) {
    const oldest = dailyPosts.items[dailyPosts.items.length - 1];
    const retryAt = new Date(oldest.created).getTime() + 24 * 60 * 60 * 1000;
    const retryAfter = Math.max(1, Math.ceil((retryAt - now.getTime()) / 1000));
    return {
      allowed: false,
      reason: 'post_daily_limit',
      message: '每天最多发布 100 篇帖子',
      retryAfter,
    };
  }

  return { allowed: true };
};
