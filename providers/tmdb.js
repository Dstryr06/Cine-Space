// Shared TMDB client (https://developer.themoviedb.org). Used by movies.js and tmdbtv.js.
const { fetchJson } = require("../lib/http");
const { httpError } = require("../lib/errors");

const BASE = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";
const HOUR = 3600 * 1000, DAY = 24 * HOUR;

const hasToken = () => !!process.env.TMDB_TOKEN;

function call(path, opts = {}) {
  if (!hasToken()) throw httpError(503, "TMDB is not configured (set TMDB_TOKEN in .env).");
  return fetchJson(`${BASE}${path}`, { headers: { Authorization: `Bearer ${process.env.TMDB_TOKEN}` }, ...opts });
}

const img = (p, size = "w342") => p ? `${IMG}/${size}${p}` : "";
const year = d => d ? Number(String(d).slice(0, 4)) || null : null;

// the region used for "where to watch": ?region=XX from the app, else WATCH_REGION from .env, else the Philippines
const regionOf = r => /^[A-Za-z]{2}$/.test(r || "") ? r.toUpperCase() : (process.env.WATCH_REGION || "PH").toUpperCase();

// TMDB certifications -> the five labels Cine Space uses
function ageRating(raw) {
  const r = String(raw || "").toUpperCase().trim();
  if (["G", "TV-G", "TV-Y", "TV-Y7", "TV-Y7-FV"].includes(r)) return "G";
  if (["PG", "TV-PG"].includes(r)) return "PG";
  if (["PG-13", "TV-14"].includes(r)) return "PG-13";
  if (["R", "TV-MA"].includes(r)) return "R";
  if (r === "NC-17") return "R18";
  return null;
}

// TMDB "watch/providers" block -> [{ name, kind, url, logoUrl, region }] for one region
const KIND = { flatrate: "stream", free: "free", ads: "free", rent: "rent", buy: "buy" };
function platformsFrom(block, region) {
  const entry = block?.results?.[region], platforms = [];
  for (const [key, kind] of Object.entries(KIND)) {
    for (const p of entry?.[key] || []) {
      if (!platforms.some(x => x.name === p.provider_name && x.kind === kind))
        platforms.push({ name: p.provider_name, kind, url: entry.link || "", logoUrl: img(p.logo_path, "w92"), region });
    }
  }
  return { platforms, watchRegions: Object.keys(block?.results || {}).sort() };
}

const genreNames = async kind => {
  const r = await call(`/genre/${kind}/list?language=en-US`, { ttl: DAY });
  return new Map(r.genres.map(g => [g.id, g.name]));
};

module.exports = { call, hasToken, img, year, regionOf, ageRating, platformsFrom, genreNames, HOUR, DAY };
