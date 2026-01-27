import { json } from '@sveltejs/kit';
import type { RecordModel } from 'pocketbase';
import { getAdminPb } from '$lib/server/pbAdmin';
import { getUserFromRequest } from '$lib/server/auth';
import { defaultLegalDocuments } from '$lib/data/legalDrafts';
import type { LegalDocument } from '$lib/types';

type LegalKey = LegalDocument['key'];

const allowedKeys = new Set<LegalKey>(['terms_of_service', 'usage_policy']);

const isAdmin = (user: RecordModel) => {
  const role = (user.get?.('role') ?? user.role ?? 'user') as string;
  return role === 'admin';
};

const isLegalKey = (value: string): value is LegalKey => allowedKeys.has(value as LegalKey);

const mapRecord = (record: RecordModel): LegalDocument => {
  const key = (record.get?.('key') ?? record.key ?? '') as string;
  return {
    key: isLegalKey(key) ? key : 'terms_of_service',
    title: (record.get?.('title') ?? record.title ?? '') as string,
    body: (record.get?.('body') ?? record.body ?? '') as string,
    version: (record.get?.('version') ?? record.version ?? '') as string,
    updatedAt: (record.get?.('updated') ?? record.updated ?? undefined) as string | undefined,
  };
};

const mergeWithDefaults = (records: LegalDocument[]) => {
  const byKey = new Map(records.map((doc) => [doc.key, doc]));
  return defaultLegalDocuments.map((doc) => byKey.get(doc.key) ?? doc);
};

const normalizeText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const normalizeDocument = (doc: unknown) => {
  if (!doc || typeof doc !== 'object') return null;
  const payload = doc as Record<string, unknown>;
  const key = normalizeText(payload.key);
  if (!isLegalKey(key)) return null;
  const title = normalizeText(payload.title);
  const body = normalizeText(payload.body);
  const version = normalizeText(payload.version);
  if (!title || !body || !version) return null;
  const normalized: LegalDocument = { key, title, body, version };
  return normalized;
};

export const GET = async () => {
  try {
    const admin = await getAdminPb();
    const records = await admin.collection('legal_documents').getFullList({ sort: 'key' });
    const documents = mergeWithDefaults(records.map(mapRecord));
    return json({ documents });
  } catch (err) {
    console.error('legal_docs_fetch_failed', err);
    return json({ documents: defaultLegalDocuments, fallback: true });
  }
};

export const PATCH = async ({ request }) => {
  const { user } = await getUserFromRequest(request);
  if (!isAdmin(user)) {
    return json({ error: 'forbidden' }, { status: 403 });
  }

  let payload: unknown = null;
  try {
    payload = await request.json();
  } catch (err) {
    return json({ error: 'invalid_json' }, { status: 400 });
  }

  const docs = Array.isArray((payload as { documents?: unknown }).documents)
    ? ((payload as { documents?: unknown }).documents as unknown[])
    : [];
  const normalized = docs.map(normalizeDocument).filter(Boolean) as LegalDocument[];

  if (normalized.length === 0) {
    return json({ error: 'invalid_documents' }, { status: 400 });
  }

  const admin = await getAdminPb();
  const filter = normalized.map((doc) => `key = "${doc.key}"`).join(' || ');
  const existing = filter
    ? await admin.collection('legal_documents').getFullList({ filter })
    : [];
  const byKey = new Map(existing.map((record) => [record.get?.('key') ?? record.key, record]));

  const saved = await Promise.all(
    normalized.map(async (doc) => {
      const record = byKey.get(doc.key) as RecordModel | undefined;
      if (record) {
        const updated = await admin.collection('legal_documents').update(record.id, {
          key: doc.key,
          title: doc.title,
          body: doc.body,
          version: doc.version,
        });
        return mapRecord(updated);
      }
      const created = await admin.collection('legal_documents').create({
        key: doc.key,
        title: doc.title,
        body: doc.body,
        version: doc.version,
      });
      return mapRecord(created);
    }),
  );

  return json({ documents: mergeWithDefaults(saved) });
};
