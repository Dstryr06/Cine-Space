// Franchise detection: no folders, no manual input. Three steps, strongest evidence first:
//  1. KNOWN universes, matched on the title, plus keywords / studios / synopsis of the title ("Marvel", "DC", "Star Wars" ...)
//  2. the OFFICIAL collection supplied by the source (TMDB "belongs_to_collection")
//  3. a shared title stem across the saved titles ("Kung Fu Panda 2", "Kung Fu Panda: Legends of Awesomeness" -> "Kung Fu Panda")
// Steps 1 and 2 are decided per title (detectFranchise); step 3 needs to see several titles (applyFranchiseGroups).

// title: tested against the title only (must be distinctive enough that no unrelated title matches)
// text:  tested against keywords + studios + creators + synopsis
const KNOWN = [
  { name: "Marvel", title: [/\b(avengers|iron man|captain america|guardians of the galaxy|doctor strange|ant-man|black panther|spider-man|x-men|deadpool|shang-chi|wandavision|the incredible hulk|fantastic four|marvel)\b/i, /^(thor|loki|hawkeye|daredevil|moon knight|ms\. marvel|she-hulk)(:|$|\s)/i],
    text: [/\bmarvel (studios|comics|cinematic universe|entertainment)\b/i, /\bmcu\b/i, /\bavengers\b/i, /\bwakanda\b/i] },
  { name: "DC", title: [/\b(batman|superman|wonder woman|aquaman|justice league|the flash|suicide squad|green lantern|teen titans|shazam|man of steel|black adam|the batman|joker|dc league)\b/i],
    text: [/\bdc (comics|studios|films|extended universe|universe)\b/i, /\bdceu\b/i, /\bgotham\b/i, /\bdc entertainment\b/i] },
  { name: "Star Wars", title: [/\bstar wars\b/i, /^(the mandalorian|andor|obi-wan kenobi|ahsoka|the clone wars|rogue one|solo: a star wars)/i], text: [/\blucasfilm\b/i, /\bjedi\b/i, /\bsith\b/i] },
  { name: "Star Trek", title: [/\bstar trek\b/i], text: [/\bstarfleet\b/i] },
  { name: "Harry Potter", title: [/\bharry potter\b/i, /\bfantastic beasts\b/i], text: [/\bhogwarts\b/i, /\bwizarding world\b/i] },
  { name: "Middle-earth", title: [/\b(the lord of the rings|the hobbit|rings of power)\b/i], text: [/\bmiddle[- ]earth\b/i, /\btolkien\b/i] },
  { name: "Fast & Furious", title: [/\b(fast (&|and) furious|the fast and the furious|furious [0-9]|fast x|hobbs (&|and) shaw|2 fast 2 furious)\b/i], text: [] },
  { name: "James Bond", title: [/\bjames bond\b/i, /\b(casino royale|skyfall|goldfinger|spectre|no time to die|quantum of solace|thunderball|octopussy|goldeneye)\b/i], text: [/\b007\b/, /\bjames bond\b/i] },
  { name: "Mission: Impossible", title: [/\bmission:? impossible\b/i], text: [] },
  { name: "Jurassic Park", title: [/\bjurassic (park|world)\b/i], text: [] },
  { name: "Transformers", title: [/\btransformers\b/i], text: [] },
  { name: "Toy Story", title: [/\btoy story\b/i, /^(lightyear|buzz lightyear)/i], text: [] },
  { name: "Shrek", title: [/\bshrek\b/i, /^puss in boots/i], text: [] },
  { name: "Despicable Me", title: [/\b(despicable me|minions)\b/i], text: [] },
  { name: "Pirates of the Caribbean", title: [/\bpirates of the caribbean\b/i], text: [] },
  { name: "Indiana Jones", title: [/\bindiana jones\b/i, /\braiders of the lost ark\b/i], text: [] },
  { name: "Alien", title: [/^(alien|aliens|alien3|alien: .+|alien resurrection|prometheus|alien vs\.? predator)$/i], text: [] },
  { name: "Terminator", title: [/\bterminator\b/i], text: [] },
  { name: "The Matrix", title: [/\bthe matrix\b/i], text: [] },
  { name: "John Wick", title: [/\bjohn wick\b/i, /^ballerina$/i], text: [] },
  { name: "Planet of the Apes", title: [/\bplanet of the apes\b/i, /\b(dawn|war|rise|kingdom) of the planet of the apes\b/i], text: [] },
  { name: "Godzilla & Kong", title: [/\b(godzilla|king kong|kong: skull island)\b/i], text: [/\bmonsterverse\b/i] },
  { name: "The Hunger Games", title: [/\bthe hunger games\b/i], text: [] },
  { name: "Twilight", title: [/^the twilight saga\b/i, /^twilight$/i], text: [] },
  { name: "Rocky & Creed", title: [/^(rocky|creed)\b/i], text: [] },
  { name: "Pokémon", title: [/\bpok[eé]mon\b/i], text: [] },
  { name: "Dragon Ball", title: [/\bdragon ball\b/i], text: [] },
  { name: "Naruto", title: [/\bnaruto\b/i, /^boruto/i], text: [] },
  { name: "One Piece", title: [/\bone piece\b/i], text: [] },
  { name: "Bleach", title: [/^bleach\b/i], text: [] },
  { name: "Attack on Titan", title: [/\battack on titan\b/i, /\bshingeki no kyojin\b/i], text: [] },
  { name: "Fullmetal Alchemist", title: [/\bfullmetal alchemist\b/i], text: [] },
  { name: "Gundam", title: [/\bgundam\b/i], text: [] },
  { name: "Sailor Moon", title: [/\bsailor moon\b/i], text: [] },
  { name: "Game of Thrones", title: [/\bgame of thrones\b/i, /\bhouse of the dragon\b/i], text: [/\bwesteros\b/i] },
  { name: "Breaking Bad", title: [/^breaking bad$/i, /^better call saul$/i, /^el camino\b/i], text: [] },
  { name: "The Walking Dead", title: [/\bthe walking dead\b/i, /\bfear the walking dead\b/i], text: [] },
  { name: "Doctor Who", title: [/\bdoctor who\b/i, /^torchwood$/i], text: [/\btardis\b/i] },
  { name: "Resident Evil", title: [/\bresident evil\b/i], text: [] },
  { name: "Mortal Kombat", title: [/\bmortal kombat\b/i], text: [] },
  { name: "Kung Fu Panda", title: [/\bkung fu panda\b/i], text: [] },
  { name: "How to Train Your Dragon", title: [/\bhow to train your dragon\b/i, /^dragons:/i], text: [] },
  { name: "The Conjuring Universe", title: [/\b(the conjuring|annabelle|the nun)\b/i], text: [] },
  { name: "Scream", title: [/^scream\b/i], text: [] },
  { name: "Spider-Verse", title: [/\bspider-verse\b/i], text: [] },
  { name: "Studio Ghibli", title: [], text: [/\bstudio ghibli\b/i] },
  { name: "Pixar", title: [], text: [/\bpixar\b/i] }
];

