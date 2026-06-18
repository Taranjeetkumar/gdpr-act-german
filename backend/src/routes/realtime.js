const express = require('express');const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const firestoreDb = require('../config/firestore');
const { getOrRefreshDemoCache } = require('../services/memorystoreService');
const { getConsentSnapshot } = require('../services/alloydbService');

const DEFAULT_DEMO_TTL_SECONDS = 15;
const MAX_DEMO_TTL_SECONDS = 60;

// GET /api/realtime/consent/:userId/stream
router.get('/consent/:userId/stream', verifyToken, (req, res) => {
  const { userId } = req.params;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // stop reverse proxies from buffering the stream
  });
  res.write(':ok\n\n'); // flush headers right away so the client doesn't wait for the first event

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const unsubscribe = firestoreDb.collection('consents').doc(userId).onSnapshot(
    (snap) => {
      const data = snap.exists ? snap.data() : null;
      send('update', {
        receivedAt: Date.now(),
        exists: snap.exists,
        consents: data?.consents || {},
      });
    },
    (err) => send('error', { message: err.message })
  );

  // stop proxies/load balancers from closing this as an idle connection
  const heartbeat = setInterval(() => res.write(':heartbeat\n\n'), 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

// GET /api/realtime/consent/:userId/:purpose/cache?ttl=15
// same cache-aside pattern as consentCheck.js, but with a short adjustable
// TTL so you can actually see the staleness window instead of waiting 5 minutes.
router.get('/consent/:userId/:purpose/cache', verifyToken, async (req, res) => {
  const { userId, purpose } = req.params;
  const ttlSeconds = Math.min(
    Math.max(parseInt(req.query.ttl) || DEFAULT_DEMO_TTL_SECONDS, 2),
    MAX_DEMO_TTL_SECONDS
  );

  try {
    const result = await getOrRefreshDemoCache(userId, purpose, ttlSeconds, async () => {
      const snap = await firestoreDb.collection('consents').doc(userId).get();
      return Boolean(snap.data()?.consents?.[purpose]?.granted);
    });
    res.json({ success: true, data: { ...result, ttlSeconds } });
  } catch (err) {
    // usually MEMORYSTORE_HOST is a private VPC IP that this backend can't
    // reach from wherever it's actually running. separate error shape so
    // the frontend shows "cache unreachable" instead of treating a missing
    // value as "revoked"
    console.error('[Realtime] Memorystore demo cache failed:', err.message);
    res.status(503).json({
      error: 'Memorystore unreachable',
      message: 'Could not reach Redis for the cache demo. Check MEMORYSTORE_HOST/PORT and that this backend can route to it.',
      detail: err.message,
    });
  }
});

// GET /api/realtime/consent/:userId/:purpose/alloydb
// plain uncached SELECT against consent_snapshot. the value is just as
// current as Firestore's, since consent.js writes both at the same time,
// but nothing pushes this to the browser. frontend only calls this when
// someone clicks Refresh, which is the point being demonstrated here.
router.get('/consent/:userId/:purpose/alloydb', verifyToken, async (req, res) => {
  try {
    const snapshot = await getConsentSnapshot(req.params.userId, req.params.purpose);
    res.json({ success: true, data: snapshot });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
