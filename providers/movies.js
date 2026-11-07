// ADAPTER for movies. Uses TMDB (https://www.themoviedb.org) when TMDB_TOKEN is set in .env,
// otherwise falls back to the iTunes Search API (no key, but it returns nothing in some regions).
const { fetchJson } = require("../lib/http");
const { httpError } = require("../lib/errors");
const { toTitle } = require("../lib/model");

const TMDB = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p/w300";
const ITUNES = "https://itunes.apple.com";
const useTmdb = () => !!process.env.TMDB_TOKEN;
const tmdb = path => fetchJson(`${TMDB}${path}`, { headers: { Authorization: `Bearer ${process.env.TMDB_TOKEN}` } });

// ---------- shared ----------
function ageRating(r) {
    if (r === "PG" || r === "PG-13" || r === "R") return r;
    if (r === "G") return "PG";
    if (r === "NC-17") return "R18";
    return null;
}

// ---------- TMDB ----------
let genreMap = null;   // id -> name, loaded once
async function genres() {
    if (!genreMap) genreMap = new Map((await tmdb("/genre/movie/list?language=en-US")).genres.map(g => [g.id, g.name]));
    return genreMap;
}

function fromTmdb(m, extra = {}) {
    return toTitle({
        source: "movies", id: m.id, type: "movie", title: m.title,
        genres: extra.genres || [], year: m.release_date ? Number(m.release_date.slice(0, 4)) : null,
        ageRating: extra.ageRating ?? null, score: m.vote_average ? Math.round(m.vote_average * 10) / 10 : null,
        lengthMinutes: m.runtime || null, creators: extra.creators || [],
        synopsis: m.overview, posterUrl: m.poster_path ? IMG + m.poster_path : "", links: extra.links || []
    });
}

async function tmdbList(path) {
    const [map, r] = await Promise.all([genres(), tmdb(path)]);
    return r.results.slice(0, 20).map(m => fromTmdb(m, { genres: (m.genre_ids || []).map(id => map.get(id)).filter(Boolean) }));
}

async function tmdbById(id) {
    const m = await tmdb(`/movie/${encodeURIComponent(id)}?language=en-US&append_to_response=release_dates,credits,watch/providers`);
    const us = (m.release_dates?.results || []).find(x => x.iso_3166_1 === "US");
    const cert = us?.release_dates.map(d => d.certification).find(Boolean);
    const wp = m["watch/providers"]?.results || {};
    const region = wp.PH || wp.US;     // TMDB gives a JustWatch page listing where the movie streams
    // one chip per service (Netflix, Apple TV...) with how it is offered; they all open that JustWatch page
    const links = [], seen = new Set();
    if (region?.link) {
        for (const [field, label] of [["flatrate", "Stream"], ["free", "Free"], ["ads", "Free with ads"], ["rent", "Rent"], ["buy", "Buy"]]) {
            for (const p of region[field] || []) {
                if (links.length < 8 && p.provider_name && !seen.has(p.provider_name)) {
                    seen.add(p.provider_name);
                    links.push({ name: p.provider_name, url: region.link, price: label });
                }
            }
        }
        links.push({ name: "All options (JustWatch)", url: region.link, price: "Varies" });
    }
    return fromTmdb(m, {
        genres: (m.genres || []).map(g => g.name), ageRating: ageRating(cert),
        creators: (m.credits?.crew || []).filter(c => c.job === "Director").map(c => c.name),
        links
    });
}

// ---------- iTunes (fallback) ----------
function fromItunes(m) {
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
const itunesSearch = async q => (await fetchJson(`${ITUNES}/search?media=movie&entity=movie&country=US&limit=50&term=${encodeURIComponent(q)}`)).results.map(fromItunes);

// ---------- public API (same for both) ----------
async function search(q) {
    if (useTmdb()) return tmdbList(`/search/movie?language=en-US&include_adult=false&query=${encodeURIComponent(q)}`);
    return itunesSearch(q);
}

async function popular() {
    return useTmdb() ? tmdbList("/movie/popular?language=en-US&page=1") : itunesSearch("adventure");
}

// what "Sync Catalog" saves for movies
// TMDB sends 20 movies per page, so we read 5 pages of "popular" and 5 of "top rated" (up to ~200 movies, duplicates removed)
const PAGES = 5;
async function catalog() {
    if (useTmdb()) {
        await genres();   // load the genre names once before the page requests run in parallel
        const pages = [...Array(PAGES).keys()].map(i => i + 1);
        const lists = await Promise.all(pages.flatMap(p => [
            tmdbList(`/movie/popular?language=en-US&page=${p}`),
            tmdbList(`/movie/top_rated?language=en-US&page=${p}`)
        ]));
        return lists.flat();
    }
    const lists = await Promise.all(["adventure", "action", "comedy", "drama", "horror"].map(itunesSearch));
    return lists.flat();
}

async function getById(id) {
    if (useTmdb()) return tmdbById(id);
    const r = await fetchJson(`${ITUNES}/lookup?id=${encodeURIComponent(id)}&entity=movie`);
    if (!r.results.length) throw httpError(404, "Title not found.");
    return fromItunes(r.results[0]);
}

module.exports = { search, popular, catalog, getById };