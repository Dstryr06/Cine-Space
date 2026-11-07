const express = require("express");
const crypto = require("crypto");
const { httpError } = require("../lib/errors");
const store = require("../lib/store");
const { requireAuth } = require("../middleware/auth");
const router = express.Router();

router.use(requireAuth);

// THE DICE: GET /api/random?scope=watchlist|catalog&type=&exclude=<key>
// watchlist = a random unwatched title from your own list; catalog = a random synced title you haven't saved
router.get("/", (req, res, next) => { try {
    const scope = String(req.query.scope ?? "watchlist"), type = String(req.query.type ?? ""), exclude = String(req.query.exclude ?? "");
    if (!["watchlist", "catalog"].includes(scope)) throw httpError(400, "scope must be watchlist or catalog.");
    if (type && !["movie", "series", "anime"].includes(type)) throw httpError(400, "Type must be movie, series or anime.");

    const mine = store.read("watchlist.json").filter(e => e.userId === req.user.id);
    const saved = new Set(mine.map(e => e.key));
    let pool = scope === "watchlist" ? mine.filter(e => e.status === "unwatched") : store.read("catalog.json").filter(t => !saved.has(t.key));
    if (type) pool = pool.filter(t => t.type === type);

    const size = pool.length;
  if (size > 1 && exclude) pool = pool.filter(t => t.key !== exclude);   // don't show the same title twice in a row
    if (!pool.length) return res.json({ data: null, poolSize: 0, scope, message: scope === "catalog" ? "Nothing to pick. Sync the catalog first." : "Nothing unwatched matches. Add some titles first." });

    const t = pool[crypto.randomInt(pool.length)];
    const [source, id] = t.custom ? ["custom", t.id] : t.key.split(":");
    res.json({ poolSize: size, scope, data: {
    key: t.key, source, id, title: t.title, type: t.type, year: t.year ?? null, genres: t.genres || [],
    posterUrl: t.posterUrl || "", synopsis: t.synopsis || "", custom: !!t.custom
    } });
} catch (e) { next(e); } });

module.exports = router;