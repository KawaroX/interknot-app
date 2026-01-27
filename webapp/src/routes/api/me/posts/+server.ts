import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';
import { getAdminPb } from '$lib/server/pbAdmin';
import { getUserFromRequest } from '$lib/server/auth';
import { mapPostSummary } from '$lib/server/mappers';

const baseUrl = env.PUBLIC_PB_URL || 'http://localhost:8090';

let cachedPostFields: Set<string> | null = null;

const getPostFields = async (admin: Awaited<ReturnType<typeof getAdminPb>>) => {
  if (cachedPostFields) return cachedPostFields;
  try {
    const collection = await admin.collections.getOne('posts');
    cachedPostFields = new Set((collection?.fields ?? []).map((field) => field.name));
  } catch (err) {
    console.error('post_fields_lookup_failed', err);
    cachedPostFields = new Set();
  }
  return cachedPostFields;
};

export const GET = async ({ request }) => {
  const { user } = await getUserFromRequest(request);
  const admin = await getAdminPb();
  const postFields = await getPostFields(admin);
  const sortField = postFields.has('edited_at') ? '-edited_at' : '-created';

  const records = await admin.collection('posts').getFullList({
    filter: `author = "${user.id}" && moderation_status != "rejected" && moderation_status != "hidden"`,
    sort: sortField,
    expand: 'author',
  });

  const items = records.map((record) => mapPostSummary(record, baseUrl));
  const getSortTime = (value?: string) => {
    if (!value) return 0;
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? 0 : time;
  };
  items.sort(
    (a, b) =>
      getSortTime(b.editedAt ?? b.createdAt) - getSortTime(a.editedAt ?? a.createdAt),
  );

  return json({
    items,
  });
};
