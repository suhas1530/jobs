const buckets = new Map();

function nowMs() {
  return Date.now();
}

export default function companyChatbotRateLimit({ limit = Number.POSITIVE_INFINITY, windowMs = 10 * 60 * 1000 } = {}) {
  return (req, res, next) => {
    if (!Number.isFinite(Number(limit)) || Number(limit) <= 0) return next();
    const clerkId = req.auth?.()?.userId || req.user?.clerkId || req.user?._id?.toString() || req.ip || "anon";
    const key = `chatbot:${clerkId}`;
    const now = nowMs();
    const slot = buckets.get(key);

    if (!slot || now > slot.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (slot.count >= limit) {
      const retryAfterSec = Math.max(1, Math.ceil((slot.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSec));
      return res.status(429).json({ message: "Too many chatbot requests. Please retry shortly." });
    }

    slot.count += 1;
    buckets.set(key, slot);
    return next();
  };
}
