// Request logging and traceability (Correlation Identifier pattern).
//  - every request gets an id; if the caller already sent X-Request-Id we keep it so a trace can span systems
//  - the id is returned in the X-Request-Id header and inside every error body
//  - every outgoing API call made while serving the request is logged against the same id (see lib/http.js)
//  - on completion one record is written: method, path, status, duration, user, and the upstream calls
const crypto = require("crypto");
const ctx = require("../lib/context");
const logger = require("../lib/logger");

module.exports = function requestLogger(req, res, next) {
  const incoming = String(req.headers["x-request-id"] || "");
  req.id = /^[\w.-]{6,64}$/.test(incoming) ? incoming : crypto.randomUUID().slice(0, 8);
  res.setHeader("X-Request-Id", req.id);
  const started = Date.now(), context = { id: req.id, upstream: [] };

  res.on("finish", () => {
    logger.request({
      ts: new Date().toISOString(), requestId: req.id, method: req.method,
      path: req.originalUrl.split("#")[0], status: res.statusCode, ms: Date.now() - started,
      userId: req.user?.id || null, ip: req.ip, upstream: context.upstream
    });
  });
  ctx.run(context, next);
};
