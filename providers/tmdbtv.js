// ADAPTER for TV on TMDB. Two jobs:
//  1. backup for TVmaze search / details when TVmaze is slow or down (source "tmdbtv")
//  2. enrich() adds streaming platforms, age rating and a backdrop image to TVmaze shows (TVmaze has none of these)
const t = require("./tmdb");
const { toTitle } = require("../lib/model");

function fromTmdb(s, extra = {}) {
  const seasons = (s.seasons || []).filter(x => x.season_number > 0).map(x => ({ number: x.season_number, episodes: x.episode_count, name: x.name }));
  return toTitle({
    source: "tmdbtv", id: s.id, type: "series", title: s.name, originalTitle: s.original_name !== s.name ? s.original_name : "",
    genres: extra.genres || [], year: t.year(s.first_air_date), ageRating: extra.ageRating ?? null,
    publicRating: s.vote_average ? { value: s.vote_average, votes: s.vote_count, source: "TMDB" } : null,
    episodes: s.number_of_episodes, seasons, showStatus: s.status,
    lengthMinutes: (s.episode_run_time || [])[0], creators: extra.creators || [], studios: extra.studios || [], keywords: extra.keywords || [],
    synopsis: s.overview, tagline: s.tagline, posterUrl: t.img(s.poster_path), backdropUrl: t.img(s.backdrop_path, "w780"),
    platforms: extra.platforms || [], platformRegion: extra.region, watchRegions: extra.watchRegions,
    externalIds: { tmdb: s.id, imdb: s.external_ids?.imdb_id, tvdb: s.external_ids?.tvdb_id }
  });
}

const DETAIL = "append_to_response=content_ratings,watch/providers,keywords,external_ids";

function details(s, reg) {
  const cert = (s.content_ratings?.results || []).find(r => r.iso_3166_1 === reg) || (s.content_ratings?.results || []).find(r => r.iso_3166_1 === "US");
  const { platforms, watchRegions } = t.platformsFrom(s["watch/providers"], reg);
  return {
    genres: (s.genres || []).map(g => g.name), ageRating: t.ageRating(cert?.rating),
    creators: [...(s.created_by || []).map(c => c.name), ...(s.networks || []).map(n => n.name)],
    studios: (s.production_companies || []).map(c => c.name), keywords: (s.keywords?.results || []).map(k => k.name),
    platforms, region: reg, watchRegions
  };
}

async function search(q) {
  const [map, r] = await Promise.all([t.genreNames("tv"), t.call(`/search/tv?language=en-US&include_adult=false&page=1&query=${encodeURIComponent(q)}`, { ttl: 5 * 60 * 1000 })]);
  return r.results.slice(0, 12).map(s => fromTmdb(s, { genres: (s.genre_ids || []).map(id => map.get(id)).filter(Boolean) }));
}

async function getById(id, { region } = {}) {
  const reg = t.regionOf(region);
  const s = await t.call(`/tv/${encodeURIComponent(id)}?language=en-US&${DETAIL}`, { ttl: 30 * 60 * 1000 });
  return fromTmdb(s, details(s, reg));
}

// find the TMDB twin of a TVmaze show through its IMDb / TheTVDB id; returns null if TMDB is off or has no match
async function enrich({ imdb, tvdb }, region) {
  if (!t.hasToken()) return null;
  const reg = t.regionOf(region);
  const lookup = async (id, source) => (await t.call(`/find/${encodeURIComponent(id)}?external_source=${source}`, { ttl: t.DAY, timeout: 4000, retries: 0 })).tv_results?.[0]?.id;
  let tmdbId = imdb ? await lookup(imdb, "imdb_id") : null;
  if (!tmdbId && tvdb) tmdbId = await lookup(tvdb, "tvdb_id");
  if (!tmdbId) return null;
  const s = await t.call(`/tv/${tmdbId}?language=en-US&${DETAIL}`, { ttl: 30 * 60 * 1000, timeout: 4000, retries: 0 });
  return { tmdbId, backdropUrl: t.img(s.backdrop_path, "w780"), votes: s.vote_count, ...details(s, reg) };
}

module.exports = { search, getById, enrich, configured: t.hasToken };
