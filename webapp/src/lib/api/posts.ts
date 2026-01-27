// Custom error class to carry extra data
import { pb } from '$lib/api/pb';
import type { CommentItem, PostDetail, PostSummary } from '$lib/types';

type ApiErrorData = {
  code?: number;
  reason?: string;
  detail?: string;
  retryAfter?: number;
};

export class ApiError extends Error {
  code?: number;
  reason?: string;
  detail?: string;
  retryAfter?: number;

  constructor(message: string, data?: ApiErrorData) {
    super(message);
    this.code = data?.code;
    this.reason = data?.reason;
    this.detail = data?.detail;
    this.retryAfter = data?.retryAfter;
  }
}

const authHeaders = (): Record<string, string> => {
  const token = pb.authStore.token;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const getString = (value: unknown) => (typeof value === 'string' ? value : undefined);
const getNumber = (value: unknown) => (typeof value === 'number' ? value : undefined);

const handleResponse = async <T>(res: Response): Promise<T> => {
  const text = await res.text();
  let data: Record<string, unknown> | null = null;
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      data = null;
    }
  }

  const error = getString(data?.error);
  const detail = getString(data?.detail);
  const retryAfter = getNumber(data?.retryAfter);

  if (!res.ok) {
    const errorMsg = error ?? detail ?? res.statusText ?? 'request_failed';
    throw new ApiError(errorMsg, {
      code: res.status,
      reason: error,
      detail,
      retryAfter,
    });
  }

  return (data ?? {}) as T;
};

export const listPosts = async (search?: string) => {
  const params = new URLSearchParams();
  if (search) {
    params.set('search', search);
  }
  const res = await fetch(`/api/posts?${params.toString()}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to load posts');
  const data = (await res.json()) as { items: PostSummary[] };
  return data.items;
};

export const getPost = async (postId: string) => {
  const res = await fetch(`/api/posts/${postId}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to load post');
  const data = (await res.json()) as { post: PostDetail };
  return data.post;
};

export const createPost = async (payload: FormData) => {
  const res = await fetch('/api/posts', {
    method: 'POST',
    headers: authHeaders(),
    body: payload,
  });
  return handleResponse<{ post: PostSummary; moderation: { status: string } }>(res);
};

export const updatePost = async (postId: string, payload: FormData) => {
  const res = await fetch(`/api/posts/${postId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: payload,
  });
  return handleResponse<{ post: PostSummary; moderation: { status: string } }>(res);
};

export const createComment = async (postId: string, body: string) => {
  const res = await fetch(`/api/posts/${postId}/comments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify({ body }),
  });
  return handleResponse<{ comment: CommentItem; moderation: { status: string } }>(res);
};

export const toggleLike = async (postId: string) => {
  const res = await fetch(`/api/posts/${postId}/like`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return handleResponse<{ liked: boolean; likeCount: number }>(res);
};

export const deletePost = async (postId: string) => {
  const res = await fetch(`/api/posts/${postId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return handleResponse<{ ok: boolean }>(res);
};

export const reportTarget = async (payload: {
  targetType: 'post' | 'comment';
  postId?: string;
  commentId?: string;
  reasonCategory: string;
  reasonDetail?: string;
}) => {
  const res = await fetch('/api/reports', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify(payload),
  });
  return handleResponse<{ reportCount: number; hidden: boolean }>(res);
};

export const requestReview = async (payload: {
  targetType: 'post' | 'comment';
  targetId: string;
  messageId?: string;
}) => {
  const res = await fetch('/api/review-request', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify(payload),
  });
  return handleResponse<{ ok: boolean }>(res);
};
