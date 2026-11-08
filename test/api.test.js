// Run with: npm test   (no internet needed: external services are faked in test/mockFetch.js)
const fs = require("fs"), os = require("os"), path = require("path");
const test = require("node:test"), assert = require("node:assert/strict");

const DATA = fs.mkdtempSync(path.join(os.tmpdir(), "cinespace-"));
Object.assign(process.env, { DATA_DIR: DATA, LOG_FILE: "off", LOG_QUIET: "1", TMDB_TOKEN: "test-token", UPSTREAM_TIMEOUT_MS: "300", SEARCH_DEADLINE_MS: "1500", WATCH_REGION: "PH" });
fs.copyFileSync(path.join(__dirname, "..", "data", "catalog.json"), path.join(DATA, "catalog.json"));

const mock = require("./mockFetch");
mock.install();
const http = require("../lib/http");
const { createApp } = require("../server");

const PW = "Str0ng!Passw0rd";                       // satisfies the password policy
let server, base, token;
const call = async (method, url, body, auth = token) => {
  const res = await mock.realFetch(base + url, { method, headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null), headers: res.headers };
};

const fixture = name => fs.readFileSync(path.join(__dirname, "fixtures", name));
const upload = async (url, bytes, type = "image/png", auth = token) => {
  const res = await mock.realFetch(base + url, { method: "PUT", headers: { "Content-Type": type, Authorization: `Bearer ${auth}` }, body: bytes });
  return { status: res.status, body: await res.json().catch(() => null) };
};

test.before(async () => {
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  const r = await call("POST", "/api/auth/register", { username: "tester", password: PW }, null);
  token = r.body.token;
});
test.after(() => server.close());
test.beforeEach(() => { mock.reset(); http.reset(); });

// ---------------- login ----------------
test("auth: validation, login, wrong password, protected routes", async () => {
  assert.equal((await call("POST", "/api/auth/register", { username: "x", password: "1" }, null)).status, 400);
  assert.equal((await call("POST", "/api/auth/register", { username: "tester", password: PW }, null)).status, 409);
  assert.equal((await call("POST", "/api/auth/login", { username: "tester", password: "nope" }, null)).status, 401);
  const ok = await call("POST", "/api/auth/login", { username: "tester", password: PW }, null);
  assert.equal(ok.status, 200); assert.ok(ok.body.token);
  assert.equal((await call("GET", "/api/watchlist", undefined, null)).status, 401);
  assert.equal((await call("GET", "/api/search?q=iron", undefined, null)).status, 401);
});

test("sign-up: usernames must be unique (any letter case) and say so", async () => {
  for (const name of ["tester", "TESTER", "  Tester "]) {
    const r = await call("POST", "/api/auth/register", { username: name, password: PW }, null);
    assert.equal(r.status, 409, name);
    assert.match(r.body.fields.username, /already exists/i);
    assert.match(r.body.errors[0], /already exists/i);
  }
  const users = JSON.parse(fs.readFileSync(path.join(DATA, "users.json"), "utf8"));
  assert.equal(users.filter(u => u.username === "tester").length, 1, "no duplicate was stored");
  // taken name AND weak password: both problems are reported together
  const both = await call("POST", "/api/auth/register", { username: "tester", password: "abc" }, null);
  assert.equal(both.status, 409); assert.ok(both.body.fields.username && both.body.fields.password);
});

test("sign-up: strong passwords only", async () => {
  const weak = {
    "short1!A": /at least 10/, "alllowercase1!": /uppercase/, "ALLUPPERCASE1!": /lowercase/, "NoNumbersHere!!": /number/, "NoSymbols12345A": /special character/,
    "Password1!": /too common/, "P@ssw0rd2024": /too common/, "Qwerty#12345": /too common/, "Cinespace!2026": /too common/,
    "Nina_Dela#2026": /username/, "": /at least 10/, ["Aa1!".repeat(40)]: /128/
  };
  for (const [password, expected] of Object.entries(weak)) {
    const username = password.startsWith("Nina") ? "nina_dela" : "weakling";
    const r = await call("POST", "/api/auth/register", { username, password }, null);
    assert.equal(r.status, 400, password);
    assert.ok(r.body.errors.some(e => expected.test(e)), `${password}: ${r.body.errors.join(" | ")}`);
    assert.ok(r.body.fields.password, "the message is tied to the password field");
  }
  assert.equal((await call("POST", "/api/auth/register", { username: "weakling", password: 12345678901234 }, null)).status, 400, "not a string");
  const strong = await call("POST", "/api/auth/register", { username: "strongone", password: "Tr1cky-Horse$99" }, null);
  assert.equal(strong.status, 201); assert.ok(strong.body.token);
  // accounts made before the rule existed can still log in with their old password
  const salt = "ab".repeat(8), file = path.join(DATA, "users.json"), users = JSON.parse(fs.readFileSync(file, "utf8"));
  users.push({ id: "legacy-1", username: "oldtimer", passwordHash: `${salt}:${require("crypto").scryptSync("1234567", salt, 64).toString("hex")}`, createdAt: "2026-01-01T00:00:00Z" });
  fs.writeFileSync(file, JSON.stringify(users));
  assert.equal((await call("POST", "/api/auth/login", { username: "oldtimer", password: "1234567" }, null)).status, 200);
});

