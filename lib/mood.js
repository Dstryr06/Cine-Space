// Genres and moods.
// Every provider names genres differently ("Science-Fiction", "Science Fiction", "Sci-Fi", "Action & Adventure").
// normalizeGenres() maps them all to one vocabulary; moodsFor() derives "what kind of night is this" from those genres.

const ALIASES = [
  [/^sci(ence)?[\s-]*fi(ction)?$/i, ["Sci-Fi"]],
  [/^sci(ence)?[\s-]*fi(ction)?\s*(&|and)\s*fantasy$/i, ["Sci-Fi", "Fantasy"]],
  [/^action\s*(&|and)\s*adventure$/i, ["Action", "Adventure"]],
  [/^war\s*(&|and)\s*politics$/i, ["War", "Politics"]],
  [/^(tv\s*movie)$/i, []],
  [/^(anime|animation)$/i, ["Animation"]],
  [/^mahou shoujo$/i, ["Fantasy"]],
  [/^(mecha)$/i, ["Mecha"]],
  [/^(ecchi|hentai)$/i, []]
];

function normalizeGenres(list) {
  const out = [];
  for (const raw of list || []) {
    const name = String(raw || "").trim();
    if (!name) continue;
    const alias = ALIASES.find(([re]) => re.test(name));
    for (const g of alias ? alias[1] : [name.replace(/\b\w/g, c => c.toUpperCase())]) if (!out.includes(g)) out.push(g);
  }
  return out;
}

// mood -> genres that suggest it. Matching is by whole genre name, case-insensitive.
const MOODS = {
  "Feel-good": ["Family", "Comedy", "Music", "Musical", "Romance", "Slice of Life", "Kids", "Animation"],
  "Funny": ["Comedy", "Parody", "Sitcom"],
  "Thrilling": ["Thriller", "Action", "Crime", "Suspense", "Spy", "Mystery"],
  "Dark": ["Horror", "Crime", "War", "Psychological", "Supernatural", "Noir"],
  "Heartfelt": ["Drama", "Romance", "Family", "Slice of Life", "Music"],
  "Mind-bending": ["Sci-Fi", "Mystery", "Psychological", "Thriller"],
  "Epic": ["Fantasy", "Adventure", "Sci-Fi", "History", "Western", "Mecha", "War"]
};

const MOOD_NAMES = Object.keys(MOODS);

function moodsFor(genres) {
  const have = new Set((genres || []).map(g => g.toLowerCase()));
  return MOOD_NAMES.filter(m => MOODS[m].some(g => have.has(g.toLowerCase())));
}

module.exports = { normalizeGenres, moodsFor, MOOD_NAMES };
