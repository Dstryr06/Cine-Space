const express = require("express");
const { httpError } = require("../lib/errors");
const store = require("../lib/store");
const { providers } = require("../providers");
const { getDetails, peekDetails } = require("../lib/details");
const { fallbackLinks } = require("../lib/watch");
const router = express.Router();

const MOVIE_TERMS = ["adventure", "action", "comedy", "drama", "horror"];
const param = (req, key) => String(req.query[key] ?? "").trim();

// SYNC (the integration workflow): pull titles from every online API and keep them in data/catalog.json
router.post("/sync", async (req, res, next) => { try {
    const jobs = [
    ["jikan", providers.jikan.popular()],
    ["tvmaze", providers.tvmaze.popular()],
    ...MOVIE_TERMS.map(term => ["movies", providers.movies.search(term)])
    ];
  const results = await Promise.allSettled(jobs.map(j => j[1]));   // all calls run at once; one failing only adds a warning

    const catalog = new Map(store.read("catalog.json").map(t => [t.key, t]));
    const before = catalog.size, warnings = [];
    results.forEach((r, i) => r.status === "fulfilled" ? r.value.forEach(t => catalog.set(t.key, t)) : warnings.push(`${jobs[i][0]}: ${r.reason.message}`));
    if (warnings.length === jobs.length) throw httpError(503, "No online service is available right now.", warnings);

    store.write("catalog.json", [...catalog.values()]);
    res.json({ message: "Catalog synchronized.", count: catalog.size, added: catalog.size - before, warnings: [...new Set(warnings)] });
} catch (e) { next(e); } });

// BROWSE: reads the saved catalog, so it is fast and still works with the internet off
router.get(["/home", "/search"], (req, res, next) => { try {
    const q = param(req, "q").toLowerCase(), type = param(req, "type"), genre = param(req, "genre").toLowerCase(), rating = param(req, "rating");
    if (type && !["movie", "series", "anime"].includes(type)) throw httpError(400, "Type must be movie, series or anime.");

    const data = store.read("catalog.json")
    .filter(t => (!q || t.title.toLowerCase().includes(q)) && (!type || t.type === type)
        && (!genre || t.genres.some(g => g.toLowerCase().includes(genre))) && (!rating || t.ageRating === rating))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    res.json({ count: data.length, data, warnings: [] });
} catch (e) { next(e); } });

// every link for one title: the API's own links, our saved links (data/watch-links.json), then search links
function withLinks(t) {
    const own = store.read("watch-links.json").filter(l => l.key === t.key);   // { key, name, url, price }
    const seen = new Set();
    const watchLinks = [...(t.links || []), ...own, ...fallbackLinks(t)].filter(l => l && l.url && !seen.has(l.url) && seen.add(l.url));
    return { ...t, watchLinks };
}

// ONE TITLE: live details first, the saved copy if the online API is down.
// ?cached=1 means "show me something right now": details we already fetched, else the saved copy, else nothing.
router.get("/:source/:id", async (req, res, next) => { try {
    const { source, id } = req.params;
    if (!providers[source]) throw httpError(404, "Unknown source.");
    const key = `${source}:${id}`;

    if (req.query.cached) {
        const live = peekDetails(source, id);
        const saved = live || store.read("catalog.json").find(x => x.key === key);
        return res.json({ data: saved ? withLinks(saved) : null, fresh: !!live });
    }

    let t, fresh = true;
    try { t = await getDetails(source, id); }
    catch (e) {
        t = store.read("catalog.json").find(x => x.key === key);
        if (!t) throw e;
        fresh = false;
    }
    res.json({ data: withLinks(t), fresh });
} catch (e) { next(e); } });

// SIMILAR: catalog titles that share a genre
router.get("/:source/:id/similar", (req, res, next) => { try {
    const catalog = store.read("catalog.json"), key = `${req.params.source}:${req.params.id}`;
    const t = catalog.find(x => x.key === key);
    res.json({ data: t ? catalog.filter(x => x.key !== key && x.genres.some(g => t.genres.includes(g))).slice(0, 8) : [] });
} catch (e) { next(e); } });

module.exports = router;