// ---------------- search + normalisation ----------------
test("search: merges TMDB, TVmaze and anime into one standardized shape", async () => {
  const r = await call("GET", "/api/search?q=iron");
  assert.equal(r.status, 200);
  const iron = r.body.data.find(t => t.key === "movies:1726");
  assert.ok(iron, "movie found");
  for (const k of ["key", "source", "id", "type", "title", "genres", "moods", "franchise", "year", "publicRating", "posterUrl", "platforms", "seasons"]) assert.ok(k in iron, `has ${k}`);
  assert.equal(iron.publicRating.source, "TMDB");
  assert.equal(iron.franchise, "Marvel");
  assert.deepEqual(iron.genres, ["Action", "Sci-Fi", "Adventure"]);   // "Science Fiction" normalised

  const tv = (await call("GET", "/api/search?q=breaking")).body.data.find(t => t.key === "tvmaze:169");
  assert.equal(tv.type, "series"); assert.equal(tv.publicRating.source, "TVmaze"); assert.equal(tv.synopsis, "A chemistry teacher turns to crime.");
  assert.equal(tv.posterUrl, "https://static.tvmaze.com/m.jpg");
  const anime = (await call("GET", "/api/search?q=fullmetal")).body.data.find(t => t.key === "jikan:5114");
  assert.equal(anime.type, "anime"); assert.equal(anime.publicRating.value, 9);
});

test("search: validates input", async () => {
  assert.equal((await call("GET", "/api/search?q=a")).status, 400);
  assert.equal((await call("GET", "/api/search?q=iron&type=book")).status, 400);
});

