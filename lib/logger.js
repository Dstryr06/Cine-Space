// Request logging and traceability.
//  - console: one readable line per request and per outgoing call, tagged with the request id
//  - logs/app.log: the same events as JSON lines (rotates at 5 MB)
//  - a ring buffer of the most recent requests, so the app can show a user their own activity
const fs = require("fs");
const path = require("path");
const ctx = require("./context");

const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, "..", "logs");
const FILE_ON = process.env.LOG_FILE !== "off";
const QUIET = process.env.LOG_QUIET === "1";
const MAX_BYTES = 5 * 1024 * 1024;
const RING_MAX = 300;
const ring = [];
let written = 0, ready = false;

function toFile(record) {
  if (!FILE_ON) return;
  try {
    const target = path.join(LOG_DIR, "app.log");
    if (!ready) { fs.mkdirSync(LOG_DIR, { recursive: true }); try { written = fs.statSync(target).size; } catch (e) { written = 0; } ready = true; }
    if (written > MAX_BYTES) { fs.renameSync(target, `${target}.1`); written = 0; }
    const line = JSON.stringify(record) + "\n";
    written += Buffer.byteLength(line);
    fs.appendFile(target, line, () => {});
  } catch (e) { /* logging must never break a request */ }
}

const say = line => { if (!QUIET) console.log(line); };

function request(rec) {
  ring.push(rec);
  if (ring.length > RING_MAX) ring.shift();
  say(`[${rec.requestId}] ${rec.method} ${rec.path} ${rec.status} ${rec.ms}ms${rec.userId ? ` user=${rec.userId.slice(0, 8)}` : ""}${rec.upstream.length ? ` upstream=${rec.upstream.length}` : ""}`);
  toFile({ type: "request", ...rec });
}

function upstream(rec) {
  const c = ctx.get();
  if (c) c.upstream.push(rec);
  say(`[${c ? c.id : "-"}]   -> ${rec.service} ${rec.method} ${rec.target} ${rec.outcome} ${rec.ms}ms`);
  toFile({ type: "upstream", requestId: c ? c.id : null, ...rec });
}

function line(level, message, fields = {}) {
  const c = ctx.get();
  const out = console[level === "error" ? "error" : level === "warn" ? "warn" : "log"];
  if (!QUIET) out(`[${c ? c.id : "-"}] ${level.toUpperCase()} ${message}`);
  toFile({ type: "log", level, requestId: c ? c.id : null, message, ...fields, ts: new Date().toISOString() });
}

const recent = ({ userId, limit = 50 } = {}) =>
  ring.filter(r => !userId || r.userId === userId).slice(-limit).reverse();

module.exports = {
  request, upstream, recent,
  info: (m, f) => line("info", m, f), warn: (m, f) => line("warn", m, f), error: (m, f) => line("error", m, f)
};
