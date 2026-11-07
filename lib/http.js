// Small wrapper around fetch used by every provider adapter (Node 18+ has fetch built in).
// fetchJson(url, { method, headers, body, timeout = 10000, retries = 1 })
//  - gives up after `timeout` ms (default 8 seconds)
//  - retries network errors, timeouts, 429 and 5xx answers `retries` more times
//  - throws an httpError with a readable message, so the API's error shape stays the same
const { httpError } = require("./errors");

const wait = ms => new Promise(r => setTimeout(r, ms));

async function fetchJson(url, { timeout = 8000, retries = 1, ...options } = {}) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await wait(500 * attempt);
    try {
        const res = await fetch(url, {
        ...options,
        headers: { Accept: "application/json", ...(options.headers || {}) },
        signal: AbortSignal.timeout(timeout)
        });
        if (res.status === 404) throw Object.assign(httpError(404, "Title not found."), { final: true });
        if (!res.ok) {
        const err = httpError(502, `Online service answered with status ${res.status}.`);
        err.final = res.status < 500 && res.status !== 429;   // 4xx (except 429) will not get better by retrying
        throw err;
        }
        return await res.json();
    } catch (e) {
        if (e.name === "TimeoutError" || e.name === "AbortError") lastError = httpError(504, "The online service took too long to answer.");
        else if (e.status) lastError = e;
        else lastError = httpError(502, "Could not reach the online service.");
        if (e.final) break;
    }
    }
    throw lastError;
}

module.exports = { fetchJson };