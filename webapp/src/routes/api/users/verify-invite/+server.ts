import { json } from '@sveltejs/kit';
import { getAdminPb } from '$lib/server/pbAdmin';
import { getUserFromRequest } from '$lib/server/auth';
import { verifyInvite } from '$lib/server/invite';

export const POST = async ({ request }) => {
  try {
    const { user } = await getUserFromRequest(request);
    const admin = await getAdminPb();

    const result = await verifyInvite(admin, user);

    if (!result.ok) {
      return json({ success: false, reason: result.reason }, { status: 200 });
    }

    return json({ success: true });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'verify_invite_failed';
    console.error('verify_invite_failed', err);
    return json({ error: 'verify_invite_failed', detail }, { status: 500 });
  }
};
