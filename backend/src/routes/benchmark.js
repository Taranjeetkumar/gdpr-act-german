const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const {
  runFullBenchmark,
  getBenchmarkHistory,
  getComparisonMatrix,
} = require('../services/benchmarkService');

// POST /api/benchmark/run - runs the benchmark suite (sequential latency,
// concurrent throughput, cache-aside effect) against all 4 live databases
// and saves the result so it shows up in the trend chart later.
// query params: ?sampleSize=25&concurrency=10
router.post('/run', verifyToken, async (req, res) => {
  try {
    const result = await runFullBenchmark({
      sampleSize: req.query.sampleSize,
      concurrency: req.query.concurrency,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/benchmark/history - past runs, for the trend chart
router.get('/history', verifyToken, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const history = await getBenchmarkHistory(limit);
    res.json({ success: true, data: history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/benchmark/matrix - the static qualitative comparison table
// (architecture, consistency model, durability etc). this is documented
// design info, not something we measured
router.get('/matrix', verifyToken, (req, res) => {
  res.json({ success: true, data: getComparisonMatrix() });
});

module.exports = router;
