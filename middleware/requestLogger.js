// Gives every request an ID and logs it (Correlation Identifier pattern, SR-10).
const crypto = require("crypto");

module.exports = function requestLogger(req, res, next) {
  req.id = crypto.randomUUID().slice(0, 8);
  res.setHeader("X-Request-Id", req.id);
  const start = Date.now();
  res.on("finish", () => console.log(`[${req.id}] ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`));
  next();
};
