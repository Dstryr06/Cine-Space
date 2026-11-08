# Cine Space

Track movies, TV shows and anime: search worldwide, see where to watch, follow every season and episode, tag, rate and review.
Node.js 18+ and Express, no database server and no front-end build step.

## Run
1. `npm install`
2. Copy `.env.example` to `.env` and add your `TMDB_TOKEN` (see below)
3. `npm start`, then open http://localhost:3000
4. Create an account, then use the account menu (top right) > **Sync catalog** once to fill Discover and the offline catalog

Other commands: `npm run check` or `npm test` (31 API tests, no internet needed) and `npm run demo` (runs the real app on port 3200 with fake online services, handy for trying the UI without keys).

## Features
| # | Feature | Where |
|---|---------|-------|
| 1 | Search movies, TV and anime across TMDB, TVmaze, AniList/Jikan | `GET /api/search`, top search bar |
| 2 | Every API payload is converted to one Cine Space shape | `lib/model.js`, one mapping per adapter in `providers/` |
| 3 | Timeouts, retry, circuit breaker, stale cache, and a backup service for each source | `lib/http.js`, `providers/index.js` |
| 4 | Status: To Watch, Watching, Completed, Dropped | `lib/library.js`, status tabs and pickers |
| 5 | Season and episode progress (+1 episode rolls into the next season; last episode completes the title) | `lib/progress.js` |
| 6 | Local CRUD: list, view, update status/progress, delete | `routes/watchlist.js` |
| 7 | Automatic franchises: known universes by keyword, TMDB collections, shared title stems | `lib/franchise.js` |
| 8 | Public rating from TMDB / TVmaze / AniList / MyAnimeList, with vote counts | `publicRating` on every title |
| 9 | Personal 1-5 star rating and written review: add, edit, delete | `/api/watchlist/:id/review` |
| 10 | Input validation: out-of-range rating or empty text gives `400` with a clear message | `lib/library.js`, `lib/query.js`, `lib/progress.js` |
| 11 | Filters: status, type, genre, franchise, mood, tag, favorites, year range, text | `lib/query.js` |
| 12 | A-Z index plus number ranges (`A`, `A-F`, `#`, `0-9`, `3-7`; "The" and "A" are ignored) | filter bar, `letter=` |
| 13 | Randomizer from your To Watch list, whole library, or undiscovered catalog | `GET /api/random`, "Surprise me" |
| 14 | Personal tags | `PATCH /api/watchlist/:id {tags}` |
| 15 | Request logging and tracing | see below |
| 16 | Login and registration | `public/login.html`, `routes/auth.js` |
| 17 | Where to watch, by country (stream, free, rent, buy, network) | `platforms` on every title |
| 18 | Strong passwords (10+ characters, upper and lower case, number, symbol, not a common password, not your username), checked live while typing and again on the server | `public/js/password-policy.js`, `routes/auth.js` |
| 19 | Unique usernames, any letter case; a taken name shows "Username already exists" next to the field | `routes/auth.js`, `public/js/pages/login.js` |
| 20 | Add, edit and delete your own movies, TV shows and anime (for titles the catalog doesn't have), with a type, seasons, episodes and a poster | `routes/shows.js`, `lib/custom.js`, `public/js/show-form.js` |
| 21 | Poster upload with quality checks: JPG, PNG or WebP, portrait 2:3, at least 600 × 900 px, up to 8 MB, stored byte for byte (no re-compression) | `lib/image.js` |

Purple accent, light and dark themes (follows your system until you pick one), responsive down to phones. The reasoning behind the interface is in [docs/DESIGN.md](docs/DESIGN.md).

## Your own shows
Use **Add Show** (top bar) or the button under search results that found nothing. A show you add is private to your account and works like any other: library, status, episode progress, tags, reviews, Surprise me, search and browse ("Only shows I added" in Browse > Filters). Editing a show updates your library copy and keeps your episode counter inside the new seasons. Deleting a show also removes it from your library.

Poster rules (shown in the form, checked in the browser and again on the server): JPG, PNG or WebP only (never SVG), portrait about 2:3, at least 600 × 900 px (1000 × 1500 or larger is ideal), up to 8 MB. The file is saved exactly as uploaded in `data/uploads/posters/` with a random name. Catalog posters are also requested in a larger size where TMDB and TVmaze offer one.

## TMDB
`TMDB_TOKEN` is the "API Read Access Token" from your TMDB account. With it you get movie search, collections (franchises), vote counts and JustWatch streaming data for movies and TV.
Without it the app still works: movies come from iTunes and TV streaming info is limited to the original network.
**Keep the token out of version control.** `.env` is in `.gitignore`; if a token was ever shared in a zip or a repository, create a new one in your TMDB settings.

## Resilience (requirement 3)
- Every outgoing call has a timeout (6 s, `UPSTREAM_TIMEOUT_MS`) and retries once on network errors, 429 and 5xx. Timeouts are not retried, so slow services fail fast.
- After 3 failures in a row a host is skipped for 30 s (circuit breaker), so users are not made to wait on a dead service.
- Good answers are cached in memory; if a service later fails, the last good answer is served.
- Each search group has a backup: movies TMDB then iTunes; TV TVmaze then TMDB; anime AniList then Jikan. The response says which one answered (`warnings`, `sources`).
- If every service is unreachable, search falls back to titles saved on the server and says so (`degraded: true`).
- Saving a title while the service is down uses the saved catalog copy. Library entries keep a full snapshot of the title, so the library works offline.
- iTunes titles use their own source name (`itunes`), so a fallback id can never be mistaken for a TMDB id.

## Logging and tracing (requirement 15)
- Every request gets an id (or keeps the `X-Request-Id` you send). It is returned in the `X-Request-Id` header and in every error body (`{ "errors": [...], "requestId": "..." }`).
- Outgoing API calls are logged under the id of the request that caused them.
- Console: one line per request and per outgoing call. `logs/app.log`: the same as JSON lines (rotates at 5 MB). Request bodies are never logged.
- In the app: account menu > **Recent activity** shows your own recent requests with their ids and the outside calls they made.

## API summary
All routes except `/api/auth/*` and `/api/health` need `Authorization: Bearer <token>`. Errors always look like `{ "errors": ["..."], "requestId": "..." }`.

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`. Register answers `400` with `fields.password` for a weak password and `409` with `fields.username` ("Username already exists") for a taken name
- `GET /api/shows/options`, `GET|POST /api/shows`, `GET|PUT|DELETE /api/shows/:id`, `PUT|DELETE /api/shows/:id/poster` (raw image body): your own movies, TV shows and anime (body field `type`: `movie` | `series` | `anime`, default `series`); they use source `custom` everywhere (`/api/catalog/custom/:id`, `POST /api/watchlist {source:"custom"}`)
- `GET /api/search?q=&type=` online search (merged, ranked, marks titles already in your library)
- `GET /api/catalog/home`, `GET /api/catalog/browse` (same filters as the library), `POST /api/catalog/sync`
- `GET /api/catalog/:source/:id?region=PH` live details with fallback to the saved copy; `/similar`
- `GET|POST /api/watchlist`, `GET|PATCH|DELETE /api/watchlist/:id`, `GET /api/watchlist/stats`
- `POST /api/watchlist/:id/progress/next|prev`, `POST /api/watchlist/:id/refresh`
- `GET|POST|PUT|DELETE /api/watchlist/:id/review`
- `GET /api/random?scope=library|catalog&...filters`
- `GET /api/account/activity`, `GET /api/health`

List filters (library, browse, random): `q, type, status, genre, franchise, mood, tag, letter, yearFrom, yearTo, favorite, sort, order, page, limit`. Several values can be comma separated; genres and tags must all match, types, statuses and moods match any.

Sources: `movies` (TMDB), `tvmaze`, `jikan` (anime, MyAnimeList ids), `tmdbtv` (TMDB TV backup), `itunes` (movie backup).

## Folders
- `server.js` app setup, security headers, error handler. `createApp()` is exported for tests
- `routes/` `auth`, `search`, `catalog`, `watchlist`, `random`, `account`, `shows`
- `providers/` one adapter per online API, plus `index.js` (registry and fallback search)
- `lib/` `http` (resilient client), `model` (standard shape), `franchise`, `mood`, `progress`, `query` (filters, A-Z, facets), `library`, `catalog`, `custom` (your own shows), `image` (poster checks), `store`, `logger`, `context`, `errors`
- `middleware/` request logger, signed-token auth
- `data/` local JSON files: `users`, `watchlist`, `catalog`, `catalog-meta`, `watch-links`, `custom-shows`, plus `uploads/posters/`
- `public/` `login`, `index` (Discover), `account` (Library), `title` pages, `css/app.css`, `js/`
- `test/` API tests and a fake-internet helper

## Notes
- Data saved by the first version is upgraded on start (`unwatched` becomes To Watch, `watched` becomes Completed, the episode counter becomes season and episode). The original is kept as `data/watchlist.json.bak-v1`.
- Moods come from genres (for example Sci-Fi and Mystery give Mind-bending). The mapping is in `lib/mood.js`.
- Franchise detection is best effort: known universes and official collections are reliable, title-stem grouping can miss or occasionally merge unrelated titles. Extend `KNOWN` in `lib/franchise.js` to teach it more.
- Data is stored in JSON files, which suits one machine and a small number of users. For many users, replace `lib/store.js` with a database.
- Login tokens are signed with `SESSION_SECRET` (or a random secret saved in `data/.session-secret`) and last 7 days. Accounts created before the password rule existed can still log in. After 8 wrong passwords for an account, logins pause for 10 minutes.