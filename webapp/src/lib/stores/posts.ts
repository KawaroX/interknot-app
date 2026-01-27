import { writable } from 'svelte/store';
import type { PostSummary } from '$lib/types';
import { listPosts } from '$lib/api/posts';

export const posts = writable<PostSummary[]>([]);
export const postsLoading = writable(false);
export const searchQuery = writable('');

export const updatePostLike = (postId: string, liked: boolean, likeCount: number) => {
  posts.update((items) =>
    items.map((item) =>
      item.id === postId ? { ...item, likedByViewer: liked, likeCount } : item,
    ),
  );
};

export const updateAuthorFollow = (authorId: string, followed: boolean) => {
  posts.update((items) =>
    items.map((item) =>
      item.author.id === authorId
        ? { ...item, authorFollowedByViewer: followed }
        : item,
    ),
  );
};

export const markPostRead = (postId: string) => {
  posts.update((items) =>
    items.map((item) =>
      item.id === postId ? { ...item, readByViewer: true } : item,
    ),
  );
};

type LoadPostsOptions = {
  silent?: boolean;
};

export const loadPosts = async (search?: string, options: LoadPostsOptions = {}) => {
  if (!options.silent) {
    postsLoading.set(true);
  }
  if (typeof search !== 'undefined') {
    searchQuery.set(search);
  }
  const currentSearch = typeof search !== 'undefined' ? search : '';

  try {
    const items = await listPosts(currentSearch);
    posts.set(items);
  } finally {
    if (!options.silent) {
      postsLoading.set(false);
    }
  }
};
