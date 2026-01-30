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
  // Try multiple ways to access fields
  const r = record as unknown as Record<string, unknown>;
  
  // Try .get() method first
  let key = '';
  let title = '';
  let body = '';
  let version = '';
  
  if (typeof record.get === 'function') {
    key = String(record.get('key') ?? '');
    title = String(record.get('title') ?? '');
    body = String(record.get('body') ?? '');
    version = String(record.get('version') ?? '');
  }
  
  // Fallback to direct property access
  if (!key) key = String(r.key ?? '');
  if (!title) title = String(r.title ?? '');
  if (!body) body = String(r.body ?? '');
  if (!version) version = String(r.version ?? '');
  
  return {
    key: isLegalKey(key) ? key : 'terms_of_service',
    title,
    body,
    version,
    updatedAt: String(r.updated ?? ''),
  };
};

const mergeWithDefaults = (records: LegalDocument[]) => {
  const byKey = new Map(records.map((doc) => [doc.key, doc]));
  return defaultLegalDocuments.map((doc) => {
    const saved = byKey.get(doc.key);
    if (saved && saved.body && saved.body.trim()) {
      return saved;
    }
    return doc;
  });
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
    
    // Debug: log what we got
    console.log('Records count:', records.length);
    records.forEach((r, i) => {
      const raw = r as unknown as Record<string, unknown>;
      console.log(`Record ${i}:`, {
        id: r.id,
        key_via_get: typeof r.get === 'function' ? r.get('key') : 'no get method',
        key_via_prop: raw.key,
        title_via_get: typeof r.get === 'function' ? r.get('title') : 'no get method',
        title_via_prop: raw.title,
        body_length_via_get: typeof r.get === 'function' ? String(r.get('body') || '').length : 0,
        body_length_via_prop: String(raw.body || '').length,
      });
    });
    
    const mapped = records.map(mapRecord);
    console.log('Mapped:', mapped.map(m => ({ key: m.key, title: m.title, body_length: m.body.length })));
    
    const documents = mergeWithDefaults(mapped);
    console.log('Final:', documents.map(d => ({ key: d.key, title: d.title, body_length: d.body.length })));
    
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
