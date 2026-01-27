import crypto from 'node:crypto';
import { json } from '@sveltejs/kit';
import type { RecordModel } from 'pocketbase';
import { env } from '$env/dynamic/public';
import { getAdminPb } from '$lib/server/pbAdmin';
import { getUserFromRequest } from '$lib/server/auth';
import { mapAuthor } from '$lib/server/mappers';
import type { InviteItem } from '$lib/types';

const baseUrl = env.PUBLIC_PB_URL || 'http://localhost:8090';

const isAdmin = (user: RecordModel) => {
  const role = (user.get?.('role') ?? user.role ?? 'user') as string;
  return role === 'admin';
};

const parseLimit = (value: string | null) => {
  const raw = Number(value ?? '200');
  if (!Number.isFinite(raw)) return 200;
  return Math.min(Math.max(Math.trunc(raw), 1), 500);
};

const parseStatus = (value: string | null) => {
  if (value === 'used' || value === 'unused' || value === 'disabled') return value;
  return 'all';
};

const mapInvite = (record: RecordModel): InviteItem => {
  const enabled = Boolean(record.get?.('enabled') ?? record.enabled ?? true);
  const usedAt = (record.get?.('used_at') ?? record.used_at ?? null) as string | null;
  const usedByRecord = record.expand?.used_by as RecordModel | undefined;
  const usedBy = usedByRecord ? mapAuthor(usedByRecord, baseUrl) : undefined;
  return {
    id: record.id,
    code: (record.get?.('code') ?? record.code ?? '') as string,
    enabled,
    usedBy,
    usedAt,
    createdAt: record.created ?? new Date().toISOString(),
  } satisfies InviteItem;
};

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const buildCode = (length: number) => {
  const bytes = crypto.randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += alphabet[bytes[i] % alphabet.length];
  }
  return code;
};

const isDuplicateError = (err: unknown) => {
  if (!err || typeof err !== 'object') return false;
  const status = Number((err as { status?: number }).status ?? 0);
  if (status !== 400) return false;
  const data = (err as { data?: Record<string, unknown> }).data ?? {};
  const payload = data as {
    data?: { code?: { code?: string; message?: string } };
    message?: string;
  };
  const field = payload.data?.code ?? {};
  const errorCode = field.code ?? '';
  const message = field.message ?? payload.message ?? '';
  return errorCode === 'validation_not_unique' || String(message).toLowerCase().includes('unique');
};

const isValidNumber = (value: number, min: number, max: number) =>
  Number.isFinite(value) && Number.isInteger(value) && value >= min && value <= max;

const createInvites = async (payload: {
  admin: Awaited<ReturnType<typeof getAdminPb>>;
  count: number;
  length: number;
}) => {
  const { admin, count, length } = payload;
  const codes: string[] = [];
  const seen = new Set<string>();
  const maxAttempts = count * 30;
  let attempts = 0;

  while (codes.length < count) {
    attempts += 1;
    if (attempts > maxAttempts) {
      throw new Error('invite_generation_exhausted');
    }
    const code = buildCode(length);
    if (seen.has(code)) continue;
    seen.add(code);
    try {
      await admin.collection('invites').create({
        code,
        enabled: true,
      });
      codes.push(code);
    } catch (err) {
      if (isDuplicateError(err)) {
        continue;
      }
      throw err;
    }
  }

  return codes;
};

export const GET = async ({ url, request }) => {
  const { user } = await getUserFromRequest(request);
  if (!isAdmin(user)) {
    return json({ error: 'forbidden' }, { status: 403 });
  }

  const status = parseStatus(url.searchParams.get('status'));
  const limit = parseLimit(url.searchParams.get('limit'));

  const admin = await getAdminPb();
  const filters: string[] = [];
  if (status === 'disabled') {
    filters.push('enabled = false');
  }
  const filter = filters.join(' && ');

  const records = await admin.collection('invites').getList(1, limit, {
    sort: '-created',
    expand: 'used_by',
    filter: filter || undefined,
  });

  let items = records.items.map(mapInvite);
  if (status === 'used') {
    items = items.filter((item) => item.usedBy);
  } else if (status === 'unused') {
    items = items.filter((item) => !item.usedBy);
  }

  return json({ items });
};

export const POST = async ({ request }) => {
  const { user } = await getUserFromRequest(request);
  if (!isAdmin(user)) {
    return json({ error: 'forbidden' }, { status: 403 });
  }

  const payload = await request.json();
  const count = Number(payload?.count ?? 10);
  const length = Number(payload?.length ?? 12);

  if (!isValidNumber(count, 1, 200) || !isValidNumber(length, 6, 32)) {
    return json({ error: 'invalid_params' }, { status: 400 });
  }

  try {
    const admin = await getAdminPb();
    const codes = await createInvites({ admin, count, length });
    return json({ codes });
  } catch (err) {
    console.error('invite_create_failed', err);
    return json({ error: 'invite_create_failed' }, { status: 500 });
  }
};

export const PATCH = async ({ request }) => {
  const { user } = await getUserFromRequest(request);
  if (!isAdmin(user)) {
    return json({ error: 'forbidden' }, { status: 403 });
  }

  const payload = await request.json();
  const id = String(payload?.id ?? '').trim();
  const enabled = payload?.enabled;
  if (!id || typeof enabled !== 'boolean') {
    return json({ error: 'invalid_params' }, { status: 400 });
  }

  const admin = await getAdminPb();
  await admin.collection('invites').update(id, {
    enabled,
  });

  return json({ ok: true });
};
