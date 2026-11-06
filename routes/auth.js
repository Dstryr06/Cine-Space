const express = require("express");
const crypto = require("crypto");
const { httpError } = require("../lib/errors");
const store = require("../lib/store");
const { createSession, requireAuth } = require("../middleware/auth");
const router = express.Router();

// passwords are stored as "salt:hash" (scrypt is built into Node), never as plain text
function hash(password) {
    const salt = crypto.randomBytes(16).toString("hex");
    return `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
}
function matches(password, stored) {
    const [salt, saved] = stored.split(":");
    const a = Buffer.from(saved, "hex");
    const b = crypto.scryptSync(password, salt, 64);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

router.post("/register", (req, res, next) => { try {
    const username = String(req.body.username ?? "").trim().toLowerCase();
    const password = String(req.body.password ?? "");
    const errors = [];
    if (!/^[a-z0-9_]{3,20}$/.test(username)) errors.push("Username must be 3 to 20 letters, numbers or underscores.");
    if (password.length < 6) errors.push("Password must be at least 6 characters.");
    if (errors.length) throw httpError(400, "Validation failed.", errors);

    const users = store.read("users.json");
    if (users.some(u => u.username === username)) throw httpError(409, "That username is already taken.");
    const user = { id: crypto.randomUUID(), username, passwordHash: hash(password), createdAt: new Date().toISOString() };
    users.push(user);
    store.write("users.json", users);
    res.status(201).json({ token: createSession(user), username });
} catch (e) { next(e); } });

router.post("/login", (req, res, next) => { try {
    const username = String(req.body.username ?? "").trim().toLowerCase();
    const password = String(req.body.password ?? "");
    const user = store.read("users.json").find(u => u.username === username);
    if (!user || !matches(password, user.passwordHash)) throw httpError(401, "Wrong username or password.");
    res.json({ token: createSession(user), username });
} catch (e) { next(e); } });

router.get("/me", requireAuth, (req, res) => res.json({ username: req.user.username }));

module.exports = router;