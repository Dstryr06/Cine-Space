// Login sessions: a signed token (HMAC) so users stay logged in even after the server restarts.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { httpError } = require("../lib/errors");
const store = require("../lib/store");

const SECRET_FILE = path.join(store.dir(), ".session-secret");
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// SESSION_SECRET from .env if set, otherwise a random one saved in data/ (ignored by git)
function loadSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  try { return fs.readFileSync(SECRET_FILE, "utf8").trim(); }
  catch (e) {
    const secret = crypto.randomBytes(32).toString("hex");
    try { fs.mkdirSync(path.dirname(SECRET_FILE), { recursive: true }); fs.writeFileSync(SECRET_FILE, secret, { mode: 0o600 }); } catch (err) { /* in-memory only */ }
    return secret;
  }
}
const SECRET = loadSecret();

const sign = body => crypto.createHmac("sha256", SECRET).update(body).digest("base64url");

function createSession(user) {
  const body = Buffer.from(JSON.stringify({ id: user.id, exp: Date.now() + MAX_AGE_MS })).toString("base64url");
  return `${body}.${sign(body)}`;
}

function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const [body, sig] = token.split(".");
    if (!body || !sig) throw httpError(401, "Please log in first.");

    const expected = Buffer.from(sign(body)), given = Buffer.from(sig);
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) throw httpError(401, "Invalid login token.");

    let payload;
    try { payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); }
    catch (e) { throw httpError(401, "Invalid login token."); }
    if (!payload.exp || payload.exp < Date.now()) throw httpError(401, "Your session expired. Please log in again.");

    const user = store.read("users.json").find(u => u.id === payload.id);
    if (!user) throw httpError(401, "Account not found. Please log in again.");
    req.user = { id: user.id, username: user.username };
    next();
  } catch (e) { next(e); }
}

module.exports = { createSession, requireAuth };
