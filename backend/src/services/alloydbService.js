// AlloyDB (Postgres-compatible) service. Main relational store for personal
// data, with ACID transactions. Handles the Article 17 cascade delete that
// flows through personal_data -> data_requests -> users.

const pool = require('../config/alloydb');

// users

async function createUser(firebaseUid, email, fullName) {
  const result = await pool.query(
    `INSERT INTO users (firebase_uid, email, full_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (firebase_uid) DO UPDATE
       SET email = EXCLUDED.email,
           full_name = COALESCE(EXCLUDED.full_name, users.full_name)
     RETURNING *`,
    [firebaseUid, email, fullName || null]
  );
  return result.rows[0];
}

async function getUserByFirebaseUid(firebaseUid) {
  const result = await pool.query(
    'SELECT * FROM users WHERE firebase_uid = $1 AND deleted_at IS NULL',
    [firebaseUid]
  );
  return result.rows[0] || null;
}

async function getUserById(userId) {
  const result = await pool.query(
    'SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL',
    [userId]
  );
  return result.rows[0] || null;
}

async function getAllUsers() {
  const result = await pool.query(
    `SELECT id, email, full_name, created_at, deleted_at
     FROM users ORDER BY created_at DESC`
  );
  return result.rows;
}

// personal data

async function getPersonalDataForUser(userId) {
  const result = await pool.query(
    `SELECT pd.*, dc.name as category_name, dc.sensitivity_level,
            dc.legal_basis, dc.retention_days, dc.description as category_description
     FROM personal_data pd
     JOIN data_categories dc ON pd.category_id = dc.id
     WHERE pd.user_id = $1 AND pd.is_active = TRUE
     ORDER BY dc.sensitivity_level DESC, pd.collected_at DESC`,
    [userId]
  );
  return result.rows;
}

async function addPersonalDataRecord(userId, categoryId, dataValue, source) {
  const result = await pool.query(
    `INSERT INTO personal_data (user_id, category_id, data_value, source, expires_at)
     SELECT $1, $2, $3, $4,
            NOW() + (dc.retention_days || ' days')::interval
     FROM data_categories dc WHERE dc.id = $2
     RETURNING *`,
    [userId, categoryId, dataValue, source]
  );
  return result.rows[0];
}

async function addDemoPersonalData(userId) {
  // demo data for new users
  const categories = await pool.query('SELECT * FROM data_categories');
  const catMap = {};
  categories.rows.forEach(c => { catMap[c.name] = c.id; });

  const records = [
    { cat: 'Email Address',    value: 'user@example.com',              source: 'registration' },
    { cat: 'Full Name',        value: 'Demo User',                     source: 'registration' },
    { cat: 'IP Address',       value: '192.168.1.1',                   source: 'login' },
    { cat: 'Location Data',    value: 'Frankfurt, Germany (DE)',        source: 'geolocation' },
    { cat: 'Browsing Behavior',value: 'Homepage -> Product -> Checkout', source: 'tracking' },
    { cat: 'Device Information',value: 'Chrome 124 / macOS 14',        source: 'session' },
  ];

  for (const rec of records) {
    if (catMap[rec.cat]) {
      await pool.query(
        `INSERT INTO personal_data (user_id, category_id, data_value, source, expires_at)
         SELECT $1, $2, $3, $4, NOW() + (dc.retention_days || ' days')::interval
         FROM data_categories dc WHERE dc.id = $2`,
        [userId, catMap[rec.cat], rec.value, rec.source]
      ).catch(() => {}); // ignore duplicates
    }
  }
}

// data categories

async function getAllDataCategories() {
  const result = await pool.query(
    'SELECT * FROM data_categories ORDER BY sensitivity_level DESC, name ASC'
  );
  return result.rows;
}

async function getProcessingPurposes() {
  const result = await pool.query(
    'SELECT * FROM processing_purposes ORDER BY requires_consent DESC, name ASC'
  );
  return result.rows;
}

// data requests

async function createDataRequest(userId, requestType, reason) {
  const result = await pool.query(
    `INSERT INTO data_requests (user_id, request_type, reason)
     VALUES ($1, $2, $3) RETURNING *`,
    [userId, requestType, reason || null]
  );
  return result.rows[0];
}

async function getDataRequestsForUser(userId) {
  const result = await pool.query(
    `SELECT * FROM data_requests WHERE user_id = $1 ORDER BY requested_at DESC`,
    [userId]
  );
  return result.rows;
}

async function getAllPendingRequests() {
  const result = await pool.query(
    `SELECT dr.*, u.email, u.full_name
     FROM data_requests dr
     JOIN users u ON dr.user_id = u.id
     WHERE dr.status = 'pending'
     ORDER BY dr.requested_at ASC`
  );
  return result.rows;
}

async function updateRequestStatus(requestId, status, adminEmail) {
  const result = await pool.query(
    `UPDATE data_requests
     SET status = $1, completed_at = NOW(), completed_by = $2
     WHERE id = $3 RETURNING *`,
    [status, adminEmail || 'system', requestId]
  );
  return result.rows[0];
}

