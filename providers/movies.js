// ADAPTER for movies: TMDB (needs TMDB_TOKEN). Fallback when TMDB is down or not configured: providers/itunes.js.
const t = require("./tmdb");
const { toTitle } = require("../lib/model");

const poster = m => t.img(m.poster_path);

function fromTmdb(m, extra = {}) {
  return toTitle({
    source: "movies", id: m.id, type: "movie", title: m.title, originalTitle: m.original_title !== m.title ? m.original_title : "",
    genres: extra.genres || [], year: t.year(m.release_date), ageRating: extra.ageRating ?? null,
    publicRating: m.vote_average ? { value: m.vote_average, votes: m.vote_count, source: "TMDB" } : null,
    lengthMinutes: m.runtime, creators: extra.creators || [], studios: extra.studios || [], keywords: extra.keywords || [],
    collection: m.belongs_to_collection, synopsis: m.overview, tagline: m.tagline,
    posterUrl: poster(m), backdropUrl: t.img(m.backdrop_path, "w780"),
    platforms: extra.platforms || [], platformRegion: extra.region, watchRegions: extra.watchRegions,
    externalIds: { imdb: m.imdb_id, tmdb: m.id }
  });
}

async function list(path, ttl = t.HOUR) {
  const [map, r] = await Promise.all([t.genreNames("movie"), t.call(path, { ttl })]);
  return r.results.slice(0, 20).map(m => fromTmdb(m, { genres: (m.genre_ids || []).map(id => map.get(id)).filter(Boolean) }));
}

const search = q => list(`/search/movie?language=en-US&include_adult=false&page=1&query=${encodeURIComponent(q)}`, 5 * 60 * 1000);
const popular = () => list("/movie/popular?language=en-US&page=1");

// what "Sync Catalog" saves: 5 pages of popular + 5 pages of top rated (about 200 movies, duplicates removed)
async function catalog() {
  await t.genreNames("movie");   // load the genre names once before the page requests run in parallel
  const pages = [1, 2, 3, 4, 5];
  const lists = await Promise.all(pages.flatMap(p => [list(`/movie/popular?language=en-US&page=${p}`), list(`/movie/top_rated?language=en-US&page=${p}`)]));
  return lists.flat();
}

async function getById(id, { region } = {}) {
  const reg = t.regionOf(region);
  const m = await t.call(`/movie/${encodeURIComponent(id)}?language=en-US&append_to_response=release_dates,credits,watch/providers,keywords`, { ttl: 30 * 60 * 1000 });
  const us = (m.release_dates?.results || []).find(x => x.iso_3166_1 === "US");
  const cert = (us?.release_dates || []).map(d => d.certification).find(Boolean);
  const { platforms, watchRegions } = t.platformsFrom(m["watch/providers"], reg);
  return fromTmdb(m, {
    genres: (m.genres || []).map(g => g.name), ageRating: t.ageRating(cert),
    creators: (m.credits?.crew || []).filter(c => c.job === "Director").map(c => c.name),
    studios: (m.production_companies || []).map(c => c.name),
    keywords: (m.keywords?.keywords || []).map(k => k.name),
    platforms, region: reg, watchRegions
  });
}

module.exports = { search, popular, catalog, getById, configured: t.hasToken };
