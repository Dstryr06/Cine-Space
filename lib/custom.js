// Movies, TV shows and anime the user adds by hand because they aren't in the online catalog (data/custom-shows.json, posters in data/uploads/posters).
// Every show belongs to the user who created it: only they see it, edit it, or delete it.
// A stored record is plain data; toMedia() turns it into the same canonical title shape as every other source (key "custom:<id>"),
// so cards, filters, the library, progress tracking and the randomizer treat it like any other show.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const store = require("./store");
const { httpError } = require("./errors");
const { toTitle } = require("./model");
const catalog = require("./catalog");
const library = require("./library");
const progress = require("./progress");
const image = require("./image");

const FILE = "custom-shows.json";
const GENRES = ["Action", "Adventure", "Animation", "Comedy", "Crime", "Drama", "Family", "Fantasy", "History", "Horror", "Kids", "Music",
    "Mystery", "Reality", "Romance", "Sci-Fi", "Slice of Life", "Sports", "Supernatural", "Thriller"];
const STATUSES = ["Ongoing", "Ended"];
const TYPES = ["movie", "series", "anime"];                  // what the user is adding; the form's Type picker offers exactly these
const TYPE_NAME = { movie: "Movie", series: "TV show", anime: "Anime" };
const LIMITS = { title: 120, synopsis: 2000, genres: 5, seasons: 40, episodes: 500 };

const postersDir = () => path.join(store.dir(), "uploads", "posters");
const posterUrl = r => (r.posterFile ? `/uploads/posters/${r.posterFile}` : "");
const now = () => new Date().toISOString();
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

const all = () => store.read(FILE);
const find = (userId, id) => all().find(r => r.userId === userId && r.id === id) || null;

function toMedia(r) {
    return toTitle({
    source: "custom", id: r.id, type: r.type || "series", title: r.title, year: r.year, genres: r.genres, synopsis: r.synopsis,
    showStatus: r.showStatus, seasons: r.seasons, posterUrl: posterUrl(r)
    });
}
const mediaOf = (userId, id) => { const r = find(userId, id); return r ? toMedia(r) : null; };
const mediaList = userId => all().filter(r => r.userId === userId).map(toMedia);

// ---------- validation ----------
// returns { value, fields } where fields maps an input name to its problem (empty = valid)
function parse(body = {}) {
    const fields = {}, value = {};
    const type = String(body.type ?? "series").trim() || "series";
    if (!TYPES.includes(type)) fields.type = "Choose Movie, TV show or Anime.";
    value.type = type;

    const title = String(body.title ?? "").replace(/\s+/g, " ").trim();
    if (!title) fields.title = "Enter the show’s title.";
    else if (title.length > LIMITS.title) fields.title = `Title must be ${LIMITS.title} characters or fewer.`;
    value.title = title;

    const rawYear = body.year;
    if (rawYear === undefined || rawYear === null || rawYear === "") value.year = null;
    else if (!Number.isInteger(Number(rawYear)) || Number(rawYear) < 1870 || Number(rawYear) > 2100) fields.year = "Year must be between 1870 and 2100.";
    else value.year = Number(rawYear);

    const status = String(body.showStatus ?? "").trim();
    if (status && !STATUSES.includes(status)) fields.showStatus = `Status must be ${STATUSES.join(" or ")}.`;
    value.showStatus = status;

    const genres = body.genres === undefined ? [] : body.genres;
    if (!Array.isArray(genres) || genres.some(g => !GENRES.includes(g))) fields.genres = "Choose genres from the list.";
    else if (new Set(genres).size > LIMITS.genres) fields.genres = `Choose up to ${LIMITS.genres} genres.`;
    value.genres = Array.isArray(genres) ? [...new Set(genres)] : [];

    const synopsis = String(body.synopsis ?? "").trim();
    if (synopsis.length > LIMITS.synopsis) fields.synopsis = `Synopsis must be ${LIMITS.synopsis} characters or fewer.`;
    value.synopsis = synopsis;

  // seasons come as a list of episode counts or { episodes } objects; numbering is always 1, 2, 3...
    const rawSeasons = body.seasons === undefined ? [] : body.seasons;
    if (!Array.isArray(rawSeasons) || rawSeasons.length > LIMITS.seasons) fields.seasons = `Add up to ${LIMITS.seasons} seasons.`;
    else {
    const counts = rawSeasons.map(s => (s && typeof s === "object" ? s.episodes : s));
    if (counts.some(n => !Number.isInteger(n) || n < 1 || n > LIMITS.episodes)) fields.seasons = `Each season needs a whole number of episodes from 1 to ${LIMITS.episodes}.`;
    value.seasons = counts.map((episodes, i) => ({ number: i + 1, episodes }));
    }
    if (!value.seasons || value.type === "movie") value.seasons = [];       // a movie has no seasons
    return { value, fields };
}

