const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLogger');
const { getUserConsents, updateConsent, getConsentHistory } = require('../services/firestoreService');
const { invalidateUserConsentCache, cacheConsent } = require('../services/memorystoreService');
const { logConsentChange } = require('../services/datastoreService');
const { upsertConsentSnapshot } = require('../services/alloydbService');

// GET /api/consent/:userId - all consent preferences, from Firestore
router.get('/:userId', verifyToken, auditLog('CONSENT_READ', 'consent'), async (req, res) => {
  try {
    const consents = await getUserConsents(req.params.userId);
    res.json({ success: true, data: consents });
  } catch (err) {
    console.error('[Consent/GET] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/consent/:userId - update one consent preference.
// touches Firestore (source of truth), Memorystore (enforcement cache) and Datastore (audit log)
router.post('/:userId', verifyToken, async (req, res) => {
  const { purpose, granted } = req.body;
  const userId = req.params.userId;

  if (!purpose || granted === undefined) {
    return res.status(400).json({ error: 'purpose and granted fields are required' });
  }

  try {
    // update Firestore first, it's the source of truth and triggers the
    // real-time listeners
    await updateConsent(userId, purpose, Boolean(granted), req.user.uid);

    // stale cache needs to go right away
    await invalidateUserConsentCache(userId);

    // write the new value back so the next check is instant
    await cacheConsent(userId, purpose, Boolean(granted));

    // immutable audit trail in Datastore
    await logConsentChange(userId, purpose, !granted, Boolean(granted), req.ip);

    // also mirror to AlloyDB. not used for enforcement, Memorystore still owns
    // that, but this lets RealtimeComparison.jsx show that AlloyDB gets the
    // same fact at the same time as Firestore/Memorystore, it just has no way
    // to push that update to an open browser tab. non-blocking on purpose,
    // shouldn't fail the actual consent update if this fails.
    await upsertConsentSnapshot(userId, purpose, Boolean(granted)).catch((err) =>
      console.error('[Consent/POST] AlloyDB snapshot mirror failed (non-blocking):', err.message)
    );

    res.json({
      success: true,
      message: `Consent for '${purpose}' has been ${granted ? 'granted' : 'revoked'}`,
      data: { purpose, granted: Boolean(granted), updatedAt: new Date().toISOString() },
      propagation: {
        firestore: 'Updated (real-time sync active)',
        memorystore: 'Cache invalidated + refreshed',
        datastore: 'Change logged to immutable audit trail',
        alloydb: 'Mirrored to consent_snapshot (pull-only, no push to open clients)',
      }
    });
  } catch (err) {
    console.error('[Consent/POST] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/consent/:userId/history - full consent change history from Firestore
router.get('/:userId/history', verifyToken, async (req, res) => {
  try {
    const history = await getConsentHistory(req.params.userId, 100);
    res.json({ success: true, data: history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
