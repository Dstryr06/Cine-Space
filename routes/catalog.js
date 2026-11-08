// The saved catalog (data/catalog.json): browse and filter it instantly, even with the internet off.
// Sync fills it from the online APIs. The detail route asks the live API first and falls back to the saved copy.
const express = require("express");
const { httpError } = require("../lib/errors");
const store = require("../lib/store");
const { providers } = require("../providers");
const { toTitle } = require("../lib/model");
const query = require("../lib/query");
const catalog = require("../lib/catalog");
const library = require("../lib/library");
const custom = require("../lib/custom");
const { applyFranchiseGroups } = require("../lib/franchise");
const { requireAuth } = require("../middleware/auth");
const router = express.Router();

router.use(requireAuth);

const SOURCES = Object.keys(providers);
let syncing = false;

const libraryKeys = userId => new Map(library.mineOf(library.all(), userId).map(e => [e.key, { id: e.id, status: e.status }]));

// SYNC (the integration workflow): pull titles from every online API and keep them in data/catalog.json
router.post("/sync", async (req, res, next) => {
    if (syncing) return next(httpError(409, "A sync is already running."));
    syncing = true;
    try {
    const jobs = [
    ["anime (AniList)", providers.jikan.popular()],
    ["series (TVmaze)", providers.tvmaze.popular()],
    ["movies (TMDB)", providers.movies.configured() ? providers.movies.catalog() : providers.itunes.catalog()]
    ];
  const results = await Promise.allSettled(jobs.map(j => j[1]));   // all calls run at once; one failing only adds a warning

    const saved = new Map(store.read("catalog.    json").map(t => [t.key, t]));
    const before = saved.size, warnings = [];
    results.forEach((r, i) => r.status === "fulfilled" ? r.value.forEach(t => saved.set(t.key, toTitle(t))) : warnings.push(`${jobs[i][0]}: ${r.reason.message}`));
    if (warnings.length === jobs.length) throw httpError(503, "No online service is available right now.", warnings);

    store.write("catalog.json", [...saved.values()]);
    store.write("catalog-meta.json", { lastSyncedAt: new Date().toISOString(), warnings });
    res.json({ message: "Catalog synchronized.", count: saved.size, added: saved.size - before, warnings });
    } catch (e) { next(e); } finally { syncing = false; }
});

// HOME: everything the dashboard needs in one request
function featured(items) {
    const art = items.filter(t => t.backdropUrl && t.score >= 7 && t.synopsis);
    const pool = (art.length >= 4 ? art : items.filter(t => t.posterUrl && t.synopsis && t.score >= 7.5)).sort((a, b) => b.score - a.score).slice(0, 40);
    const day = Math.floor(Date.now() / 86400000), picked = [], perType = {};
  for (let i = 0; i < pool.length && picked.length < 6; i++) {       // rotates daily, never more than 3 of one type
    const t = pool[(i + day * 7) % pool.length];
    if ((perType[t.type] || 0) >= 3 || picked.includes(t)) continue;
    perType[t.type] = (perType[t.type] || 0) + 1;
    picked.push(t);
    }
    return picked;
}

router.get("/home", (req, res, next) => { try {
    const items = catalog.load().items, mine = libraryKeys(req.user.id), added = custom.mediaList(req.user.id);
    const top = type => items.filter(t => t.type === type && t.posterUrl).sort((a, b) => (b.  score ?? 0) - (a.score ?? 0)).slice(0, 16);
    const groups = new Map();
    for (const t of items) if (t.franchise) { const g = groups.get(t.franchise) || { name: t.franchise, count: 0, posterUrl: "" }; g.count++; g.posterUrl ||= t.posterUrl; groups.set(t.franchise, g); }
    const mark = t => ({ ...t, library: mine.get(t.key) || null });
    const meta = store.read("catalog-meta.json", {});
    res.json({
    empty: items.length === 0, total: items.length, lastSyncedAt: meta.lastSyncedAt || null,
    featured: featured(items).map(mark), added: added.map(mark), movies: top("movie").map(mark), series: top("series").map(mark), anime: top("anime").map(mark),
    franchises: [...groups.values()].sort((a, b) => b.count - a.count).slice(0, 16)
    });
} catch (e) { next(e); } });

