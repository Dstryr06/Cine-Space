// THE LIBRARY: full local CRUD on the user's saved titles (data/watchlist.json).
//   GET    /api/watchlist              list + multi-criteria filters + A-Z + facets
//   GET    /api/watchlist/stats        totals for the dashboard
//   GET    /api/watchlist/:id          one entry (with its saved title details)
//   POST   /api/watchlist              save a title (verified online first, offline catalog as backup)
//   PATCH  /api/watchlist/:id          status, favorite, season/episode progress, tags
//   POST   /api/watchlist/:id/progress/next | prev   step one episode (rolls over to the next season)
//   POST   /api/watchlist/:id/refresh  re-fetch the title details and public rating
//   DELETE /api/watchlist/:id
//   GET/POST/PUT/DELETE /api/watchlist/:id/review   personal star rating + written review
const express = require("express");
const crypto = require("crypto");
const { httpError } = require("../lib/errors");
const store = require("../lib/store");
const { providers } = require("../providers");
const query = require("../lib/query");
const progress = require("../lib/progress");
const library = require("../lib/library");
const catalog = require("../lib/catalog");
const custom = require("../lib/custom");
const { requireAuth } = require("../middleware/auth");
const router = express.Router();

router.use(requireAuth);   // every library route needs a logged-in user

const fail = errors => { throw httpError(400, "Validation failed.", errors); };
const validRegion = r => !r || /^[A-Za-z]{2}$/.test(r);

// loads this user's entries fresh from disk and finds one; `commit()` saves them
function open(req) {
  const entries = library.all();
  const entry = entries.find(e => e.id === req.params.id && e.userId === req.user.id);
  if (!entry) throw httpError(404, "Entry not found.");
  return { entries, entry, commit() { entry.updatedAt = library.now(); store.write(library.FILE, entries); return entry; } };
}
const respond = (req, entry) => library.view(library.rowsFor(req.user.id).find(r => r.entry.id === entry.id));

// ---------- list ----------
router.get("/", (req, res, next) => { try {
  const f = query.parseFilters(req.query);
  const rows = library.rowsFor(req.user.id);
  const page = query.paginate(query.sortRows(query.filterRows(rows, f), f, "added"), f);
  res.json({
    count: page.count, total: rows.length, page: page.page, pages: page.pages, hasMore: page.hasMore,
    data: page.slice.map(library.view), facets: query.facets(rows, f)
  });
} catch (e) { next(e); } });

router.get("/stats", (req, res, next) => { try {
  const rows = library.rowsFor(req.user.id), views = rows.map(library.view);
  const byStatus = Object.fromEntries(query.STATUSES.map(s => [s, 0])), byType = { movie: 0, series: 0, anime: 0 };
  const genres = new Map();
  let rated = 0, ratingSum = 0, episodes = 0;
  for (const v of views) {
    byStatus[v.status]++; byType[v.media.type]++;
    if (v.review) { rated++; ratingSum += v.review.rating; }
    if (v.progress) episodes += v.progress.watched;
    for (const g of v.media.genres) genres.set(g, (genres.get(g) || 0) + 1);
  }
  res.json({
    total: views.length, byStatus, byType, favorites: views.filter(v => v.favorite).length, reviewed: rated,
    averageMyRating: rated ? Math.round((ratingSum / rated) * 10) / 10 : null, episodesWatched: episodes,
    topGenres: [...genres.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count }))
  });
} catch (e) { next(e); } });

router.get("/:id", (req, res, next) => { try {
  const { entry } = open(req);
  res.json({ data: respond(req, entry) });
} catch (e) { next(e); } });

// ---------- create: verify the title online, then save it locally ----------
router.post("/", async (req, res, next) => { try {
  const b = req.body || {}, errors = [];
  const source = String(b.source ?? ""), id = String(b.id ?? "").trim();
  if ((!providers[source] && source !== "custom") || !/^[\w.-]{1,64}$/.test(id)) errors.push("Send a valid source and id.");
  if ("status" in b && !query.STATUSES.includes(b.status)) errors.push(`status must be one of ${query.STATUSES.join(", ")}.`);
  if ("favorite" in b && typeof b.favorite !== "boolean") errors.push("favorite must be true or false.");
  if (!validRegion(b.region)) errors.push("region must be a two-letter country code.");
  const tags = "tags" in b ? library.normalizeTags(b.tags, errors) : [];
  if (errors.length) fail(errors);

  const key = `${source}:${id}`;
  if (library.mineOf(library.all(), req.user.id).some(e => e.key === key)) throw httpError(409, "Already in your library.");

  let media;
  const warnings = [];
  if (source === "custom") {                     // a show the user added by hand
    media = custom.mediaOf(req.user.id, id);
    if (!media) throw httpError(404, "Show not found.");
  } else try { media = await providers[source].getById(id, { region: b.region }); }
  catch (e) {
    media = catalog.load().byKey.get(key);       // the online service failed: use the saved catalog copy if there is one
    if (!media) throw e;
    warnings.push(`Saved from the offline catalog because the online service failed (${e.message})`);
  }

  const entries = library.all();                  // read again: the lock-free "check, wait, write" pattern would otherwise lose updates
  if (entries.some(e => e.userId === req.user.id && e.key === key)) throw httpError(409, "Already in your library.");
  const at = library.now();
  const entry = {
    id: crypto.randomUUID(), userId: req.user.id, key, source, mediaId: id, title: media.title, type: media.type,
    status: "to_watch", favorite: b.favorite === true, progress: media.type === "movie" ? null : progress.start(media),
    tags, review: null, media, addedAt: at, updatedAt: at, startedAt: null, completedAt: null, schema: 2
  };
  if (b.status) library.setStatus(entry, b.status);
  entries.push(entry);
  store.write(library.FILE, entries);
  res.status(201).json({ message: "Added to your library.", data: respond(req, entry), warnings });
} catch (e) { next(e); } });

