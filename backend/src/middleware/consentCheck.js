// Consent check middleware. Runs on every API call that touches personal
// data. Checks Redis first, falls back to Firestore on a cache miss, and
// denies access by default if anything goes wrong (Article 25, privacy
// by default).

const { checkConsentCache, populateConsentCache } = require('../services/memorystoreService');
const { getUserConsents } = require('../services/firestoreService');

// Returns middleware that checks if the user has given consent for a
// given purpose, e.g. router.get('/analytics-data', checkConsent('analytics'), handler)
// Order: Memorystore cache (fast) -> Firestore on a miss -> deny if anything errors.
function checkConsent(purpose) {
  return async (req, res, next) => {
    const userId = req.params.userId || req.user?.uid;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthenticated, cannot verify consent' });
    }

    try {
      // check cache first
      let consentValue = await checkConsentCache(userId, purpose);
      let cacheHit = consentValue !== null;

      if (consentValue === null) {
        // cache miss, fall back to Firestore and warm the cache for next time
        console.log(`[ConsentCheck] Cache miss for ${userId}:${purpose}, reading Firestore`);
        const consentsData = await getUserConsents(userId);

        await populateConsentCache(userId, consentsData);

        const purposeData = consentsData?.consents?.[purpose];
        consentValue = purposeData?.granted ? 'granted' : 'denied';
      }

      if (consentValue !== 'granted') {
        return res.status(403).json({
          error: 'Consent not granted',
          purpose,
          cacheHit,
          message: `You have not granted consent for: ${purpose}. Visit Consent Preferences to enable this feature.`,
          gdprReference: 'Article 6(1)(a), consent as legal basis for processing',
          consentPageUrl: '/consent',
        });
      }

      req.consentVerified = purpose;
      req.consentCacheHit = cacheHit;
      next();

    } catch (err) {
      console.error('[ConsentCheck] Error during consent verification:', err.message);
      // fail closed - if we can't verify consent, don't assume it was given
      return res.status(403).json({
        error: 'Consent verification failed',
        message: 'Access denied by default, could not verify consent status.',
        gdprReference: 'Article 25(2), data protection by default',
      });
    }
  };
}

module.exports = { checkConsent };
