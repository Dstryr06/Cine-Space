// The ONE shape every title is converted into (Canonical Data Model pattern).
// Each adapter in /providers returns raw API data through toTitle(), so the rest of the app never sees raw API payloads.
// toTitle() is idempotent: feeding it an already-canonical title (old catalog.json entries, saved snapshots) is safe.
const { normalizeGenres, moodsFor } = require("./mood");
const { detectFranchise } = require("./franchise");

const RATING_SOURCE = { movies: "TMDB", tmdbtv: "TMDB", tvmaze: "TVmaze", jikan: "MyAnimeList" };
const TYPES = ["movie", "series", "anime"];
const KINDS = ["stream", "free", "rent", "buy", "network", "official", "link"];

const num = v => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v))) ? null : Number(v);
const int = v => { const n = num(v); return n === null ? null : Math.trunc(n); };
const round1 = v => v === null ? null : Math.round(v * 10) / 10;
const text = v => String(v ?? "").trim();
const strings = list => [...new Set((list || []).map(text).filter(Boolean))];

function toPlatform(p) {
  return {
    name: text(p.name), kind: KINDS.includes(p.kind) ? p.kind : "link",
    url: text(p.url), logoUrl: text(p.logoUrl), region: text(p.region)
  };
}

function toSeasons(list) {
  return (list || [])
    .map(s => ({ number: int(s.number), episodes: int(s.episodes), name: text(s.name) }))
    .filter(s => s.number > 0 && s.episodes > 0)
    .sort((a, b) => a.number - b.number);
}

function toTitle(t) {
  const genres = normalizeGenres(t.genres);
  const value = round1(num(t.publicRating?.value ?? t.score));
  const publicRating = value > 0 ? {
    value, scale: 10, votes: int(t.publicRating?.votes ?? t.votes),
    source: text(t.publicRating?.source || t.ratingSource) || RATING_SOURCE[t.source] || "Online"
  } : null;

  const seasons = t.type === "movie" ? [] : toSeasons(t.seasons);
  const seasonTotal = seasons.reduce((n, s) => n + s.episodes, 0);
  const episodes = t.type === "movie" ? null : (seasonTotal || int(t.episodes));

  const collection = t.collection?.name ? { name: text(t.collection.name), id: text(t.collection.id) } : null;
  const keywords = strings(t.keywords), studios = strings(t.studios), creators = strings(t.creators);
  const synopsis = text(t.synopsis);

  // an old "title"-derived label must not stick: it is recalculated from the whole set each time
  const kept = t.franchise && t.franchiseSource !== "title" ? { name: text(t.franchise), source: t.franchiseSource || "keyword" } : null;
  const f = kept || detectFranchise({ title: t.title, collection, synopsis, keywords, studios, creators });

  const platforms = (t.platforms || (t.links || []).map(l => ({ name: l.name, url: l.url, kind: "official" }))).map(toPlatform).filter(p => p.name);

  return {
    key: `${t.source}:${t.id}`,        // e.g. "jikan:5114"
    source: t.source,                  // "jikan" | "tvmaze" | "movies" | "tmdbtv"
    id: String(t.id),
    type: TYPES.includes(t.type) ? t.type : "movie",
    title: text(t.title),
    originalTitle: text(t.originalTitle),
    genres,
    moods: moodsFor(genres),
    franchise: f ? f.name : null,
    franchiseSource: f ? f.source : null,   // "keyword" | "collection" | "title"
    collection: collection ? collection.name : null,
    year: int(t.year),
    ageRating: t.ageRating || null,    // "G" | "PG" | "PG-13" | "R" | "R18"
    publicRating,                      // { value (0-10), scale, votes, source } fetched from the external database
    score: publicRating ? publicRating.value : null,   // kept for older code and quick sorting
    episodes,                          // series and anime: total episodes
    seasons,                           // [{ number, episodes, name }]
    showStatus: text(t.showStatus),    // "Ended", "Running", ...
    lengthMinutes: int(t.lengthMinutes),
    creators, studios, keywords,
    synopsis,
    tagline: text(t.tagline),
    posterUrl: text(t.posterUrl),
    backdropUrl: text(t.backdropUrl),
    platforms,                         // where to watch: [{ name, kind, url, logoUrl, region }]
    platformRegion: text(t.platformRegion),
    watchRegions: strings(t.watchRegions),   // regions that have streaming data (so the UI can suggest one)
    externalIds: { imdb: text(t.externalIds?.imdb), tmdb: text(t.externalIds?.tmdb), tvdb: text(t.externalIds?.tvdb) }
  };
}

module.exports = { toTitle, TYPES };
