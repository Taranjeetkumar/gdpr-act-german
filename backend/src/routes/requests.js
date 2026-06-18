const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const {
  createDataRequest,
  getDataRequestsForUser,
  executeErasureRequest,
  exportUserData,
  updateRequestStatus,
} = require('../services/alloydbService');
const { deleteUserConsents } = require('../services/firestoreService');
const {
  invalidateUserConsentCache,
  invalidateUserSession,
  setDeletionStatus,
  getDeletionStatus,
} = require('../services/memorystoreService');
const { logErasureEvent, logDeletionFromSystem } = require('../services/datastoreService');

// POST /api/requests - submit a new GDPR data rights request
router.post('/', verifyToken, async (req, res) => {
  const { userId, requestType, reason } = req.body;
  if (!userId || !requestType) {
    return res.status(400).json({ error: 'userId and requestType are required' });
  }
  try {
    const request = await createDataRequest(userId, requestType, reason);
    await logErasureEvent(userId, 'requested', req.user.uid, { requestType, reason });
    res.json({ success: true, data: request });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/requests/:userId - all requests for a user
router.get('/:userId', verifyToken, async (req, res) => {
  try {
    const requests = await getDataRequestsForUser(req.params.userId);
    res.json({ success: true, data: requests });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/requests/:userId/deletion-status - poll deletion progress
router.get('/:userId/deletion-status', verifyToken, async (req, res) => {
  try {
    const status = await getDeletionStatus(req.params.userId);
    res.json({ success: true, status: status || 'not_started' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/requests/:requestId/execute-erasure - Article 17 right to erasure.
// Cascades deletion through all 4 databases in order:
// AlloyDB -> Firestore -> Memorystore -> Datastore (audit log kept per Art. 17(3))
router.post('/:requestId/execute-erasure', verifyToken, async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId is required' });

  try {
    await setDeletionStatus(userId, 'processing');

    const summary = {};

    // delete personal data from AlloyDB (cascade), soft-delete the user
    console.log(`[Erasure] Deleting from AlloyDB for user ${userId}`);
    const alloyResult = await executeErasureRequest(userId);
    await logDeletionFromSystem(userId, 'AlloyDB', alloyResult.deletedRecords);
    summary.alloyDB = `${alloyResult.deletedRecords} personal data records deleted (cascade)`;

    // delete consent preferences from Firestore
    console.log(`[Erasure] Deleting consent data from Firestore`);
    await deleteUserConsents(userId);
    await logDeletionFromSystem(userId, 'Firestore', 1);
    summary.firestore = 'Consent preferences deleted';

    // clear out cached data and session in Memorystore
    console.log(`[Erasure] Invalidating Memorystore cache`);
    await invalidateUserConsentCache(userId);
    await invalidateUserSession(userId);
    await logDeletionFromSystem(userId, 'Memorystore', 1);
    summary.memorystore = 'All cached consent flags and session data invalidated';

    // log the erasure itself, but don't delete the audit log - Article
    // 17(3)(b) says erasure doesn't apply where there's a legal obligation
    // to keep records, so the DeletionLog/AuditLog stays as proof of compliance
    console.log(`[Erasure] Logging completion to Datastore`);
    await logErasureEvent(userId, 'completed', req.user.uid, {
      alloyDBRecords: alloyResult.deletedRecords,
      firestoreConsents: 'deleted',
      memorystoreCache: 'invalidated',
      note: 'Audit logs retained in Datastore per Article 17(3)(b), legal obligation exception',
    });
    summary.datastore = 'Audit trail preserved (Article 17(3) legal obligation exception)';

    await updateRequestStatus(req.params.requestId, 'completed', req.user.email || req.user.uid);
    await setDeletionStatus(userId, 'completed');

    res.json({
      success: true,
      message: 'User data erased from all systems in compliance with GDPR Article 17',
      gdprArticle: 'Article 17, right to erasure ("right to be forgotten")',
      summary,
      completedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Erasure] Error during erasure:', err);
    await setDeletionStatus(userId, 'failed').catch(() => {});
    res.status(500).json({ error: err.message });
  }
});

// GET /api/requests/:userId/export - Article 20 right to data portability
router.get('/:userId/export', verifyToken, async (req, res) => {
  try {
    const exportData = await exportUserData(req.params.userId);
    const filename = `gdpr-data-export-${Date.now()}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/json');
    res.json(exportData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
