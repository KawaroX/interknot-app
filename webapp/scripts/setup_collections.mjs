import fs from 'node:fs';
import path from 'node:path';
import PocketBase from 'pocketbase';

const envPath = path.resolve(process.cwd(), '.env');
if (!fs.existsSync(envPath)) {
  console.error('Missing webapp/.env. Create it first.');
  process.exit(1);
}

const parseEnv = (content) => {
  const result = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    result[key] = value;
  }
  return result;
};

const env = parseEnv(fs.readFileSync(envPath, 'utf8'));
const baseUrl = env.PUBLIC_PB_URL || 'http://localhost:8090';
const adminEmail = env.PB_ADMIN_EMAIL;
const adminPassword = env.PB_ADMIN_PASSWORD;

if (!adminEmail || !adminPassword) {
  console.error('Missing PB_ADMIN_EMAIL or PB_ADMIN_PASSWORD in webapp/.env');
  process.exit(1);
}

const pb = new PocketBase(baseUrl);
await pb.admins.authWithPassword(adminEmail, adminPassword);

const list = await pb.collections.getFullList();
const byName = new Map(list.map((item) => [item.name, item]));

const ensureCollection = async (definition) => {
  if (byName.has(definition.name)) {
    const existing = byName.get(definition.name);
    const updated = await pb.collections.update(existing.id, definition);
    console.log(`Updated collection ${definition.name}.`);
    return updated;
  }
  const created = await pb.collections.create(definition);
  console.log(`Created collection ${definition.name}.`);
  return created;
};

const textOptions = () => ({ min: 0, max: 0, pattern: '' });
const numberOptions = () => ({ min: 0, max: null, onlyInt: true });
const boolOptions = () => ({ });
const dateOptions = () => ({ min: '', max: '' });
const autodateOptions = (onCreate, onUpdate) => ({ onCreate, onUpdate });
const fileOptions = () => ({
  maxSelect: 1,
  maxSize: 0,
  mimeTypes: [],
  thumbs: [],
  protected: false,
});
const selectOptions = (values) => ({ maxSelect: 1, values });
const relationOptions = (collectionId) => ({
  collectionId,
  cascadeDelete: false,
  minSelect: 0,
  maxSelect: 1,
  displayFields: [],
});

const adminOnly = '';
const selfOnly = 'id = @request.auth.id';

const users = await ensureCollection({
  name: 'users',
  type: 'auth',
  fields: [
    { name: 'name', type: 'text', required: true, unique: false, ...textOptions() },
    { name: 'avatar', type: 'file', required: false, unique: false, ...fileOptions() },
    { name: 'bio', type: 'text', required: false, unique: false, ...textOptions() },
    { name: 'role', type: 'select', required: false, unique: false, ...selectOptions(['user', 'moderator', 'admin']) },
    { name: 'can_post', type: 'bool', required: false, unique: false, ...boolOptions() },
    { name: 'reject_count', type: 'number', required: false, unique: false, ...numberOptions() },
    { name: 'invite_code', type: 'text', required: false, unique: false, ...textOptions() },
    { name: 'terms_version', type: 'text', required: false, unique: false, ...textOptions() },
    { name: 'terms_accepted_at', type: 'date', required: false, unique: false, ...dateOptions() },
    { name: 'usage_version', type: 'text', required: false, unique: false, ...textOptions() },
    { name: 'usage_accepted_at', type: 'date', required: false, unique: false, ...dateOptions() },
    { name: 'created', type: 'autodate', required: false, unique: false, ...autodateOptions(true, false) },
    { name: 'updated', type: 'autodate', required: false, unique: false, ...autodateOptions(true, true) },
  ],
  listRule: selfOnly,
  viewRule: selfOnly,
  createRule: '',
  updateRule: selfOnly,
  deleteRule: selfOnly,
  options: {
    allowEmailAuth: true,
    allowOAuth2Auth: true,
    allowUsernameAuth: false,
    requireEmail: false,
  },
});

