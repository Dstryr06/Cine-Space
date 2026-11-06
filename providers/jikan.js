// ADAPTER for anime (https://api.jikan.moe/v4). No key. About 3 requests per second.
const { fetchJson } = require("../lib/http");
const { toTitle } = require("../lib/model");
const BASE = "https://api.jikan.moe/v4";

// Jikan writes ratings like "PG-13 - Teens 13 or older"; we keep PG, PG-13, R, R18
function ageRating(text) {
if (text.startsWith("PG-13")) return "PG-13";
if (text.startsWith("PG") || text.startsWith("G ")) return "PG";
if (text.startsWith("R+") || text.startsWith("Rx")) return "R18";
if (text.startsWith("R ")) return "R";
return null;
}

// the mapping: Jikan field -> our field
function toCanonical(a) {
return toTitle({
    source: "jikan", id: a.mal_id, type: "anime", title: a.title_english || a.title,
    genres: (a.genres || []).map(g => g.name), year: a.year ?? a.aired?.prop?.from?.year,
    ageRating: ageRating(a.rating || ""), score: a.score, episodes: a.episodes,
    lengthMinutes: parseInt(a.duration) || null, creators: (a.studios || []).map(s => s.name),
    synopsis: a.synopsis, posterUrl: a.images?.jpg?.image_url
});
}

async function search(q) { return (await fetchJson(`${BASE}/anime?q=${encodeURIComponent(q)}&limit=12`)).data.map(toCanonical); }
async function popular() { return (await fetchJson(`${BASE}/top/anime?limit=12`)).data.map(toCanonical); }
async function getById(id) { return toCanonical((await fetchJson(`${BASE}/anime/${encodeURIComponent(id)}`)).data); }

module.exports = { search, popular, getById };