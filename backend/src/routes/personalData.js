const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { checkConsent } = require('../middleware/consentCheck');
const { auditLog } = require('../middleware/auditLogger');
const {
  getPersonalDataForUser,
  addPersonalDataRecord,
  getAllDataCategories,
  getProcessingPurposes,
  getDataRecordStats,
} = require('../services/alloydbService');

// GET /api/data/categories/all - data categories list, browsing this needs no consent
router.get('/categories/all', verifyToken, async (req, res) => {
  try {
    const categories = await getAllDataCategories();
    res.json({ success: true, data: categories });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/data/purposes/all - all processing purposes
router.get('/purposes/all', verifyToken, async (req, res) => {
  try {
    const purposes = await getProcessingPurposes();
    res.json({ success: true, data: purposes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/data/stats - aggregate stats across all categories
router.get('/stats', verifyToken, async (req, res) => {
  try {
    const stats = await getDataRecordStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/data/:userId - all personal data stored for this user.
// auditLog middleware logs this to Datastore (Article 30)
router.get('/:userId',
  verifyToken,
  auditLog('DATA_READ', 'personal_data'),
  async (req, res) => {
    try {
      const data = await getPersonalDataForUser(req.params.userId);
      res.json({ success: true, data, count: data.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// POST /api/data/:userId - add a personal data record.
// needs functional consent at minimum, analytics-type data needs analytics consent too
router.post('/:userId',
  verifyToken,
  checkConsent('functional'),
  auditLog('DATA_WRITE', 'personal_data'),
  async (req, res) => {
    const { categoryId, dataValue, source } = req.body;
    if (!categoryId || !dataValue || !source) {
      return res.status(400).json({ error: 'categoryId, dataValue, and source are required' });
    }
    try {
      const record = await addPersonalDataRecord(req.params.userId, categoryId, dataValue, source);
      res.json({ success: true, data: record });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;
