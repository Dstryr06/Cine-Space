// Shared filter / sort / paginate / facet engine. The library, the catalog browser and the randomizer all use it,
// so "status + type + genre + franchise + mood + tag + A-Z + year range" behave identically everywhere.
// A row is { media, entry? }: media is the canonical title; entry is the user's saved record (library only).
const { httpError } = require("./errors");

const STATUSES = ["to_watch", "watching", "completed", "dropped"];
const TYPES = ["movie", "series", "anime"];
const SORTS = ["title", "year", "rating", "added", "updated", "myrating", "progress"];

const list = v => String(v ?? "").split(",").map(s => s.trim()).filter(Boolean);
const lc = s => s.toLowerCase();

// ---------- alphabetical index ----------
// "The Wire" is filed under W, "A Silent Voice" under S. '#' = anything that doesn't start with a letter.
function indexChar(title) {
  const t = String(title || "").trim().replace(/^(the|an|a)\s+(?=\S)/i, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const c = (t[0] || "").toUpperCase();
  return /[A-Z]/.test(c) ? c : /[0-9]/.test(c) ? c : "#";
}

// accepted: "A", "#", "0-9", "A-F", "3-7"
function parseLetter(raw) {
  const s = String(raw ?? "").trim().toUpperCase();
  if (!s) return null;
  const m = /^([A-Z0-9#])(?:-([A-Z0-9]))?$/.exec(s);
  if (!m) return false;
  const [, a, b] = m;
  if (!b) return { from: a, to: a };
  const isDigit = c => /[0-9]/.test(c), isLetter = c => /[A-Z]/.test(c);
  if (!((isDigit(a) && isDigit(b)) || (isLetter(a) && isLetter(b))) || a > b) return false;
  return { from: a, to: b };
}

function letterMatches(title, spec) {
  const c = indexChar(title);
  if (spec.from === "#") return !/[A-Z]/.test(c);      // numbers and symbols
  if (/[0-9]/.test(spec.from)) return /[0-9]/.test(c) && c >= spec.from && c <= spec.to;
  return /[A-Z]/.test(c) && c >= spec.from && c <= spec.to;
}

// ---------- parsing ----------
function parseFilters(q = {}) {
  const errors = [];
  const f = {
    q: lc(String(q.q ?? "").trim()),
    types: list(q.type).map(lc), statuses: list(q.status).map(lc),
    genres: list(q.genre).map(lc), moods: list(q.mood).map(lc), tags: list(q.tag).map(lc),
    franchise: lc(String(q.franchise ?? "").trim()),
    favorite: q.favorite === "1" || q.favorite === "true",
    reviewed: q.reviewed === "1" || q.reviewed === "true",
    rating: String(q.rating ?? "").trim(),
    sort: String(q.sort ?? "").trim().toLowerCase(), order: String(q.order ?? "").trim().toLowerCase(),
    page: 1, limit: 24, letter: null, yearFrom: null, yearTo: null
  };
  if (f.types.some(t => !TYPES.includes(t))) errors.push("type must be movie, series or anime.");
  if (f.statuses.some(s => !STATUSES.includes(s))) errors.push(`status must be one of ${STATUSES.join(", ")}.`);
  if (f.sort && !SORTS.includes(f.sort)) errors.push(`sort must be one of ${SORTS.join(", ")}.`);
  if (f.order && !["asc", "desc"].includes(f.order)) errors.push("order must be asc or desc.");

  const letter = parseLetter(q.letter);
  if (letter === false) errors.push("letter must look like A, #, 0-9, A-F or 3-7.");
  else f.letter = letter;

  for (const key of ["yearFrom", "yearTo"]) {
    if (q[key] === undefined || q[key] === "") continue;
    const n = Number(q[key]);
    if (!Number.isInteger(n) || n < 1870 || n > 2100) errors.push(`${key} must be a year between 1870 and 2100.`);
    else f[key] = n;
  }
  if (f.yearFrom && f.yearTo && f.yearFrom > f.yearTo) errors.push("yearFrom can't be after yearTo.");

  if (q.page !== undefined) { const n = Number(q.page); if (!Number.isInteger(n) || n < 1) errors.push("page must be a whole number of 1 or more."); else f.page = n; }
  if (q.limit !== undefined) { const n = Number(q.limit); if (!Number.isInteger(n) || n < 1 || n > 100) errors.push("limit must be a whole number from 1 to 100."); else f.limit = n; }

  if (errors.length) throw httpError(400, "Validation failed.", errors);
  return f;
}

// ---------- matching ----------
// `skip` lets facet counts ignore their own criterion (so the status tabs still show the other statuses' counts)
function matches(row, f, skip = []) {
  const m = row.media, e = row.entry;
  const on = k => !skip.includes(k);
  if (f.q && on("q")) {
    const hay = [m.title, m.originalTitle, m.franchise, ...(m.creators || [])].join(" ").toLowerCase();
    if (!hay.includes(f.q)) return false;
  }
  if (f.types.length && on("type") && !f.types.includes(m.type)) return false;
  if (f.genres.length && on("genre")) { const have = m.genres.map(lc); if (!f.genres.every(g => have.includes(g))) return false; }
  if (f.moods.length && on("mood")) { const have = m.moods.map(lc); if (!f.moods.some(x => have.includes(x))) return false; }
  if (f.franchise && on("franchise") && lc(m.franchise || "") !== f.franchise) return false;
  if (f.letter && on("letter") && !letterMatches(m.title, f.letter)) return false;
  if (f.yearFrom && on("year") && !(m.year >= f.yearFrom)) return false;
  if (f.yearTo && on("year") && !(m.year <= f.yearTo)) return false;
  if (f.rating && on("rating") && m.ageRating !== f.rating) return false;
  if (e) {
    if (f.statuses.length && on("status") && !f.statuses.includes(e.status)) return false;
    if (f.tags.length && on("tag") && !f.tags.every(t => e.tags.includes(t))) return false;
    if (f.favorite && on("favorite") && !e.favorite) return false;
    if (f.reviewed && on("reviewed") && !e.review) return false;
  }
  return true;
}

const filterRows = (rows, f, skip) => rows.filter(r => matches(r, f, skip));

// ---------- sorting ----------
const byText = (a, b) => String(a).localeCompare(String(b), undefined, { sensitivity: "base", numeric: true });
const sortKey = title => String(title || "").replace(/^(the|an|a)\s+(?=\S)/i, "");

const SORTERS = {
  title: (a, b) => byText(sortKey(a.media.title), sortKey(b.media.title)),
  year: (a, b) => (a.media.year ?? 0) - (b.media.year ?? 0),
  rating: (a, b) => (a.media.score ?? 0) - (b.media.score ?? 0),
  added: (a, b) => String(a.entry?.addedAt ?? "").localeCompare(String(b.entry?.addedAt ?? "")),
  updated: (a, b) => String(a.entry?.updatedAt ?? "").localeCompare(String(b.entry?.updatedAt ?? "")),
  myrating: (a, b) => (a.entry?.review?.rating ?? 0) - (b.entry?.review?.rating ?? 0),
  progress: (a, b) => (a.progressPercent ?? 0) - (b.progressPercent ?? 0)
};
// the direction that makes sense when nobody asks for one
const DEFAULT_ORDER = { title: "asc", year: "desc", rating: "desc", added: "desc", updated: "desc", myrating: "desc", progress: "desc" };

function sortRows(rows, f, fallbackSort) {
  const sort = f.sort || fallbackSort, order = f.order || DEFAULT_ORDER[sort];
  const fn = SORTERS[sort];
  return [...rows].sort((a, b) => (order === "asc" ? 1 : -1) * fn(a, b) || SORTERS.title(a, b));
}

function paginate(rows, f) {
  const pages = Math.max(1, Math.ceil(rows.length / f.limit));
  const page = Math.min(f.page, pages);
  return { count: rows.length, page, pages, hasMore: page < pages, slice: rows.slice((page - 1) * f.limit, page * f.limit) };
}

// ---------- facets ----------
function tally(values) {
  const map = new Map();
  for (const v of values) if (v) map.set(v, (map.get(v) || 0) + 1);
  return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || byText(a.name, b.name));
}

function facets(rows, f) {
  const letters = {};
  for (const r of filterRows(rows, f, ["letter"])) { const c = indexChar(r.media.title); letters[c] = (letters[c] || 0) + 1; }
  const out = {
    letters,
    types: tally(rows.map(r => r.media.type)),
    genres: tally(rows.flatMap(r => r.media.genres)),
    moods: tally(rows.flatMap(r => r.media.moods)),
    franchises: tally(rows.map(r => r.media.franchise))
  };
  if (rows.some(r => r.entry)) {
    out.tags = tally(rows.flatMap(r => r.entry?.tags || []));
    const counts = Object.fromEntries(STATUSES.map(s => [s, 0]));
    for (const r of filterRows(rows, f, ["status"])) counts[r.entry.status]++;
    out.statuses = counts;
  }
  return out;
}

module.exports = { STATUSES, TYPES, SORTS, parseFilters, filterRows, sortRows, paginate, facets, indexChar, parseLetter, letterMatches };