test("fallback: TMDB down -> iTunes answers with a warning; fallback ids use their own source", async () => {
  mock.modes.tmdb = "down";
  const r = await call("GET", "/api/search?q=iron&type=movie");
  assert.equal(r.status, 200);
  assert.equal(r.body.data[0].key, "itunes:5551");
  assert.match(r.body.warnings[0], /TMDB didn't respond.*iTunes/);
  assert.equal(r.body.sources.movie, "fallback:iTunes");
});

test("timeout: a slow TVmaze is cut off and TMDB TV answers instead", async () => {
  mock.modes.tvmaze = "slow";
  const t0 = Date.now();
  const r = await call("GET", "/api/search?q=breaking&type=series");
  assert.ok(Date.now() - t0 < 2000, "did not hang");
  assert.equal(r.status, 200);
  assert.equal(r.body.data[0].key, "tmdbtv:1396");
  assert.match(r.body.warnings[0], /too long/);
});

test("everything unreachable -> 200 with saved titles and degraded=true", async () => {
  for (const k of Object.keys(mock.modes)) mock.modes[k] = "down";
  const r = await call("GET", "/api/search?q=breaking");
  assert.equal(r.status, 200); assert.equal(r.body.degraded, true);
  assert.ok(r.body.data.some(t => /breaking bad/i.test(t.title)), "local catalog match");
  assert.ok(r.body.warnings.length >= 3);
});

test("circuit breaker: after repeated failures a host is skipped instead of waited on", async () => {
  mock.modes.itunes = "down"; mock.modes.tmdb = "down";
  for (let i = 0; i < 3; i++) await call("GET", `/api/search?q=iron${i}&type=movie`);
  assert.ok(http.state().find(s => s.host === "api.themoviedb.org").open);
  const before = mock.calls.length;
  await call("GET", "/api/search?q=ironx&type=movie");
  assert.equal(mock.calls.filter((c, i) => i >= before && c.service === "tmdb").length, 0, "no call made to an open circuit");
});

// ---------------- details, platforms, public rating ----------------
test("detail: streaming platforms per region, collection, public rating, age rating", async () => {
  const ph = (await call("GET", "/api/catalog/movies/1726?region=PH")).body.data;
  assert.deepEqual(ph.platforms.map(p => `${p.kind}:${p.name}`), ["stream:Disney Plus", "rent:Apple TV"]);
  assert.equal(ph.collection, "Iron Man Collection"); assert.equal(ph.franchise, "Marvel");
  assert.equal(ph.ageRating, "PG-13"); assert.equal(ph.publicRating.votes, 25000);
  assert.deepEqual(ph.watchRegions, ["PH", "US"]);
  const us = (await call("GET", "/api/catalog/movies/1726?region=US")).body.data;
  assert.equal(us.platforms[0].name, "Max");
  assert.equal((await call("GET", "/api/catalog/movies/1726?region=Philippines")).status, 400);
});

test("detail: TVmaze show gets seasons from episodes and platforms from TMDB; survives TMDB failure", async () => {
  let t = (await call("GET", "/api/catalog/tvmaze/169")).body.data;
  assert.deepEqual(t.seasons.map(s => s.episodes), [3, 2]);   // the special is ignored
  assert.equal(t.episodes, 5); assert.equal(t.ageRating, "R");
  assert.ok(t.platforms.some(p => p.name === "Netflix" && p.kind === "stream"));
  assert.ok(t.platforms.some(p => p.name === "AMC" && p.kind === "network"));
  http.reset(); mock.modes.tmdb = "down";
  t = (await call("GET", "/api/catalog/tvmaze/169")).body.data;
  assert.equal(t.seasons.length, 2); assert.deepEqual(t.platforms.map(p => p.name), ["AMC"]);
});

test("detail: live service down -> saved copy with a warning; unknown title -> error", async () => {
  mock.modes.tvmaze = "down";
  const r = await call("GET", "/api/catalog/tvmaze/179");        // The Wire is in the saved catalog
  assert.equal(r.status, 200); assert.equal(r.body.stale, true);
  assert.equal(r.body.data.title, "The Wire"); assert.match(r.body.warnings[0], /saved copy/);
  const none = await call("GET", "/api/catalog/tvmaze/99999999");  // not saved anywhere: the real error comes through
  assert.equal(none.status, 502);
  assert.equal((await call("GET", "/api/catalog/bogus/1")).status, 404);
});

// ---------------- library CRUD ----------------
let breaking, ironId;
test("library: add, duplicate, validation", async () => {
  assert.equal((await call("POST", "/api/watchlist", { source: "nope", id: "1" })).status, 400);
  assert.equal((await call("POST", "/api/watchlist", { source: "tvmaze", id: "169", status: "bad" })).status, 400);
  const r = await call("POST", "/api/watchlist", { source: "tvmaze", id: "169", tags: ["Rewatch", "crime night"] });
  assert.equal(r.status, 201);
  breaking = r.body.data;
  assert.equal(breaking.status, "to_watch"); assert.deepEqual(breaking.tags, ["rewatch", "crime night"]);
  assert.equal(breaking.progress.total, 5); assert.equal(breaking.progress.season, 1);
  assert.equal((await call("POST", "/api/watchlist", { source: "tvmaze", id: "169" })).status, 409);
  const m = await call("POST", "/api/watchlist", { source: "movies", id: "1726", status: "completed" });
  ironId = m.body.data.id;
  assert.equal(m.body.data.status, "completed"); assert.equal(m.body.data.progress, null);
  await call("POST", "/api/watchlist", { source: "jikan", id: "5114" });
});

test("library: add falls back to the saved catalog when the online service is down", async () => {
  mock.modes.tvmaze = "down";
  const r = await call("POST", "/api/watchlist", { source: "tvmaze", id: "179" });
  assert.equal(r.status, 201); assert.match(r.body.warnings[0], /offline catalog/);
  mock.reset();
});

test("progress: season/episode validation, rollover, auto status", async () => {
  const id = breaking.id;
  assert.equal((await call("PATCH", `/api/watchlist/${id}`, { progress: { season: 3, episode: 1 } })).status, 400);
  assert.equal((await call("PATCH", `/api/watchlist/${id}`, { progress: { season: 1, episode: 4 } })).status, 400);
  assert.equal((await call("PATCH", `/api/watchlist/${id}`, { progress: { season: 1, episode: -1 } })).status, 400);
  assert.equal((await call("PATCH", `/api/watchlist/${ironId}`, { progress: { season: 1, episode: 1 } })).status, 400, "movies have no episodes");

  let r = await call("PATCH", `/api/watchlist/${id}`, { progress: { season: 1, episode: 2 } });
  assert.equal(r.body.data.status, "watching"); assert.equal(r.body.data.progress.watched, 2);
  r = await call("POST", `/api/watchlist/${id}/progress/next`);
  r = await call("POST", `/api/watchlist/${id}/progress/next`);          // 1x3 -> 2x1
  assert.deepEqual([r.body.data.progress.season, r.body.data.progress.episode], [2, 1]);
  r = await call("POST", `/api/watchlist/${id}/progress/next`);          // 2x2 = last episode
  assert.equal(r.body.data.status, "completed"); assert.equal(r.body.data.progress.percent, 100);
  assert.equal((await call("POST", `/api/watchlist/${id}/progress/next`)).status, 400);
  r = await call("POST", `/api/watchlist/${id}/progress/prev`);
  assert.equal(r.body.data.status, "watching");
});

test("status: all four states, invalid rejected, completed fills progress", async () => {
  const id = breaking.id;
  for (const status of ["dropped", "to_watch", "watching", "completed"]) assert.equal((await call("PATCH", `/api/watchlist/${id}`, { status })).body.data.status, status);
  assert.equal((await call("GET", `/api/watchlist/${id}`)).body.data.progress.percent, 100);
  assert.equal((await call("PATCH", `/api/watchlist/${id}`, { status: "unwatched" })).status, 400);
  assert.equal((await call("PATCH", `/api/watchlist/${id}`, {})).status, 400);
  assert.equal((await call("PATCH", `/api/watchlist/${id}`, { favorite: "yes" })).status, 400);
});

test("tags: normalised, de-duplicated, validated", async () => {
  const id = breaking.id;
  const r = await call("PATCH", `/api/watchlist/${id}`, { tags: ["  Cozy ", "cozy", "binge"] });
  assert.deepEqual(r.body.data.tags, ["cozy", "binge"]);
  assert.equal((await call("PATCH", `/api/watchlist/${id}`, { tags: ["<script>"] })).status, 400);
  assert.equal((await call("PATCH", `/api/watchlist/${id}`, { tags: "nope" })).status, 400);
});

// ---------------- reviews ----------------
test("reviews: add, edit, delete; out-of-range rating and empty text are rejected with 400", async () => {
  const id = breaking.id, url = `/api/watchlist/${id}/review`;
  for (const bad of [{ rating: 0, text: "x" }, { rating: 6, text: "x" }, { rating: 3.5, text: "x" }, { rating: "5", text: "x" }, { rating: 4, text: "" }, { rating: 4, text: "   " }, { rating: 4 }, {}]) {
    const r = await call("POST", url, bad);
    assert.equal(r.status, 400, JSON.stringify(bad)); assert.ok(r.body.errors.length);
  }
  assert.equal((await call("POST", url, { rating: 4, text: "x".repeat(2001) })).status, 400);
  const ok = await call("POST", url, { rating: 5, text: "  Perfect pacing.  " });
  assert.equal(ok.status, 201); assert.equal(ok.body.data.text, "Perfect pacing.");
  assert.equal((await call("POST", url, { rating: 5, text: "again" })).status, 409);
  assert.equal((await call("PUT", url, { rating: 9 })).status, 400);
  assert.equal((await call("PUT", url, { text: "" })).status, 400);
  const edit = await call("PUT", url, { rating: 4 });
  assert.equal(edit.body.data.rating, 4); assert.equal(edit.body.data.text, "Perfect pacing.");
  assert.equal((await call("GET", `/api/watchlist/${id}`)).body.data.review.rating, 4);
  assert.equal((await call("DELETE", url)).status, 200);
  assert.equal((await call("DELETE", url)).status, 404);
  assert.equal((await call("PUT", url, { rating: 3, text: "x" })).status, 404);
  await call("POST", url, { rating: 5, text: "Back again." });
});

// ---------------- filters, A-Z, random ----------------
test("multi-criteria filters, A-Z index and number ranges", async () => {
  const L = qs => call("GET", `/api/watchlist?${qs}`);
  const titles = r => r.body.data.map(e => e.title);
  assert.equal((await L("")).body.total, 4);
  assert.deepEqual(titles(await L("type=movie")), ["Iron Man"]);
  assert.deepEqual(titles(await L("franchise=marvel")), ["Iron Man"]);
  assert.deepEqual(titles(await L("status=completed&type=series")), ["Breaking Bad"]);
  assert.ok(titles(await L("genre=crime")).includes("Breaking Bad"));
  assert.deepEqual(titles(await L("genre=crime,drama&type=anime")), []);
  assert.ok(titles(await L("mood=Epic")).includes("Iron Man"));
  assert.deepEqual(titles(await L("tag=cozy")), ["Breaking Bad"]);
  assert.deepEqual(titles(await L("letter=B")), ["Breaking Bad"]);
  assert.deepEqual(titles(await L("letter=I-J")), ["Iron Man"]);
  assert.ok(!titles(await L("letter=A-E")).includes("Iron Man"));
  assert.deepEqual(titles(await L("yearFrom=2009")), ["Fullmetal Alchemist: Brotherhood"]);
  assert.deepEqual(titles(await L("favorite=1")), []);
  assert.deepEqual(titles(await L("q=wire")), ["The Wire"]);   // searched by title
  const r = await L("sort=title&order=asc");
  assert.deepEqual(titles(r), [...titles(r)].sort((a, b) => a.replace(/^The /, "").localeCompare(b.replace(/^The /, ""))));
  assert.ok(r.body.facets.letters.B >= 1 && r.body.facets.statuses.completed >= 1 && r.body.facets.franchises.length);
  for (const bad of ["letter=!!", "letter=F-A", "type=x", "status=x", "sort=x", "page=0", "limit=500", "yearFrom=abc"]) assert.equal((await L(bad)).status, 400, bad);
});

test("catalog browse uses the same filters", async () => {
  const r = await call("GET", "/api/catalog/search?franchise=Marvel&limit=5");
  assert.equal(r.status, 200); assert.ok(r.body.count >= 5);
  assert.ok(r.body.data.every(t => t.franchise === "Marvel"));
  const az = await call("GET", "/api/catalog/search?letter=0-9&limit=50");
  assert.ok(az.body.data.every(t => /^[0-9]/.test(t.title.replace(/^(the|an|a)\s+/i, ""))));
  assert.ok(az.body.data.length > 0);
});

test("franchise grouping works across the saved catalog without any manual input", async () => {
  const r = await call("GET", "/api/catalog/home");
  const names = r.body.franchises.map(f => f.name);
  assert.ok(names.includes("Marvel") && names.includes("DC"), names.join());
  assert.ok(r.body.featured.length > 0 && r.body.movies.length && r.body.anime.length);
});

test("randomizer: respects filters, avoids repeats, handles empty pools", async () => {
  await call("PATCH", `/api/watchlist/${breaking.id}`, { status: "to_watch" });
  const a = await call("GET", "/api/random?scope=library");
  assert.equal(a.status, 200); assert.equal(a.body.data.status, "to_watch");
  assert.ok(a.body.poolSize >= 2);
  const b = await call("GET", `/api/random?scope=library&exclude=${a.body.data.id}`);
  assert.notEqual(b.body.data.id, a.body.data.id);
  const none = await call("GET", "/api/random?scope=library&type=movie");
  assert.equal(none.body.data, null);
  const c = await call("GET", "/api/random?scope=catalog&type=movie&mood=Funny");
  assert.ok(c.body.data.type === "movie" && c.body.data.moods.includes("Funny"));
  assert.equal((await call("GET", "/api/random?scope=nope")).status, 400);
});

test("stats and refresh", async () => {
  const s = (await call("GET", "/api/watchlist/stats")).body;
  assert.equal(s.total, 4); assert.equal(s.reviewed, 1); assert.equal(s.averageMyRating, 5);
  const r = await call("POST", `/api/watchlist/${ironId}/refresh`);
  assert.equal(r.status, 200); assert.equal(r.body.data.media.publicRating.value, 7.6);
  mock.modes.tmdb = "down"; http.reset();
  assert.ok([502, 504].includes((await call("POST", `/api/watchlist/${ironId}/refresh`)).status));
});

// ---------------- delete + isolation ----------------
test("delete removes the entry; other users can't see or touch it", async () => {
  const other = (await call("POST", "/api/auth/register", { username: "other_user", password: PW }, null)).body.token;
  assert.equal((await call("GET", "/api/watchlist", undefined, other)).body.total, 0);
  assert.equal((await call("DELETE", `/api/watchlist/${ironId}`, undefined, other)).status, 404);
  assert.equal((await call("DELETE", `/api/watchlist/${ironId}`)).status, 200);
  assert.equal((await call("GET", `/api/watchlist/${ironId}`)).status, 404);
});

// ---------------- TV shows added by hand ----------------
let mine, mineLib;
test("custom shows: validation, duplicates, and shows that are already in the catalog", async () => {
  const bad = await call("POST", "/api/shows", { title: "", year: 1500, genres: ["Nope"], seasons: [0, "x"], showStatus: "Maybe", synopsis: "x".repeat(2001) });
  assert.equal(bad.status, 400);
  for (const f of ["title", "year", "genres", "seasons", "showStatus", "synopsis"]) assert.ok(bad.body.fields[f], `field error for ${f}`);
  assert.equal((await call("POST", "/api/shows", { title: "x".repeat(121) })).status, 400);
  assert.equal((await call("POST", "/api/shows", { title: "A", genres: ["Drama", "Comedy", "Crime", "Action", "Family", "Music"] })).status, 400, "max 5 genres");
  assert.equal((await call("POST", "/api/shows", { title: "Ok", seasons: [{ episodes: 501 }] })).status, 400);

  const inCatalog = await call("POST", "/api/shows", { title: "the wire" });
  assert.equal(inCatalog.status, 409); assert.match(inCatalog.body.fields.title, /already in the catalog/);

  const r = await call("POST", "/api/shows", { title: "  Barangay   Nights ", year: "2024", showStatus: "Ongoing", genres: ["Drama", "Drama", "Mystery"], synopsis: "A night market hides a secret.", seasons: [8, { episodes: 6 }] });
  assert.equal(r.status, 201);
  mine = r.body.data;
  assert.equal(mine.key, `custom:${mine.id}`); assert.equal(mine.type, "series"); assert.equal(mine.title, "Barangay Nights");
  assert.deepEqual(mine.genres, ["Drama", "Mystery"]); assert.deepEqual(mine.seasons.map(s => [s.number, s.episodes]), [[1, 8], [2, 6]]);
  assert.equal(mine.episodes, 14); assert.equal(mine.publicRating, null, "no invented rating"); assert.equal(mine.posterUrl, "");
  assert.equal((await call("POST", "/api/shows", { title: "barangay nights", year: 2024 })).status, 409, "same title twice");
  assert.equal((await call("GET", "/api/shows/options")).body.data.poster.minWidth, 600);
});

test("custom shows: posters are checked for type, size and shape, and stored untouched", async () => {
  const url = `/api/shows/${mine.id}/poster`;
  // not images, or not an allowed kind
  assert.equal((await upload(url, Buffer.from("just text"), "image/png")).status, 415);
  assert.equal((await upload(url, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), "image/png")).status, 415);
  assert.equal((await upload(url, Buffer.from("<svg/>"), "image/svg+xml")).status, 415, "SVG is never accepted");
  assert.equal((await upload(url, fixture("poster-ok.png"), "text/plain")).status, 415);
  // too small / wrong shape
  const small = await upload(url, fixture("poster-small.png"));
  assert.equal(small.status, 400); assert.match(small.body.fields.poster, /300 × 450.*at least 600 × 900/);
  const wide = await upload(url, fixture("poster-wide.png"));
  assert.equal(wide.status, 400); assert.match(wide.body.fields.poster, /portrait/);
  // too big
  const big = Buffer.concat([fixture("poster-ok.png"), Buffer.alloc(8 * 1024 * 1024 + 10)]);
  const tooBig = await upload(url, big);
  assert.equal(tooBig.status, 413); assert.match(tooBig.body.fields.poster, /8 MB/);
  assert.equal((await call("GET", `/api/shows/${mine.id}`)).body.data.posterUrl, "", "nothing was saved by the failed uploads");

  // good ones: the stored bytes are exactly the uploaded bytes (no re-compression)
  for (const [file, type, ext] of [["poster-ok.jpg", "image/jpeg", "jpg"], ["poster-ok.webp", "image/webp", "webp"], ["poster-exif.jpg", "image/jpeg", "jpg"], ["poster-ok.png", "image/png", "png"]]) {
    const ok = await upload(url, fixture(file), type);
    assert.equal(ok.status, 200, file); assert.ok(ok.body.poster.width >= 600 && ok.body.poster.height > ok.body.poster.width, `${file} reads as portrait`);
    assert.match(ok.body.data.posterUrl, new RegExp(`^/uploads/posters/[0-9a-f-]{36}\\.${ext}$`));
    const served = await mock.realFetch(base + ok.body.data.posterUrl);
    assert.equal(served.status, 200); assert.equal(served.headers.get("content-type"), type);
    assert.equal(served.headers.get("x-content-type-options"), "nosniff");
    assert.ok(Buffer.from(await served.arrayBuffer()).equals(fixture(file)), `${file} stored byte for byte`);
    mine = ok.body.data;
  }
  const dir = path.join(DATA, "uploads", "posters");
  assert.equal(fs.readdirSync(dir).length, 1, "replacing a poster removes the old file");
  assert.equal((await upload(url, fixture("poster-ok.png"), "image/png", "bad-token")).status, 401);
});

