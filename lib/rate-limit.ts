/**
 * Simple in-memory rate limiter.
 * Works per-instance — good enough for Vercel serverless (each cold start gets its own counter).
 * For multi-instance persistence, swap the Map for Upstash Redis.
 */

interface Entry {
  count: number;
  reset: number;
}

const store = new Map<string, Entry>();

// Clean up expired entries every 5 minutes to prevent memory leaks
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    store.forEach((entry, key) => {
      if (now > entry.reset) store.delete(key);
    });
  }, 5 * 60 * 1000);
}

/**
 * @param key      Unique identifier — e.g. `ip:${ip}:payment`
 * @param limit    Max requests allowed in the window
 * @param windowMs Time window in milliseconds
 * @returns `{ allowed: boolean, remaining: number, retryAfter: number }`
 */
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.reset) {
    store.set(key, { count: 1, reset: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfter: 0 };
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, retryAfter: Math.ceil((entry.reset - now) / 1000) };
  }

  entry.count++;
  return { allowed: true, remaining: limit - entry.count, retryAfter: 0 };
}

/** Extract the real IP from Next.js request headers */
export function getIp(req: Request): string {
  const headers = req instanceof Request ? req.headers : (req as { headers: Headers }).headers;
  return (
    (headers.get('x-forwarded-for') || '').split(',')[0].trim() ||
    headers.get('x-real-ip') ||
    'unknown'
  );
}
