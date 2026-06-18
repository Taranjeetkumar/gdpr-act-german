// AlloyDB schema init. Run once with `node scripts/initSchema.js`, or it
// gets called automatically by server.js on startup. Creates the tables
// and seeds default data categories + processing purposes.

const pool = require('../src/config/alloydb');

async function initSchema() {
  console.log('[initSchema] Connecting to AlloyDB...');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // users table. firebase_uid links this to Firebase Auth. deleted_at is
    // for soft delete (anonymize first, hard delete only if legally required)
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        firebase_uid TEXT UNIQUE NOT NULL,
        email TEXT NOT NULL,
        full_name TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        deleted_at TIMESTAMPTZ DEFAULT NULL
      );
    `);

    // data categories, the types of personal data the company collects.
    // sensitivity_level drives the UI color-coding and processing restrictions
    await client.query(`
      CREATE TABLE IF NOT EXISTS data_categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        description TEXT,
        sensitivity_level TEXT CHECK (sensitivity_level IN ('low','medium','high','special')) DEFAULT 'medium',
        legal_basis TEXT NOT NULL,
        retention_days INTEGER NOT NULL DEFAULT 365
      );
    `);

    // the actual personal data held about each user. ON DELETE CASCADE means
    // deleting a user automatically deletes all their personal data too,
    // that's the Article 17 cascade that makes right-to-erasure atomic
    await client.query(`
      CREATE TABLE IF NOT EXISTS personal_data (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        category_id UUID REFERENCES data_categories(id),
        data_value TEXT NOT NULL,
        source TEXT NOT NULL,
        collected_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ,
        is_active BOOLEAN DEFAULT TRUE
      );
    `);

    // legal bases for processing, maps to the Firestore consent toggles
    await client.query(`
      CREATE TABLE IF NOT EXISTS processing_purposes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        requires_consent BOOLEAN DEFAULT TRUE,
        legal_basis TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // GDPR Articles 15-22 requests: erasure, portability, rectification, restriction.
    // also cascades on user delete, so request history goes with the user
    await client.query(`
      CREATE TABLE IF NOT EXISTS data_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        request_type TEXT CHECK (request_type IN ('erasure','portability','rectification','restriction')) NOT NULL,
        status TEXT CHECK (status IN ('pending','processing','completed','rejected')) DEFAULT 'pending',
        reason TEXT,
        requested_at TIMESTAMPTZ DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        completed_by TEXT
      );
    `);

    // stores the latency/throughput results from each benchmark run (see
    // benchmarkService.js), so the dashboard can chart trends over time
    // instead of just showing the most recent run
    await client.query(`
      CREATE TABLE IF NOT EXISTS benchmark_runs (
        id UUID PRIMARY KEY,
        ran_at TIMESTAMPTZ DEFAULT NOW(),
        payload JSONB NOT NULL
      );
    `);

    // used for the real-time-vs-pull-based comparison demo (realtime.js /
    // RealtimeComparison.jsx). mirrors the exact same consent fact that
    // Firestore (source of truth) and Memorystore (cache) hold for a user,
    // written by the same POST /api/consent request at the same time. that
    // way the live-comparison page can show the databases differ in how a
    // change reaches the browser, not in whether or when the value itself
    // changes. keyed by Firebase UID instead of users.id on purpose, since
    // that's the identity Firestore/Memorystore already use for this fact
    // (see consent.js), so this just mirrors them instead of adding a second ID.
    await client.query(`
      CREATE TABLE IF NOT EXISTS consent_snapshot (
        user_id TEXT NOT NULL,
        purpose TEXT NOT NULL,
        granted BOOLEAN NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (user_id, purpose)
      );
    `);

    await client.query('COMMIT');
    console.log('[initSchema] Tables created successfully');

    // seed data categories
    await pool.query(`
      INSERT INTO data_categories (name, description, sensitivity_level, legal_basis, retention_days) VALUES
        ('Email Address',     'Primary contact email used for account and communication', 'medium', 'contract',            730),
        ('Full Name',         'User''s full legal name as provided at registration',      'low',    'contract',            730),
        ('IP Address',        'Login and session IP addresses for security purposes',      'medium', 'legitimate_interest',  90),
        ('Location Data',     'Approximate geolocation derived from IP address',           'high',   'consent',              30),
        ('Purchase History',  'Records of all transactions and purchases made',            'medium', 'contract',           2555),
        ('Browsing Behavior', 'Pages visited, links clicked, time spent on pages',         'high',   'consent',              90),
        ('Device Information','Browser type, OS, device type for compatibility',           'low',    'legitimate_interest',  365)
      ON CONFLICT DO NOTHING;
    `);

    // seed processing purposes
    await pool.query(`
      INSERT INTO processing_purposes (name, description, requires_consent, legal_basis) VALUES
        ('marketing_emails',    'Send promotional emails, newsletters, and product updates',   TRUE,  'consent'),
        ('analytics',           'Analyze usage patterns and behavior to improve the service',  TRUE,  'consent'),
        ('personalization',     'Personalize content, recommendations, and user experience',   TRUE,  'consent'),
        ('third_party_sharing', 'Share anonymized data with trusted advertising partners',     TRUE,  'consent'),
        ('functional',          'Essential session management, authentication, and core UX',   FALSE, 'legitimate_interest'),
        ('security',            'Fraud detection, rate limiting, and account security',        FALSE, 'legitimate_interest')
      ON CONFLICT DO NOTHING;
    `);

    console.log('[initSchema] Seed data inserted successfully');
    console.log('[initSchema] AlloyDB schema initialization complete');

  } catch (err) {
    await client.query('ROLLBACK').catch(() => { });
    console.error('[initSchema] Error:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { initSchema };

// Allow running directly: node scripts/initSchema.js
if (require.main === module) {
  initSchema()
    .then(() => { console.log('Done.'); process.exit(0); })
    .catch((err) => { console.error(err); process.exit(1); });
}
