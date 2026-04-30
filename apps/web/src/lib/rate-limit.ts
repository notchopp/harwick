type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export function checkRateLimit(params: {
  key: string;
  limit: number;
  windowMs: number;
  now?: () => number;
}): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const now = params.now?.() ?? Date.now();
  const current = buckets.get(params.key);
  if (current === undefined || current.resetAt <= now) {
    buckets.set(params.key, {
      count: 1,
      resetAt: now + params.windowMs,
    });
    return { allowed: true };
  }

  if (current.count >= params.limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  return { allowed: true };
}

export function rateLimitKeyFromRequest(params: {
  request: Request;
  namespace: string;
}): string {
  const forwardedFor = params.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = params.request.headers.get("x-real-ip")?.trim();
  return `${params.namespace}:${forwardedFor ?? realIp ?? "unknown"}`;
}
