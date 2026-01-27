import { env } from '$env/dynamic/private';

type ModerationResult = {
  allowed: boolean;
  reason?: string;
};

const baseUrl = env.AI_BASE_URL || 'https://api.yunwu.ai/v1';
const apiKey = env.AI_API_KEY;
const model = env.AI_MODEL || 'gemini-3-flash-preview';

const buildPrompt = () => {
  return [
    'You are a strict content moderation system.',
    'Decide if the content is safe for a public community app.',
    'If the content should be rejected, provide a short reason in Chinese (<= 40 characters).',
    'The rejection reason must not be empty.',
    'If the content is allowed, return an empty reason string.',
    'Return ONLY valid JSON: {"allow":true|false,"reason":"short"}.',
  ].join('\n');
};

const normalizeAllow = (value: unknown) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return Boolean(value);
};

const extractJsonString = (raw: string) => {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }
  return trimmed;
};

const buildResult = (allowed: boolean, reason?: string) => {
  const rawReason = typeof reason === 'string' ? reason.trim() : '';
  return {
    allowed,
    reason: rawReason || (allowed ? undefined : '内容可能违反社区规范'),
  } satisfies ModerationResult;
};

const parseModerationResponse = (raw: unknown) => {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const candidate = raw as { allow?: unknown; allowed?: unknown; reason?: unknown };
    if ('allow' in candidate || 'allowed' in candidate) {
      const allowed = normalizeAllow(candidate.allow ?? candidate.allowed);
      return buildResult(allowed, typeof candidate.reason === 'string' ? candidate.reason : undefined);
    }
  }

  const text = typeof raw === 'string' ? raw : JSON.stringify(raw ?? '');
  const jsonText = extractJsonString(text);
  const parsed = JSON.parse(jsonText) as { allow?: unknown; allowed?: unknown; reason?: string };
  const allowed = normalizeAllow(parsed.allow ?? parsed.allowed);
  return buildResult(allowed, parsed.reason);
};

export const runModeration = async (text: string, imageDataUrls: string[] = []) => {
  if (!apiKey) {
    return { allowed: true, reason: 'ai_disabled' } satisfies ModerationResult;
  }

  const contentParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
    { type: 'text', text },
  ];

  for (const imageUrl of imageDataUrls) {
    contentParts.push({ type: 'image_url', image_url: { url: imageUrl } });
  }

  const payload = {
    model,
    messages: [
      {
        role: 'system',
        content: buildPrompt(),
      },
      {
        role: 'user',
        content: contentParts,
      },
    ],
    temperature: 0.2,
  };

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('moderation_request_error', err);
    throw err;
  }

  if (!res.ok) {
    console.error('moderation_request_failed', {
      status: res.status,
      statusText: res.statusText,
    });
    return { allowed: false, reason: `ai_error_${res.status}` } satisfies ModerationResult;
  }

  const rawBody = await res.text();
  let parsedBody: unknown = null;
  try {
    parsedBody = rawBody ? (JSON.parse(rawBody) as unknown) : null;
  } catch (err) {
    console.error('moderation_response_json_failed', {
      contentLength: rawBody.length,
      preview: rawBody.slice(0, 200),
    });
  }

  const choiceContent =
    parsedBody && typeof parsedBody === 'object'
      ? (parsedBody as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message
          ?.content
      : undefined;
  const rawContent = choiceContent ?? parsedBody ?? rawBody;
  try {
    return parseModerationResponse(rawContent);
  } catch (err) {
    const content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent ?? '');
    console.error('moderation_response_parse_failed', {
      rawType: typeof rawContent,
      contentLength: content.length,
      preview: content.slice(0, 200),
    });
    return { allowed: false, reason: 'ai_parse_error' } satisfies ModerationResult;
  }
};
