// Everything about a user's saved titles ("library entries") that more than one route needs.
//
// A stored entry looks like:
// { id, userId, key, source, mediaId, title, type,
//   status: "to_watch" | "watching" | "completed" | "dropped", favorite,
//   progress: { season, episode } | null,   // null for movies
//   tags: ["rewatch", "with-friends"],
//   review: { rating: 1-5, text, createdAt, updatedAt } | null,
//   media: <canonical title snapshot, so the library works with the internet off>,
//   addedAt, updatedAt, startedAt, completedAt, schema: 2 }
const store = require("./store");
const { httpError } = require("./errors");
const { applyFranchiseGroups } = require("./franchise");
const progress = require("./progress");
const catalog = require("./catalog");
const { STATUSES } = require("./query");

const FILE = "watchlist.json";
const now = () => new Date().toISOString();

const all = () => store.read(FILE);
const mineOf = (entries, userId) => entries.filter(e => e.userId === userId);

// rows for the query engine: entry + media (with franchise groups) + the numbers sorting needs
function rowsFor(userId) {
  const entries = mineOf(all(), userId);
  const medias = applyFranchiseGroups(entries.map(e => e.media), [...entries.map(e => e.media), ...catalog.load().items]);
  return entries.map((entry, i) => {
    const media = medias[i], summary = progress.summarize(media, entry.progress);
    return { entry, media, progressPercent: summary ? (summary.percent ?? 0) : (entry.status === "completed" ? 100 : 0) };
  });
}

// what the API sends for one entry: the entry, its media, and a ready-to-draw progress summary
function view(row) {
  const { entry, media } = row;
  return { ...entry, media, progress: progress.summarize(media, entry.progress) };
}

// ---------- status ----------
function setStatus(entry, status, { keepProgress = false } = {}) {
  entry.status = status;
  if (status === "watching" && !entry.startedAt) entry.startedAt = now();
  if (status === "completed") {
    entry.completedAt = now();
    if (!entry.startedAt) entry.startedAt = entry.completedAt;
    const end = entry.media.type !== "movie" && !keepProgress ? progress.endOf(entry.media) : null;
    if (end) entry.progress = end;
  } else entry.completedAt = null;
}

// moving the episode counter also moves the status: first episode -> watching, last episode -> completed
function applyProgress(entry, p) {
  entry.progress = p;
  const s = progress.summarize(entry.media, p);
  if (s.finished) { if (entry.status !== "completed") setStatus(entry, "completed", { keepProgress: true }); }
  else if (entry.status === "completed" || ((p.episode > 0 || p.season > progress.start(entry.media).season) && ["to_watch", "dropped"].includes(entry.status))) setStatus(entry, "watching");
}

// ---------- tags ----------
const TAG_RE = /^[\p{L}\p{N}][\p{L}\p{N} _\-&'.+]{0,23}$/u;
function normalizeTags(input, errors) {
  if (!Array.isArray(input)) { errors.push("tags must be a list of words."); return null; }
  if (input.length > 12) errors.push("You can add up to 12 tags.");
  const out = [];
  for (const raw of input) {
    const tag = String(raw ?? "").trim().toLowerCase().replace(/\s+/g, " ");
    if (!TAG_RE.test(tag)) { errors.push(`"${String(raw).slice(0, 30)}" is not a valid tag (1 to 24 letters, numbers, spaces or - _ & ' . +).`); continue; }
    if (!out.includes(tag)) out.push(tag);
  }
  return out;
}

// ---------- review ----------
// rejects: rating outside 1-5 (or not a whole number), empty or blank text, text over 2000 characters
function checkReview({ rating, text }) {
  const errors = [];
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) errors.push("rating must be a whole number from 1 to 5.");
  if (typeof text !== "string" || !text.trim()) errors.push("text can't be empty.");
  else if (text.trim().length > 2000) errors.push("text must be 2000 characters or fewer.");
  return errors;
}

// ---------- custom TV shows ----------
// When the user edits a show they added by hand, their saved library copies of it follow the edit.
// Progress is kept inside the new season list (fewer seasons or episodes never leave the counter out of range).
function syncCustom(userId, media) {
  const entries = all();
  let touched = false;
  for (const e of entries) {
    if (e.userId !== userId || e.key !== media.key) continue;
    e.media = media; e.title = media.title; e.type = media.type; e.updatedAt = now();
    const seasons = progress.seasonsOf(media), p = e.progress;
    if (p && seasons.length) {
      const season = seasons.find(s => s.number === p.season);
      let fixed = p;
      if (!season) fixed = p.season > seasons[seasons.length - 1].number ? progress.endOf(media) : progress.start(media);
      else if (p.episode > season.episodes) fixed = { season: season.number, episode: season.episodes };
      if (fixed !== p) applyProgress(e, fixed);
    }
    touched = true;
  }
  if (touched) store.write(FILE, entries);
}

// deleting a custom show removes it from the owner's library too; returns how many entries went with it
function dropCustom(userId, key) {
  const entries = all(), keep = entries.filter(e => !(e.userId === userId && e.key === key));
  if (keep.length !== entries.length) store.write(FILE, keep);
  return entries.length - keep.length;
}

// ---------- start-up migration of data saved by the first version ----------
// old statuses: unwatched / watched;  old progress: one episode counter.
function migrate() {
  const entries = store.read(FILE);
  if (!entries.some(e => e.schema !== 2)) return 0;
  const { toTitle } = require("./model");
  const byKey = catalog.load().byKey;
  let n = 0;

  const next = entries.map(e => {
    if (e.schema === 2) return e;
    n++;
    const i = e.key.indexOf(":"), source = e.key.slice(0, i), mediaId = e.key.slice(i + 1);
    const saved = byKey.get(e.key) || {};
    const total = saved.episodes || e.episodes || null;
    let media = toTitle({ ...saved, source, id: mediaId, type: e.type || saved.type, title: saved.title || e.title, episodes: total });
    if (media.type === "anime" && total && !media.seasons.length) media = toTitle({ ...media, seasons: [{ number: 1, episodes: total }] });

    const status = { unwatched: "to_watch", watched: "completed" }[e.status] || (STATUSES.includes(e.status) ? e.status : "to_watch");
    let prog = null;
    if (media.type !== "movie") {
      const count = Number.isInteger(e.episodeProgress) ? e.episodeProgress : 0;
      prog = { season: progress.start(media).season, episode: count };
      let left = count;
      for (const s of progress.seasonsOf(media)) {         // turn "episode 30" into season 2, episode 5
        if (left <= s.episodes) { prog = { season: s.number, episode: left }; break; }
        left -= s.episodes; prog = { season: s.number, episode: s.episodes };
      }
    }
    const { episodes, episodeProgress, ...rest } = e;
    const entry = { ...rest, source, mediaId, status, favorite: !!e.favorite, progress: prog, tags: [], review: null, media,
      updatedAt: e.addedAt || now(), startedAt: null, completedAt: null, schema: 2 };
    if (status === "completed") setStatus(entry, "completed");
    else if (prog && prog.episode > 0) entry.startedAt = entry.addedAt;
    if (status === "to_watch" && prog && prog.episode > 0) entry.status = "watching";
    return entry;
  });

  store.write(`${FILE}.bak-v1`, entries);   // keep the original just in case
  store.write(FILE, next);
  return n;
}

module.exports = { FILE, all, mineOf, rowsFor, view, setStatus, applyProgress, normalizeTags, checkReview, syncCustom, dropCustom, migrate, now };
