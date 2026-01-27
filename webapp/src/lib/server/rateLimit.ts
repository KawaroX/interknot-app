interface RateLimitResult {
  limited: boolean;
  remaining: number;
  resetAt: number;
}

const hits = new Map<string, { count: number; resetAt: number }>();

// Cleanup expired entries every minute to prevent memory leaks
const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, value] of hits.entries()) {
    if (value.resetAt <= now) {
      hits.delete(key);
    }
  }
}, 60000);

// Prevent the interval from keeping the process alive if it's the only thing pending
if (cleanup.unref) cleanup.unref();

export const checkRateLimit = (key: string, max: number, windowMs: number): RateLimitResult => {
  const now = Date.now();
  const record = hits.get(key);

  if (!record || record.resetAt <= now) {
    const resetAt = now + windowMs;
    hits.set(key, { count: 1, resetAt });
    return { limited: false, remaining: max - 1, resetAt };
  }

  if (record.count >= max) {
    return { limited: true, remaining: 0, resetAt: record.resetAt };
  }

  record.count += 1;
  return { limited: false, remaining: max - record.count, resetAt: record.resetAt };
};
