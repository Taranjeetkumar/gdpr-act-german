const { logAuditEvent } = require('../services/datastoreService');

// Logs API access to Datastore in the background.
// Usage: router.get('/data/:userId', verifyToken, auditLog('DATA_READ', 'personal_data'), handler)
function auditLog(action, resourceType) {
  return async (req, res, next) => {
    const userId = req.params.userId || req.body?.userId || req.user?.uid || 'anonymous';
    const performedBy = req.user?.uid || 'anonymous';

    // don't await this, the audit log shouldn't slow down or block the request
    setImmediate(async () => {
      try {
        await logAuditEvent({
          userId,
          action,
          resourceType,
          resourceId: req.params.id || req.params.userId || req.params.requestId || '',
          performedBy,
          ipAddress: req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || '',
          userAgent: req.headers['user-agent'] || '',
          metadata: {
            method: req.method,
            path: req.path,
            consentVerified: req.consentVerified || null,
            query: req.query,
            gdprArticle: 'Article 30, records of processing activities',
          },
        });
      } catch (err) {
        // worth knowing about, but should never break the actual request
        console.error('[AuditLogger] Non-blocking failure:', err.message);
      }
    });

    next();
  };
}

module.exports = { auditLog };
