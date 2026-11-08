require("dotenv").config();
const express = require("express");
const path = require("path");
const { httpError } = require("./lib/errors");
const logger = require("./lib/logger");
const http = require("./lib/http");
const store = require("./lib/store");
const requestLogger = require("./middleware/requestLogger");

function createApp() {
  const app = express();
  app.disable("x-powered-by");

  app.use(requestLogger);                                  // first: every request, even rejected ones, gets an id and a log line
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Content-Security-Policy", [
      "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src https://fonts.gstatic.com", "img-src 'self' data: blob: https:", "connect-src 'self'", "object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'"
    ].join("; "));
    next();
  });
  app.use(express.json({ limit: "100kb" }));
  app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));
  // custom TV show posters: file names are random ids and the content type comes from the file itself, never from the user
  app.use("/uploads", express.static(path.join(store.dir(), "uploads"), { index: false, dotfiles: "ignore", maxAge: "365d", immutable: true }));

  app.get("/api/health", (req, res) => res.json({
    ok: true, service: "cine-space", uptimeSeconds: Math.round(process.uptime()),
    tmdbConfigured: !!process.env.TMDB_TOKEN, upstream: http.state()
  }));
  app.use("/api/auth", require("./routes/auth"));
  app.use("/api/account", require("./routes/account"));
  app.use("/api/search", require("./routes/search"));
  app.use("/api/catalog", require("./routes/catalog"));
  app.use("/api/watchlist", require("./routes/watchlist"));
  app.use("/api/shows", require("./routes/shows"));
  app.use("/api/random", require("./routes/random"));

  app.use((req, res, next) => next(httpError(404, `Route ${req.method} ${req.originalUrl.split("?")[0]} was not found.`)));

  // every error leaves the API in the same shape: { "errors": ["..."], "requestId": "..." }
  app.use((err, req, res, next) => {
    let status = err.status || 500, errors = err.errors;
    if (err.type === "entity.parse.failed") { status = 400; errors = ["The request body is not valid JSON."]; }
    else if (err.type === "entity.too.large") { status = 413; errors = ["The request body is too large."]; }
    else if (!err.status) { errors = ["Internal Server Error"]; logger.error(`${err.stack || err.message}`); }
    else if (status >= 500) logger.warn(err.message);
    res.status(status).json({ errors: errors || [err.message], ...(err.fields ? { fields: err.fields } : {}), requestId: req.id });
  });

  require("./lib/library").migrate();                      // upgrades data saved by the first version
  return app;
}

if (require.main === module) {
  const PORT = Number(process.env.PORT) || 3000;
  createApp().listen(PORT, () => {
    console.log(`Cine Space running at http://localhost:${PORT}`);
    if (!process.env.TMDB_TOKEN) console.log("TMDB_TOKEN is not set: movies use the iTunes fallback and streaming info is limited. See README.");
  });
}

module.exports = { createApp };