const express = require("express");
const crypto = require("crypto");
const { httpError } = require("../lib/errors");
const store = require("../lib/store");
const { providers } = require("../providers");
const { requireAuth } = require("../middleware/auth");
const router = express.Router();

router.use(requireAuth);   // every watchlist route needs a logged-in user

const mine = (req, entries) => entries.filter(e => e.userId === req.user.id);

router.get("/", (req, res, next) => { try {
    const tab = String(req.query.tab ?? "");
    if (tab && !["favorites", "watched", "unwatched"].includes(tab)) throw httpError(400, "Tab must be favorites, watched or unwatched.");
    let data = mine(req, store.read("watchlist.json"));
    if (tab === "favorites") data = data.filter(e => e.favorite);
    else if (tab) data = data.filter(e => e.status === tab);
    res.json({ count: data.length, data });
} catch (e) { next(e); } });

// the integration workflow: verify the title online, then save it locally
router.post("/", async (req, res, next) => { try {
    const source = String(req.body.source ?? ""), id = String(req.body.id ?? "");
    if (!providers[source] || !id) throw httpError(400, "Send a valid source and id.");
    const entries = store.read("watchlist.json");
    if (mine(req, entries).some(e => e.key === `${source}:${id}`)) throw httpError(409, "Already on your watchlist.");

    const t = await providers[source].getById(id);
    const entry = {
    id: crypto.randomUUID(), userId: req.user.id, key: t.key, title: t.title, type: t.type,
    episodes: t.episodes, episodeProgress: 0, favorite: false, status: "unwatched", addedAt: new Date().toISOString()
    };
    entries.push(entry);
    store.write("watchlist.json", entries);
    res.status(201).json({ message: "Added to your watchlist.", data: entry });
} catch (e) { next(e); } });

router.patch("/:id", (req, res, next) => { try {
    const entries = store.read("watchlist.json");
    const entry = mine(req, entries).find(e => e.id === req.params.id);
    if (!entry) throw httpError(404, "Entry not found.");

    const b = req.body, errors = [];
    if ("favorite" in b && typeof b.favorite !== "boolean") errors.push("favorite must be true or false.");
    if ("status" in b && !["watched", "unwatched"].includes(b.status)) errors.push("status must be watched or unwatched.");
    if ("episodeProgress" in b) {
    const n = b.episodeProgress;
    if (!Number.isInteger(n) || n < 0 || (entry.episodes && n > entry.episodes)) errors.push("episodeProgress must be a whole number from 0 up to the episode count.");
    }
    if (errors.length) throw httpError(400, "Validation failed.", errors);

    for (const key of ["favorite", "status", "episodeProgress"]) if (key in b) entry[key] = b[key];
    store.write("watchlist.json", entries);
    res.json({ data: entry });
} catch (e) { next(e); } });

router.delete("/:id", (req, res, next) => { try {
    const entries = store.read("watchlist.json");
    const entry = mine(req, entries).find(e => e.id === req.params.id);
    if (!entry) throw httpError(404, "Entry not found.");
    store.write("watchlist.json", entries.filter(e => e !== entry));
    res.json({ message: "Removed from your watchlist.", data: entry });
} catch (e) { next(e); } });

module.exports = router;