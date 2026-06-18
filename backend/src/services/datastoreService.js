const datastore = require('../config/datastore');
const { PropertyFilter } = require('@google-cloud/datastore');

// core audit event logger

async function logAuditEvent({
  userId,
  action,
  resourceType,
  resourceId,
  performedBy,
  ipAddress,
  userAgent,
  metadata = {}
}) {
  const key = datastore.key('AuditLog');
  const entity = {
    key,
    data: [
      { name: 'userId',       value: userId || 'anonymous' },
      { name: 'action',       value: action },
      { name: 'resourceType', value: resourceType || '' },
      { name: 'resourceId',   value: String(resourceId || '') },
      { name: 'performedBy',  value: performedBy || userId || 'anonymous' },
      { name: 'ipAddress',    value: ipAddress || '' },
      { name: 'userAgent',    value: userAgent || '',           excludeFromIndexes: true },
      { name: 'metadata',     value: JSON.stringify(metadata), excludeFromIndexes: true },
      { name: 'timestamp',    value: new Date() },
      { name: 'lawfulBasis',  value: metadata.lawfulBasis || 'legitimate_interest' },
      { name: 'gdprArticle',  value: metadata.gdprArticle  || 'Article 30' },
    ],
  };

  try {
    await datastore.save(entity);
    return key.id;
  } catch (err) {
    // never let an audit log failure block the actual request
    console.error('[Datastore] Audit log write failed:', err.message);
    return null;
  }
}

// specific loggers built on top of logAuditEvent

// log a consent grant or revocation
async function logConsentChange(userId, purpose, oldValue, newValue, ipAddress) {
  return logAuditEvent({
    userId,
    action: newValue ? 'CONSENT_GRANTED' : 'CONSENT_REVOKED',
    resourceType: 'consent',
    resourceId: purpose,
    performedBy: userId,
    ipAddress,
    metadata: {
      purpose,
      oldValue: Boolean(oldValue),
      newValue: Boolean(newValue),
      gdprArticle: 'Article 7, conditions for consent',
      lawfulBasis: 'consent',
    },
  });
}

// log a personal data read
async function logDataAccess(userId, dataType, performedBy, ipAddress, purpose) {
  return logAuditEvent({
    userId,
    action: 'DATA_READ',
    resourceType: 'personal_data',
    resourceId: dataType || 'all',
    performedBy: performedBy || userId,
    ipAddress,
    metadata: {
      dataType,
      purpose: purpose || 'user_request',
      gdprArticle: 'Article 30, records of processing activities',
      lawfulBasis: 'legitimate_interest',
    },
  });
}

// log an Article 17 erasure event
async function logErasureEvent(userId, stage, performedBy, details = {}) {
  return logAuditEvent({
    userId,
    action: stage === 'requested' ? 'ERASURE_REQUESTED' : 'ERASURE_COMPLETED',
    resourceType: 'user',
    resourceId: userId,
    performedBy: performedBy || userId,
    metadata: {
      stage,
      ...details,
      gdprArticle: 'Article 17, right to erasure ("right to be forgotten")',
      lawfulBasis: 'data_subject_rights',
    },
  });
}

// log a deletion from one database during Article 17 execution
async function logDeletionFromSystem(userId, system, recordCount) {
  const key = datastore.key('DeletionLog');
  const entity = {
    key,
    data: [
      { name: 'userId',      value: userId },
      { name: 'system',      value: system },   // 'AlloyDB' | 'Firestore' | 'Memorystore'
      { name: 'recordCount', value: typeof recordCount === 'number' ? recordCount : 0 },
      { name: 'deletedAt',   value: new Date() },
      { name: 'gdprArticle', value: 'Article 17, right to erasure' },
    ],
  };
  try {
    await datastore.save(entity);
  } catch (err) {
    console.error('[Datastore] DeletionLog write failed:', err.message);
  }
}

// query functions

