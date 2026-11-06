// FAST adapter for anime lists (https://graphql.anilist.co). No key.
// GraphQL lets us ask for ONLY the fields we need, so the answer is small and fast.
// jikan.js uses it for sync and search (and as backup for the detail page). It returns the same "jikan:<MAL id>" titles,
// so saved catalog entries and watchlist entries stay valid whichever service answered.
const { fetchJson } = require("../lib/http");
const { toTitle } = require("../lib/model");

const FIELDS = `idMal title { romaji english } genres seasonYear averageScore episodes duration
    isAdult description(asHtml: false) coverImage { large } studios(isMain: true) { nodes { name } }`;

const LIST = `query ($search: String, $sort: [MediaSort]) {
    Page(page: 1, perPage: 50) { media(type: ANIME, isAdult: false, search: $search, sort: $sort) { ${FIELDS} } } }`;
const ONE = `query ($mal: Int) { Media(type: ANIME, idMal: $mal) { ${FIELDS} } }`;

const post = async (query, variables) => (await fetchJson("https://graphql.anilist.co", {
    method: "POST", timeout: 10000, retries: 0,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables })
})).data;

const stripHtml = h => String(h ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

// the mapping: AniList field -> our field (the id is the MyAnimeList id so keys match Jikan's)
function toCanonical(a) {
    return toTitle({
        source: "jikan", id: a.idMal, type: "anime", title: a.title?.english || a.title?.romaji,
        genres: a.genres || [], year: a.seasonYear,
        ageRating: a.isAdult ? "R18" : null,
        score: a.averageScore ? Math.round(a.averageScore) / 10 : null,   // AniList scores are 0-100
        episodes: a.episodes, lengthMinutes: a.duration,
        creators: (a.studios?.nodes || []).map(s => s.name),
        synopsis: stripHtml(a.description), posterUrl: a.coverImage?.large
    });
}

const list = async variables => (await post(LIST, variables)).Page.media.filter(a => a.idMal).map(toCanonical);

const search = q => list({ search: q, sort: ["SEARCH_MATCH"] });
const popular = () => list({ sort: ["POPULARITY_DESC"] });
async function getById(id) {
    const r = await post(ONE, { mal: Number(id) });
    return toCanonical(r.Media);
}

module.exports = { search, popular, getById };