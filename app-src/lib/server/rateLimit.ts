import { NextResponse } from 'next/server';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const globalRateLimit = globalThis as typeof globalThis & {
  aimfRateLimits?: Map<string, RateLimitEntry>;
};

const entries = globalRateLimit.aimfRateLimits ?? new Map<string, RateLimitEntry>();
globalRateLimit.aimfRateLimits = entries;

export function enforceRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): NextResponse | null {
  const now = Date.now();
  const current = entries.get(key);

  if (!current || current.resetAt <= now) {
    entries.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  if (current.count >= limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1_000));
    return NextResponse.json(
      { error: 'Too many requests. Please try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
    );
  }

  current.count += 1;
  return null;
}
