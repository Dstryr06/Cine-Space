// A fake internet for tests and offline demos. Install with require("./mockFetch").install().
// Each service can be switched to "ok", "down" (network error), "slow" (never answers) or "500".
const modes = { tmdb: "ok", tvmaze: "ok", anilist: "ok", jikan: "ok", itunes: "ok" };
const calls = [];
const realFetch = globalThis.fetch;

const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

const TMDB_GENRES = [{ id: 28, name: "Action" }, { id: 12, name: "Adventure" }, { id: 878, name: "Science Fiction" }, { id: 35, name: "Comedy" }, { id: 18, name: "Drama" }];
const providers = { PH: { link: "https://www.themoviedb.org/x/watch?locale=PH", flatrate: [{ provider_name: "Disney Plus", logo_path: "/d.jpg" }], rent: [{ provider_name: "Apple TV", logo_path: "/a.jpg" }] },
  US: { link: "https://www.themoviedb.org/x/watch?locale=US", flatrate: [{ provider_name: "Max", logo_path: "/m.jpg" }] } };

const ironMan = { id: 1726, title: "Iron Man", original_title: "Iron Man", release_date: "2008-04-30", vote_average: 7.64, vote_count: 25000, runtime: 126,
  overview: "After being held captive, billionaire engineer Tony Stark creates a unique weaponized suit of armor.", tagline: "Heroes aren't born.",
  poster_path: "/iron.jpg", backdrop_path: "/ironb.jpg", genre_ids: [28, 878, 12], genres: [{ name: "Action" }, { name: "Science Fiction" }, { name: "Adventure" }], imdb_id: "tt0371746",
  belongs_to_collection: { id: 131292, name: "Iron Man Collection" }, production_companies: [{ name: "Marvel Studios" }],
  release_dates: { results: [{ iso_3166_1: "US", release_dates: [{ certification: "PG-13" }] }] },
  credits: { crew: [{ job: "Director", name: "Jon Favreau" }, { job: "Writer", name: "Someone" }] },
  "watch/providers": { results: providers }, keywords: { keywords: [{ name: "superhero" }, { name: "marvel cinematic universe (mcu)" }] } };

const inception = { id: 27205, title: "Inception", release_date: "2010-07-15", vote_average: 8.37, vote_count: 36000, runtime: 148, overview: "A thief who steals secrets through dreams.",
  poster_path: "/inc.jpg", genre_ids: [28, 878, 12], genres: [{ name: "Action" }, { name: "Science Fiction" }], release_dates: { results: [] }, credits: { crew: [] }, "watch/providers": { results: {} }, keywords: { keywords: [] } };

const bbTv = { id: 1396, name: "Breaking Bad", first_air_date: "2008-01-20", vote_average: 8.9, vote_count: 14000, overview: "A chemistry teacher turns to crime.", poster_path: "/bb.jpg", backdrop_path: "/bbb.jpg",
  genre_ids: [18], genres: [{ name: "Drama" }], number_of_episodes: 5, status: "Ended", seasons: [{ season_number: 0, episode_count: 9 }, { season_number: 1, episode_count: 3 }, { season_number: 2, episode_count: 2 }],
  content_ratings: { results: [{ iso_3166_1: "US", rating: "TV-MA" }] }, "watch/providers": { results: { PH: { link: "https://tmdb/tv/watch", flatrate: [{ provider_name: "Netflix", logo_path: "/n.jpg" }] } } },
  keywords: { results: [] }, external_ids: { imdb_id: "tt0903747" }, created_by: [{ name: "Vince Gilligan" }], networks: [{ name: "AMC" }] };

const ep = (season, number, type = "regular") => ({ season, number, type });
const bbShow = { id: 169, name: "Breaking Bad", premiered: "2008-01-20", genres: ["Drama", "Crime", "Thriller"], rating: { average: 9.2 }, status: "Ended", averageRuntime: 60,
  network: { name: "AMC", country: { code: "US" } }, officialSite: "http://www.amc.com/shows/breaking-bad", summary: "<p>A <b>chemistry</b> teacher turns to crime.</p>",
  image: { medium: "http://static.tvmaze.com/m.jpg", original: "http://static.tvmaze.com/o.jpg" }, externals: { imdb: "tt0903747", thetvdb: 81189 },
  _embedded: { episodes: [ep(1, 1), ep(1, 2), ep(1, 3), ep(2, 1), ep(2, 2), { season: 2, number: null, type: "significant_special" }] } };
const wireShow = { id: 179, name: "The Wire", premiered: "2002-06-02", genres: ["Drama", "Crime"], rating: { average: 9.3 }, network: { name: "HBO" }, summary: "<p>Baltimore.</p>", image: { medium: "http://static.tvmaze.com/w.jpg" }, externals: {}, _embedded: { episodes: [ep(1, 1), ep(1, 2)] } };

