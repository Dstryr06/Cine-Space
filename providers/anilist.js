// FAST adapter for anime (https://graphql.anilist.co). No key.
// GraphQL lets us ask for ONLY the fields we need, so the answer is small and fast.
// jikan.js uses it for sync and search (and as backup for the detail page). It returns the same "jikan:<MAL id>" titles,
// so saved catalog entries and library entries stay valid whichever service answered.
const { fetchJson } = require("../lib/http");
const { toTitle } = require("../lib/model");

const FIELDS = `idMal title { romaji english } genres seasonYear averageScore episodes duration status
    isAdult description(asHtml: false) coverImage { extraLarge large } bannerImage studios(isMain: true) { nodes { name } }`;
const EXTRA = `popularity tags { name } externalLinks { site url type }`;

const LIST = `query ($search: String, $sort: [MediaSort]) {
    Page(page: 1, perPage: 50) { media(type: ANIME, isAdult: false, search: $search, sort: $sort) { ${FIELDS} } } }`;
const ONE = `query ($mal: Int) { Media(type: ANIME, idMal: $mal) { ${FIELDS} ${EXTRA} } }`;

const post = async (query, variables, ttl) => (await fetchJson("https://graphql.anilist.co", {
  method: "POST", timeout: 8000, retries: 0, ttl,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ query, variables })
})).data;

const stripHtml = h => String(h ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const pretty = s => String(s || "").toLowerCase().replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase());

// the mapping: AniList field -> Cine Space field (the id is the MyAnimeList id so keys match Jikan's)
function toCanonical(a) {
  const episodes = a.episodes || null;
  return toTitle({
    source: "jikan", id: a.idMal, type: "anime", title: a.title?.english || a.title?.romaji,
    originalTitle: a.title?.english && a.title?.romaji !== a.title.english ? a.title.romaji : "",
    genres: a.genres || [], year: a.seasonYear, ageRating: a.isAdult ? "R18" : null,
    publicRating: a.averageScore ? { value: a.averageScore / 10, source: "AniList" } : null,   // AniList scores are 0-100
    episodes, seasons: episodes ? [{ number: 1, episodes, name: "Season 1" }] : [],
    showStatus: pretty(a.status), lengthMinutes: a.duration,
    creators: (a.studios?.nodes || []).map(s => s.name), studios: (a.studios?.nodes || []).map(s => s.name),
    keywords: (a.tags || []).map(t => t.name),
    synopsis: stripHtml(a.description), posterUrl: a.coverImage?.extraLarge || a.coverImage?.large, backdropUrl: a.bannerImage,
    platforms: (a.externalLinks || []).filter(l => l.type === "STREAMING").map(l => ({ name: l.site, kind: "stream", url: l.url }))
  });
}

const list = async variables => (await post(LIST, variables, 5 * 60 * 1000)).Page.media.filter(a => a.idMal).map(toCanonical);

const search = q => list({ search: q, sort: ["SEARCH_MATCH"] });
const popular = () => list({ sort: ["POPULARITY_DESC"] });
async function getById(id) {
  const r = await post(ONE, { mal: Number(id) }, 30 * 60 * 1000);
  return toCanonical(r.Media);
}

module.exports = { search, popular, getById };