// audit trail for a specific user, used by the DataLineage page. uses
// PropertyFilter since plain object filters are deprecated in the
// Datastore v8 API.
//
// filter(userId) + order(timestamp desc) needs a composite index. if it's
// not deployed yet, falls back to a userId-only query and sorts in memory
// so the page isn't just blank.
// deploy with: gcloud datastore indexes create backend/index.yaml --project=YOUR_PROJECT
// check status: gcloud datastore indexes list --project=YOUR_PROJECT
async function getAuditLogsForUser(userId, limit = 100) {
  // try the composite index query first, fastest and correctly ordered
  try {
    const query = datastore
      .createQuery('AuditLog')
      .filter(new PropertyFilter('userId', '=', userId))
      .order('timestamp', { descending: true })
      .limit(limit);

    const [logs] = await datastore.runQuery(query);
    return logs.map(formatLog);
  } catch (primaryErr) {
    const isMissingIndex =
      primaryErr.code === 9 ||
      /FAILED_PRECONDITION|no matching index/i.test(primaryErr.message);

    if (isMissingIndex) {
      console.warn(
        '[Datastore] Composite index not ready for AuditLog(userId, timestamp). ' +
        'Deploy it with: gcloud datastore indexes create backend/index.yaml\n' +
        'Falling back to in-memory sort, results are correct but a bit slower.'
      );
    } else {
      // something else went wrong, log it but still try the fallback
      console.error('[Datastore] getAuditLogsForUser primary query failed:', primaryErr.message);
    }

    // fallback: filter only, no order, sort on our side. works without a
    // composite index since Datastore auto-indexes every property on its own
    try {
      const fallbackQuery = datastore
        .createQuery('AuditLog')
        .filter(new PropertyFilter('userId', '=', userId))
        .limit(limit);

      const [logs] = await datastore.runQuery(fallbackQuery);

      // newest first
      logs.sort((a, b) => {
        const ta = a.timestamp instanceof Date ? a.timestamp : new Date(a.timestamp || 0);
        const tb = b.timestamp instanceof Date ? b.timestamp : new Date(b.timestamp || 0);
        return tb - ta;
      });

      return logs.map(formatLog);
    } catch (fallbackErr) {
      console.error('[Datastore] getAuditLogsForUser fallback also failed:', fallbackErr.message);
      return [];
    }
  }
}

// all audit logs for the admin view, single-property order so no composite index needed
async function getAllAuditLogs(limit = 200) {
  try {
    const query = datastore
      .createQuery('AuditLog')
      .order('timestamp', { descending: true })
      .limit(limit);
    const [logs] = await datastore.runQuery(query);
    return logs.map(formatLog);
  } catch (err) {
    console.error('[Datastore] getAllAuditLogs error:', err.message);
    return [];
  }
}

// deletion certificate for a user (Article 17 audit trail). same composite
// index situation as getAuditLogsForUser, falls back to sorting in memory
// if the index isn't ready yet.
async function getDeletionLogsForUser(userId) {
  // try the indexed query first
  try {
    const query = datastore
      .createQuery('DeletionLog')
      .filter(new PropertyFilter('userId', '=', userId))
      .order('deletedAt', { descending: true });

    const [logs] = await datastore.runQuery(query);
    return logs.map(formatDeletionLog);
  } catch (primaryErr) {
    const isMissingIndex =
      primaryErr.code === 9 ||
      /FAILED_PRECONDITION|no matching index/i.test(primaryErr.message);

    if (isMissingIndex) {
      console.warn(
        '[Datastore] Composite index not ready for DeletionLog(userId, deletedAt). ' +
        'Deploy it with: gcloud datastore indexes create backend/index.yaml\n' +
        'Falling back to in-memory sort.'
      );
    } else {
      console.error('[Datastore] getDeletionLogsForUser primary query failed:', primaryErr.message);
    }

    // fallback, sort in memory
    try {
      const fallbackQuery = datastore
        .createQuery('DeletionLog')
        .filter(new PropertyFilter('userId', '=', userId));

      const [logs] = await datastore.runQuery(fallbackQuery);

      logs.sort((a, b) => {
        const ta = a.deletedAt instanceof Date ? a.deletedAt : new Date(a.deletedAt || 0);
        const tb = b.deletedAt instanceof Date ? b.deletedAt : new Date(b.deletedAt || 0);
        return tb - ta;
      });

      return logs.map(formatDeletionLog);
    } catch (fallbackErr) {
      console.error('[Datastore] getDeletionLogsForUser fallback also failed:', fallbackErr.message);
      return [];
    }
  }
}

// count audit events by action type, for the admin dashboard stats
async function getAuditStats() {
  try {
    const query = datastore
      .createQuery('AuditLog')
      .order('timestamp', { descending: true })
      .limit(1000);
    const [logs] = await datastore.runQuery(query);
    const stats = { total: logs.length };
    logs.forEach(log => {
      stats[log.action] = (stats[log.action] || 0) + 1;
    });
    return stats;
  } catch (err) {
    console.error('[Datastore] getAuditStats error:', err.message);
    return { total: 0 };
  }
}

// formatters

// format an AuditLog entity for the API response
function formatLog(log) {
  return {
    ...log,
    id:        log[datastore.KEY]?.id || log[datastore.KEY]?.name,
    timestamp: log.timestamp?.toISOString?.() || log.timestamp,
  };
}

// format a DeletionLog entity for the API response
function formatDeletionLog(log) {
  return {
    ...log,
    id:        log[datastore.KEY]?.id || log[datastore.KEY]?.name,
    deletedAt: log.deletedAt?.toISOString?.() || log.deletedAt,
  };
}

module.exports = {
  logAuditEvent,
  logConsentChange,
  logDataAccess,
  logErasureEvent,
  logDeletionFromSystem,
  getAuditLogsForUser,
  getAllAuditLogs,
  getDeletionLogsForUser,
  getAuditStats,
};
