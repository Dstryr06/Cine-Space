// ADAPTER for movies using the iTunes Search API (https://itunes.apple.com). No key. About 20 requests per minute.
const { fetchJson } = require("../lib/http");
const { httpError } = require("../lib/errors");
const { toTitle } = require("../lib/model");
const BASE = "https://itunes.apple.com";

function ageRating(r) {
    if (r === "PG" || r === "PG-13" || r === "R") return r;
    if (r === "G") return "PG";
    if (r === "NC-17") return "R18";
    return null;
}

function toCanonical(m) {
    return toTitle({
    source: "movies", id: m.trackId, type: "movie", title: m.trackName,
    genres: [m.primaryGenreName].filter(Boolean), year: m.releaseDate ? Number(m.releaseDate.slice(0, 4)) : null,
    ageRating: ageRating(m.contentAdvisoryRating),
    lengthMinutes: m.trackTimeMillis ? Math.round(m.trackTimeMillis / 60000) : null,
    creators: [m.artistName].filter(Boolean), synopsis: m.longDescription || m.shortDescription,
    posterUrl: (m.artworkUrl100 || "").replace("100x100", "300x300"),
    links: m.trackViewUrl ? [{ name: "Apple TV (iTunes)", url: m.trackViewUrl, price: "Paid" }] : []
    });
}

async function search(q) { return (await fetchJson(`${BASE}/search?media=movie&entity=movie&limit=12&term=${encodeURIComponent(q)}`)).results.map(toCanonical); }

// iTunes has no "popular" list, so the home page uses a fixed search term
async function popular() { return search("adventure"); }

async function getById(id) {
    const r = await fetchJson(`${BASE}/lookup?id=${encodeURIComponent(id)}&entity=movie`);
    if (!r.results.length) throw httpError(404, "Title not found.");
    return toCanonical(r.results[0]);
}

module.exports = { search, popular, getById };