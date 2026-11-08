// ADAPTER for anime: a HYBRID of two free services, so that nobody waits for the slow one.
//  - AniList (https://graphql.anilist.co) is the MAIN source: one fast request gives 50 titles or a whole detail page.
//  - Jikan (https://api.jikan.moe/v4, MyAnimeList) is slower and rate limited, so it never holds up a page.
//    A background queue asks it, one title at a time, for what AniList lacks (age rating, MyAnimeList score with votes)
//    and remembers the answers. Titles show those extras as soon as they are known.
//  - If AniList is down, Jikan answers on its own (slower, but the page still works).
const { fetchJson } = require("../lib/http");
const { toTitle } = require("../lib/model");
const logger = require("../lib/logger");
const anilist = require("./anilist");
const BASE = "https://api.jikan.moe/v4";

const get = (url, ttl) => fetchJson(url, { timeout: 7000, retries: 0, ttl });
const EXTRAS_TIMEOUT_MS = Number(process.env.JIKAN_EXTRAS_TIMEOUT_MS) || 3000;
const getQuick = (url, ttl) => fetchJson(url, { timeout: EXTRAS_TIMEOUT_MS, retries: 0, ttl });
const withBackup = (name, main, fallback) => main().catch(err => { logger.warn(`${name} failed (${err.message}), using the other anime service.`); return fallback(); });

// Jikan writes ratings like "PG-13 - Teens 13 or older"; we keep G, PG, PG-13, R, R18
function ageRating(text) {
    if (text.startsWith("PG-13")) return "PG-13";
    if (text.startsWith("PG")) return "PG";
    if (text.startsWith("G ")) return "G";
    if (text.startsWith("R+") || text.startsWith("Rx")) return "R18";
    if (text.startsWith("R ")) return "R";
    return null;
}

// the mapping: Jikan field -> Cine Space field
function toCanonical(a) {
    const episodes = a.episodes || null;
    return toTitle({
    source: "jikan", id: a.mal_id, type: "anime", title: a.title_english || a.title,
    originalTitle: a.title_english && a.title !== a.title_english ? a.title : "",
    genres: [...(a.genres || []), ...(a.themes || [])].map(g => g.name), year: a.year ?? a.aired?.prop?.from?.year,
    ageRating: ageRating(a.rating || ""),
    publicRating: a.score ? { value: a.score, votes: a.scored_by, source: "MyAnimeList" } : null,
    episodes, seasons: episodes ? [{ number: 1, episodes, name: "Season 1" }] : [], showStatus: a.status,
    lengthMinutes: parseInt(a.duration) || null, creators: (a.studios || []).map(s => s.name), studios: (a.studios || []).map(s => s.name),
    synopsis: a.synopsis, posterUrl: a.images?.jpg?.large_image_url || a.images?.jpg?.image_url
    });
}

const searchJikan = async q => (await get(`${BASE}/anime?q=${encodeURIComponent(q)}&limit=25&sfw=true`, 5 * 60 * 1000)).data.map(toCanonical);
const popularJikan = async () => (await get(`${BASE}/top/anime?limit=25`, 3600 * 1000)).data.map(toCanonical);


// ---------- background extras from Jikan ----------
const extras = new Map();     // MyAnimeList id -> { ageRating, publicRating }, kept while the server runs
const queue = [];             // ids waiting to be asked
const WARM_GAP_MS = 1100;     // Jikan allows about 3 requests per second and 60 per minute
const MAX_QUEUE = 100;
let running = false;
const sleep = ms => new Promise(done => setTimeout(done, ms));

// adds the extras to a title when we already know them
const withExtras = t => {
    const x = extras.get(t.id);
    return x ? toTitle({ ...t, ageRating: x.ageRating || t.ageRating, publicRating: x.publicRating || t.publicRating }) : t;
};

async function jikanExtras(id) {
  const j = toCanonical((await getQuick(`${BASE}/anime/${encodeURIComponent(id)}`, 30 * 60 * 1000)).data);
    return { ageRating: j.ageRating, publicRating: j.publicRating };
}

// puts ids in the queue and works through it in the background, one request at a time
function warm(ids, urgent = false) {
    for (const raw of ids) {
    const id = String(raw);
    if (extras.has(id) || queue.includes(id) || queue.length >= MAX_QUEUE) continue;
    urgent ? queue.unshift(id) : queue.push(id);
    }
    if (running) return;
    running = true;
    (async () => {
    let fails = 0;
    while (queue.length) {
        const id = queue.shift();
        try { extras.set(id, await jikanExtras(id)); fails = 0; }
      catch (e) { if (++fails >= 3) { queue.length = 0; break; } }   // Jikan is struggling: stop and try again later
        await sleep(WARM_GAP_MS);
    }
    running = false;
    })();
}

const known = list => { warm(list.map(t => t.id)); return list.map(withExtras); };

const search = q => withBackup("AniList", () => anilist.search(q).then(known), () => searchJikan(q));
const popular = () => withBackup("AniList", () => anilist.popular().then(known), popularJikan);

// DETAIL PAGE: AniList answers at once. Jikan is asked in the background and its extras are used when known.
async function getById(id, opts) {
    let t;
    try { t = await anilist.getById(id, opts); }
    catch (err) {
    logger.warn(`AniList failed (${err.message}), using Jikan for the detail page.`);
    return fromJikan(id);   // AniList is down: the full Jikan answer
    }
    warm([id], true);
    return withExtras(t);
}

async function fromJikan(id) {
  const t = toCanonical((await get(`${BASE}/anime/${encodeURIComponent(id)}`, 30 * 60 * 1000)).data);
  // where to watch: Jikan lists streaming sites on a separate endpoint; if it fails we still return the title
    try {
    const s = await get(`${BASE}/anime/${encodeURIComponent(id)}/streaming`, 30 * 60 * 1000);
    t.platforms = (s.data || []).map(x => ({ name: x.name, url: x.url, kind: "stream" }));
  } catch (e) { /* the title is still useful without streaming links */ }
    return t;
}


// when the server starts, warm up the anime already saved in the catalog (not while the tests run)
if (require.main && /server\.js$/.test(require.main.filename)) {
    setTimeout(() => {
    try { warm(require("../lib/catalog").load().items.filter(t => t.type === "anime").map(t => t.id)); }
    catch (e) { /* no catalog yet */ }
    }, 4000).unref();
}

module.exports = { search, popular, getById, searchJikan, searchAnilist: q => anilist.search(q).then(known) };