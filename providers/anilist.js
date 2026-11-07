// FAST adapter for anime (https://graphql.anilist.co). No key.
// GraphQL lets us ask for ONLY the fields we need, so the answer is small and fast.
// jikan.js uses it first for everything: sync, search and the detail page (with streaming links).
// Jikan is only the backup if AniList is down. It returns the same "jikan:<MAL id>" titles,
// so saved catalog entries and watchlist entries stay valid whichever service answered.
const { fetchJson } = require("../lib/http");
const { httpError } = require("../lib/errors");
const { toTitle } = require("../lib/model");

const FIELDS = `idMal title { romaji english } genres seasonYear averageScore episodes duration
    isAdult description(asHtml: false) coverImage { large } studios(isMain: true) { nodes { name } }`;

// the detail page also asks for the streaming sites (Crunchyroll, Netflix...); lists skip this to stay small
const DETAIL_FIELDS = `${FIELDS} externalLinks { site url type isDisabled }`;

const LIST = `query ($search: String, $sort: [MediaSort]) {
    Page(page: 1, perPage: 50) { media(type: ANIME, isAdult: false, search: $search, sort: $sort) { ${FIELDS} } } }`;
const ONE = `query ($mal: Int) { Media(type: ANIME, idMal: $mal) { ${DETAIL_FIELDS} } }`;

const post = async (query, variables) => (await fetchJson("https://graphql.anilist.co", {
    method: "POST", timeout: 8000, retries: 0,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables })
})).data;

const stripHtml = h => String(h ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

// AniList lists every outside link of a title; we keep only the streaming sites, one chip per site
function streamingLinks(a) {
    const seen = new Set();
    return (a.externalLinks || [])
        .filter(l => l.type === "STREAMING" && !l.isDisabled && l.url && l.site && !seen.has(l.site) && seen.add(l.site))
        .map(l => ({ name: l.site, url: l.url, price: "Varies" }));
}

// the mapping: AniList field -> our field (the id is the MyAnimeList id so keys match Jikan's)
function toCanonical(a) {
    return toTitle({
        source: "jikan", id: a.idMal, type: "anime", title: a.title?.english || a.title?.romaji,
        genres: a.genres || [], year: a.seasonYear,
        ageRating: a.isAdult ? "R18" : null,
        score: a.averageScore ? Math.round(a.averageScore) / 10 : null,   // AniList scores are 0-100
        episodes: a.episodes, lengthMinutes: a.duration,
        creators: (a.studios?.nodes || []).map(s => s.name),
        synopsis: stripHtml(a.description), posterUrl: a.coverImage?.large,
        links: streamingLinks(a)
    });
}

const list = async variables => (await post(LIST, variables)).Page.media.filter(a => a.idMal).map(toCanonical);

const search = q => list({ search: q, sort: ["SEARCH_MATCH"] });
const popular = () => list({ sort: ["POPULARITY_DESC"] });
async function getById(id) {
    const r = await post(ONE, { mal: Number(id) });
    if (!r.Media) throw httpError(404, "Title not found.");     // then jikan.js asks Jikan instead
    return toCanonical(r.Media);
}

module.exports = { search, popular, getById };