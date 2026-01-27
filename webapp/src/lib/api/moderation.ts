import type { ModerationQueueItem } from '$lib/types';
import { pb } from '$lib/api/pb';

const authHeaders = (): Record<string, string> => {
  const token = pb.authStore.token;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const fetchModerationQueue = async (params: {
  type?: 'post' | 'comment' | 'all';
  status?: 'pending_review' | 'hidden' | 'rejected' | 'pending_ai' | 'active' | 'all';
  reviewRequested?: 'true' | 'false' | 'all';
  source?: 'all' | 'review' | 'reported';
  limit?: number;
}) => {
  const search = new URLSearchParams();
  if (params.type) search.set('type', params.type);
  if (params.status) search.set('status', params.status);
  if (params.reviewRequested) search.set('reviewRequested', params.reviewRequested);
  if (params.source) search.set('source', params.source);
  if (params.limit) search.set('limit', String(params.limit));

  const res = await fetch(`/api/moderation/queue?${search.toString()}`, {
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error ?? 'moderation_queue_failed');
  }
  return data as { items: ModerationQueueItem[] };
};

export const submitModerationDecision = async (payload: {
  targetType: 'post' | 'comment';
  targetId: string;
  decision: 'approve' | 'reject' | 'hide';
  reason?: string;
}) => {
  const res = await fetch('/api/moderation/decision', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error ?? 'moderation_decision_failed');
  }
  return data as { ok: boolean };
};
