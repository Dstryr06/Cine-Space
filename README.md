# Cine-Space

Watchlist web app: browse movies, series and anime, then keep a personal watchlist after logging in.
Node.js 18+ and Express.

## Run
1. `npm install`
2. Copy `.env.example` to `.env` and fill in any keys
3. `npm start`, then open http://localhost:3000
   (`/api/health` works already; routes marked "Not built yet" answer 501)

## Folders
- `server.js`: app setup, logging, error handler
- `routes/`: `auth`, `catalog` (online data), `watchlist` (local data)
- `providers/`: one adapter per online API (`jikan` anime, `tvmaze` series, `movies` TBD)
- `lib/`: `errors`, `store` (JSON files), `model` (our own title shape)
- `middleware/`: request ID logging
- `data/`: local JSON files (`users`, `watchlist`, `watch-links`)
- `public/`: `login`, `index` (main), `title` (one title), `account` (watchlist) + `js/app.js` (shared helpers)

## Suggested build order
1. `routes/watchlist.js` + `data/watchlist.json`: CRUD (local data)
2. One adapter (`providers/jikan.js`) with a timeout
3. `GET /api/catalog/search` and `GET /api/catalog/:source/:id`
4. `POST /api/watchlist`: verify the title online, then save (the integration workflow)
5. Auth, then the other adapters, similar titles and watch links
