const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const {
  getAuditLogsForUser,
  getDeletionLogsForUser,
  getAllAuditLogs,
  getAuditStats,
} = require('../services/datastoreService');

// GET /api/audit/admin/all - all audit events across all users, for the admin view.
// has to come before /:userId or express will match that route instead
router.get('/admin/all', verifyToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 200;
    const [logs, stats] = await Promise.all([
      getAllAuditLogs(limit),
      getAuditStats(),
    ]);
    res.json({ success: true, data: logs, stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/audit/:userId - audit trail for a specific user (DataLineage page)
router.get('/:userId', verifyToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const logs = await getAuditLogsForUser(req.params.userId, limit);
    res.json({ success: true, data: logs, count: logs.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/audit/:userId/deletions - erasure audit trail (Article 17 certificate)
router.get('/:userId/deletions', verifyToken, async (req, res) => {
  try {
    const logs = await getDeletionLogsForUser(req.params.userId);
    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
