// GLOBAL SEARCH across the online databases (TMDB for movies, TVmaze for TV, AniList/Jikan for anime).
// Slow or broken services never break the page: each one has a backup, and if everything is down
// the answer falls back to the titles saved locally, with a warning that says so.
const express = require("express");
const { httpError } = require("../lib/errors");
const { searchAll } = require("../providers");
const { TYPES } = require("../lib/query");
const catalog = require("../lib/catalog");
const library = require("../lib/library");
const custom = require("../lib/custom");
const { requireAuth } = require("../middleware/auth");
const router = express.Router();

router.use(requireAuth);

// key -> { id, status } for everything this user has saved, so results can show "In library"
function libraryIndex(userId) {
  return new Map(library.mineOf(library.all(), userId).map(e => [e.key, { id: e.id, status: e.status }]));
}

router.get("/", async (req, res, next) => { try {
  const q = String(req.query.q ?? "").trim();
  if (q.length < 2) throw httpError(400, "Type at least 2 characters to search.");
  if (q.length > 100) throw httpError(400, "Search text must be 100 characters or fewer.");
  const types = String(req.query.type ?? "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  if (types.some(t => !TYPES.includes(t))) throw httpError(400, "type must be movie, series or anime.");

  const out = await searchAll(q, types);
  let data = out.data, degraded = false;
  const warnings = [...out.warnings];

  if (out.allFailed) {
    const needle = q.toLowerCase();
    const saved = new Map();
    for (const t of catalog.load().items) saved.set(t.key, t);
    for (const e of library.mineOf(library.all(), req.user.id)) saved.set(e.key, e.media);
    data = [...saved.values()].filter(t => (!types.length || types.includes(t.type)) && t.title.toLowerCase().includes(needle)).slice(0, 40);
    degraded = true;
    warnings.push("The online services can't be reached right now. These are matching titles saved on this server.");
  }

  // shows the user added by hand are searched locally and come first
  const needle = q.toLowerCase();
  const own = custom.mediaList(req.user.id).filter(t => (!types.length || types.includes(t.type)) && t.title.toLowerCase().includes(needle));
  data = [...own, ...data];

  const mine = libraryIndex(req.user.id);
  data = data.slice(0, 60).map(t => ({ ...t, library: mine.get(t.key) || null }));
  res.json({ query: q, count: data.length, data, warnings, sources: out.sources, degraded });
} catch (e) { next(e); } });

module.exports = router;