const WORDS_TO_DROP = /\b(collection|saga|anthology|trilogy|film series)\b/gi;
const cleanCollection = name => String(name || "").replace(/[\s-]*\bcollection\b$/i, "").replace(/\s+/g, " ").trim();

function detectFranchise({ title = "", collection = null, synopsis = "", keywords = [], studios = [], creators = [] }) {
  const t = String(title);
  for (const f of KNOWN) if (f.title.some(re => re.test(t))) return { name: f.name, source: "keyword" };

  const text = [...keywords, ...studios, ...creators].join(" | ");
  const body = `${text} | ${synopsis || ""}`;
  for (const f of KNOWN) if (f.text.some(re => re.test(body))) return { name: f.name, source: "keyword" };

  const c = cleanCollection(collection?.name ?? collection);
  if (c) return { name: c, source: "collection" };
  return null;
}

// ---------- step 3: group by shared title stem ----------
// "Kung Fu Panda 2" -> "Kung Fu Panda";  "Avatar: The Way of Water" -> "Avatar";  "Ocean's Eleven" stays alone.
const GENERIC = new Set(["the", "love", "home", "life", "dark", "night", "day", "man", "woman", "girl", "boy", "world", "story", "war", "red", "blue", "black", "white", "death", "dead", "game", "games", "king", "queen", "blood", "high", "school", "city", "island", "house", "family", "lost", "one", "two", "heart", "fire", "ice", "last", "first", "new", "big", "little", "great", "good", "bad"]);

function stemOf(title) {
  let s = String(title || "").replace(/\([^)]*\)/g, " ");
  s = s.split(/\s*[:\u2013\u2014]\s*|\s+-\s+/)[0];
  s = s.replace(/\b(part|chapter|vol(ume)?|season|episode)\b.*$/i, "");
  s = s.replace(/[\s\-\u2013]*(\d{1,2}|[ivx]{1,4})\s*$/i, "");
  s = s.replace(/^(the|a|an)\s+/i, "").replace(/[^\p{L}\p{N}\s'&.-]/gu, "").replace(/\s+/g, " ").trim();
  return s;
}

const stemKey = s => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const usableStem = s => {
  if (s.length < 4) return false;
  const words = s.split(" ");
  if (words.length === 1 && (s.length < 5 || GENERIC.has(stemKey(s)))) return false;
  return !words.every(w => GENERIC.has(stemKey(w)));
};

// medias: what to label. universe: every title we can see (so a lone "Shrek 2" saved by the user still joins "Shrek" in the catalog)
function applyFranchiseGroups(medias, universe = medias) {
  const counts = new Map();
  for (const m of universe) {
    const s = stemOf(m.title);
    if (!usableStem(s)) continue;
    const k = stemKey(s), bucket = counts.get(k) || { n: 0, names: new Map() };
    bucket.n++;
    bucket.names.set(s, (bucket.names.get(s) || 0) + 1);
    counts.set(k, bucket);
  }
  return medias.map(m => {
    if (m.franchise) return m;
    const s = stemOf(m.title);
    if (!usableStem(s)) return m;
    const b = counts.get(stemKey(s));
    if (!b || b.n < 2) return m;
    const name = [...b.names.entries()].sort((a, c) => c[1] - a[1] || a[0].length - c[0].length)[0][0];
    return { ...m, franchise: name, franchiseSource: "title" };
  });
}

module.exports = { detectFranchise, applyFranchiseGroups, stemOf, KNOWN };
