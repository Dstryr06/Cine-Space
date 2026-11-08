// ADAPTER for series using TVmaze (https://api.tvmaze.com). No key.
// TVmaze knows seasons and episodes very well but has no age ratings or streaming services, so getById()
// asks TMDB (if configured) for those. If TMDB is slow or down the show is still returned, just without them.
const { fetchJson } = require("../lib/http");
const { toTitle } = require("../lib/model");
const tmdbtv = require("./tmdbtv");
const logger = require("../lib/logger");
const BASE = "https://api.tvmaze.com";

// TVmaze summaries contain HTML tags; the canonical model stores plain text
const stripHtml = html => String(html ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
const https = u => String(u || "").replace(/^http:/, "https:");

// the mapping: TVmaze field -> Cine Space field
function toCanonical(s, extra = {}) {
  const net = s.network || s.webChannel;
  const platforms = [];
  if (net) platforms.push({ name: net.name, kind: "network", url: https(s.officialSite || net.officialSite), region: net.country?.code || "" });
  return toTitle({
    source: "tvmaze", id: s.id, type: "series", title: s.name,
    genres: s.genres || [], year: s.premiered ? Number(s.premiered.slice(0, 4)) : null,
    publicRating: s.rating?.average ? { value: s.rating.average, source: "TVmaze" } : null,
    episodes: extra.episodes ?? null, seasons: extra.seasons, showStatus: s.status,
    lengthMinutes: s.averageRuntime ?? s.runtime ?? null,
    creators: [net?.name].filter(Boolean), studios: [], synopsis: stripHtml(s.summary),
    posterUrl: https(extra.big ? (s.image?.original || s.image?.medium) : (s.image?.medium || s.image?.original)), platforms,
    externalIds: { imdb: s.externals?.imdb, tvdb: s.externals?.thetvdb }
  });
}

async function search(q) {
  const r = await fetchJson(`${BASE}/search/shows?q=${encodeURIComponent(q)}`, { ttl: 5 * 60 * 1000 });
  return r.slice(0, 12).map(x => toCanonical(x.show));
}

// TVmaze has no "popular" list: take the first page (up to 250 shows) and keep every show that has a rating, best first
async function popular() {
  const shows = await fetchJson(`${BASE}/shows?page=0`, { timeout: 15000, ttl: 6 * 3600 * 1000 });
  return shows.filter(s => s.rating?.average).sort((a, b) => b.rating.average - a.rating.average).map(s => toCanonical(s));
}

// embed=episodes gives us the real season / episode structure (specials are left out)
async function getById(id, { region } = {}) {
  const s = await fetchJson(`${BASE}/shows/${encodeURIComponent(id)}?embed=episodes`, { ttl: 30 * 60 * 1000 });
  const regular = (s._embedded?.episodes || []).filter(e => e.number != null && (!e.type || e.type === "regular"));
  const bySeason = new Map();
  for (const e of regular) bySeason.set(e.season, (bySeason.get(e.season) || 0) + 1);
  const seasons = [...bySeason.entries()].map(([number, episodes]) => ({ number, episodes, name: `Season ${number}` }));
  const title = toCanonical(s, { seasons, episodes: regular.length || null, big: true });

  try {
    const extra = await tmdbtv.enrich({ imdb: s.externals?.imdb, tvdb: s.externals?.thetvdb }, region);
    if (extra) {
      return toTitle({
        ...title, ageRating: extra.ageRating || title.ageRating, backdropUrl: extra.backdropUrl || title.backdropUrl,
        keywords: extra.keywords, studios: extra.studios,
        publicRating: title.publicRating ? { ...title.publicRating, votes: title.publicRating.votes ?? extra.votes } : null,
        platforms: [...extra.platforms, ...title.platforms.filter(p => !extra.platforms.some(x => x.name.toLowerCase() === p.name.toLowerCase()))],
        platformRegion: extra.region, watchRegions: extra.watchRegions, externalIds: { ...title.externalIds, tmdb: extra.tmdbId }
      });
    }
  } catch (e) { logger.warn(`TMDB enrichment skipped for tvmaze:${id} (${e.message})`); }
  return title;
}

module.exports = { search, popular, getById };
