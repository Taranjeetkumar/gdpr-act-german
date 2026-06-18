const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { getAdminStats, getAllPendingRequests, getAllUsers, updateRequestStatus } = require('../services/alloydbService');
const { getConsentStats } = require('../services/firestoreService');
const { getCacheInfo } = require('../services/memorystoreService');
const { getAuditStats, getAllAuditLogs } = require('../services/datastoreService');

// GET /api/admin/dashboard - pulls stats from all 4 databases at once
router.get('/dashboard', verifyToken, async (req, res) => {
  try {
    const [alloyStats, consentStats, cacheInfo, auditStats, pendingRequests] = await Promise.all([
      getAdminStats(),          // AlloyDB: user counts, data records, request counts
      getConsentStats(),        // Firestore: consent grant rates per purpose
      getCacheInfo(),           // Memorystore: cache key count, memory usage
      getAuditStats(),          // Datastore: event counts by action type
      getAllPendingRequests(),   // AlloyDB: pending GDPR requests
    ]);

    res.json({
      success: true,
      generatedAt: new Date().toISOString(),
      databases: {
        alloyDB: {
          role: 'Primary relational store, personal data + GDPR requests',
          stats: alloyStats,
        },
        firestore: {
          role: 'Real-time consent preferences',
          stats: consentStats,
        },
        memorystore: {
          role: 'Consent enforcement cache (<1ms gate)',
          stats: cacheInfo,
        },
        datastore: {
          role: 'Immutable GDPR audit log (Article 30)',
          stats: auditStats,
        },
      },
      pendingRequests,
    });
  } catch (err) {
    console.error('[Admin/dashboard] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/users - all users from AlloyDB
router.get('/users', verifyToken, async (req, res) => {
  try {
    const users = await getAllUsers();
    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/audit - recent audit log from Datastore
router.get('/audit', verifyToken, async (req, res) => {
  try {
    const logs = await getAllAuditLogs(100);
    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/requests/:requestId - process a pending GDPR request
router.patch('/requests/:requestId', verifyToken, async (req, res) => {
  const { status } = req.body;
  try {
    const updated = await updateRequestStatus(
      req.params.requestId,
      status,
      req.user.email || req.user.uid
    );
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
