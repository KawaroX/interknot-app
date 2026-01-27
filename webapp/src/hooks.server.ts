import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { checkRateLimit } from '$lib/server/rateLimit';

const WINDOW_MS = Number(env.RATE_LIMIT_WINDOW_MS || 60000);
const MAX_READ = Number(env.RATE_LIMIT_MAX_READ || 240);
const MAX_WRITE = Number(env.RATE_LIMIT_MAX_WRITE || 60);

export const handle = async ({ event, resolve }) => {
  // Only apply rate limiting to API routes
  if (event.url.pathname.startsWith('/api')) {
    const ip = event.getClientAddress();
    const method = event.request.method;
    const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    
    // Separate counters for read and write operations per IP
    const key = `${ip}:${isWrite ? 'write' : 'read'}`;
    const limit = isWrite ? MAX_WRITE : MAX_READ;
    
    const result = checkRateLimit(key, limit, WINDOW_MS);

    if (result.limited) {
      const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);
      return json(
        { error: 'rate_limited', message: 'Too many requests' },
        { 
          status: 429,
          headers: {
            'Retry-After': String(retryAfter),
            'X-RateLimit-Limit': String(limit),
            'X-RateLimit-Remaining': String(0),
            'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000))
          }
        }
      );
    }
    
    // Process the request
    const response = await resolve(event);
    
    // Add rate limit headers to the response
    response.headers.set('X-RateLimit-Limit', String(limit));
    response.headers.set('X-RateLimit-Remaining', String(result.remaining));
    response.headers.set('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));
    
    return response;
  }

  return resolve(event);
};
