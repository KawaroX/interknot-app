import PocketBase from 'pocketbase';
import { env } from '$env/dynamic/public';

const baseUrl = env.PUBLIC_PB_URL || 'http://localhost:8090';
export const pb = new PocketBase(baseUrl);
pb.autoCancellation(false);