const fma = { idMal: 5114, title: { english: "Fullmetal Alchemist: Brotherhood", romaji: "Hagane no Renkinjutsushi" }, genres: ["Action", "Adventure", "Drama", "Fantasy"], seasonYear: 2009, averageScore: 90, episodes: 64, duration: 24, status: "FINISHED",
  isAdult: false, description: "Two brothers search for the <b>Philosopher's Stone</b>.", coverImage: { extraLarge: "https://s4.anilist.co/fma.jpg" }, bannerImage: "https://s4.anilist.co/fmab.jpg", studios: { nodes: [{ name: "Bones" }] },
  tags: [{ name: "Alchemy" }], externalLinks: [{ site: "Crunchyroll", url: "https://crunchyroll.com/fma", type: "STREAMING" }, { site: "Twitter", url: "https://t.co", type: "SOCIAL" }] };
const itunesIron = { trackId: 5551, trackName: "Iron Man", primaryGenreName: "Action & Adventure", releaseDate: "2008-05-02T07:00:00Z", contentAdvisoryRating: "PG-13", trackTimeMillis: 7560000, artistName: "Jon Favreau", longDescription: "Stark.", artworkUrl100: "https://is1.mzstatic.com/100x100bb.jpg", trackViewUrl: "https://tv.apple.com/iron" };

function hang(signal) {
  return new Promise((_, reject) => signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
}

async function handle(service, url, opts, answer) {
  calls.push({ service, url: String(url) });
  const mode = modes[service];
  if (mode === "down") throw new TypeError("fetch failed");
  if (mode === "slow") return hang(opts?.signal);
  if (mode === "500") return json({}, 500);
  return answer();
}

async function fake(input, opts = {}) {
  const url = new URL(String(input)), p = url.pathname + url.search, host = url.host;
  if (host === "api.themoviedb.org") return handle("tmdb", url, opts, () => {
    const path = url.pathname.replace("/3", "");
    if (path === "/genre/movie/list" || path === "/genre/tv/list") return json({ genres: TMDB_GENRES });
    if (path === "/search/movie") return json({ results: /iron/i.test(url.searchParams.get("query")) ? [ironMan] : /incep/i.test(url.searchParams.get("query")) ? [inception] : [] });
    if (path === "/movie/popular" || path === "/movie/top_rated") return json({ results: [ironMan, inception] });
    if (path === "/movie/1726") return json(ironMan);
    if (path === "/movie/27205") return json(inception);
    if (path === "/search/tv") return json({ results: /breaking/i.test(url.searchParams.get("query")) ? [bbTv] : [] });
    if (path === "/tv/1396") return json(bbTv);
    if (path.startsWith("/find/tt0903747")) return json({ tv_results: [{ id: 1396 }] });
    if (path.startsWith("/find/")) return json({ tv_results: [] });
    return json({}, 404);
  });
  if (host === "api.tvmaze.com") return handle("tvmaze", url, opts, () => {
    if (url.pathname === "/search/shows") return json(/break|wire/i.test(url.searchParams.get("q")) ? [{ score: 1, show: bbShow }, { score: .5, show: wireShow }] : []);
    if (url.pathname === "/shows") return json([bbShow, wireShow]);
    if (url.pathname === "/shows/169") return json(bbShow);
    if (url.pathname === "/shows/179") return json(wireShow);
    return json({}, 404);
  });
  if (host === "graphql.anilist.co") return handle("anilist", url, opts, () => {
    const q = JSON.parse(opts.body).query;
    return q.includes("Page(") ? json({ data: { Page: { media: /full|alch/i.test(JSON.parse(opts.body).variables.search || "") || !JSON.parse(opts.body).variables.search ? [fma] : [] } } }) : json({ data: { Media: fma } });
  });
  if (host === "api.jikan.moe") return handle("jikan", url, opts, () => {
    if (url.pathname === "/v4/anime/5114") return json({ data: { mal_id: 5114, title: "Fullmetal Alchemist: Brotherhood", title_english: "Fullmetal Alchemist: Brotherhood", genres: [{ name: "Action" }], year: 2009, rating: "R - 17+ (violence & profanity)", score: 9.1, scored_by: 2000000, episodes: 64, status: "Finished Airing", duration: "24 min per ep", synopsis: "Brothers.", images: { jpg: { large_image_url: "https://cdn.myanimelist.net/fma.jpg" } } } });
    if (url.pathname === "/v4/anime/5114/streaming") return json({ data: [{ name: "Netflix", url: "https://netflix.com/fma" }] });
    if (url.pathname === "/v4/anime") return json({ data: [] });
    return json({}, 404);
  });
  if (host === "itunes.apple.com") return handle("itunes", url, opts, () => url.pathname === "/lookup" ? json({ results: [itunesIron] }) : json({ results: /iron/i.test(url.searchParams.get("term")) ? [itunesIron] : [] }));
  return realFetch(input, opts);
}

module.exports = {
  modes, calls,
  install() { globalThis.fetch = fake; },
  uninstall() { globalThis.fetch = realFetch; },
  reset() { Object.keys(modes).forEach(k => modes[k] = "ok"); calls.length = 0; },
  realFetch
};