// ---------- update ----------
router.patch("/:id", (req, res, next) => { try {
  const ctx = open(req), { entry } = ctx, b = req.body || {}, errors = [];
  if (!["status", "favorite", "progress", "tags"].some(k => k in b)) fail(["Send at least one of: status, favorite, progress, tags."]);
  if ("favorite" in b && typeof b.favorite !== "boolean") errors.push("favorite must be true or false.");
  if ("status" in b && !query.STATUSES.includes(b.status)) errors.push(`status must be one of ${query.STATUSES.join(", ")}.`);
  const p = "progress" in b ? { season: b.progress?.season, episode: b.progress?.episode } : null;
  if (p) errors.push(...progress.validate(entry.media, p));
  const tags = "tags" in b ? library.normalizeTags(b.tags, errors) : null;
  if (errors.length) fail(errors);

  if ("favorite" in b) entry.favorite = b.favorite;
  if (tags) entry.tags = tags;
  if (p) library.applyProgress(entry, p);                                  // may move status on its own (watching / completed)
  if ("status" in b) library.setStatus(entry, b.status, { keepProgress: !!p });   // an explicit status always wins
  ctx.commit();
  res.json({ data: respond(req, entry) });
} catch (e) { next(e); } });

// step one episode forward or back; rolls over between seasons
for (const dir of ["next", "prev"]) {
  router.post(`/:id/progress/${dir}`, (req, res, next) => { try {
    const ctx = open(req), { entry } = ctx;
    if (entry.media.type === "movie") fail(["Movies don't have season or episode progress."]);
    const current = entry.progress || progress.start(entry.media);
    const target = progress[dir](entry.media, current);
    if (!target) fail(["You're already at the last episode."]);
    if (dir === "prev" && target.season === current.season && target.episode === current.episode) fail(["You're already at the start."]);
    library.applyProgress(entry, target);
    ctx.commit();
    res.json({ data: respond(req, entry) });
  } catch (e) { next(e); } });
}

// re-fetch details + public rating from the online database, keeping everything the user entered
router.post("/:id/refresh", async (req, res, next) => { try {
  const { entry } = open(req), region = String(req.query.region ?? "");
  if (!validRegion(region)) fail(["region must be a two-letter country code."]);
  const media = entry.source === "custom" ? custom.mediaOf(req.user.id, entry.mediaId) : await providers[entry.source].getById(entry.mediaId, { region });
  if (!media) throw httpError(404, "Show not found.");

  const entries = library.all(), fresh = entries.find(e => e.id === entry.id && e.userId === req.user.id);
  if (!fresh) throw httpError(404, "Entry not found.");
  fresh.media = media; fresh.title = media.title; fresh.type = media.type; fresh.updatedAt = library.now();
  store.write(library.FILE, entries);
  res.json({ message: "Details refreshed.", data: respond(req, fresh) });
} catch (e) { next(e); } });

router.delete("/:id", (req, res, next) => { try {
  const { entries, entry } = open(req);
  store.write(library.FILE, entries.filter(e => e !== entry));
  res.json({ message: "Removed from your library.", data: { id: entry.id, key: entry.key, title: entry.title } });
} catch (e) { next(e); } });

// ---------- personal review: star rating (1-5) + written review ----------
router.get("/:id/review", (req, res, next) => { try { res.json({ data: open(req).entry.review }); } catch (e) { next(e); } });

router.post("/:id/review", (req, res, next) => { try {
  const ctx = open(req), b = req.body || {};
  if (ctx.entry.review) throw httpError(409, "You already reviewed this title. Edit your review instead.");
  const errors = library.checkReview({ rating: b.rating, text: b.text });
  if (errors.length) fail(errors);
  const at = library.now();
  ctx.entry.review = { rating: b.rating, text: b.text.trim(), createdAt: at, updatedAt: at };
  ctx.commit();
  res.status(201).json({ message: "Review saved.", data: ctx.entry.review });
} catch (e) { next(e); } });

router.put("/:id/review", (req, res, next) => { try {
  const ctx = open(req), b = req.body || {}, old = ctx.entry.review;
  if (!old) throw httpError(404, "There is no review to edit yet.");
  const merged = { rating: "rating" in b ? b.rating : old.rating, text: "text" in b ? b.text : old.text };   // send one field or both
  const errors = library.checkReview(merged);
  if (errors.length) fail(errors);
  ctx.entry.review = { ...old, rating: merged.rating, text: merged.text.trim(), updatedAt: library.now() };
  ctx.commit();
  res.json({ message: "Review updated.", data: ctx.entry.review });
} catch (e) { next(e); } });

router.delete("/:id/review", (req, res, next) => { try {
  const ctx = open(req);
  if (!ctx.entry.review) throw httpError(404, "There is no review to delete.");
  ctx.entry.review = null;
  ctx.commit();
  res.json({ message: "Review deleted.", data: null });
} catch (e) { next(e); } });

module.exports = router;
