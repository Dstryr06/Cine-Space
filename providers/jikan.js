// ADAPTER for anime (https://api.jikan.moe/v4). No key. About 3 requests per second.
const { fetchJson } = require("../lib/http");
const { toTitle } = require("../lib/model");
const BASE = "https://api.jikan.moe/v4";

const anilist = require("./anilist");

// HYBRID: lists (sync + search) come from AniList: fast, 50 titles per request.
// The detail page tries Jikan first (it has age ratings and streaming links) and uses AniList if Jikan is slow.
// If a service fails, the other one answers instead.
const get = url => fetchJson(url, { timeout: 8000, retries: 0 });
const withBackup = (name, main, fallback) => main().catch(err => { console.warn(`${name} failed (${err.message}), using the other anime service.`); return fallback(); });

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

const search = q => withBackup("AniList", () => anilist.search(q), async () => (await get(`${BASE}/anime?q=${encodeURIComponent(q)}&limit=25`)).data.map(toCanonical));
const popular = () => withBackup("AniList", () => anilist.popular(), async () => (await get(`${BASE}/top/anime?limit=25`)).data.map(toCanonical));
const getById = id => withBackup("Jikan", () => fromJikan(id), () => anilist.getById(id));

async function fromJikan(id) {
    const t = toCanonical((await get(`${BASE}/anime/${encodeURIComponent(id)}`)).data);
    // where to watch: Jikan lists streaming sites on a separate endpoint; if it fails we still return the title
    try {
        const s = await get(`${BASE}/anime/${encodeURIComponent(id)}/streaming`);
        t.links = (s.data || []).map(x => ({ name: x.name, url: x.url, price: "Varies" }));
    } catch (e) { /* ignore */ }
    return t;
}

module.exports = { search, popular, getById };