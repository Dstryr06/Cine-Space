// The saved catalog (data/catalog.json) in canonical form, with franchise groups applied. Parsed once per file change.
const store = require("./store");
const { toTitle } = require("./model");
const { applyFranchiseGroups } = require("./franchise");

const cache = new WeakMap();

function load() {
  const raw = store.readCached("catalog.json", []);
  let c = cache.get(raw);
  if (!c) {
    const items = applyFranchiseGroups(raw.map(toTitle));
    c = { items, byKey: new Map(items.map(t => [t.key, t])) };
    if (raw.length) cache.set(raw, c);
  }
  return c;
}

module.exports = { load };
