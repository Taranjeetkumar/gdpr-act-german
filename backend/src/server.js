require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');

const authRoutes      = require('./routes/auth');
const consentRoutes   = require('./routes/consent');
const dataRoutes      = require('./routes/personalData');
const requestRoutes   = require('./routes/requests');
const auditRoutes     = require('./routes/audit');
const adminRoutes     = require('./routes/admin');
const benchmarkRoutes = require('./routes/benchmark');
const realtimeRoutes  = require('./routes/realtime');

const { initSchema }   = require('../scripts/initSchema');
const { connectRedis } = require('./config/memorystore');

const app = express();

// ─── Security middleware ──────────────────────────────────────────────────────
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false,
}));

const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5173',
];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) cb(null, true);
    else cb(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Request logger ───────────────────────────────────────────────────────────
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/consent',   consentRoutes);
app.use('/api/data',      dataRoutes);
app.use('/api/requests',  requestRoutes);
app.use('/api/audit',     auditRoutes);
app.use('/api/admin',     adminRoutes);
app.use('/api/benchmark', benchmarkRoutes);
app.use('/api/realtime',  realtimeRoutes);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'GDPR Consent & Data Lineage Tracker',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    region: 'europe-west3 (Frankfurt, EU data residency)',
    databases: {
      alloyDB: {
        role: 'Primary relational store, personal user data + cascade delete',
        gdprArticles: ['Article 17 (erasure cascade)', 'Article 20 (portability export)'],
        tables: ['users', 'personal_data', 'data_categories', 'processing_purposes', 'data_requests'],
      },
      firestore: {
        role: 'Real-time consent preferences, pushes to all active sessions',
        gdprArticles: ['Article 6 (lawful basis)', 'Article 7 (consent conditions)'],
        collections: ['consents/{userId}', 'consents/{userId}/history'],
      },
      memorystore: {
        role: 'Consent enforcement gate (<1ms Redis check on every API call)',
        gdprArticles: ['Article 6(1)(a) (consent enforcement)', 'Article 25 (privacy by default)'],
        keyPattern: 'consent:{userId}:{purpose}',
        ttlMinutes: 5,
      },
      datastore: {
        role: 'Immutable GDPR audit log, Article 30 records of processing',
        gdprArticles: ['Article 30 (records of processing)', 'Article 17(3) (legal exception)'],
        kinds: ['AuditLog', 'DeletionLog'],
      },
    },
    timestamp: new Date().toISOString(),
  });
});

// ─── 404 / error handlers ─────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

app.use((err, req, res, _next) => {
  console.error('[Server] Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Startup ──────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '8080', 10);

async function start() {
  // 1. Connect Redis first — non-fatal, app works without it
  await connectRedis();

  // 2. AlloyDB schema bootstrap — also non-fatal for dev
  try {
    await initSchema();
    console.log('[Server] AlloyDB schema ready');
  } catch (err) {
    console.warn('[Server] AlloyDB schema init failed (continuing without it):', err.message);
  }

  // 3. Start listening
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\nGDPR Tracker Backend running on port ${PORT}`);
    console.log(`  Env:    ${process.env.NODE_ENV || 'development'}`);
    console.log(`  Health: http://localhost:${PORT}/health`);
    console.log(`  Region: europe-west3 (Frankfurt)\n`);
  });
}

start();