const posts = await ensureCollection({
  name: 'posts',
  type: 'base',
  fields: [
    { name: 'title', type: 'text', required: true, unique: false, ...textOptions() },
    { name: 'body', type: 'text', required: true, unique: false, ...textOptions() },
    { name: 'cover', type: 'file', required: false, unique: false, ...fileOptions() },
    { name: 'author', type: 'relation', required: true, unique: false, ...relationOptions(users.id) },
    { name: 'like_count', type: 'number', required: false, unique: false, ...numberOptions() },
    { name: 'comment_count', type: 'number', required: false, unique: false, ...numberOptions() },
    { name: 'view_count', type: 'number', required: false, unique: false, ...numberOptions() },
    { name: 'report_count', type: 'number', required: false, unique: false, ...numberOptions() },
    { name: 'moderation_status', type: 'select', required: false, unique: false, ...selectOptions(['pending_ai', 'pending_review', 'active', 'hidden', 'rejected']) },
    { name: 'ai_reason', type: 'text', required: false, unique: false, ...textOptions() },
    { name: 'review_requested', type: 'bool', required: false, unique: false, ...boolOptions() },
    { name: 'tags', type: 'json', required: false, unique: false },
    { name: 'edited_at', type: 'date', required: false, unique: false, ...dateOptions() },
    { name: 'ip_address', type: 'text', required: false, unique: false, ...textOptions() },
    { name: 'ip_region', type: 'text', required: false, unique: false, ...textOptions() },
    { name: 'created', type: 'autodate', required: false, unique: false, ...autodateOptions(true, false) },
    { name: 'updated', type: 'autodate', required: false, unique: false, ...autodateOptions(true, true) },
  ],
  listRule: adminOnly,
  viewRule: adminOnly,
  createRule: adminOnly,
  updateRule: adminOnly,
  deleteRule: adminOnly,
});

const comments = await ensureCollection({
  name: 'comments',
  type: 'base',
  fields: [
    { name: 'post', type: 'relation', required: true, unique: false, ...relationOptions(posts.id) },
    { name: 'author', type: 'relation', required: true, unique: false, ...relationOptions(users.id) },
    { name: 'body', type: 'text', required: true, unique: false, ...textOptions() },
    { name: 'report_count', type: 'number', required: false, unique: false, ...numberOptions() },
    { name: 'moderation_status', type: 'select', required: false, unique: false, ...selectOptions(['pending_ai', 'pending_review', 'active', 'hidden', 'rejected']) },
    { name: 'ai_reason', type: 'text', required: false, unique: false, ...textOptions() },
    { name: 'review_requested', type: 'bool', required: false, unique: false, ...boolOptions() },
    { name: 'ip_address', type: 'text', required: false, unique: false, ...textOptions() },
    { name: 'ip_region', type: 'text', required: false, unique: false, ...textOptions() },
    { name: 'created', type: 'autodate', required: false, unique: false, ...autodateOptions(true, false) },
    { name: 'updated', type: 'autodate', required: false, unique: false, ...autodateOptions(true, true) },
  ],
  listRule: adminOnly,
  viewRule: adminOnly,
  createRule: adminOnly,
  updateRule: adminOnly,
  deleteRule: adminOnly,
});

await ensureCollection({
  name: 'likes',
  type: 'base',
  fields: [
    { name: 'post', type: 'relation', required: true, unique: false, ...relationOptions(posts.id) },
    { name: 'user', type: 'relation', required: true, unique: false, ...relationOptions(users.id) },
    { name: 'like_key', type: 'text', required: true, unique: true, ...textOptions() },
    { name: 'created', type: 'autodate', required: false, unique: false, ...autodateOptions(true, false) },
    { name: 'updated', type: 'autodate', required: false, unique: false, ...autodateOptions(true, true) },
  ],
  listRule: adminOnly,
  viewRule: adminOnly,
  createRule: adminOnly,
  updateRule: adminOnly,
  deleteRule: adminOnly,
});

await ensureCollection({
  name: 'reports',
  type: 'base',
  fields: [
    { name: 'target_type', type: 'select', required: true, unique: false, ...selectOptions(['post', 'comment']) },
    { name: 'post', type: 'relation', required: false, unique: false, ...relationOptions(posts.id) },
    { name: 'comment', type: 'relation', required: false, unique: false, ...relationOptions(comments.id) },
    { name: 'reporter', type: 'relation', required: true, unique: false, ...relationOptions(users.id) },
    { name: 'reason', type: 'text', required: false, unique: false, ...textOptions() },
    { name: 'reason_detail', type: 'text', required: false, unique: false, ...textOptions() },
    { name: 'status', type: 'select', required: false, unique: false, ...selectOptions(['pending', 'reviewed']) },
    { name: 'created', type: 'autodate', required: false, unique: false, ...autodateOptions(true, false) },
    { name: 'updated', type: 'autodate', required: false, unique: false, ...autodateOptions(true, true) },
  ],
  listRule: adminOnly,
  viewRule: adminOnly,
  createRule: adminOnly,
  updateRule: adminOnly,
  deleteRule: adminOnly,
});

