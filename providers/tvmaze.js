// ADAPTER for series using TVmaze (https://api.tvmaze.com). No key.
const { fetchJson } = require("../lib/http");
const { toTitle } = require("../lib/model");
const BASE = "https://api.tvmaze.com";

// TVmaze summaries contain HTML tags; the canonical model stores plain text
const stripHtml = html => String(html ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

// the mapping: TVmaze field -> our field (TVmaze has no age rating, so ageRating stays null)
function toCanonical(s, episodes = null) {
  const links = [];
  if (s.webChannel?.officialSite) links.push({ name: `${s.webChannel.name} (official)`, url: s.webChannel.officialSite, price: "Varies" });
  if (s.officialSite) links.push({ name: "Official site", url: s.officialSite, price: "Varies" });
  return toTitle({
    source: "tvmaze", id: s.id, type: "series", title: s.name,
    genres: s.genres || [], year: s.premiered ? Number(s.premiered.slice(0, 4)) : null,
    score: s.rating?.average, episodes,
    lengthMinutes: s.averageRuntime ?? s.runtime ?? null,
    creators: [s.network?.name || s.webChannel?.name].filter(Boolean),
    synopsis: stripHtml(s.summary),
    posterUrl: (s.image?.medium || "").replace(/^http:/, "https:"),
    links
  });
}

async function search(q) {
  const r = await fetchJson(`${BASE}/search/shows?q=${encodeURIComponent(q)}`);
  return r.slice(0, 12).map(x => toCanonical(x.show));
}

// TVmaze has no "popular" list: take the first page (up to 250 shows, the most TVmaze sends at once)
// and keep every show that has a rating, best first
async function popular() {
  const shows = await fetchJson(`${BASE}/shows?page=0`, { timeout: 15000 });
  return shows
    .filter(s => s.rating?.average)
    .sort((a, b) => b.rating.average - a.rating.average)
    .map(s => toCanonical(s));
}

// embed=episodes lets us count the episodes (needed for episode progress on the watchlist)
async function getById(id) {
    const s = await fetchJson(`${BASE}/shows/${encodeURIComponent(id)}?embed=episodes`);
    return toCanonical(s, s._embedded?.episodes?.length ?? null);
}

module.exports = { search, popular, getById };