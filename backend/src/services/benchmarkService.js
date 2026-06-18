
const { v4: uuidv4 } = require('uuid');
const pool        = require('../config/alloydb');
const firestoreDb = require('../config/firestore');
const redis       = require('../config/memorystore');
const datastore   = require('../config/datastore');
const { logAuditEvent } = require('./datastoreService');

const DEFAULT_SAMPLE_SIZE = 25;
const DEFAULT_CONCURRENCY = 10;
const MAX_SAMPLE_SIZE     = 100;
const MAX_CONCURRENCY     = 50;

function nowMs() {
  return Number(process.hrtime.bigint()) / 1e6;
}

function percentile(sortedAsc, p) {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sortedAsc.length) - 1;
  return sortedAsc[Math.max(0, Math.min(idx, sortedAsc.length - 1))];
}

function summarize(samplesMs) {
  if (!samplesMs.length) return { samples: 0, minMs: 0, maxMs: 0, avgMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0 };
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const sum    = sorted.reduce((a, b) => a + b, 0);
  return {
    samples: sorted.length,
    minMs:   round(sorted[0]),
    maxMs:   round(sorted[sorted.length - 1]),
    avgMs:   round(sum / sorted.length),
    p50Ms:   round(percentile(sorted, 50)),
    p95Ms:   round(percentile(sorted, 95)),
    p99Ms:   round(percentile(sorted, 99)),
  };
}

function round(n) {
  return Math.round(n * 1000) / 1000;
}

// ─── Redis availability helper ────────────────────────────────────────────────
// Returns true only when the ioredis client is fully connected and ready.
// Used to guard every direct redis call inside this file (benchmarkService
// intentionally calls redis directly to measure raw latency, so it cannot
// use the safeRedis wrapper from memorystoreService).
function isRedisReady() {
  return redis.status === 'ready';
}

// ─── Per-database probes ──────────────────────────────────────────────────────

async function probeAlloyDBRead(userId) {
  const t0 = nowMs();
  await pool.query(
    `SELECT pd.id, pd.data_value, dc.name AS category_name, dc.sensitivity_level
     FROM personal_data pd
     JOIN data_categories dc ON pd.category_id = dc.id
     WHERE pd.user_id = $1
     LIMIT 20`,
    [userId]
  );
  return nowMs() - t0;
}

async function probeAlloyDBWrite(userId, categoryId) {
  const id = uuidv4();
  const t0 = nowMs();
  await pool.query(
    `INSERT INTO personal_data (id, user_id, category_id, data_value, source)
     VALUES ($1, $2, $3, $4, 'benchmark_probe')`,
    [id, userId, categoryId, `probe-${id}`]
  );
  const elapsed = nowMs() - t0;
  await pool.query('DELETE FROM personal_data WHERE id = $1', [id]);
  return elapsed;
}

async function probeFirestoreRead(userId) {
  const t0 = nowMs();
  await firestoreDb.collection('consents').doc(userId).get();
  return nowMs() - t0;
}

async function probeFirestoreWrite(runId, i) {
  const ref = firestoreDb.collection('_benchmark_probes').doc(`${runId}-${i}`);
  const t0 = nowMs();
  await ref.set({ probe: true, ts: new Date() });
  const elapsed = nowMs() - t0;
  await ref.delete();
  return elapsed;
}

// Redis probes — guard with isRedisReady() so they throw a clear error
// instead of hanging on a disconnected client.
async function probeMemorystoreRead(key) {
  if (!isRedisReady()) throw new Error('Redis not ready');
  const t0 = nowMs();
  await redis.get(key);
  return nowMs() - t0;
}

async function probeMemorystoreWrite(keyBase, i) {
  if (!isRedisReady()) throw new Error('Redis not ready');
  const t0 = nowMs();
  await redis.setex(`${keyBase}:${i}`, 30, 'probe');
  return nowMs() - t0;
}

async function probeDatastoreRead() {
  const t0 = nowMs();
  const query = datastore.createQuery('AuditLog').order('timestamp', { descending: true }).limit(20);
  await datastore.runQuery(query);
  return nowMs() - t0;
}

async function probeDatastoreWrite(runId, i) {
  const key = datastore.key('BenchmarkProbe');
  const t0 = nowMs();
  await datastore.save({
    key,
    data: [
      { name: 'runId', value: runId },
      { name: 'i',     value: i },
      { name: 'ts',    value: new Date() },
    ],
  });
  const elapsed = nowMs() - t0;
  await datastore.delete(key);
  return elapsed;
}

// ─── Sample helpers ───────────────────────────────────────────────────────────

async function pickSampleIds() {
  const userRes = await pool.query('SELECT id FROM users WHERE deleted_at IS NULL LIMIT 1');
  const catRes  = await pool.query('SELECT id FROM data_categories LIMIT 1');
  if (!userRes.rows[0] || !catRes.rows[0]) {
    throw new Error('Benchmark needs at least one seeded user and one data category in AlloyDB.');
  }
  return { userId: userRes.rows[0].id, categoryId: catRes.rows[0].id };
}