// Article 17, right to erasure. Cascade delete through AlloyDB.
// personal_data and data_requests cascade via FK ON DELETE CASCADE.
// runs as one transaction so it's all-or-nothing.

async function executeErasureRequest(userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // count then delete personal data records
    const countResult = await client.query(
      'SELECT COUNT(*) FROM personal_data WHERE user_id = $1',
      [userId]
    );
    const deletedData = await client.query(
      'DELETE FROM personal_data WHERE user_id = $1 RETURNING id',
      [userId]
    );

    // mark pending data requests as completed
    await client.query(
      `UPDATE data_requests
       SET status = 'completed', completed_at = NOW(), completed_by = 'GDPR_ERASURE'
       WHERE user_id = $1 AND status = 'pending'`,
      [userId]
    );

    // anonymize the user record instead of deleting it, keeps the audit trail intact
    await client.query(
      `UPDATE users SET
         email = 'deleted_' || id || '@erased.gdpr',
         full_name = '[ERASED]',
         deleted_at = NOW()
       WHERE id = $1`,
      [userId]
    );

    await client.query('COMMIT');
    return { deletedRecords: deletedData.rowCount };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// data export, Article 20 right to portability

async function exportUserData(userId) {
  const user = await getUserById(userId);
  if (!user) throw new Error('User not found');

  const personalData = await getPersonalDataForUser(userId);
  const requests = await getDataRequestsForUser(userId);
  const categories = await getAllDataCategories();
  const purposes = await getProcessingPurposes();

  return {
    exportedAt: new Date().toISOString(),
    gdprArticle: 'Article 20, right to data portability',
    exportFormat: 'JSON',
    dataController: {
      name: 'GDPR Tracker Demo Company',
      email: 'dpo@gdpr-tracker.example.com',
      address: 'Frankfurt am Main, Germany'
    },
    dataSubject: {
      email: user.email,
      name: user.full_name,
      registeredAt: user.created_at
    },
    personalData: personalData.map(pd => ({
      category: pd.category_name,
      value: pd.data_value,
      source: pd.source,
      collectedAt: pd.collected_at,
      expiresAt: pd.expires_at,
      sensitivityLevel: pd.sensitivity_level,
      legalBasis: pd.legal_basis
    })),
    gdprRequests: requests,
    processingPurposes: purposes,
  };
}

// consent snapshot, used for the real-time vs pull-based comparison demo.
// check initSchema.js for why this table exists and why it's keyed by Firebase
// UID instead of users.id. consent.js writes here in the same request that
// updates Firestore and Memorystore, so all three are equally current, the
// realtime.js endpoints just differ in how a client finds out.

async function upsertConsentSnapshot(firebaseUid, purpose, granted) {
  const result = await pool.query(
    `INSERT INTO consent_snapshot (user_id, purpose, granted, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id, purpose) DO UPDATE
       SET granted = EXCLUDED.granted, updated_at = NOW()
     RETURNING *`,
    [firebaseUid, purpose, granted]
  );
  return result.rows[0];
}

async function getConsentSnapshot(firebaseUid, purpose) {
  const result = await pool.query(
    'SELECT granted, updated_at FROM consent_snapshot WHERE user_id = $1 AND purpose = $2',
    [firebaseUid, purpose]
  );
  return result.rows[0] || null;
}

// admin stats

async function getAdminStats() {
  const result = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL)::int AS total_users,
      (SELECT COUNT(*) FROM personal_data WHERE is_active = TRUE)::int AS active_data_records,
      (SELECT COUNT(*) FROM data_requests WHERE status = 'pending')::int AS pending_requests,
      (SELECT COUNT(*) FROM data_requests WHERE request_type = 'erasure')::int AS erasure_requests,
      (SELECT COUNT(*) FROM data_requests WHERE status = 'completed')::int AS completed_requests,
      (SELECT COUNT(*) FROM data_categories)::int AS data_categories,
      (SELECT COUNT(*) FROM processing_purposes)::int AS processing_purposes
  `);
  return result.rows[0];
}

async function getDataRecordStats() {
  const result = await pool.query(`
    SELECT dc.name, dc.sensitivity_level, COUNT(pd.id)::int as record_count
    FROM data_categories dc
    LEFT JOIN personal_data pd ON dc.id = pd.category_id AND pd.is_active = TRUE
    GROUP BY dc.id, dc.name, dc.sensitivity_level
    ORDER BY record_count DESC
  `);
  return result.rows;
}

module.exports = {
  createUser,
  getUserByFirebaseUid,
  getUserById,
  getAllUsers,
  getPersonalDataForUser,
  addPersonalDataRecord,
  addDemoPersonalData,
  getAllDataCategories,
  getProcessingPurposes,
  createDataRequest,
  getDataRequestsForUser,
  getAllPendingRequests,
  updateRequestStatus,
  executeErasureRequest,
  exportUserData,
  getAdminStats,
  getDataRecordStats,
  upsertConsentSnapshot,
  getConsentSnapshot,
};
