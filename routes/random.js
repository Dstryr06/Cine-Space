// SHOW RANDOMIZER: "what should I watch tonight?"
//   GET /api/random?scope=library|catalog  + any filter the lists accept (type, genre, mood, franchise, tag, yearFrom ...)
// scope=library picks from your own list (only To Watch unless you pass status=any or a status)
// scope=catalog picks from the saved catalog, skipping titles you already saved
// exclude=<key or entry id> avoids showing the same title twice in a row.
const express = require("express");
const crypto = require("crypto");
const { httpError } = require("../lib/errors");
const query = require("../lib/query");
const library = require("../lib/library");
const catalog = require("../lib/catalog");
const custom = require("../lib/custom");
const { requireAuth } = require("../middleware/auth");
const router = express.Router();

router.use(requireAuth);

router.get("/", (req, res, next) => { try {
  const scope = String(req.query.scope ?? "library");
  if (!["library", "catalog"].includes(scope)) throw httpError(400, "scope must be library or catalog.");
  const q = { ...req.query };
  if (scope === "library") { if (q.status === "any") delete q.status; else if (q.status === undefined || q.status === "") q.status = "to_watch"; }
  else delete q.status;
  const f = query.parseFilters(q), exclude = String(req.query.exclude ?? "");

  let pool;
  if (scope === "library") pool = query.filterRows(library.rowsFor(req.user.id), f);
  else {
    const saved = new Set(library.mineOf(library.all(), req.user.id).map(e => e.key));
    pool = query.filterRows([...catalog.load().items, ...custom.mediaList(req.user.id)].filter(t => !saved.has(t.key)).map(media => ({ media })), f);
  }

  const size = pool.length;
  if (size > 1 && exclude) pool = pool.filter(r => r.media.key !== exclude && r.entry?.id !== exclude);
  if (!pool.length) return res.json({ data: null, scope, poolSize: 0, message: "Nothing matches these filters. Loosen one and try again." });

  const pick = pool[crypto.randomInt(pool.length)];
  res.json({ data: pick.entry ? library.view(pick) : { ...pick.media, library: null }, scope, poolSize: size });
} catch (e) { next(e); } });

module.exports = router;
