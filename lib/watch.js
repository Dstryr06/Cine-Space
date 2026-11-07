// "Where to watch" search links. They are added after the real links from the APIs, so every title has somewhere to go
// even when the online service knows nothing. They open each service's own search page for the title.
const REGION = (process.env.WATCH_REGION || "ph").toLowerCase();   // JustWatch country page, e.g. ph, us

function fallbackLinks(t) {
    const q = encodeURIComponent(t.title || "");
    if (!q) return [];
    const search = (name, url) => ({ name, url, price: "Search" });
    return [
    search("JustWatch", `https://www.justwatch.com/${REGION}/search?q=${q}`),
    search("Netflix", `https://www.netflix.com/search?q=${q}`),
    search("Prime Video", `https://www.amazon.com/s?k=${q}&i=instant-video`),
    ...(t.type === "anime" ? [search("Crunchyroll", `https://www.crunchyroll.com/search?q=${q}`)] : []),
    search("YouTube", `https://www.youtube.com/results?search_query=${q}+trailer`)
    ];
}

module.exports = { fallbackLinks };