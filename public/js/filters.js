// The filter bar shared by My library and Browse.
// Visible: search, type, sort (and Favorites in the library). Everything else sits behind one "Filters" button,
// which opens by itself when one of those filters is already active, so nothing is ever applied out of sight.
// State lives in the URL, so back/refresh/share keep the same view.
import { esc, icon, debounce, MOODS, $, $$ } from "./app.js";

const KEYS = ["q", "type", "genre", "franchise", "mood", "tag", "letter", "sort", "order", "favorite", "mine", "yearFrom", "yearTo", "status", "page"];
const ADVANCED = ["genre", "franchise", "mood", "tag", "letter", "yearFrom", "yearTo", "mine"];

export function readState(defaults = {}) {
    const p = new URLSearchParams(location.search), s = { ...defaults };
    for (const k of KEYS) if (p.has(k)) s[k] = p.get(k);
    s.page = Number(s.page) || 1;
    return s;
}
export function toQuery(state, extra = {}) {
    const p = new URLSearchParams();
    for (const k of KEYS) if (state[k] !== undefined && state[k] !== "" && state[k] !== null && !(k === "page" && state[k] === 1)) p.set(k, state[k]);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return p;
}
export function writeUrl(state, keep = {}) {
    const p = toQuery(state);
    for (const [k, v] of Object.entries(keep)) p.set(k, v);
    history.replaceState(null, "", `${location.pathname}${p.toString() ? `?${p}` : ""}`);
}
export const hasFilters = (s, ignore = []) => KEYS.some(k => !["sort", "order", "page", ...ignore].includes(k) && s[k]);
const advancedCount = s => ADVANCED.filter(k => s[k]).length;

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const DIGITS = "0123456789".split("");

// opts: { tags: false, favorite: false, mine: false, sorts: [[value, label]] }
export function filterBarHtml(state, opts = {}) {
    const sorts = opts.sorts || [["title", "Title"], ["year", "Year"], ["rating", "Public rating"]];
    const panelId = `fp${Math.random().toString(36).slice(2, 7)}`;
    return `<section class="filters" aria-label="Filters">
    <div class="filter-main">
        <input class="input" type="search" data-f="q" placeholder="Search by title or franchise" aria-label="Search by title or franchise" value="${esc(state.q || "")}">
        <div class="seg" role="group" aria-label="Type">${[["", "All"], ["movie", "Movies"], ["series", "TV"], ["anime", "Anime"]].map(([v, l]) => `<button class="seg-btn" type="button" data-f-set="type" data-value="${v}" aria-pressed="${(state.type || "") === v}">${l}</button>`).join("")}</div>
        ${opts.favorite ? `<button class="btn" type="button" data-f-toggle="favorite" aria-pressed="${state.favorite === "1"}">${icon("heart", state.favorite === "1" ? "fill" : "")}Favorites</button>` : ""}
        <select class="select" data-f="sort" aria-label="Sort by">${sorts.map(([v, l]) => `<option value="${v}" ${v === state.sort ? "selected" : ""}>Sort: ${l}</option>`).join("")}</select>
        <button class="btn" type="button" data-f-panel aria-expanded="false" aria-controls="${panelId}">${icon("sliders")}Filters<span class="count" hidden></span></button>
        <button class="btn btn-ghost" type="button" data-f-clear hidden>${icon("x")}Clear all</button>
    </div>
    <div class="filter-panel" id="${panelId}" hidden>
        <div class="filter-grid">
        <div class="field"><label>Genre</label><select class="select" data-f="genre"><option value="">All genres</option></select></div>
        <div class="field"><label>Franchise</label><select class="select" data-f="franchise"><option value="">All franchises</option></select></div>
        <div class="field"><label>Mood</label><select class="select" data-f="mood"><option value="">Any mood</option></select></div>
        ${opts.tags ? `<div class="field"><label>Tag</label><select class="select" data-f="tag"><option value="">All tags</option></select></div>` : ""}
        <div class="field"><label>Year from</label><input class="input" type="number" inputmode="numeric" min="1870" max="2100" data-f="yearFrom" placeholder="e.g. 2010" value="${esc(state.yearFrom || "")}"></div>
        <div class="field"><label>Year to</label><input class="input" type="number" inputmode="numeric" min="1870" max="2100" data-f="yearTo" placeholder="e.g. 2024" value="${esc(state.yearTo || "")}"></div>
        </div>
        <div class="az-wrap"><span class="label">Jump to letter</span><div class="az" role="group" aria-label="Alphabetical index"></div><div class="az az-sub" role="group" aria-label="Number index" hidden></div></div>
        <div class="filter-foot">
        ${opts.mine ? `<label class="check"><input type="checkbox" data-f-toggle="mine" ${state.mine === "1" ? "checked" : ""}>Only shows I added</label>` : ""}
        <button class="btn btn-sm" type="button" data-f-order title="Reverse sort order">${icon("refresh")}Reverse order</button>
        </div>
    </div>
    </section>`;
}

