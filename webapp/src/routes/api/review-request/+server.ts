import { json } from '@sveltejs/kit';
import { getAdminPb } from '$lib/server/pbAdmin';
import { getUserFromRequest } from '$lib/server/auth';

export const POST = async ({ request }) => {
  const { user } = await getUserFromRequest(request);
  const admin = await getAdminPb();
  const payload = await request.json();

  const targetType = String(payload?.targetType ?? '');
  const targetId = String(payload?.targetId ?? '');
  const messageId = String(payload?.messageId ?? '');

  if (!targetId || (targetType !== 'post' && targetType !== 'comment')) {
    return json({ error: 'invalid_target' }, { status: 400 });
  }

  const collection = targetType === 'post' ? 'posts' : 'comments';
  const record = await admin.collection(collection).getOne(targetId);

  const recordAuthor = record.get?.('author') ?? record.author;
  if (recordAuthor !== user.id) {
    return json({ error: 'not_owner' }, { status: 403 });
  }

  const extractReason = (body: string) => {
    const marker = '原因：';
    const asciiMarker = '原因:';
    const index = body.lastIndexOf(marker);
    const fallbackIndex = index === -1 ? body.lastIndexOf(asciiMarker) : index;
    if (fallbackIndex === -1) return '';
    const offset = fallbackIndex + (body[fallbackIndex] === '原' ? marker.length : asciiMarker.length);
    return body.slice(offset).trim();
  };

  const currentReason = String(record.get?.('ai_reason') ?? record.ai_reason ?? '').trim();
  let aiReason = '';
  let messageUserId: string | null = null;

  if (messageId) {
    try {
      const message = await admin.collection('system_messages').getOne(messageId);
      messageUserId = (message.get?.('user') ?? message.user ?? null) as string | null;
      if (messageUserId === user.id) {
        const body = String(message.get?.('body') ?? message.body ?? '');
        aiReason = extractReason(body);
        await admin.collection('system_messages').update(messageId, {
          status: 'actioned',
        });
      }
    } catch {
      // ignore missing message
    }
  }

  await admin.collection(collection).update(targetId, {
    review_requested: true,
    moderation_status: 'pending_review',
    ...(currentReason ? {} : aiReason ? { ai_reason: aiReason } : {}),
  });

  return json({ ok: true });
};