await ensureCollection({
  name: 'follows',
  type: 'base',
  fields: [
    { name: 'follower', type: 'relation', required: true, unique: false, ...relationOptions(users.id) },
    { name: 'followed', type: 'relation', required: true, unique: false, ...relationOptions(users.id) },
    { name: 'follow_key', type: 'text', required: true, unique: true, ...textOptions() },
    { name: 'created', type: 'autodate', required: false, unique: false, ...autodateOptions(true, false) },
    { name: 'updated', type: 'autodate', required: false, unique: false, ...autodateOptions(true, true) },
  ],
  listRule: adminOnly,
  viewRule: adminOnly,
  createRule: adminOnly,
  updateRule: adminOnly,
  deleteRule: adminOnly,
});

await ensureCollection({
  name: 'post_reads',
  type: 'base',
  fields: [
    { name: 'post', type: 'relation', required: true, unique: false, ...relationOptions(posts.id) },
    { name: 'user', type: 'relation', required: true, unique: false, ...relationOptions(users.id) },
    { name: 'read_key', type: 'text', required: true, unique: true, ...textOptions() },
    { name: 'created', type: 'autodate', required: false, unique: false, ...autodateOptions(true, false) },
    { name: 'updated', type: 'autodate', required: false, unique: false, ...autodateOptions(true, true) },
  ],
  listRule: adminOnly,
  viewRule: adminOnly,
  createRule: adminOnly,
  updateRule: adminOnly,
  deleteRule: adminOnly,
});

await ensureCollection({
  name: 'invites',
  type: 'base',
  fields: [
    { name: 'code', type: 'text', required: true, unique: true, ...textOptions() },
    { name: 'used_by', type: 'relation', required: false, unique: false, ...relationOptions(users.id) },
    { name: 'used_at', type: 'date', required: false, unique: false, ...dateOptions() },
    { name: 'enabled', type: 'bool', required: false, unique: false, ...boolOptions() },
    { name: 'created', type: 'autodate', required: false, unique: false, ...autodateOptions(true, false) },
    { name: 'updated', type: 'autodate', required: false, unique: false, ...autodateOptions(true, true) },
  ],
  listRule: adminOnly,
  viewRule: adminOnly,
  createRule: adminOnly,
  updateRule: adminOnly,
  deleteRule: adminOnly,
});

await ensureCollection({
  name: 'legal_documents',
  type: 'base',
  fields: [
    { name: 'key', type: 'text', required: true, unique: true, ...textOptions() },
    { name: 'title', type: 'text', required: true, unique: false, ...textOptions() },
    { name: 'body', type: 'text', required: true, unique: false, ...textOptions() },
    { name: 'version', type: 'text', required: true, unique: false, ...textOptions() },
    { name: 'created', type: 'autodate', required: false, unique: false, ...autodateOptions(true, false) },
    { name: 'updated', type: 'autodate', required: false, unique: false, ...autodateOptions(true, true) },
  ],
  listRule: adminOnly,
  viewRule: adminOnly,
  createRule: adminOnly,
  updateRule: adminOnly,
  deleteRule: adminOnly,
});

await ensureCollection({
  name: 'system_messages',
  type: 'base',
  fields: [
    { name: 'user', type: 'relation', required: true, unique: false, ...relationOptions(users.id) },
    { name: 'message_type', type: 'select', required: false, unique: false, ...selectOptions(['system', 'like', 'comment']) },
    { name: 'actor', type: 'relation', required: false, unique: false, ...relationOptions(users.id) },
    { name: 'title', type: 'text', required: true, unique: false, ...textOptions() },
    { name: 'body', type: 'text', required: false, unique: false, ...textOptions() },
    { name: 'target_type', type: 'select', required: false, unique: false, ...selectOptions(['post', 'comment']) },
    { name: 'post', type: 'relation', required: false, unique: false, ...relationOptions(posts.id) },
    { name: 'comment', type: 'relation', required: false, unique: false, ...relationOptions(comments.id) },
    { name: 'status', type: 'select', required: false, unique: false, ...selectOptions(['unread', 'read', 'actioned', 'hidden']) },
    { name: 'created', type: 'autodate', required: false, unique: false, ...autodateOptions(true, false) },
    { name: 'updated', type: 'autodate', required: false, unique: false, ...autodateOptions(true, true) },
  ],
  listRule: adminOnly,
  viewRule: adminOnly,
  createRule: adminOnly,
  updateRule: adminOnly,
  deleteRule: adminOnly,
});

console.log('Collection setup complete.');