// BROWSE: reads the saved catalog, so it is fast and still works with the internet off
router.get(["/search", "/browse"], (req, res, next) => { try {
    const f = query.parseFilters(req.query), mine = libraryKeys(req.user.id);
  const own = custom.mediaList(req.user.id);                                   // shows this user added by hand
    const rows = (req.query.mine === "1" ? own : [...catalog.load().items, ...own]).map(media => ({ media }));
    const page = query.paginate(query.sortRows(query.filterRows(rows, f), f, "rating"), f);
    res.json({
    count: page.count, page: page.page, pages: page.pages, hasMore: page.hasMore,
    data: page.slice.map(r => ({ ...r.media, library: mine.get(r.media.key) || null })),
    facets: query.facets(rows, f), warnings: []
    });
} catch (e) { next(e); } });

// ONE TITLE: live details first, the saved copy if the online API is down
router.get("/:source/:id", async (req, res, next) => { try {
    const { source, id } = req.params;
    if (!SOURCES.includes(source) && source !== "custom") throw httpError(404, "Unknown source.");
    const key = `${source}:${id}`, region = String(req.query.region ?? "");
    if (region && !/^[A-Za-z]{2}$/.test(region)) throw httpError(400, "region must be a two-letter country code such as PH or US.");

    let media, stale = false;
    const warnings = [];
  if (source === "custom") {                                    // a show this user added by hand: it lives in our own data, no online call
    media = custom.mediaOf(req.user.id, id);
    if (!media) throw httpError(404, "Show not found.");
    } else try { media = await providers[source].getById(id, { region }); }
    catch (e) {
    const own = library.mineOf(library.all(), req.user.id).find(x => x.key === key);
    media = own ? own.media : catalog.load().byKey.get(key);
    if (!media) throw e;
    stale = true;
    warnings.push(`Showing the saved copy: ${e.message}`);
    }
    media = applyFranchiseGroups([media], [media, ...catalog.load().items])[0];

  // keep the saved snapshot of a library title fresh whenever live data arrives
    const entries = library.all(), own = entries.find(x => x.userId === req.user.id && x.key === key);
    if (own && !stale) { own.media = media; own.title = media.title; own.type = media.type; store.write(library.FILE, entries); }

    const ownRow = own ? library.rowsFor(req.user.id).find(r => r.entry.id === own.id) : null;
    res.json({ data: media, libraryEntry: ownRow ? library.view(ownRow) : null, stale, warnings });
} catch (e) { next(e); } });

// SIMILAR: same franchise first, then the most shared genres
router.get("/:source/:id/similar", (req, res, next) => { try {
    const key = `${req.params.source}:${req.params.id}`, c = catalog.load();
    const own = library.mineOf(library.all(), req.user.id).find(e => e.key === key);
    const t = c.byKey.get(key) || own?.media || (req.params.source === "custom" ? custom.mediaOf(req.user.id, req.params.id) : null);
    if (!t) return res.json({ data: [] });
    const mine = libraryKeys(req.user.id);
    const data = c.items.filter(x => x.key !== key)
    .map(x => ({ x, s: (x.franchise && x.franchise === t.franchise ? 5 : 0) + x.genres.filter(g => t.genres.includes(g)).length + (x.type === t.type ? 1 : 0) }))
    .filter(r => r.s >= 2).sort((a, b) => b.s - a.s || (b.x.score ?? 0) - (a.x.score ?? 0)).slice(0, 12)
    .map(r => ({ ...r.x, library: mine.get(r.x.key) || null }));
    res.json({ data });
} catch (e) { next(e); } });

module.exports = router;