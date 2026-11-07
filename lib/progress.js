// Season / episode tracking. A progress is { season, episode }: "I am in season S and have watched E episodes of it".
// Titles with known seasons are bounds-checked and roll over from one season to the next.
// Titles without season data (ongoing anime, old saved entries) accept any season >= 1 and episode >= 0.

const seasonsOf = media => (media.seasons || []).filter(s => s.episodes > 0);

const totalEpisodes = media => {
  const s = seasonsOf(media);
  return s.length ? s.reduce((n, x) => n + x.episodes, 0) : (media.episodes || null);
};

const start = media => ({ season: seasonsOf(media)[0]?.number ?? 1, episode: 0 });

function endOf(media) {
  const s = seasonsOf(media);
  if (s.length) { const last = s[s.length - 1]; return { season: last.number, episode: last.episodes }; }
  return media.episodes ? { season: 1, episode: media.episodes } : null;
}

function watchedCount(media, p) {
  if (!p) return 0;
  const s = seasonsOf(media);
  if (!s.length) return p.episode;
  let n = 0;
  for (const x of s) {
    if (x.number < p.season) n += x.episodes;
    else if (x.number === p.season) n += Math.min(p.episode, x.episodes);
  }
  return n;
}

// returns a list of problems (empty = valid)
function validate(media, p) {
  const errors = [];
  if (media.type === "movie") return ["Movies don't have season or episode progress."];
  if (!p || typeof p !== "object") return ["progress must be an object like { \"season\": 1, \"episode\": 3 }."];
  if (!Number.isInteger(p.season) || p.season < 1) errors.push("season must be a whole number of 1 or more.");
  if (!Number.isInteger(p.episode) || p.episode < 0) errors.push("episode must be a whole number of 0 or more.");
  if (errors.length) return errors;

  const s = seasonsOf(media);
  if (s.length) {
    const season = s.find(x => x.number === p.season);
    if (!season) errors.push(`season must be one of ${s.map(x => x.number).join(", ")}.`);
    else if (p.episode > season.episodes) errors.push(`season ${p.season} has ${season.episodes} episodes.`);
  } else if (media.episodes && p.season === 1 && p.episode > media.episodes) {
    errors.push(`this title has ${media.episodes} episodes.`);
  } else if (p.episode > 5000) errors.push("episode is too large.");
  return errors;
}

function next(media, p) {
  const s = seasonsOf(media);
  if (!s.length) {
    const total = media.episodes;
    return total && p.episode >= total ? null : { season: p.season, episode: p.episode + 1 };
  }
  const i = s.findIndex(x => x.number === p.season);
  if (i < 0) return start(media);
  if (p.episode < s[i].episodes) return { season: p.season, episode: p.episode + 1 };
  return s[i + 1] ? { season: s[i + 1].number, episode: 1 } : null;
}

function prev(media, p) {
  const s = seasonsOf(media);
  const i = s.findIndex(x => x.number === p.season);
  if (p.episode > 1) return { season: p.season, episode: p.episode - 1 };
  if (p.episode === 1) return i > 0 ? { season: s[i - 1].number, episode: s[i - 1].episodes } : { season: p.season, episode: 0 };
  return i > 0 ? { season: s[i - 1].number, episode: Math.max(s[i - 1].episodes - 1, 0) } : p;
}

// what the client needs to draw a progress bar
function summarize(media, p) {
  if (media.type === "movie") return null;
  const cur = p || start(media), total = totalEpisodes(media), watched = watchedCount(media, cur);
  return {
    season: cur.season, episode: cur.episode, watched, total,
    percent: total ? Math.min(100, Math.round((watched / total) * 100)) : null,
    next: next(media, cur), finished: !!total && watched >= total
  };
}

module.exports = { seasonsOf, totalEpisodes, start, endOf, watchedCount, validate, next, prev, summarize };
