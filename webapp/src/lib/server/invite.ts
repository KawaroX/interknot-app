import type { RecordModel } from 'pocketbase';
import type PocketBase from 'pocketbase';

export const verifyInvite = async (admin: PocketBase, user: RecordModel) => {
  const code = (user.get?.('invite_code') ?? user.invite_code ?? '') as string;
  if (!code) {
    return { ok: false, reason: 'invite_required' };
  }

  try {
    const invite = await admin
      .collection('invites')
      .getFirstListItem(`code = "${code}" && enabled = true`);

    const usedBy = invite.get?.('used_by') ?? invite.used_by;
    if (usedBy && usedBy !== user.id) {
      return { ok: false, reason: 'invite_in_use' };
    }

    if (!usedBy) {
      await admin.collection('invites').update(invite.id, {
        used_by: user.id,
        used_at: new Date().toISOString(),
      });
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, reason: 'invite_invalid' };
  }
};
