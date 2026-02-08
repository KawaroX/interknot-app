import { env } from '$env/dynamic/public';

export const buildFileUrl = (record: { id: string; collectionId: string }, filename?: string | null) => {
  if (!filename) return null;
  const baseUrl = env.PUBLIC_PB_URL || 'http://localhost:8090';
  return `${baseUrl}/api/files/${record.collectionId}/${record.id}/${filename}`;
};

export const buildThumbUrl = (url?: string | null, thumb = '720x0') => {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('thumb', thumb);
    return parsed.toString();
  } catch {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}thumb=${encodeURIComponent(thumb)}`;
  }
};
