type LimitState = {
  count: number;
  resetAt: number;
};

const state = new Map<string, LimitState>();

export function checkRateLimit(
  key: string,
  options: { max: number; windowMs: number },
): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  const item = state.get(key);

  if (!item || item.resetAt <= now) {
    const resetAt = now + options.windowMs;
    state.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: options.max - 1, resetAt };
  }

  if (item.count >= options.max) {
    return { allowed: false, remaining: 0, resetAt: item.resetAt };
  }

  item.count += 1;
  state.set(key, item);

  return {
    allowed: true,
    remaining: options.max - item.count,
    resetAt: item.resetAt,
  };
}

export function clientKeyFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
  return ip;
}
