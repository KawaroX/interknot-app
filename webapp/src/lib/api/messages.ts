import type { SystemMessage } from '$lib/types';
import { pb } from '$lib/api/pb';

const authHeaders = (): Record<string, string> => {
  const token = pb.authStore.token;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const fetchMessages = async () => {
  const res = await fetch('/api/messages', {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('messages_failed');
  const data = (await res.json()) as { items: SystemMessage[] };
  return data.items;
};

export const updateMessageStatus = async (messageId: string, status: string) => {
  const res = await fetch('/api/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify({ messageId, status }),
  });
  if (!res.ok) throw new Error('message_update_failed');
};
