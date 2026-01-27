import type PocketBase from 'pocketbase';

type RejectPenaltyResult = {
  rejectCount: number;
  canPost: boolean;
};

export const applyRejectPenalty = async (payload: {
  admin: PocketBase;
  userId: string;
  delta: number;
}): Promise<RejectPenaltyResult | null> => {
  const { admin, userId, delta } = payload;
  if (!userId || !Number.isFinite(delta) || delta === 0) {
    return null;
  }

  try {
    const user = await admin.collection('users').getOne(userId);
    const current = Number(user.get?.('reject_count') ?? user.reject_count ?? 0);
    const next = Math.max(0, current + delta);
    const canPost = next < 3;

    await admin.collection('users').update(userId, {
      reject_count: next,
      can_post: canPost,
    });

    return { rejectCount: next, canPost };
  } catch (err) {
    console.error('reject_penalty_update_failed', err);
    return null;
  }
};
