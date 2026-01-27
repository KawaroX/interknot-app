import PocketBase from 'pocketbase';
import { env } from '$env/dynamic/public';
import type { RecordModel } from 'pocketbase';
import { error } from '@sveltejs/kit';

const baseUrl = env.PUBLIC_PB_URL || 'http://localhost:8090';

export const getUserFromRequest = async (request: Request) => {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : null;

  if (!token) {
    throw error(401, 'Missing auth token');
  }

  const pb = new PocketBase(baseUrl);
  pb.authStore.save(token, null);

  try {
    await pb.collection('users').authRefresh();
  } catch (err) {
    throw error(401, 'Invalid auth token');
  }

  const user = pb.authStore.model as RecordModel | null;
  if (!user) {
    throw error(401, 'Invalid auth session');
  }

  return { pb, user, token };
};

export const getOptionalUserFromRequest = async (request: Request) => {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  try {
    const { user } = await getUserFromRequest(request);
    return user;
  } catch {
    return null;
  }
};
