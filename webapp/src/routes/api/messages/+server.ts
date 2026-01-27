import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';
import { getAdminPb } from '$lib/server/pbAdmin';
import { getUserFromRequest } from '$lib/server/auth';
import { mapSystemMessage } from '$lib/server/mappers';

const baseUrl = env.PUBLIC_PB_URL || 'http://localhost:8090';

export const GET = async ({ request }) => {
  const { user } = await getUserFromRequest(request);
  const admin = await getAdminPb();

  const records = await admin.collection('system_messages').getFullList({
    filter: `user = "${user.id}" && status != "hidden"`,
    sort: '-created',
    expand: 'actor,post,comment',
  });

  return json({
    items: records.map((record) => mapSystemMessage(record, baseUrl)),
  });
};

export const POST = async ({ request }) => {
  try {
    const { user } = await getUserFromRequest(request);
    const admin = await getAdminPb();
    const payload = await request.json();

    const messageId = String(payload?.messageId ?? '');
    const status = String(payload?.status ?? 'read');

    if (!messageId) {
      return json({ error: 'message_id_missing' }, { status: 400 });
    }

    const record = await admin.collection('system_messages').getOne(messageId);
    const recordUser = record.get?.('user') ?? record.user;
    if (recordUser !== user.id) {
      return json({ error: 'not_owner' }, { status: 403 });
    }

    await admin.collection('system_messages').update(messageId, {
      status,
    });

    return json({ ok: true });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'message_update_failed';
    console.error('message_update_failed', err);
    return json({ error: 'message_update_failed', detail }, { status: 500 });
  }
};
