import { writable } from 'svelte/store';
import type { FollowedUser } from '$lib/types';
import { listFollows } from '$lib/api/follows';
import { pb } from '$lib/api/pb';

export const following = writable<FollowedUser[]>([]);
export const followingLoading = writable(false);

export const loadFollowing = async () => {
  if (!pb.authStore.isValid) {
    following.set([]);
    return;
  }
  followingLoading.set(true);
  try {
    const items = await listFollows();
    following.set(items);
  } finally {
    followingLoading.set(false);
  }
};

export const addFollowing = (user: FollowedUser) => {
  following.update((items) => {
    if (items.some((item) => item.id === user.id)) {
      return items;
    }
    return [user, ...items];
  });
};

export const removeFollowing = (userId: string) => {
  following.update((items) => items.filter((item) => item.id !== userId));
};
