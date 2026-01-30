import { writable } from 'svelte/store';
import type { PostSummary } from '$lib/types';
import { fetchMyPosts } from '$lib/api/me';
import { pb } from '$lib/api/pb';

export const myPosts = writable<PostSummary[]>([]);
export const myPostsLoading = writable(false);

export const loadMyPosts = async () => {
  if (!pb.authStore.isValid) {
    myPosts.set([]);
    return;
  }
  myPostsLoading.set(true);
  try {
    const items = await fetchMyPosts();
    myPosts.set(items);
  } finally {
    myPostsLoading.set(false);
  }
};
