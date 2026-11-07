const express = require("express");
const crypto = require("crypto");
const { httpError } = require("../lib/errors");
const store = require("../lib/store");
const { providers } = require("../providers");
const { getDetails } = require("../lib/details");
const { requireAuth } = require("../middleware/auth");
const router = express.Router();

router.use(requireAuth);   // every watchlist route needs a logged-in user

const mine = (req, entries) => entries.filter(e => e.userId === req.user.id);

// checks the form fields of a custom title and returns the cleaned values (or throws 400)
function cleanCustom(b, current = {}) {
    const errors = [];
    const title = "title" in b ? String(b.title ?? "").trim() : current.title;
    const type = "type" in b ? String(b.type ?? "") : current.type;
    if (!title || title.length > 100) errors.push("Title is required (up to 100 characters).");
    if (!["movie", "series", "anime"].includes(type)) errors.push("Type must be movie, series or anime.");

    let episodes = "episodes" in b ? b.episodes : current.episodes;
    if (type === "movie" || episodes === "" || episodes == null) episodes = null;
    else if (!Number.isInteger(Number(episodes)) || Number(episodes) < 1 || Number(episodes) > 5000) errors.push("Episodes must be a whole number from 1 to 5000.");
    else episodes = Number(episodes);

    const raw = "genres" in b ? b.genres : current.genres;
    const genres = (Array.isArray(raw) ? raw : String(raw ?? "").split(",")).map(g => String(g).trim()).filter(Boolean).slice(0, 5);
    if (errors.length) throw httpError(400, "Validation failed.", errors);
    return { title, type, episodes, genres };
}

const isDuplicate = (req, entries, title, selfId) =>
    mine(req, entries).some(e => e.custom && e.id !== selfId && e.title.toLowerCase() === title.toLowerCase());

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

    const t = await getDetails(source, id);     // shared cache: instant if the title page already fetched it
    const entry = {
    id: crypto.randomUUID(), userId: req.user.id, key: t.key, title: t.title, type: t.type, genres: t.genres, posterUrl: t.posterUrl, year: t.year,
    episodes: t.episodes, episodeProgress: 0, favorite: false, status: "unwatched", addedAt: new Date().toISOString()
    };
    entries.push(entry);
    store.write("watchlist.json", entries);
    res.status(201).json({ message: "Added to your watchlist.", data: entry });
} catch (e) { next(e); } });

// a title the user types in themselves, for films the online APIs don't have
router.post("/custom", (req, res, next) => { try {
    const fields = cleanCustom(req.body);
    const entries = store.read("watchlist.json");
    if (isDuplicate(req, entries, fields.title)) throw httpError(409, "You already added a custom title with that name.");
    const id = crypto.randomUUID();
    const entry = {
    id, userId: req.user.id, key: `custom:${id}`, custom: true, ...fields,
    episodeProgress: 0, favorite: false, status: "unwatched", addedAt: new Date().toISOString()
    };
    entries.push(entry);
    store.write("watchlist.json", entries);
    res.status(201).json({ message: "Custom title added.", data: entry });
} catch (e) { next(e); } });

router.patch("/:id", (req, res, next) => { try {
    const entries = store.read("watchlist.json");
    const entry = mine(req, entries).find(e => e.id === req.params.id);
    if (!entry) throw httpError(404, "Entry not found.");

    const b = req.body, errors = [];
    const touched = ["title", "type", "episodes", "genres"].filter(k => k in b);
    if (touched.length && !entry.custom) errors.push("Only your own custom titles can have their details edited.");
    if ("favorite" in b && typeof b.favorite !== "boolean") errors.push("favorite must be true or false.");
    if ("status" in b && !["watched", "unwatched"].includes(b.status)) errors.push("status must be watched or unwatched.");
    if ("episodeProgress" in b) {
    const n = b.episodeProgress;
    if (!Number.isInteger(n) || n < 0 || (entry.episodes && n > entry.episodes)) errors.push("episodeProgress must be a whole number from 0 up to the episode count.");
    }
    if (errors.length) throw httpError(400, "Validation failed.", errors);

    if (touched.length) {
    const fields = cleanCustom(b, entry);
    if (isDuplicate(req, entries, fields.title, entry.id)) throw httpError(409, "You already added a custom title with that name.");
    Object.assign(entry, fields);
    if (entry.episodes === null) entry.episodeProgress = 0;
    else if (entry.episodeProgress > entry.episodes) entry.episodeProgress = entry.episodes;
    }
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