const invalid = fields => httpError(400, "Validation failed.", Object.values(fields), fields);

// the point of this feature is shows the catalog doesn't have: say so when it does
function checkNotDuplicate(userId, v, selfId) {
    // same kind of title (movie / TV show / anime), same name or same original name, and the same year when both have one
    const name = norm(v.title);
    const same = t => (t.type || "series") === v.type && (norm(t.title) === name || (t.originalTitle && norm(t.originalTitle) === name)) && (!t.year || !v.year || t.year === v.year);
    if (all().some(r => r.userId === userId && r.id !== selfId && same(r))) {
    const own = `You already added a ${TYPE_NAME[v.type].toLowerCase()} with this title.`;
    throw httpError(409, "Duplicate show.", [own], { title: own });
    }
    const hit = catalog.load().items.find(same);
    if (hit) {
    const msg = `“${hit.title}” (${TYPE_NAME[hit.type]}) is already in the catalog. Search for it and add it to your library instead.`;
    throw httpError(409, "Already in the catalog.", [msg], { title: msg });
    }
}

// ---------- create / update / delete ----------
function create(userId, body) {
    const { value, fields } = parse(body);
    if (Object.keys(fields).length) throw invalid(fields);
    checkNotDuplicate(userId, value);
    const at = now();
    const record = { id: crypto.randomUUID(), userId, ...value, posterFile: "", createdAt: at, updatedAt: at };
    const rows = all(); rows.push(record); store.write(FILE, rows);
    return record;
}

function update(userId, id, body) {
    const { value, fields } = parse(body);
    if (Object.keys(fields).length) throw invalid(fields);
    const rows = all(), record = rows.find(r => r.userId === userId && r.id === id);
    if (!record) throw httpError(404, "Show not found.");
    checkNotDuplicate(userId, value, id);
    Object.assign(record, value, { updatedAt: now() });
    store.write(FILE, rows);
  library.syncCustom(userId, toMedia(record));          // saved library copies follow the edit
    return record;
}

function removeFile(name) { if (name) fs.promises.unlink(path.join(postersDir(), name)).catch(() => {}); }

function remove(userId, id) {
    const rows = all(), record = rows.find(r => r.userId === userId && r.id === id);
    if (!record) throw httpError(404, "Show not found.");
    store.write(FILE, rows.filter(r => r !== record));
    removeFile(record.posterFile);
    return { record, removedFromLibrary: library.dropCustom(userId, `custom:${id}`) };
}

// ---------- poster ----------
function setPoster(userId, id, buffer) {
    const info = image.inspect(buffer);
    if (!info) throw httpError(415, "Unsupported image.", ["Upload a JPG, PNG or WebP image."], { poster: "Upload a JPG, PNG or WebP image." });
    const problems = image.posterProblems(info);
    if (problems.length) throw httpError(400, "Poster not accepted.", problems, { poster: problems[0] });

    const rows = all(), record = rows.find(r => r.userId === userId && r.id === id);
    if (!record) throw httpError(404, "Show not found.");
  const file = `${crypto.randomUUID()}.${info.ext}`;           // a new name every time, so browsers never show the old poster from cache
    fs.mkdirSync(postersDir(), { recursive: true });
  fs.writeFileSync(path.join(postersDir(), file), buffer);     // the bytes are stored exactly as uploaded: no re-compression, no quality loss
    const old = record.posterFile;
    record.posterFile = file; record.updatedAt = now();
    store.write(FILE, rows);
    removeFile(old);
    library.syncCustom(userId, toMedia(record));
    return { record, info };
}

function clearPoster(userId, id) {
    const rows = all(), record = rows.find(r => r.userId === userId && r.id === id);
    if (!record) throw httpError(404, "Show not found.");
    const old = record.posterFile;
    record.posterFile = ""; record.updatedAt = now();
    store.write(FILE, rows);
    removeFile(old);
    library.syncCustom(userId, toMedia(record));
    return record;
}

const options = () => ({ genres: GENRES, statuses: STATUSES, types: TYPES, limits: LIMITS, poster: image.POSTER });

module.exports = { GENRES, STATUSES, TYPES, find, toMedia, mediaOf, mediaList, create, update, remove, setPoster, clearPoster, options, posterUrl };