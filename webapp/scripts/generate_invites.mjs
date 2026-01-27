import crypto from 'node:crypto';
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

const args = process.argv.slice(2);
const getArgValue = (name) => {
  const directIndex = args.indexOf(name);
  if (directIndex >= 0 && args[directIndex + 1]) {
    return args[directIndex + 1];
  }
  const prefix = `${name}=`;
  const match = args.find((arg) => arg.startsWith(prefix));
  if (match) {
    return match.slice(prefix.length);
  }
  return undefined;
};

const rawCount = getArgValue('--count') ?? getArgValue('-n');
const rawLength = getArgValue('--length') ?? getArgValue('-l');
const count = rawCount ? Number(rawCount) : 10;
const length = rawLength ? Number(rawLength) : 12;

const isValidNumber = (value, min, max) =>
  Number.isFinite(value) && Number.isInteger(value) && value >= min && value <= max;

if (!isValidNumber(count, 1, 5000) || !isValidNumber(length, 6, 64)) {
  console.error('Usage: node scripts/generate_invites.mjs --count 10 --length 12');
  process.exit(1);
}

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const buildCode = (size) => {
  const bytes = crypto.randomBytes(size);
  let code = '';
  for (let i = 0; i < size; i += 1) {
    code += alphabet[bytes[i] % alphabet.length];
  }
  return code;
};

const isDuplicateError = (err) => {
  if (!err || typeof err !== 'object') return false;
  const status = Number(err.status ?? 0);
  if (status !== 400) return false;
  const data = err.data ?? {};
  const field = data.data?.code ?? {};
  const errorCode = field.code ?? '';
  const message = field.message ?? data.message ?? '';
  return errorCode === 'validation_not_unique' || String(message).toLowerCase().includes('unique');
};

const pb = new PocketBase(baseUrl);
await pb.admins.authWithPassword(adminEmail, adminPassword);

const created = [];
const seen = new Set();
const maxAttempts = count * 30;
let attempts = 0;

while (created.length < count) {
  attempts += 1;
  if (attempts > maxAttempts) {
    console.error('Failed to generate enough unique invites.');
    process.exit(1);
  }
  const code = buildCode(length);
  if (seen.has(code)) continue;
  seen.add(code);
  try {
    await pb.collection('invites').create({
      code,
      enabled: true,
    });
    created.push(code);
  } catch (err) {
    if (isDuplicateError(err)) {
      continue;
    }
    console.error('Invite creation failed.', err);
    process.exit(1);
  }
}

console.log(`Created ${created.length} invite codes:`);
for (const code of created) {
  console.log(code);
}
