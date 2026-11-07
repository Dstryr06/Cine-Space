// The one place that talks to online APIs. It gives every call:
//  - a hard timeout (AbortController)
//  - one quick retry on network errors, 429 and 5xx (never on timeouts, so slow services fail fast)
//  - a circuit breaker per host: after 3 failures in a row the host is skipped for 30 s instead of making users wait
//  - a small in-memory cache, and "stale if error": if the service is down we serve the last good answer
//  - a trace line (logged against the request id that caused it)
const { httpError } = require("./errors");
const logger = require("./logger");

const DEFAULT_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS) || 6000;
const BREAKER_FAILS = 3;
const BREAKER_OPEN_MS = 30000;
const MAX_CACHE = 500;

const breakers = new Map();   // host -> { fails, openUntil }
const cache = new Map();      // key  -> { data, at, ttl }

const sleep = ms => new Promise(r => setTimeout(r, ms));
const hostOf = url => { try { return new URL(url).host; } catch (e) { return "unknown"; } };
const breaker = host => { if (!breakers.has(host)) breakers.set(host, { fails: 0, openUntil: 0 }); return breakers.get(host); };

function remember(key, data, ttl) {
  cache.delete(key);
  cache.set(key, { data, at: Date.now(), ttl });
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);   // drop the oldest
}

// one network attempt; returns the parsed JSON or throws an error that says whether a retry makes sense
async function attempt(url, { method, body, headers, timeout }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      method, body, signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "cine-space/2.0", ...headers }
    });
    if (res.status === 404) throw Object.assign(httpError(404, "Title not found."), { final: true });
    if (res.status === 429) throw Object.assign(httpError(503, "The online service is rate limiting requests."), { retry: true, countsAsFailure: true });
    if (res.status >= 500) throw Object.assign(httpError(502, `Online service answered ${res.status}.`), { retry: true, countsAsFailure: true });
    if (!res.ok) throw Object.assign(httpError(502, `Online service answered ${res.status}.`), { final: true });
    try { return { data: await res.json(), status: res.status }; }
    catch (e) { throw Object.assign(httpError(502, "The online service sent an unreadable answer."), { final: true, countsAsFailure: true }); }
  } catch (e) {
    if (e.status) throw e;
    if (e.name === "AbortError") throw Object.assign(httpError(504, "The online service took too long to answer."), { countsAsFailure: true });
    throw Object.assign(httpError(502, "Unable to reach the online service."), { retry: true, countsAsFailure: true });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url, { timeout = DEFAULT_TIMEOUT_MS, retries = 1, headers = {}, method = "GET", body, ttl = 0, staleTtl = 24 * 3600 * 1000 } = {}) {
  const key = `${method} ${url} ${body || ""}`;
  const host = hostOf(url);
  const hit = cache.get(key);
  const target = new URL(url).pathname;

  if (hit && ttl && Date.now() - hit.at < hit.ttl) {
    logger.upstream({ service: host, method, target, outcome: "cache", ms: 0 });
    return hit.data;
  }

  const br = breaker(host);
  const started = Date.now();
  try {
    if (br.openUntil > Date.now()) throw Object.assign(httpError(503, `${host} is temporarily unavailable.`), { skipped: true });

    let lastError;
    for (let i = 0; i <= retries; i++) {
      try {
        const { data, status } = await attempt(url, { method, body, headers, timeout });
        br.fails = 0;
        if (ttl) remember(key, data, ttl);
        logger.upstream({ service: host, method, target, outcome: String(status), ms: Date.now() - started });
        return data;
      } catch (e) {
        lastError = e;
        if (!e.retry || i === retries) break;
        await sleep(e.status === 503 ? 1200 : 300);
      }
    }
    throw lastError;
  } catch (e) {
    if (e.countsAsFailure && !e.skipped && ++br.fails >= BREAKER_FAILS) br.openUntil = Date.now() + BREAKER_OPEN_MS;
    // a failing service should not take the page down with it: serve the last good answer if we have one
    if (e.status !== 404 && hit && Date.now() - hit.at < staleTtl) {
      logger.upstream({ service: host, method, target, outcome: `stale (${e.status})`, ms: Date.now() - started });
      return hit.data;
    }
    logger.upstream({ service: host, method, target, outcome: `failed ${e.status || ""} ${e.message}`.trim(), ms: Date.now() - started });
    throw e;
  }
}

// lets tests and the health endpoint look at (or reset) the protective state
const state = () => [...breakers.entries()].map(([host, b]) => ({ host, fails: b.fails, open: b.openUntil > Date.now() }));
const reset = () => { breakers.clear(); cache.clear(); };

module.exports = { fetchJson, state, reset };