test("custom shows: they appear in browse, search and similar, and only for their owner", async () => {
  const browse = (await call("GET", "/api/catalog/browse?q=barangay")).body;
  assert.deepEqual(browse.data.map(t => t.key), [mine.key]);
  assert.equal((await call("GET", "/api/catalog/browse?mine=1&limit=100")).body.count, 1);
  assert.ok((await call("GET", "/api/catalog/browse?limit=100")).body.count > 1);
  const found = (await call("GET", "/api/search?q=barangay")).body.data;
  assert.equal(found[0].key, mine.key);
  assert.equal((await call("GET", "/api/catalog/home")).body.added[0].key, mine.key);
  const detail = await call("GET", `/api/catalog/custom/${mine.id}`);
  assert.equal(detail.status, 200); assert.equal(detail.body.data.title, "Barangay Nights"); assert.equal(detail.body.stale, false);
  assert.equal((await call("GET", `/api/catalog/custom/${mine.id}/similar`)).status, 200);

  const other = (await call("POST", "/api/auth/register", { username: "somebody_else", password: PW }, null)).body.token;
  assert.equal((await call("GET", `/api/catalog/custom/${mine.id}`, undefined, other)).status, 404);
  assert.equal((await call("GET", `/api/shows/${mine.id}`, undefined, other)).status, 404);
  assert.equal((await call("PUT", `/api/shows/${mine.id}`, { title: "Hijacked" }, other)).status, 404);
  assert.equal((await call("DELETE", `/api/shows/${mine.id}`, undefined, other)).status, 404);
  assert.equal((await upload(`/api/shows/${mine.id}/poster`, fixture("poster-ok.png"), "image/png", other)).status, 404);
  assert.deepEqual((await call("GET", "/api/shows", undefined, other)).body.data, []);
  assert.equal((await call("GET", "/api/catalog/browse?q=barangay", undefined, other)).body.count, 0);
  assert.equal((await call("POST", "/api/watchlist", { source: "custom", id: mine.id }, other)).status, 404);
});