async function runSection(label, fn) {
  try {
    return await fn();
  } catch (err) {
    console.error(`[Benchmark] ${label} section failed:`, err.message);
    return { unavailable: true, error: err.message };
  }
}

async function sampleSequential(fn, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(await fn(i));
  return out;
}

async function burstConcurrent(fn, n) {
  const t0 = nowMs();
  await Promise.all(Array.from({ length: n }, (_, i) => fn(i)));
  const totalMs = nowMs() - t0;
  return round(n / (totalMs / 1000));
}

// ─── Cache-aside measurement ──────────────────────────────────────────────────

async function measureCacheAsideEffect(userId, sampleSize) {
  if (!isRedisReady()) {
    return {
      unavailable: true,
      error: 'Redis not ready — cache-aside demo skipped',
    };
  }

  const purpose = 'benchmark_demo_purpose';
  const key     = `consent:${userId}:${purpose}`;
  await redis.del(key).catch(() => {}); // force cold start

  // Cold path: cache miss → Firestore read → populate cache
  const t0 = nowMs();
  await firestoreDb.collection('consents').doc(userId).get();
  await redis.setex(key, 300, 'granted');
  const coldMs = nowMs() - t0;

  // Warm path: all subsequent requests within the TTL window
  const warmSamples = await sampleSequential(() => probeMemorystoreRead(key), sampleSize);
  await redis.del(key).catch(() => {});

  const warm = summarize(warmSamples);
  return {
    coldPathMs:     round(coldMs),
    warmPathAvgMs:  warm.avgMs,
    warmPathP95Ms:  warm.p95Ms,
    speedupFactor:  warm.avgMs > 0 ? round(coldMs / warm.avgMs) : null,
    note: 'Cold path is a cache miss: Firestore read + Memorystore populate (once per 5-min TTL). Warm path is every subsequent request served from Redis alone.',
  };
}

// ─── Persistence ─────────────────────────────────────────────────────────────

async function persistRun(runId, results) {
  try {
    await pool.query(
      `INSERT INTO benchmark_runs (id, ran_at, payload) VALUES ($1, NOW(), $2)`,
      [runId, JSON.stringify(results)]
    );
  } catch (err) {
    console.error('[Benchmark] Failed to persist run (non-blocking):', err.message);
  }
}

async function getBenchmarkHistory(limit = 20) {
  const r = await pool.query(
    'SELECT id, ran_at, payload FROM benchmark_runs ORDER BY ran_at DESC LIMIT $1',
    [limit]
  );
  return r.rows.map((row) => ({ id: row.id, ranAt: row.ran_at, ...row.payload }));
}

// ─── Main entry point ─────────────────────────────────────────────────────────

async function runFullBenchmark({ sampleSize, concurrency } = {}) {
  const SAMPLE_SIZE  = Math.min(Math.max(parseInt(sampleSize)  || DEFAULT_SAMPLE_SIZE,  5), MAX_SAMPLE_SIZE);
  const CONCURRENCY  = Math.min(Math.max(parseInt(concurrency) || DEFAULT_CONCURRENCY,  2), MAX_CONCURRENCY);

  const runId = uuidv4();
  const { userId, categoryId } = await pickSampleIds();

  // Pre-warm a Memorystore key only if Redis is up
  const readKey   = `consent:${userId}:benchmark_read_probe`;
  const tpReadKey = `consent:${userId}:benchmark_tp_probe`;
  if (isRedisReady()) {
    await redis.setex(readKey,   60, 'granted').catch(() => {});
    await redis.setex(tpReadKey, 60, 'granted').catch(() => {});
  }

  const read = {
    alloydb: await runSection('AlloyDB read', async () =>
      summarize(await sampleSequential(() => probeAlloyDBRead(userId), SAMPLE_SIZE))
    ),
    firestore: await runSection('Firestore read', async () =>
      summarize(await sampleSequential(() => probeFirestoreRead(userId), SAMPLE_SIZE))
    ),
    memorystore: await runSection('Memorystore read', async () =>
      summarize(await sampleSequential(() => probeMemorystoreRead(readKey), SAMPLE_SIZE))
    ),
    datastore: await runSection('Datastore read', async () =>
      summarize(await sampleSequential(() => probeDatastoreRead(), SAMPLE_SIZE))
    ),
  };

  const write = {
    alloydb: await runSection('AlloyDB write', async () =>
      summarize(await sampleSequential(() => probeAlloyDBWrite(userId, categoryId), SAMPLE_SIZE))
    ),
    firestore: await runSection('Firestore write', async () =>
      summarize(await sampleSequential((i) => probeFirestoreWrite(runId, i), SAMPLE_SIZE))
    ),
    memorystore: await runSection('Memorystore write', async () =>
      summarize(await sampleSequential((i) => probeMemorystoreWrite(`bench:${runId}`, i), SAMPLE_SIZE))
    ),
    datastore: await runSection('Datastore write', async () =>
      summarize(await sampleSequential((i) => probeDatastoreWrite(runId, i), SAMPLE_SIZE))
    ),
  };

  const throughput = {
    concurrency: CONCURRENCY,
    opsPerSec: {
      alloydb:     await runSection('AlloyDB throughput',     () => burstConcurrent(() => probeAlloyDBRead(userId),      CONCURRENCY)),
      firestore:   await runSection('Firestore throughput',   () => burstConcurrent(() => probeFirestoreRead(userId),    CONCURRENCY)),
      memorystore: await runSection('Memorystore throughput', () => burstConcurrent(() => probeMemorystoreRead(tpReadKey), CONCURRENCY)),
      datastore:   await runSection('Datastore throughput',   () => burstConcurrent(() => probeDatastoreRead(),          CONCURRENCY)),
    },
  };

  // Cleanup probe keys
  if (isRedisReady()) {
    await redis.del(readKey, tpReadKey).catch(() => {});
  }

  const cacheAside = await runSection('Cache-aside effect', () =>
    measureCacheAsideEffect(userId, SAMPLE_SIZE)
  );

  const result = {
    runId,
    ranAt: new Date().toISOString(),
    sampleSize: SAMPLE_SIZE,
    concurrency: CONCURRENCY,
    read,
    write,
    throughput,
    cacheAside,
  };

  await persistRun(runId, result);
  await logAuditEvent({
    userId:       'system',
    action:       'BENCHMARK_RUN',
    resourceType: 'system',
    resourceId:   runId,
    performedBy:  'admin',
    metadata: {
      gdprArticle: 'N/A, system diagnostics',
      sampleSize:  SAMPLE_SIZE,
      concurrency: CONCURRENCY,
    },
  }).catch(() => {});

  return result;
}

