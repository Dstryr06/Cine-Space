// Login tokens: signed with HMAC-SHA256 using only Node's built-in crypto (no extra packages).
// createSession(user) -> token string; requireAuth -> reads "Authorization: Bearer <token>" and sets req.user.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { httpError } = require("../lib/errors");
const store = require("../lib/store");

const DAY = 24 * 60 * 60 * 1000;
const LIFETIME = 7 * DAY;

// SESSION_SECRET from .env, or a random one that is generated once and saved in data/ so logins survive restarts
function loadSecret() {
    if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
    const file = path.join(__dirname, "..", "data", ".session-secret");
    try { return fs.readFileSync(file, "utf8").trim(); }
    catch (e) {
    const secret = crypto.randomBytes(32).toString("hex");
    try { fs.writeFileSync(file, secret); } catch (err) { /* read-only disk: secret lives in memory only */ }
    return secret;
    }
}
const SECRET = loadSecret();

const sign = body => crypto.createHmac("sha256", SECRET).update(body).digest("base64url");

function createSession(user) {
    const body = Buffer.from(JSON.stringify({ id: user.id, username: user.username, exp: Date.now() + LIFETIME })).toString("base64url");
    return `${body}.${sign(body)}`;
}

function requireAuth(req, res, next) {
    try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const [body, sig] = token.split(".");
    const expected = body ? sign(body) : "";
    const valid = sig && sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    if (!valid) throw httpError(401, "Please log in first.");

    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload.exp || payload.exp < Date.now()) throw httpError(401, "Your session expired. Please log in again.");

    const user = store.read("users.json").find(u => u.id === payload.id);
    if (!user) throw httpError(401, "Account not found. Please log in again.");
    req.user = { id: user.id, username: user.username };
    next();
    } catch (e) {
    next(e.status ? e : httpError(401, "Please log in first."));
    }
}

module.exports = { createSession, requireAuth };