test("custom shows: add to library, track episodes, edit and delete keep everything in step", async () => {
  const add = await call("POST", "/api/watchlist", { source: "custom", id: mine.id, status: "watching" });
  assert.equal(add.status, 201); mineLib = add.body.data;
  assert.equal(mineLib.media.title, "Barangay Nights"); assert.equal(mineLib.progress.total, 14);
  assert.equal((await call("POST", "/api/watchlist", { source: "custom", id: mine.id })).status, 409);
  assert.equal((await call("PATCH", `/api/watchlist/${mineLib.id}`, { progress: { season: 2, episode: 6 } })).body.data.status, "completed");
  assert.equal((await call("PATCH", `/api/watchlist/${mineLib.id}`, { progress: { season: 3, episode: 1 } })).status, 400);

  // edit: the library copy follows, and a counter that no longer fits is pulled back inside the new seasons
  const edit = await call("PUT", `/api/shows/${mine.id}`, { title: "Barangay Nights", year: 2024, showStatus: "Ended", genres: ["Drama"], seasons: [8, 4] });
  assert.equal(edit.status, 200); assert.equal(edit.body.data.episodes, 12); assert.equal(edit.body.data.showStatus, "Ended");
  assert.ok(edit.body.data.posterUrl, "the poster stays when you edit the text");
  const after = (await call("GET", `/api/watchlist/${mineLib.id}`)).body.data;
  assert.equal(after.media.episodes, 12); assert.deepEqual([after.progress.season, after.progress.episode], [2, 4]);
  assert.equal((await call("PUT", `/api/shows/${mine.id}`, { title: "The Wire" })).status, 409);
  assert.equal((await call("PUT", `/api/shows/${mine.id}`, { title: "" })).status, 400);

  const refresh = await call("POST", `/api/watchlist/${mineLib.id}/refresh`);
  assert.equal(refresh.status, 200); assert.equal(refresh.body.data.media.title, "Barangay Nights");

  // random from the catalog can offer a custom show you haven't saved
  const second = (await call("POST", "/api/shows", { title: "Weekend Detectives", genres: ["Mystery"] })).body.data;
  const seen = new Set();
  for (let i = 0; i < 80 && !seen.has(second.key); i++) seen.add((await call("GET", "/api/random?scope=catalog&type=series&genre=Mystery")).body.data?.key);
  assert.ok(seen.has(second.key), "randomizer can pick a custom show");

  const poster = path.join(DATA, "uploads", "posters", fs.readdirSync(path.join(DATA, "uploads", "posters"))[0]);
  assert.ok(fs.existsSync(poster));
  assert.equal((await call("DELETE", `/api/shows/${mine.id}/poster`)).body.data.posterUrl, "");
  await new Promise(r => setTimeout(r, 50));
  assert.ok(!fs.existsSync(poster), "removing the poster deletes the file");

  const del = await call("DELETE", `/api/shows/${mine.id}`);
  assert.equal(del.status, 200); assert.equal(del.body.data.removedFromLibrary, 1);
  assert.equal((await call("GET", `/api/watchlist/${mineLib.id}`)).status, 404, "its library entry went with it");
  assert.equal((await call("GET", `/api/catalog/custom/${mine.id}`)).status, 404);
  assert.equal((await call("DELETE", `/api/shows/${mine.id}`)).status, 404);
  assert.equal((await call("DELETE", `/api/shows/${second.id}`)).status, 200);
});

