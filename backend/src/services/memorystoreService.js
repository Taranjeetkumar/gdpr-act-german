const redis = require('../config/memorystore');

const CONSENT_TTL_SECONDS  = 300;   // 5 minutes
const SESSION_TTL_SECONDS  = 3600;  // 1 hour
const DELETION_TTL_SECONDS = 3600;  // 1 hour

// ─── safeRedis ────────────────────────────────────────────────────────────────
//
// Wraps every Redis call so that a down/slow/unreachable Redis instance never
// crashes the API. Returns null on any error so callers can fall back to
// Firestore / AlloyDB gracefully.
//
async function safeRedis(fn) {
  try {
    // If Redis is still connecting, status is "connecting". Don't queue
    // commands on a client that isn't ready — they'll pile up and time out
    // when the connectTimeout fires.
    if (redis.status !== 'ready') {
      console.warn(`[Memorystore] Skipped — client status: "${redis.status}"`);
      return null;
    }
    return await fn();
  } catch (err) {
    console.error('[Memorystore] Operation failed (non-blocking):', err.message);
    return null;
  }
}

// ─── Consent cache ────────────────────────────────────────────────────────────

async function cacheConsent(userId, purpose, granted) {
  const key = `consent:${userId}:${purpose}`;
  return safeRedis(() =>
    redis.setex(key, CONSENT_TTL_SECONDS, granted ? 'granted' : 'denied')
  );
}

// Returns 'granted', 'denied', or null on cache miss / Redis down.
async function checkConsentCache(userId, purpose) {
  const key = `consent:${userId}:${purpose}`;
  return safeRedis(() => redis.get(key));
}

// Warm the cache from a Firestore document after a cache miss.
async function populateConsentCache(userId, consentsData) {
  const consents = consentsData?.consents || {};
  if (Object.keys(consents).length === 0) return;

  return safeRedis(() => {
    const pipeline = redis.pipeline();
    Object.entries(consents).forEach(([purpose, data]) => {
      pipeline.setex(
        `consent:${userId}:${purpose}`,
        CONSENT_TTL_SECONDS,
        data.granted ? 'granted' : 'denied'
      );
    });
    return pipeline.exec();
  });
}

// Invalidate all consent keys for a user after a Firestore update.
async function invalidateUserConsentCache(userId) {
  return safeRedis(async () => {
    const keys = await redis.keys(`consent:${userId}:*`);
    if (keys.length > 0) {
      await redis.del(...keys);
      console.log(`[Memorystore] Invalidated ${keys.length} consent key(s) for ${userId}`);
    }
  });
}

// ─── Session cache ────────────────────────────────────────────────────────────

async function cacheUserSession(userId, userData) {
  return safeRedis(() =>
    redis.setex(`session:${userId}`, SESSION_TTL_SECONDS, JSON.stringify(userData))
  );
}

async function getCachedUserSession(userId) {
  return safeRedis(async () => {
    const cached = await redis.get(`session:${userId}`);
    return cached ? JSON.parse(cached) : null;
  });
}

async function invalidateUserSession(userId) {
  return safeRedis(() => redis.del(`session:${userId}`));
}

// ─── Deletion job status ──────────────────────────────────────────────────────

async function setDeletionStatus(userId, status) {
  // status: 'processing' | 'completed' | 'failed'
  return safeRedis(() =>
    redis.setex(`deletion:${userId}`, DELETION_TTL_SECONDS, status)
  );
}

async function getDeletionStatus(userId) {
  return safeRedis(() => redis.get(`deletion:${userId}`));
}

// ─── Rate limiter ─────────────────────────────────────────────────────────────

// Fail-open: if Redis is down, allow the request (don't block users unnecessarily).
async function checkRateLimit(userId, action, maxRequests = 10, windowSeconds = 3600) {
  const key = `ratelimit:${userId}:${action}`;
  const result = await safeRedis(async () => {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, windowSeconds);
    return { allowed: count <= maxRequests, count, max: maxRequests };
  });
  // null means Redis was unavailable — fail open
  return result || { allowed: true, count: 0, max: maxRequests };
}

// ─── Demo cache-aside (realtime route) ───────────────────────────────────────
//
// Used by /api/realtime/consent/:userId/:purpose/cache to demonstrate cache-
// aside behaviour. Uses safeRedis throughout so it surfaces a clean error
// message to the frontend when Redis is unreachable instead of a raw timeout.
//
async function getOrRefreshDemoCache(userId, purpose, ttlSeconds, fetchFreshValue) {
  const key = `demo:consent:${userId}:${purpose}`;

  // TTL check — wrapped in safeRedis
  const ttlRemaining = await safeRedis(() => redis.ttl(key));

  if (ttlRemaining !== null && ttlRemaining > 0) {
    const cached = await safeRedis(() => redis.get(key));
    if (cached !== null) {
      return {
        value: cached === 'granted',
        cacheHit: true,
        ttlRemainingSeconds: ttlRemaining,
      };
    }
  }

  // Cache miss — fetch from source of truth
  const fresh = await fetchFreshValue();

  await safeRedis(() =>
    redis.setex(key, ttlSeconds, fresh ? 'granted' : 'denied')
  );

  return {
    value: Boolean(fresh),
    cacheHit: false,
    ttlRemainingSeconds: ttlSeconds,
  };
}

// ─── Admin dashboard stats ────────────────────────────────────────────────────

async function getCacheInfo() {
  return safeRedis(async () => {
    const [info, keys] = await Promise.all([
      redis.info('memory'),
      redis.dbsize(),
    ]);
    const memMatch  = info.match(/used_memory_human:([^\r\n]+)/);
    const peakMatch = info.match(/used_memory_peak_human:([^\r\n]+)/);
    return {
      keys,
      usedMemory: memMatch  ? memMatch[1].trim()  : 'unknown',
      peakMemory: peakMatch ? peakMatch[1].trim() : 'unknown',
      ttlMinutes: CONSENT_TTL_SECONDS / 60,
      status: 'connected',
    };
  }) || {
    keys: 0,
    usedMemory: 'unavailable',
    peakMemory: 'unavailable',
    status: 'disconnected',
  };
}

module.exports = {
  cacheConsent,
  checkConsentCache,
  populateConsentCache,
  invalidateUserConsentCache,
  cacheUserSession,
  getCachedUserSession,
  invalidateUserSession,
  setDeletionStatus,
  getDeletionStatus,
  checkRateLimit,
  getCacheInfo,
  getOrRefreshDemoCache,
};
