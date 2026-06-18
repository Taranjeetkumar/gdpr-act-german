const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

if (!admin.apps.length) {
  const config = {
    projectId: process.env.GCP_PROJECT_ID,
    databaseId: '(default)'
  };

  // __dirname is src/middleware — go up 2 levels to reach the backend root
  const localKeyPath = path.join(__dirname, '..', '..', 'service-account.json');
  if (fs.existsSync(localKeyPath)) {
    config.credential = admin.credential.cert(localKeyPath);
    console.log('[Auth] Firebase Admin SDK initialized via local Service Account File (Admin Privileges Enabled)');
  } else {
    config.credential = admin.credential.applicationDefault();
    console.log('[Auth] Firebase Admin SDK initialized via Application Default Credentials (ADC)');
  }

  if (config.projectId) {
    process.env.GOOGLE_CLOUD_PROJECT = config.projectId;
    process.env.FIRESTORE_PROJECT_ID = config.projectId;
  }

  admin.initializeApp(config);
}

async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Missing or invalid authorization header',
      hint: 'Include: Authorization: Bearer <firebase-id-token>',
    });
  }

  const token = authHeader.split('Bearer ')[1];

  // ── Admin secret token bypass (no Firebase account needed) ──────────────
  const adminSecret = process.env.ADMIN_SECRET_TOKEN;
  if (adminSecret && token === adminSecret) {
    req.user = {
      uid:   'admin-local',
      email: 'admin@gdprtracker.com',
      name:  'Administrator',
      admin: true,
    };
    return next();
  }
  // ────────────────────────────────────────────────────────────────────────

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    console.error('[Auth] Token verification failed:', err.code);
    return res.status(401).json({
      error: 'Invalid or expired token',
      code: err.code,
    });
  }
}

// attaches the user if a token is present, but doesn't block the request if not
async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const token = authHeader.split('Bearer ')[1];
      const adminSecret = process.env.ADMIN_SECRET_TOKEN;
      if (adminSecret && token === adminSecret) {
        req.user = { uid: 'admin-local', email: 'admin@gdprtracker.com', admin: true };
      } else {
        req.user = await admin.auth().verifyIdToken(token);
      }
    } catch (err) {}
  }
  next();
}

module.exports = { verifyToken, optionalAuth };
