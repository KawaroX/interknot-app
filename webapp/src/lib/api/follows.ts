import type { FollowedUser } from '$lib/types';
import { pb } from '$lib/api/pb';

const authHeaders = (): Record<string, string> => {
  const token = pb.authStore.token;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const listFollows = async () => {
  const res = await fetch('/api/follows', {
    headers: authHeaders(),
  });
  const data = (await res.json()) as { items?: FollowedUser[]; error?: string };
  if (!res.ok) {
    throw new Error(data?.error ?? 'follow_list_failed');
  }
  return data.items ?? [];
};

export const setFollow = async (targetUserId: string, follow: boolean) => {
  const res = await fetch('/api/follows', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify({
      targetUserId,
      action: follow ? 'follow' : 'unfollow',
    }),
  });

  const data = (await res.json()) as { following?: boolean; error?: string };
  if (!res.ok) {
    throw new Error(data?.error ?? 'follow_failed');
  }
  return data as { following: boolean };
};
