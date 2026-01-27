import type { PostSummary } from '$lib/types';
import { pb } from '$lib/api/pb';

const authHeaders = (): Record<string, string> => {
  const token = pb.authStore.token;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const fetchMyPosts = async () => {
  const res = await fetch('/api/me/posts', {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('my_posts_failed');
  const data = (await res.json()) as { items: PostSummary[] };
  return data.items;
};
