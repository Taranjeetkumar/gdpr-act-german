const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { createUser, getUserByFirebaseUid, addDemoPersonalData } = require('../services/alloydbService');
const { initializeUserConsents } = require('../services/firestoreService');
const { cacheUserSession } = require('../services/memorystoreService');
const { logAuditEvent } = require('../services/datastoreService');


// POST /api/auth/register - called after Firebase Google Sign-In succeeds.
// creates the user in AlloyDB, sets up default Firestore consents, caches the session
router.post('/register', verifyToken, async (req, res) => {
  const { uid, email, name, picture } = req.user;
  try {
    // upsert into AlloyDB
    const user = await createUser(uid, email, name || email.split('@')[0]);

    // set up default consents in Firestore (privacy by default)
    await initializeUserConsents(uid);


    // seed demo personal data, only runs if the user has none yet
    await addDemoPersonalData(user.id);


    // cache the session so we don't hit AlloyDB on every request
    await cacheUserSession(uid, { id: user.id, email, name: user.full_name });


    // log registration to Datastore, Article 13 covers info given at point of collection
    await logAuditEvent({
      userId: uid,
      action: 'USER_REGISTERED',
      resourceType: 'user',
      resourceId: uid,
      performedBy: uid,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: {
        email,
        gdprArticle: 'Article 13, information to be provided at point of data collection',
        lawfulBasis: 'contract',
      },
    });

    res.json({ success: true, data: user });
  } catch (err) {
    console.error('[Auth/register] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me - current user profile from AlloyDB
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await getUserByFirebaseUid(req.user.uid);
    if (!user) return res.status(404).json({ error: 'User not found. Please register first.' });
    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
