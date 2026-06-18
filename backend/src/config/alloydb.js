const { Pool } = require('pg');

// AlloyDB allows an optional public IP (unlike Memorystore which is
// VPC-private only), so ALLOYDB_HOST works the same whether this is
// running locally or deployed, as long as your IP is in AlloyDB's
// authorized networks.
if (!process.env.ALLOYDB_HOST || !process.env.ALLOYDB_PASSWORD) {
  console.warn(
    '[AlloyDB] ALLOYDB_HOST or ALLOYDB_PASSWORD missing from .env. ' +
    'Not using a hardcoded fallback here on purpose since that would leak ' +
    'credentials if this repo is ever pushed somewhere public. Set both in backend/.env.'
  );
}

const pool = new Pool({
  host: process.env.ALLOYDB_HOST,
  port: 5432,
  database: process.env.ALLOYDB_DB || 'gdprdb',
  user: process.env.ALLOYDB_USER || 'postgres',
  password: process.env.ALLOYDB_PASSWORD,
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('[AlloyDB] Pool error:', err);
});

pool.on('connect', () => {
  console.log('[AlloyDB] New client connected');
});

module.exports = pool;
