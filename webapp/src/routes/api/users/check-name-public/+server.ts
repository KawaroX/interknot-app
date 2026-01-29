import { json } from '@sveltejs/kit';
import { ClientResponseError } from 'pocketbase';
import { getAdminPb } from '$lib/server/pbAdmin';

const escapeFilterValue = (value: string) => value.replaceAll('"', '\\"');

export const GET = async ({ request }) => {
  try {
    const { searchParams } = new URL(request.url);
    const rawName = searchParams.get('name') ?? '';
    const name = rawName.trim();

    if (!name) {
      return json({ error: 'name_missing' }, { status: 400 });
    }

    const admin = await getAdminPb();
    const filter = `name = "${escapeFilterValue(name)}"`;

    try {
      await admin.collection('users').getFirstListItem(filter);
      // Name exists
      return json({ available: false });
    } catch (err) {
      if (err instanceof ClientResponseError && err.status === 404) {
        return json({ available: true });
      }
      throw err;
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'check_name_failed';
    console.error('check_name_public_failed', err);
    return json({ error: 'check_name_failed', detail }, { status: 500 });
  }
};
