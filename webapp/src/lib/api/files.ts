import { env } from '$env/dynamic/public';

export const buildFileUrl = (record: { id: string; collectionId: string }, filename?: string | null) => {
  if (!filename) return null;
  const baseUrl = env.PUBLIC_PB_URL || 'http://localhost:8090';
  return `${baseUrl}/api/files/${record.collectionId}/${record.id}/${filename}`;
};