// ─── Qualitative comparison matrix ───────────────────────────────────────────

function getComparisonMatrix() {
  return {
    alloydb: {
      label: 'AlloyDB',
      roleInProject: 'Primary relational store, personal data, cascade delete (Article 17)',
      dataModel: 'Relational (PostgreSQL-compatible), normalized tables, foreign keys',
      consistencyModel: 'Strong, full ACID, synchronous multi-row transactions',
      durability: 'Persistent, multi-zone replicated regional storage',
      transactionSupport: 'Full multi-statement ACID transactions; FK cascades',
      scalability: 'Vertical scaling + read replicas; single-writer primary',
      typicalLatency: 'Single-digit to tens of ms (depends on joins/indexes)',
      costModel: 'Provisioned vCPU/RAM instance, billed continuously',
      bestFit: 'Structured data needing joins, constraints, and atomic cascade delete',
    },
    firestore: {
      label: 'Firestore',
      roleInProject: 'Real-time consent preferences, live sync to all sessions',
      dataModel: 'Document NoSQL, hierarchical collections/subcollections',
      consistencyModel: 'Strong on single-document reads/writes; limited multi-doc transactions',
      durability: 'Persistent, regionally/multi-regionally replicated',
      transactionSupport: 'Multi-document transactions, bounded in size/scope',
      scalability: 'Automatic horizontal scaling, no provisioning',
      typicalLatency: 'Tens of ms typical (network round trip + index lookup)',
      costModel: 'Pay-per-operation (reads/writes/deletes) + storage, no idle cost',
      bestFit: 'Semi-structured state needing real-time propagation to live clients',
    },
    memorystore: {
      label: 'Memorystore (Redis)',
      roleInProject: 'Consent enforcement gate, sub-ms cache checked on every request',
      dataModel: 'In-memory key-value (Redis data structures)',
      consistencyModel: 'Strong within a node; async-replicated read replica on Standard tier',
      durability: 'Volatile by default; intentionally short-TTL in this project',
      transactionSupport: 'Atomic single commands; MULTI/EXEC pipelines (no rollback)',
      scalability: 'Vertical instance sizing; Redis Cluster for sharding',
      typicalLatency: 'Sub-millisecond to low single-digit ms (in-VPC RAM access)',
      costModel: 'Provisioned memory size, billed continuously',
      bestFit: 'High-frequency, low-latency reads where brief staleness is acceptable',
    },
    datastore: {
      label: 'Datastore',
      roleInProject: 'Immutable GDPR audit log, Article 30 records of processing',
      dataModel: 'Schemaless NoSQL entity/key-value store',
      consistencyModel: 'Strong for key lookups/ancestor queries; eventual for some index queries',
      durability: 'Persistent, multi-region replicated',
      transactionSupport: 'Entity-group transactions',
      scalability: 'Fully managed automatic horizontal scaling; very high write throughput',
      typicalLatency: 'Tens of ms typical, optimized for high-volume sequential writes',
      costModel: 'Pay-per-operation + storage, no idle cost',
      bestFit: 'High-volume, append-only records rarely queried by arbitrary fields',
    },
  };
}

module.exports = {
  runFullBenchmark,
  getBenchmarkHistory,
  getComparisonMatrix,
};
