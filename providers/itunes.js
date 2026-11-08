// FALLBACK ADAPTER for movies: the iTunes Search API (no key). Used when TMDB is slow, down or not configured.
// Its ids are different from TMDB's, so these titles use their own source name ("itunes") and never get mixed up.
const { fetchJson } = require("../lib/http");
const { httpError } = require("../lib/errors");
const { toTitle } = require("../lib/model");
const ITUNES = "https://itunes.apple.com";

function ageRating(r) {
  if (r === "G") return "G";
  if (r === "PG" || r === "PG-13" || r === "R") return r;
  if (r === "NC-17") return "R18";
  return null;
}

function fromItunes(m) {
  return toTitle({
    source: "itunes", id: m.trackId, type: "movie", title: m.trackName,
    genres: [m.primaryGenreName].filter(Boolean), year: m.releaseDate ? Number(m.releaseDate.slice(0, 4)) : null,
    ageRating: ageRating(m.contentAdvisoryRating),
    lengthMinutes: m.trackTimeMillis ? Math.round(m.trackTimeMillis / 60000) : null,
    creators: [m.artistName].filter(Boolean), synopsis: m.longDescription || m.shortDescription,
    posterUrl: (m.artworkUrl100 || "").replace("100x100", "300x300"),
    platforms: m.trackViewUrl ? [{ name: "Apple TV", kind: m.trackRentalPrice ? "rent" : "buy", url: m.trackViewUrl, region: "US" }] : []
  });
}

const run = async term => (await fetchJson(`${ITUNES}/search?media=movie&entity=movie&country=US&limit=25&term=${encodeURIComponent(term)}`, { ttl: 5 * 60 * 1000 })).results.map(fromItunes);
const search = q => run(q);
const popular = () => run("adventure");
const catalog = async () => (await Promise.all(["adventure", "action", "comedy", "drama", "horror"].map(run))).flat();

async function getById(id) {
  const r = await fetchJson(`${ITUNES}/lookup?id=${encodeURIComponent(id)}&entity=movie`, { ttl: 30 * 60 * 1000 });
  if (!r.results.length) throw httpError(404, "Title not found.");
  return fromItunes(r.results[0]);
}

module.exports = { search, popular, catalog, getById };
