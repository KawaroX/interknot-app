import { pb } from '$lib/api/pb';
import type { LegalDocument } from '$lib/types';

const authHeaders = (): Record<string, string> => {
  const token = pb.authStore.token;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const parseError = async (res: Response) => {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error ?? res.statusText;
  } catch {
    return res.statusText;
  }
};

export const fetchLegalDocuments = async () => {
  const res = await fetch('/api/legal');
  if (!res.ok) {
    const message = await parseError(res);
    throw new Error(message || '加载条款失败');
  }
  const data = (await res.json()) as { documents: LegalDocument[] };
  return data.documents;
};

export const updateLegalDocuments = async (documents: LegalDocument[]) => {
  const res = await fetch('/api/legal', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify({ documents }),
  });
  if (!res.ok) {
    const message = await parseError(res);
    throw new Error(message || '保存失败');
  }
  const data = (await res.json()) as { documents: LegalDocument[] };
  return data.documents;
};
