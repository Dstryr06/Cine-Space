// ADAPTER for anime (https://api.jikan.moe/v4). No key. About 3 requests per second.
const { fetchJson } = require("../lib/http");
const { toTitle } = require("../lib/model");
const BASE = "https://api.jikan.moe/v4";

const anilist = require("./anilist");

// HYBRID: AniList answers everything first (sync, search and the detail page with its streaming links): fast, one small request.
// Jikan is the backup. It is slower, but it also knows age ratings (PG, PG-13, R), so it answers when AniList is down.
// If a service fails, the other one answers instead.
const get = url => fetchJson(url, { timeout: 6000, retries: 0 });
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
// Detail page: AniList first (fast, and it has the streaming links); Jikan only if AniList fails or does not know the title.
const getById = id => withBackup("AniList", () => anilist.getById(id), () => fromJikan(id));

async function fromJikan(id) {
    const safeId = encodeURIComponent(id);
    // the title and its streaming sites are asked at the same time (before: one after the other)
    // where to watch is optional: if that endpoint fails we still return the title
    const [main, streaming] = await Promise.all([
        get(`${BASE}/anime/${safeId}`),
        get(`${BASE}/anime/${safeId}/streaming`).catch(() => null)
    ]);
    const t = toCanonical(main.data);
    if (streaming) t.links = (streaming.data || []).map(x => ({ name: x.name, url: x.url, price: "Varies" }));
    return t;
}

module.exports = { search, popular, getById };