// ---------------- logging & traceability ----------------
test("custom shows: the Type picker (movie, TV show, anime) is saved, validated and used by the duplicate check", async () => {
  assert.deepEqual((await call("GET", "/api/shows/options")).body.data.types, ["movie", "series", "anime"]);
  const bad = await call("POST", "/api/shows", { title: "Typed Title", type: "documentary" });
  assert.equal(bad.status, 400); assert.ok(bad.body.fields.type, "field error for type");

  // no type sent = TV show (so older clients and saved shows keep working)
  const plain = await call("POST", "/api/shows", { title: "Typed Title", year: 2020, seasons: [3] });
  assert.equal(plain.status, 201); assert.equal(plain.body.data.type, "series");

  // the same name as a different kind of title is allowed; a movie never keeps seasons
  const movie = await call("POST", "/api/shows", { title: "Typed Title", year: 2020, type: "movie", seasons: [5, 5] });
  assert.equal(movie.status, 201); assert.equal(movie.body.data.type, "movie");
  assert.deepEqual(movie.body.data.seasons, []); assert.equal(movie.body.data.episodes, null);

  // the same name and the same kind is a duplicate, and the message says which kind
  const dup = await call("POST", "/api/shows", { title: "typed  title", year: 2020, type: "movie" });
  assert.equal(dup.status, 409); assert.match(dup.body.fields.title, /movie/);
  const anime = await call("POST", "/api/shows", { title: "Typed Title", year: 2020, type: "anime", seasons: [12] });
  assert.equal(anime.status, 201); assert.equal(anime.body.data.type, "anime");

  // changing the type on edit also updates the saved library copy
  const lib = await call("POST", "/api/watchlist", { source: "custom", id: anime.body.data.id });
  assert.equal(lib.status, 201); assert.equal(lib.body.data.type, "anime");
  const edit = await call("PUT", `/api/shows/${anime.body.data.id}`, { title: "Typed Title", year: 2020, type: "series", seasons: [12] });
  assert.equal(edit.status, 409, "now it would be a second TV show with the same name and year");
  const edit2 = await call("PUT", `/api/shows/${anime.body.data.id}`, { title: "Typed Title Reborn", year: 2020, type: "series", seasons: [12] });
  assert.equal(edit2.status, 200); assert.equal(edit2.body.data.type, "series");
  assert.equal((await call("GET", `/api/watchlist/${lib.body.data.id}`)).body.data.type, "series");

  for (const r of [plain, movie, anime]) assert.equal((await call("DELETE", `/api/shows/${r.body.data.id}`)).status, 200);
});