const opt = (value, label, sel) => `<option value="${esc(value)}" ${sel ? "selected" : ""}>${esc(label)}</option>`;

// refresh the choices (and the A-Z buttons) from the latest facets, without touching the inputs the user is typing in
export function syncFilterBar(root, state, facets, opts = {}) {
    const fill = (key, all, list) => {
    const el = $(`[data-f="${key}"]`, root); if (!el) return;
    const cur = state[key] || "";
    const items = list.some(x => x.name.toLowerCase() === cur.toLowerCase()) || !cur ? list : [{ name: cur, count: 0 }, ...list];
    el.innerHTML = opt("", all, !cur) + items.map(x => opt(x.name, `${x.name} (${x.count})`, x.name.toLowerCase() === cur.toLowerCase())).join("");
    };
    fill("genre", "All genres", facets.genres || []);
    fill("franchise", "All franchises", facets.franchises || []);
    const moodCounts = new Map((facets.moods || []).map(m => [m.name, m.count]));
    fill("mood", "Any mood", MOODS.map(name => ({ name, count: moodCounts.get(name) || 0 })));
    if (opts.tags) fill("tag", "All tags", facets.tags || []);

    $$("[data-f-set]", root).forEach(b => b.setAttribute("aria-pressed", String((state.type || "") === b.dataset.value)));
    const fav = $("[data-f-toggle=favorite]", root); if (fav) { fav.setAttribute("aria-pressed", String(state.favorite === "1")); fav.innerHTML = `${icon("heart", state.favorite === "1" ? "fill" : "")}Favorites`; }
    $("[data-f-clear]", root).hidden = !hasFilters(state);

  // the Filters button shows how many advanced filters are on; the panel opens itself the first time if any are
    const n = advancedCount(state), count = $(".count", root), panelBtn = $("[data-f-panel]", root), panel = $(".filter-panel", root);
    count.hidden = !n; count.textContent = n;
    if (!root.dataset.ready) { root.dataset.ready = "1"; if (n) setPanel(root, true); }
    panelBtn.setAttribute("aria-label", n ? `Filters, ${n} active` : "Filters");

  // A-Z index: letters with no titles are disabled; shift-click picks a range (A-F, 3-7)
    const counts = facets.letters || {};
    const digitSum = DIGITS.reduce((m, d) => m + (counts[d] || 0), 0) + (counts["#"] || 0);
    const cur = String(state.letter || "").toUpperCase(), [a, b] = cur.includes("-") ? cur.split("-") : [cur, cur];
    const pressed = L => cur === L || (!!cur && /^[A-Z0-9]$/.test(L) && a && b && /^[A-Z0-9]$/.test(a) && (/[0-9]/.test(L) === /[0-9]/.test(a)) && L >= a && L <= b);
    const btn = (L, label, c, wide) => `<button class="az-btn ${wide ? "wide" : ""}" type="button" data-letter="${L}" aria-pressed="${pressed(L)}" ${c ? "" : "disabled"} aria-label="${L === "" ? "All titles" : L === "#" ? "Numbers and symbols" : `Titles starting with ${L}`}">${label}</button>`;
    const total = Object.values(counts).reduce((m, x) => m + x, 0);
    $(".az", root).innerHTML = btn("", "All", total || 1, true) + btn("#", "#", digitSum) + LETTERS.map(L => btn(L, L, counts[L])).join("");
    const sub = $(".az-sub", root), numeric = /^[0-9#]/.test(cur);
    sub.hidden = !numeric;
    if (numeric) sub.innerHTML = `<span class="az-label">Numbers (shift-click for a range)</span>${DIGITS.map(d => btn(d, d, counts[d])).join("")}`;
}

function setPanel(root, open) {
    $(".filter-panel", root).hidden = !open;
    $("[data-f-panel]", root).setAttribute("aria-expanded", String(open));
}

export function bindFilters(root, state, onChange) {
    const apply = () => { state.page = 1; onChange(); };
    const typed = debounce(apply, 300);
    root.addEventListener("input", e => { const el = e.target.closest("input[data-f]"); if (el) { state[el.dataset.f] = el.value.trim(); typed(); } });
    root.addEventListener("change", e => {
    const el = e.target.closest("select[data-f]"), box = e.target.closest('input[type="checkbox"][data-f-toggle]');
    if (el) { state[el.dataset.f] = el.value; apply(); }
    else if (box) { state[box.dataset.fToggle] = box.checked ? "1" : ""; apply(); }
    });
    root.addEventListener("click", e => {
    const set = e.target.closest("[data-f-set]"), tog = e.target.closest("button[data-f-toggle]"), ord = e.target.closest("[data-f-order]"), clr = e.target.closest("[data-f-clear]"), let_ = e.target.closest("[data-letter]"), pan = e.target.closest("[data-f-panel]");
    if (pan) setPanel(root, $(".filter-panel", root).hidden);
    else if (set) { state[set.dataset.fSet] = set.dataset.value; apply(); }
    else if (tog) { state[tog.dataset.fToggle] = state[tog.dataset.fToggle] === "1" ? "" : "1"; apply(); }
    else if (ord) { state.order = (state.order || (["title"].includes(state.sort) ? "asc" : "desc")) === "asc" ? "desc" : "asc"; apply(); }
    else if (clr) { for (const k of Object.keys(state)) if (!["sort", "order", "page"].includes(k)) state[k] = ""; $$("input[data-f]", root).forEach(i => (i.value = "")); apply(); }
    else if (let_) {
        const L = let_.dataset.letter, cur = String(state.letter || "").toUpperCase(), base = cur[0];
        if (L === "") state.letter = "";
        else if (e.shiftKey && base && /^[A-Z0-9]$/.test(base) && /^[A-Z0-9]$/.test(L) && /[0-9]/.test(base) === /[0-9]/.test(L)) {
        const [x, y] = [base, L].sort();
        state.letter = x === y ? x : `${x}-${y}`;
        } else state.letter = cur === L ? "" : L;
        apply();
    }
    });
}

export function pagerHtml(page, pages) {
    if (pages <= 1) return "";
    const nums = new Set([1, pages, page - 1, page, page + 1]);
    const list = [...nums].filter(n => n >= 1 && n <= pages).sort((x, y) => x - y);
    let out = `<button type="button" data-page="${page - 1}" ${page === 1 ? "disabled" : ""} aria-label="Previous page">${icon("chevL")}</button>`, prev = 0;
    for (const n of list) { if (n - prev > 1) out += `<button type="button" disabled>…</button>`; out += `<button type="button" data-page="${n}" ${n === page ? 'aria-current="page"' : ""}>${n}</button>`; prev = n; }
    return out + `<button type="button" data-page="${page + 1}" ${page === pages ? "disabled" : ""} aria-label="Next page">${icon("chevR")}</button>`;
}