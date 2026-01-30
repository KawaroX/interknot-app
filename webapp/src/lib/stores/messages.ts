import { writable } from 'svelte/store';
import type { SystemMessage } from '$lib/types';
import { fetchMessages } from '$lib/api/messages';
import { pb } from '$lib/api/pb';

export const messages = writable<SystemMessage[]>([]);
export const messagesLoading = writable(false);

export const loadMessages = async () => {
  if (!pb.authStore.isValid) {
    messages.set([]);
    return;
  }
  messagesLoading.set(true);
  try {
    const items = await fetchMessages();
    messages.set(items);
  } finally {
    messagesLoading.set(false);
  }
};