test("traceability: request id echoed, in error bodies, and upstream calls are attributed to it", async () => {
  const r = await mock.realFetch(base + "/api/search?q=iron", { headers: { Authorization: `Bearer ${token}`, "X-Request-Id": "trace-abc-123" } });
  assert.equal(r.headers.get("x-request-id"), "trace-abc-123");
  const bad = await mock.realFetch(base + "/api/search?q=a", { headers: { Authorization: `Bearer ${token}`, "X-Request-Id": "trace-err-456" } });
  assert.equal((await bad.json()).requestId, "trace-err-456");
  const act = (await call("GET", "/api/account/activity")).body.data;
  const rec = act.find(a => a.requestId === "trace-abc-123");
  assert.ok(rec && rec.upstream.length > 0 && rec.upstream.some(u => u.service.includes("themoviedb")), "upstream calls recorded under the request id");
  assert.equal((await call("GET", "/api/nope")).status, 404);
  const junk = await mock.realFetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{oops" });
  assert.equal(junk.status, 400);
});

// ---------------- migration of the first version's data ----------------
test("migration: old statuses and episode counters are upgraded and a backup is kept", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cs-mig-"));
  fs.copyFileSync(path.join(DATA, "catalog.json"), path.join(dir, "catalog.json"));
  fs.writeFileSync(path.join(dir, "watchlist.json"), JSON.stringify([
    { id: "a", userId: "u", key: "jikan:5114", title: "Fullmetal Alchemist: Brotherhood", type: "anime", episodes: 64, episodeProgress: 10, favorite: true, status: "unwatched", addedAt: "2026-01-01T00:00:00Z" },
    { id: "b", userId: "u", key: "tvmaze:179", title: "The Wire", type: "series", episodes: 60, episodeProgress: 0, favorite: false, status: "watched", addedAt: "2026-01-01T00:00:00Z" }
  ]));
  const prev = process.env.DATA_DIR; process.env.DATA_DIR = dir;
  const lib = require("../lib/library");
  assert.equal(lib.migrate(), 2); assert.equal(lib.migrate(), 0);
  const out = JSON.parse(fs.readFileSync(path.join(dir, "watchlist.json")));
  assert.equal(out[0].status, "watching"); assert.deepEqual(out[0].progress, { season: 1, episode: 10 }); assert.equal(out[0].favorite, true);
  assert.equal(out[1].status, "completed"); assert.ok(out[1].completedAt);
  assert.ok(fs.existsSync(path.join(dir, "watchlist.json.bak-v1")));
  process.env.DATA_DIR = prev;
});