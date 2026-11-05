// The ONE shape every online title is converted into (Canonical Data Model pattern).
// Each adapter in /providers returns this shape, so the rest of the app never sees raw API data.
// This is also the target side of the data mapping table in the documentation.
function toTitle(t) {
  return {
    key: `${t.source}:${t.id}`,        // e.g. "jikan:5114"
    source: t.source,                  // "jikan" | "tvmaze" | "movies"
    id: String(t.id),
    type: t.type,                      // "movie" | "series" | "anime"
    title: t.title || "",
    genres: t.genres || [],
    year: t.year ?? null,
    ageRating: t.ageRating ?? null,    // "PG" | "PG-13" | "R" | "R18"
    score: t.score ?? null,
    episodes: t.episodes ?? null,      // series and anime
    lengthMinutes: t.lengthMinutes ?? null,
    creators: t.creators || [],
    synopsis: t.synopsis || "",
    posterUrl: t.posterUrl || ""
  };
}

module.exports = { toTitle };
