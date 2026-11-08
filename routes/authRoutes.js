const express = require("express");
const crypto = require("crypto");
const { httpError } = require("../lib/errors");
const store = require("../lib/store");
const logger = require("../lib/logger");
const { createSession, requireAuth } = require("../middleware/auth");
const PasswordPolicy = require("../public/js/password-policy");   // the same file the sign-up form uses
const router = express.Router();
const DUPLICATE = "Username already exists. Choose a different one.";

// passwords are stored as "salt:hash" (scrypt is built into Node), never as plain text
function hash(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    return `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
}
function matches(password, stored) {
    const [salt, saved] = String(stored).split(":");
    const a = Buffer.from(saved || "", "hex");
    const b = crypto.scryptSync(password, salt || "", 64);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// brute-force guard: 8 wrong passwords for one account + address, then a 10 minute pause
const attempts = new Map();
const WINDOW_MS = 10 * 60 * 1000, MAX_FAILS = 8;
function guard(req, username) {
    const key = `${req.ip}|${username}`, rec = attempts.get(key);
    if (rec && rec.until > Date.now() && rec.fails >= MAX_FAILS) {
    throw httpError(429, `Too many failed attempts. Try again in ${Math.ceil((rec.until - Date.now()) / 60000)} minute(s).`);
    }
    return key;
}
const failed = key => { const r = attempts.get(key); attempts.set(key, { fails: (r && r.until > Date.now() ? r.fails : 0) + 1, until: Date.now() + WINDOW_MS }); };

router.post("/register", (req, res, next) => { try {
    const username = String(req.body?.username ?? "").trim().toLowerCase();
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const errors = [], fields = {};

    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    fields.username = "Username must be 3 to 20 letters, numbers or underscores.";
  } else if (store.read("users.json").some(u => u.username === username)) {   // usernames are lowercase, so "Rica" and "rica" are the same
    fields.username = DUPLICATE;
    }

  const policy = PasswordPolicy.check(password, { username });                  // strong password: same rules the sign-up form shows
    if (!policy.ok) fields.password = policy.messages[0];

    if (fields.username) errors.push(fields.username);
    errors.push(...policy.messages);
    if (errors.length) throw httpError(fields.username === DUPLICATE ? 409 : 400, "Validation failed.", errors, fields);

    const users = store.read("users.json");
    const user = { id: crypto.randomUUID(), username, passwordHash: hash(password), createdAt: new Date().toISOString() };
    users.push(user);
    store.write("users.json", users);
    logger.info(`user registered: ${username}`);
    res.status(201).json({ token: createSession(user), username });
} catch (e) { next(e); } });

router.post("/login", (req, res, next) => { try {
    const username = String(req.body?.username ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");
    if (!username || !password) throw httpError(400, "Validation failed.", ["Enter your username and password."]);
    const key = guard(req, username);
    const user = store.read("users.json").find(u => u.username === username);
    if (!user || !matches(password, user.passwordHash)) { failed(key); throw httpError(401, "Wrong username or password."); }
    attempts.delete(key);
    res.json({ token: createSession(user), username });
} catch (e) { next(e); } });

router.get("/me", requireAuth, (req, res) => res.json({ username: req.user.username }));

module.exports = router;