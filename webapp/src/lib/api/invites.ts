import type { InviteItem } from '$lib/types';
import { pb } from '$lib/api/pb';

const authHeaders = (): Record<string, string> => {
  const token = pb.authStore.token;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const fetchInvites = async (params: {
  status?: 'all' | 'unused' | 'used' | 'disabled';
  limit?: number;
}) => {
  const search = new URLSearchParams();
  if (params.status) search.set('status', params.status);
  if (params.limit) search.set('limit', String(params.limit));

  const res = await fetch(`/api/invites?${search.toString()}`, {
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error ?? 'invite_list_failed');
  }
  return data as { items: InviteItem[] };
};

export const generateInvites = async (payload: {
  count: number;
  length: number;
}) => {
  const res = await fetch('/api/invites', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error ?? 'invite_generate_failed');
  }
  return data as { codes: string[] };
};

export const setInviteEnabled = async (payload: { id: string; enabled: boolean }) => {
  const res = await fetch('/api/invites', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error ?? 'invite_update_failed');
  }
  return data as { ok: boolean };
};
