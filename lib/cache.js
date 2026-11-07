// Tiny in-memory cache with a time limit. Used so the same online lookup is not repeated for every click.
// cached(key, ttlMs, loader): returns the saved answer, or runs loader() once (even if asked twice at the same moment).
const entries = new Map();    // key -> { value, expires }
const running = new Map();    // key -> promise of a lookup that is still in progress
const MAX_ENTRIES = 300;

function peek(key) {
    const hit = entries.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;
    entries.delete(key);
    return null;
}

function cached(key, ttlMs, loader) {
    const hit = peek(key);
    if (hit) return Promise.resolve(hit);
    if (running.has(key)) return running.get(key);

    const job = loader()
    .then(value => {
      if (entries.size >= MAX_ENTRIES) entries.delete(entries.keys().next().value);   // drop the oldest
        entries.set(key, { value, expires: Date.now() + ttlMs });
        return value;
    })
    .finally(() => running.delete(key));      // a failed lookup is not saved, so the next click tries again
    running.set(key, job);
    return job;
}

module.exports = { cached, peek };