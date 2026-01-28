import { json } from '@sveltejs/kit';
import { ClientResponseError } from 'pocketbase';
import { getAdminPb } from '$lib/server/pbAdmin';
import { getUserFromRequest } from '$lib/server/auth';

const escapeFilterValue = (value: string) => value.replaceAll('"', '\\"');

export const GET = async ({ request }) => {
  try {
    const { user } = await getUserFromRequest(request);
    const { searchParams } = new URL(request.url);
    const rawName = searchParams.get('name') ?? '';
    const name = rawName.trim();

    if (!name) {
      return json({ error: 'name_missing' }, { status: 400 });
    }

    const admin = await getAdminPb();
    const filter = `name = "${escapeFilterValue(name)}"`;

    try {
      const record = await admin.collection('users').getFirstListItem(filter);
      const available = record.id === user.id;
      return json({ available });
    } catch (err) {
      if (err instanceof ClientResponseError && err.status === 404) {
        return json({ available: true });
      }
      throw err;
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'check_name_failed';
    console.error('check_name_failed', err);
    return json({ error: 'check_name_failed', detail }, { status: 500 });
  }
};
