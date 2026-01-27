import PocketBase from 'pocketbase';
import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

const baseUrl = publicEnv.PUBLIC_PB_URL || 'http://localhost:8090';
const adminEmail = privateEnv.PB_ADMIN_EMAIL;
const adminPassword = privateEnv.PB_ADMIN_PASSWORD;

const adminPb = new PocketBase(baseUrl);
adminPb.autoCancellation(false);

export const getAdminPb = async () => {
  if (!adminEmail || !adminPassword) {
    throw new Error('Missing PocketBase admin credentials');
  }
  if (!adminPb.authStore.isValid) {
    await adminPb.admins.authWithPassword(adminEmail, adminPassword);
  }
  return adminPb;
};
