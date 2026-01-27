import { writable } from 'svelte/store';
import type { PostSummary } from '$lib/types';
import { fetchMyPosts } from '$lib/api/me';

export const myPosts = writable<PostSummary[]>([]);
export const myPostsLoading = writable(false);

export const loadMyPosts = async () => {
  myPostsLoading.set(true);
  try {
    const items = await fetchMyPosts();
    myPosts.set(items);
  } finally {
    myPostsLoading.set(false);
  }
};
