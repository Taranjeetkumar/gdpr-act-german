const Redis = require('ioredis');

// ─── Environment detection ────────────────────────────────────────────────────
//
// NODE_ENV=production  → Cloud Run inside the GCP VPC → connect to GCP Memorystore
// anything else        → local dev                    → connect to local Docker Redis
//
// IMPORTANT: Never set NODE_ENV=production in your local .env.
// The Dockerfile sets it automatically for Cloud Run deployments.
//
const isProduction = process.env.NODE_ENV === 'production';

const redisHost = isProduction
  ? (process.env.MEMORYSTORE_HOST || 'localhost')
  : (process.env.MEMORYSTORE_HOST_LOCAL || '127.0.0.1');

const redisPort = isProduction
  ? parseInt(process.env.MEMORYSTORE_PORT || '6379', 10)
  : parseInt(process.env.MEMORYSTORE_PORT_LOCAL || '6379', 10);

const envLabel = isProduction
  ? 'PRODUCTION → GCP Memorystore (must be inside VPC)'
  : 'LOCAL → Docker Redis (127.0.0.1:6379)';

console.log(
  `[Memorystore] NODE_ENV="${process.env.NODE_ENV || 'development'}" | ` +
  `${envLabel} | host=${redisHost}:${redisPort}`
);

// ─── Connection ───────────────────────────────────────────────────────────────
//
// Key settings that prevent the timeout cascade:
//
//  connectTimeout    – give up on the TCP handshake after 5 s instead of hanging
//  commandTimeout    – individual commands fail fast rather than queuing forever
//  maxRetriesPerRequest – 3 quick retries then surface the error; safeRedis()
//                         catches it so nothing crashes
//  retryStrategy     – capped exponential back-off; returning null permanently
//                       closes the connection, so we never return null
//  lazyConnect:true  – do NOT open a socket at require() time; we call
//                       redis.connect() once at server start so the very first
//                       command doesn't also have to wait for the handshake
//
const redis = new Redis({
  host: redisHost,
  port: redisPort,
  lazyConnect: true,
  connectTimeout: 5000,       // TCP handshake timeout  (ms)
  commandTimeout: 3000,       // per-command timeout    (ms)
  maxRetriesPerRequest: 3,    // retry each command 3× before throwing
  enableReadyCheck: true,     // wait for Redis "READY" before marking connected
  retryStrategy: (times) => {
    // Exponential back-off, capped at 10 s.
    // NEVER return null — that permanently closes the client.
    const delay = Math.min(times * 300, 10000);
    console.log(`[Memorystore] Reconnect attempt #${times} in ${delay}ms`);
    return delay;
  },
  reconnectOnError: (err) => {
    // Reconnect on READONLY errors (Memorystore failover) and broken pipe
    const reconnectOn = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
    return reconnectOn.some((code) => err.message.includes(code));
  },
});

// ─── Event logging ────────────────────────────────────────────────────────────
redis.on('connect',      ()    => console.log('[Memorystore] ✓ TCP connection established'));
redis.on('ready',        ()    => console.log('[Memorystore] ✓ Redis ready'));
redis.on('error',        (err) => console.error('[Memorystore] ✗ Error:', err.message));
redis.on('close',        ()    => console.log('[Memorystore] Connection closed'));
redis.on('reconnecting', (ms)  => console.log(`[Memorystore] Reconnecting in ${ms}ms…`));
redis.on('end',          ()    => console.log('[Memorystore] Connection ended'));

// ─── Warm-up connection at startup ───────────────────────────────────────────
//
// Called by server.js so the socket is open before the first real request
// hits. Failures are logged but NOT fatal — the app runs fine without Redis
// (safeRedis in memorystoreService.js catches every command error).
//
async function connectRedis() {
  try {
    await redis.connect();
    await redis.ping(); // verify the server actually responds
    console.log('[Memorystore] ✓ Startup PING succeeded');
  } catch (err) {
    console.warn(
      '[Memorystore] ⚠ Could not connect at startup — running without cache.',
      '\n  Reason:', err.message,
      isProduction
        ? '\n  In production this means the Cloud Run service is not inside the VPC connector.'
        : '\n  Locally: start Redis with:  docker run -d --name redis -p 6379:6379 redis:7-alpine'
    );
    // Do NOT rethrow — the app is functional without Redis.
  }
}

module.exports = redis;
module.exports.connectRedis = connectRedis;
