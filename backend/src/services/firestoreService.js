

const db = require('../config/firestore');
const { FieldValue } = require('@google-cloud/firestore');

// default consent state for new users, privacy by default (Article 25)
const DEFAULT_CONSENTS = {
  marketing_emails: {
    granted: false,
    label: 'Marketing Emails',
    description: 'Promotional emails and newsletters',
    required: false,
    legalBasis: 'consent',
    gdprArticle: 'Article 6(1)(a)'
  },
  analytics: {
    granted: false,
    label: 'Analytics Tracking',
    description: 'Usage analysis to improve the service',
    required: false,
    legalBasis: 'consent',
    gdprArticle: 'Article 6(1)(a)'
  },
  personalization: {
    granted: false,
    label: 'Personalization',
    description: 'Tailored content and recommendations',
    required: false,
    legalBasis: 'consent',
    gdprArticle: 'Article 6(1)(a)'
  },
  third_party_sharing: {
    granted: false,
    label: 'Third-Party Sharing',
    description: 'Sharing data with trusted partners',
    required: false,
    legalBasis: 'consent',
    gdprArticle: 'Article 6(1)(a)'
  },
  functional: {
    granted: true,
    label: 'Functional (Essential)',
    description: 'Session management and core features',
    required: true,
    legalBasis: 'legitimate_interest',
    gdprArticle: 'Article 6(1)(f)'
  },
  security: {
    granted: true,
    label: 'Security Monitoring',
    description: 'Fraud detection and account security',
    required: true,
    legalBasis: 'legitimate_interest',
    gdprArticle: 'Article 6(1)(f)'
  },
};

// sets up the consent doc for a new user, called at registration
async function initializeUserConsents(userId) {
  const ref = db.collection('consents').doc(userId);
  const existing = await ref.get();
  if (!existing.exists) {
    await ref.set({
      userId,
      consents: DEFAULT_CONSENTS,
      lastUpdated: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      version: 1,
      // GDPR Article 13: Record when consent was first collected
      consentCollectedAt: FieldValue.serverTimestamp(),
    });
    console.log(`[Firestore] Initialized consent document for user: ${userId}`);
  }
  const snap = await ref.get();
  return snap.data();
}

// gets all consents for a user, sets defaults if there's nothing yet
async function getUserConsents(userId) {
  const ref = db.collection('consents').doc(userId);
  const snap = await ref.get();
  if (!snap.exists) {
    return await initializeUserConsents(userId);
  }
  return snap.data();
}

// updates one consent purpose, the actual toggle.
// Article 7 says withdrawing consent has to be as easy as giving it
async function updateConsent(userId, purpose, granted, changedBy) {
  const ref = db.collection('consents').doc(userId);

  // Ensure document exists first
  const snap = await ref.get();
  if (!snap.exists) await initializeUserConsents(userId);

  // Update the specific consent flag in Firestore
  await ref.update({
    [`consents.${purpose}.granted`]: granted,
    [`consents.${purpose}.updatedAt`]: FieldValue.serverTimestamp(),
    [`consents.${purpose}.lastChangedBy`]: changedBy || userId,
    lastUpdated: FieldValue.serverTimestamp(),
  });

  // Append to history subcollection (immutable record of consent changes)
  await ref.collection('history').add({
    purpose,
    previousValue: !granted,
    newValue: granted,
    changedAt: FieldValue.serverTimestamp(),
    changedBy: changedBy || userId,
    action: granted ? 'CONSENT_GRANTED' : 'CONSENT_REVOKED',
    // Article 7(1): Record of consent must be kept
    gdprArticle: 'Article 7, conditions for consent',
    ipAddressHash: 'hashed_for_privacy', // In production, hash the IP
  });

  return { purpose, granted, updatedAt: new Date().toISOString() };
}

// full consent change history, for accountability
async function getConsentHistory(userId, limit = 50) {
  try {
    const snap = await db.collection('consents').doc(userId)
      .collection('history')
      .orderBy('changedAt', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        changedAt: data.changedAt?.toDate?.()?.toISOString() || null,
      };
    });
  } catch (err) {
    console.error('[Firestore] getConsentHistory error:', err.message);
    return [];
  }
}

// deletes all consent data for a user, called during Article 17 erasure.
// only deletes from Firestore, the Datastore audit log stays
async function deleteUserConsents(userId) {
  const ref = db.collection('consents').doc(userId);

  // Must delete subcollection docs first (Firestore does not cascade-delete subcollections)
  const historySnap = await ref.collection('history').get();
  if (historySnap.size > 0) {
    const batch = db.batch();
    historySnap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  }

  // Delete the main consent document
  await ref.delete();
  console.log(`[Firestore] Deleted consent data for user: ${userId}`);
}

// aggregate consent stats for the admin dashboard, scans all user docs
async function getConsentStats() {
  const snap = await db.collection('consents').get();
  const stats = {};
  const purposes = Object.keys(DEFAULT_CONSENTS);

  purposes.forEach(p => { stats[p] = { granted: 0, denied: 0, total: 0, label: DEFAULT_CONSENTS[p].label }; });

  snap.forEach(doc => {
    const data = doc.data();
    purposes.forEach(p => {
      if (data.consents?.[p] !== undefined) {
        stats[p].total++;
        if (data.consents[p].granted) stats[p].granted++;
        else stats[p].denied++;
      }
    });
  });

  return stats;
}

module.exports = {
  DEFAULT_CONSENTS,
  initializeUserConsents,
  getUserConsents,
  updateConsent,
  getConsentHistory,
  deleteUserConsents,
  getConsentStats,
};
