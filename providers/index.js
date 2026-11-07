// One place that lists every adapter. The keys are the "source" names used in titles and URLs.
const movies = require("./movies"), itunes = require("./itunes"), tvmaze = require("./tvmaze"), tmdbtv = require("./tmdbtv"), jikan = require("./jikan");
const { httpError } = require("../lib/errors");

const providers = {
  movies,    // movies (TMDB)
  itunes,    // movies fallback (iTunes)
  tvmaze,    // series
  tmdbtv,    // series fallback + streaming info (TMDB)
  jikan      // anime (AniList + Jikan)
};

// ---------- global search with fallback ----------
// Each group asks its main service first; if that one fails or is too slow, the backup answers instead.
// A group that fails completely only adds a warning: the other groups still return results.
const GROUP_DEADLINE_MS = Number(process.env.SEARCH_DEADLINE_MS) || 10000;

const GROUPS = [
  { type: "movie", label: "Movies", engines: [
    { name: "TMDB", run: movies.search, enabled: movies.configured },
    { name: "iTunes", run: itunes.search }
  ] },
  { type: "series", label: "TV shows", engines: [
    { name: "TVmaze", run: tvmaze.search },
    { name: "TMDB", run: tmdbtv.search, enabled: tmdbtv.configured }
  ] },
  { type: "anime", label: "Anime", engines: [
    { name: "AniList", run: q => jikan.searchAnilist(q) },
    { name: "Jikan", run: q => jikan.searchJikan(q) }
  ] }
];

const withDeadline = (promise, ms) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(httpError(504, "The online service took too long to answer.")), Math.max(ms, 1));
  promise.then(v => { clearTimeout(timer); resolve(v); }, e => { clearTimeout(timer); reject(e); });
});

async function runGroup(group, q) {
  const started = Date.now(), failures = [];
  for (const engine of group.engines) {
    if (engine.enabled && !engine.enabled()) continue;
    const left = GROUP_DEADLINE_MS - (Date.now() - started);
    if (left <= 0) break;
    try {
      const results = await withDeadline(Promise.resolve().then(() => engine.run(q)), left);
      const warning = failures.length ? `${group.label}: ${failures[0].name} didn't respond (${failures[0].reason}). Showing ${engine.name} results instead.` : null;
      return { group, results, via: engine.name, fallback: failures.length > 0, warning, failed: false };
    } catch (e) { failures.push({ name: engine.name, reason: e.message.replace(/\.$/, "") }); }
  }
  return { group, results: [], via: null, fallback: false, failed: true,
    warning: `${group.label}: no online service answered (${failures.map(f => `${f.name}: ${f.reason}`).join("; ") || "none configured"}).` };
}

const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

function relevance(title, q) {
  const t = norm(title), n = norm(q);
  if (!n) return 0;
  if (t === n) return 100;
  if (t.startsWith(n)) return 70;
  if (n.split(" ").every(w => t.split(" ").includes(w))) return 50;
  return t.includes(n) ? 30 : 10;
}

// TVmaze lists some anime too; when AniList has the same show, keep the anime version (it has richer data)
function dedupe(items) {
  const anime = items.filter(t => t.type === "anime");
  return items.filter(t => t.type !== "series" || !anime.some(a => norm(a.title) === norm(t.title) && Math.abs((a.year || 0) - (t.year || 0)) <= 1));
}

async function searchAll(q, types) {
  const groups = GROUPS.filter(g => !types.length || types.includes(g.type));
  const runs = await Promise.all(groups.map(g => runGroup(g, q)));
  const items = dedupe(runs.flatMap(r => r.results));
  const ranked = items.map(t => ({ t, s: relevance(t.title, q) * 10 + (t.score || 0) })).sort((a, b) => b.s - a.s).map(x => x.t);
  return {
    data: ranked,
    warnings: runs.map(r => r.warning).filter(Boolean),
    sources: Object.fromEntries(runs.map(r => [r.group.type, r.failed ? "failed" : r.fallback ? `fallback:${r.via}` : `ok:${r.via}`])),
    allFailed: runs.length > 0 && runs.every(r => r.failed)
  };
}

module.exports = { providers, searchAll };
