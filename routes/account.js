// Traceability for the user: their own recent requests with the request id, so "what happened?" can be answered.
const express = require("express");
const logger = require("../lib/logger");
const { requireAuth } = require("../middleware/auth");
const router = express.Router();

router.use(requireAuth);

router.get("/activity", (req, res) => {
  const data = logger.recent({ userId: req.user.id, limit: 40 }).map(r => ({
    requestId: r.requestId, at: r.ts, method: r.method, path: r.path, status: r.status, ms: r.ms,
    upstream: r.upstream.map(u => ({ service: u.service, outcome: u.outcome, ms: u.ms }))
  }));
  res.json({ count: data.length, data });
});

module.exports = router;
