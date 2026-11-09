// Shared helpers for every page: API client, auth, theme, icons, app shell, cards, modal, toast, randomizer.
export const TOKEN_KEY = "cinespace_token";
export const USER_KEY = "cinespace_user";

// ---------- tiny helpers ----------
export const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const safeUrl = u => /^(https?:\/\/|\/(?!\/))/i.test(u || "") ? u : "";
export const TYPE_LABEL = { movie: "Movie", series: "TV show", anime: "Anime" };
export const STATUS = {
    to_watch: { label: "To Watch", icon: "bookmark" },
    watching: { label: "Watching", icon: "play" },
    completed: { label: "Completed", icon: "check" },
    dropped: { label: "Dropped", icon: "x" }
};
export const STATUS_KEYS = Object.keys(STATUS);
export const MOODS = ["Feel-good", "Funny", "Thrilling", "Dark", "Heartfelt", "Mind-bending", "Epic"];

// ---------- icons (inline SVG, 24px grid) ----------
const ICONS = {
    home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-5h4v5"/>',
    library: '<rect x="3" y="4" width="4.5" height="16" rx="1.2"/><rect x="9.5" y="4" width="4.5" height="16" rx="1.2"/><path d="m16.2 5.6 3.9-1 3 14.6-3.9 1z" transform="translate(-1.6 0)"/>',
    heart: '<path d="M12 20.5s-8-4.8-8-10.8A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8 2.7c0 6-8 10.8-8 10.8z"/>',
    dice: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.5" cy="8.5" r="1" class="d"/><circle cx="15.5" cy="8.5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="8.5" cy="15.5" r="1"/><circle cx="15.5" cy="15.5" r="1"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20.5 20.5-4.2-4.2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M2.5 12H5M19 12h2.5M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8"/>',
    moon: '<path d="M20 14.5A8.2 8.2 0 0 1 9.5 4a8.2 8.2 0 1 0 10.5 10.5z"/>',
    logout: '<path d="M9.5 4.5h-4v15h4"/><path d="m16 8 4 4-4 4"/><path d="M20 12H9.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="m4.5 12.5 5 5 10-11"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    play: '<path d="M8 5v14l11-7z"/>',
    bookmark: '<path d="M6.5 4h11v16.5L12 16.5l-5.5 4z"/>',
    trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
    edit: '<path d="M4 20h4L19.5 8.5l-4-4L4 16z"/>',
    chevL: '<path d="m14.5 5-7 7 7 7"/>',
    chevR: '<path d="m9.5 5 7 7-7 7"/>',
    refresh: '<path d="M20 11.5A8 8 0 0 0 5.5 7.5M4 4v4h4"/><path d="M4 12.5A8 8 0 0 0 18.5 16.5M20 20v-4h-4"/>',
    star: '<path d="m12 3 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.3 6.3 20.5l1.2-6.4-4.7-4.4 6.4-.8z"/>',
    alert: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17.2v.1"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8v.1"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
    eyeOff: '<path d="M3 3l18 18M10 5.7A9 9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-3.2 3.9M6.4 7.4A16 16 0 0 0 2.5 12S6 18.5 12 18.5a9 9 0 0 0 3.6-.8"/>',
    tv: '<rect x="3" y="6" width="18" height="12.5" rx="2.5"/><path d="M8 21h8M12 18.5V21"/>',
    activity: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
    film: '<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M8 4v16M16 4v16M3.5 9h4.5M16 9h4.5M3.5 15h4.5M16 15h4.5"/>',
    external: '<path d="M14 4.5h5.5V10M19.5 4.5 11 13M18 14v5.5H5V6.5h5.5"/>',
    dot: '<circle cx="12" cy="12" r="3.2"/>',
    sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17 5-4.5 3.5 3L16 12l4 4"/>'
};
export const icon = (name, extra = "") => `<svg class="i ${extra}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ""}</svg>`;
export const LOGO = `<svg viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a78bfa"/><stop offset="1" stop-color="#7c3aed"/></linearGradient></defs><circle cx="22" cy="26" r="16" fill="none" stroke="url(#lg)" stroke-width="4"/><path d="M18 19v14l11-7z" fill="url(#lg)"/><circle cx="38.5" cy="9.5" r="4.5" fill="url(#lg)"/></svg>`;

// broken poster images fall back to the initial letter underneath
document.addEventListener("error", e => { if (e.target.tagName === "IMG") e.target.classList.add("is-broken"); }, true);

// ---------- theme ----------
export const getTheme = () => document.documentElement.getAttribute("data-theme") || "light";
export function setTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
  try { localStorage.setItem("cs_theme", t); } catch (e) { /* ignore */ }
    document.dispatchEvent(new CustomEvent("cs:theme"));
}
const themeIcon = () => icon(getTheme() === "dark" ? "sun" : "moon");
export const themeButton = (cls = "icon-btn") => `<button class="${cls} theme-btn" type="button" data-theme-toggle aria-label="Switch to ${getTheme() === "dark" ? "light" : "dark"} mode">${themeIcon()}</button>`;
const themeLabel = () => (getTheme() === "dark" ? "Light mode" : "Dark mode");
document.addEventListener("click", e => {
    const b = e.target.closest("[data-theme-toggle]");
    if (!b) return;
    setTheme(getTheme() === "dark" ? "light" : "dark");
    $$("[data-theme-toggle]").forEach(x => {
    x.innerHTML = x.dataset.themeStyle === "menu" ? `${themeIcon()}<span>${themeLabel()}</span>` : themeIcon();
    x.setAttribute("aria-label", `Switch to ${getTheme() === "dark" ? "light" : "dark"} mode`);
    });
});

// ---------- region (for "where to watch") ----------
export const REGIONS = ["PH", "US", "GB", "CA", "AU", "NZ", "SG", "MY", "ID", "TH", "VN", "JP", "KR", "IN", "DE", "FR", "ES", "IT", "BR", "MX"];
export const getRegion = () => { try { return localStorage.getItem("cs_region") || "PH"; } catch (e) { return "PH"; } };
export const setRegion = r => { try { localStorage.setItem("cs_region", r); } catch (e) { /* ignore */ } };
export function regionName(code) { try { return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code; } catch (e) { return code; } }

// ---------- API ----------
export class ApiError extends Error {
    constructor(message, { status, errors, requestId, fields } = {}) { super(message); this.status = status; this.errors = errors || [message]; this.requestId = requestId; this.fields = fields || {}; }
}
export const isLoggedIn = () => !!localStorage.getItem(TOKEN_KEY);
export const loginUrl = () => `login.html?next=${encodeURIComponent(location.pathname.split("/").pop() + location.search)}`;

async function send(url, init) {
    const token = localStorage.getItem(TOKEN_KEY);
    init.headers = { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers };
    let res;
    try { res = await fetch(url, init); }
    catch (e) {
    if (e.name === "AbortError") throw e;
    throw new ApiError("Can't reach the Cine Space server. Check your connection and try again.", { status: 0 });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
    if (res.status === 401 && token && !location.pathname.endsWith("login.html")) { localStorage.removeItem(TOKEN_KEY); location.href = loginUrl(); }
    const errors = data.errors || ["Something went wrong. Try again."];
    throw new ApiError(errors.join(" "), { status: res.status, errors, fields: data.fields, requestId: data.requestId || res.headers.get("X-Request-Id") });
    }
    return data;
}

export function api(url, { method = "GET", body, signal } = {}) {
    return send(url, { method, signal, headers: body === undefined ? {} : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
}
// sends a file as raw bytes (used for posters): no multipart, no re-encoding, so the image arrives exactly as chosen
export const apiUpload = (url, file) => send(url, { method: "PUT", headers: { "Content-Type": file.type }, body: file });

// Poster URLs from the catalog are stored in a small size. Ask the image host for a sharper one where it offers it.
export function posterSrc(url, size = "card") {
    const u = safeUrl(url);
    if (!u) return "";
    if (/image\.tmdb\.org\/t\/p\/w\d+\//.test(u)) return u.replace(/\/t\/p\/w\d+\//, `/t/p/${size === "large" ? "w780" : "w500"}/`);
    if (size === "large" && /static\.tvmaze\.com\/uploads\/images\/(medium_portrait|medium_untouched|large_untouched)\//.test(u)) return u.replace(/images\/[a-z_]+\//, "images/original_untouched/");
    return u;
}

export function requireLogin() { if (!isLoggedIn()) { location.href = loginUrl(); return false; } return true; }
export function logout() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); location.href = "login.html"; }

// ---------- toast ----------
export function toast(message, type = "", detail = "") {
    let box = $(".toasts");
    if (!box) { box = document.createElement("div"); box.className = "toasts"; box.setAttribute("aria-live", "polite"); document.body.appendChild(box); }
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.innerHTML = `<div>${esc(message)}${detail ? `<small>${esc(detail)}</small>` : ""}</div>`;
    box.appendChild(el);
    setTimeout(() => el.remove(), type === "error" ? 7000 : 3800);
}
export const toastError = e => toast(e.message || "Something went wrong.", "error", e.requestId ? `Reference ${e.requestId}` : "");

// ---------- modal ----------
export function openModal({ title, html, wide = false, size = "", onMount }) {
    const opener = document.activeElement;
    const back = document.createElement("div");
    back.className = "backdrop";
    const id = `m${Math.random().toString(36).slice(2, 7)}`;
    back.innerHTML = `<div class="modal ${wide ? "wide" : ""} ${size}" role="dialog" aria-modal="true" aria-labelledby="${id}">
    <div class="modal-head"><h2 id="${id}">${esc(title)}</h2><button class="icon-btn" type="button" data-close aria-label="Close">${icon("x")}</button></div>
    <div class="modal-body">${html}</div></div>`;
    document.body.appendChild(back);
    const modal = back.firstElementChild;
    const close = () => { back.remove(); document.removeEventListener("keydown", onKey, true); opener && opener.focus && opener.focus(); };
    function onKey(e) {
    if (e.key === "Escape") { e.stopPropagation(); close(); return; }
    if (e.key !== "Tab") return;
    const f = $$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', modal).filter(x => !x.disabled && x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKey, true);
    back.addEventListener("mousedown", e => { if (e.target === back) close(); });
    modal.addEventListener("click", e => { if (e.target.closest("[data-close]")) close(); });
    const ctrl = { el: modal, close, body: $(".modal-body", modal) };
    onMount && onMount(ctrl);
    (modal.querySelector("[autofocus]") || modal.querySelector("input, select, textarea, button:not([data-close])") || modal.querySelector("[data-close]")).focus();
    return ctrl;
}

export function confirmDialog({ title, message, confirmLabel = "Confirm", danger = false }) {
    return new Promise(resolve => {
    let answer = false;
    const m = openModal({ title, html: `<p>${esc(message)}</p><div class="modal-actions"><button class="btn" data-close type="button">Cancel</button><button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-ok type="button">${esc(confirmLabel)}</button></div>` });
    m.el.addEventListener("click", e => { if (e.target.closest("[data-ok]")) { answer = true; m.close(); } });
    const obs = new MutationObserver(() => { if (!document.body.contains(m.el)) { obs.disconnect(); resolve(answer); } });
    obs.observe(document.body, { childList: true });
    });
}

// ---------- cards ----------
export const titleUrl = (source, id) => `title.html?source=${encodeURIComponent(source)}&id=${encodeURIComponent(id)}`;
export const entryUrl = e => `title.html?entry=${encodeURIComponent(e.id)}`;
export const initials = t => esc(([...String(t || "?").trim()][0] || "?").toUpperCase());

export function posterImg(url, title, size = "card") {
    const src = posterSrc(url, size);
    return `<div class="poster">${src ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ""}<span class="initial">${initials(title)}</span></div>`;
}
export const ratingChip = t => t.publicRating ? `<span class="rate" title="${esc(t.publicRating.source)} rating">${icon("star", "fill")}${esc(t.publicRating.value.toFixed(1))}</span>` : "";

// card for catalog and search results: poster, then title and one line of facts
export function browseCard(t) {
    const inLib = t.library, href = titleUrl(t.source, t.id);
    const fab = inLib
    ? `<a class="card-fab is-on" href="${href}" aria-label="${esc(t.title)} is in your library: ${STATUS[inLib.status].label}" title="In your library: ${STATUS[inLib.status].label}">${icon("check")}</a>`
    : `<button class="card-fab" type="button" data-action="add" data-source="${esc(t.source)}" data-id="${esc(t.id)}" aria-label="Add ${esc(t.title)} to your library" title="Add to library">${icon("plus")}</button>`;
    return `<article class="card" data-key="${esc(t.key)}">
    <a class="card-link" href="${href}" tabindex="-1" aria-hidden="true">${posterImg(t.posterUrl, t.title)}</a>${fab}
    <div><a class="card-title" href="${href}">${esc(t.title)}</a>
        <div class="card-meta"><span>${TYPE_LABEL[t.type]}</span>${t.year ? `<span>${t.year}</span>` : ""}${ratingChip(t)}</div></div>
    </article>`;
}

// card for library entries: status, progress, favorite
export function libraryCard(e) {
    const m = e.media, p = e.progress, href = entryUrl(e);
    const prog = p ? `<div class="bar" style="margin-top:8px" aria-hidden="true"><i style="--p:${p.percent ?? 0}%"></i></div><div class="card-meta" style="margin-top:4px">S${p.season} E${p.episode}${p.total ? ` of ${p.total} episodes` : ""}</div>` : "";
    const mine = e.review ? `<span class="stars" role="img" aria-label="Your rating ${e.review.rating} of 5">${stars(e.review.rating)}</span>` : "";
    const next = p && p.next ? `<button class="btn btn-sm" type="button" data-action="next" data-id="${esc(e.id)}" title="Mark S${p.next.season} E${p.next.episode} watched" aria-label="Mark season ${p.next.season} episode ${p.next.episode} of ${esc(m.title)} watched">+1 ep</button>` : "";
    return `<article class="card" data-id="${esc(e.id)}">
    <a class="card-link" href="${href}" tabindex="-1" aria-hidden="true">${posterImg(m.posterUrl, m.title)}</a>
    <button class="card-fab is-heart ${e.favorite ? "is-on" : ""}" type="button" data-action="fav" data-id="${esc(e.id)}" aria-pressed="${e.favorite}" aria-label="${e.favorite ? "Remove from favorites" : "Add to favorites"}">${icon("heart", e.favorite ? "fill" : "")}</button>
    <div><a class="card-title" href="${href}">${esc(m.title)}</a>
        <div class="card-meta"><span>${TYPE_LABEL[m.type]}</span>${m.year ? `<span>${m.year}</span>` : ""}${mine}</div>${prog}</div>
    <div class="card-foot">
        <select class="select" data-action="status" data-id="${esc(e.id)}" aria-label="Status of ${esc(m.title)}">${STATUS_KEYS.map(k => `<option value="${k}" ${k === e.status ? "selected" : ""}>${STATUS[k].label}</option>`).join("")}</select>${next}
    </div>
    </article>`;
}

export function stars(n, max = 5) {
    return Array.from({ length: max }, (_, i) => `<span class="${i < n ? "" : "off"}">${icon("star", "fill")}</span>`).join("");
}

// ---------- add to library (shared by every page) ----------
export async function addToLibrary(source, id, status) {
    try {
    const r = await api("/api/watchlist", { method: "POST", body: { source, id, region: getRegion(), ...(status ? { status } : {}) } });
    toast("Added to your library", "success", r.warnings?.[0] || "");
    return r.data;
    } catch (e) { toastError(e); return null; }
}

// ---------- app shell ----------
// One top bar: brand, two places to go (Discover, My library), search, the one global action (Add Show) and the account menu.
export async function openShowForm(opts) { return (await import("./show-form.js")).openShowForm(opts); }

export function mountShell({ active, search = true }) {
    const view = $("#view");
    const user = localStorage.getItem(USER_KEY) || "there";
    const link = (key, href, label) => `<a href="${href}" ${key === active ? 'aria-current="page"' : ""}>${label}</a>`;
    const header = document.createElement("header");
    header.className = "topbar";
    header.innerHTML = `<div class="topbar-in">
        <a class="brand" href="index.html" aria-label="Cine Space home">${LOGO}<span>Cine Space</span></a>
        <nav class="nav" aria-label="Main">${link("home", "index.html", "Discover")}${link("library", "account.html", "My library")}</nav>
        ${search ? `<form class="search" role="search" id="globalSearchForm">${icon("search")}<input id="globalSearch" type="search" placeholder="Search movies, TV shows and anime" aria-label="Search movies, TV shows and anime" autocomplete="off"></form>` : ""}
        <div class="topbar-actions">
        <button class="btn btn-primary btn-add" type="button" data-add-show aria-label="Add a show">${icon("plus")}<span class="txt">Add Show</span></button>
        <button class="avatar-btn" type="button" id="userMenuBtn" aria-haspopup="true" aria-expanded="false" aria-label="Account menu">${esc(user[0] || "?")}</button>
        <div class="menu" id="userMenu" hidden>
            <div class="menu-head">${esc(user)}</div>
            <div class="menu-field"><label for="regionSel">Where to watch region</label><select class="select" id="regionSel">${REGIONS.map(r => `<option value="${r}" ${r === getRegion() ? "selected" : ""}>${esc(regionName(r))} (${r})</option>`).join("")}</select></div>
            <button class="menu-item" type="button" data-theme-toggle data-theme-style="menu" aria-label="Switch to ${getTheme() === "dark" ? "light" : "dark"} mode">${themeIcon()}<span>${themeLabel()}</span></button>
            <button class="menu-item" type="button" data-sync>${icon("refresh")}Sync catalog</button>
            <button class="menu-item" type="button" data-activity>${icon("activity")}Recent activity</button>
            <button class="menu-item" type="button" data-logout>${icon("logout")}Log out</button>
        </div>
        </div>
    </div>`;
    view.before(header);
    const foot = document.createElement("footer");
    foot.className = "footer-note";
    foot.textContent = "Movie and TV data from TMDB, TVmaze and AniList. This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming availability by JustWatch.";
    view.after(foot);

    const menu = $("#userMenu"), btn = $("#userMenuBtn");
    const toggle = open => { menu.hidden = !open; btn.setAttribute("aria-expanded", String(open)); };
    btn.addEventListener("click", e => { e.stopPropagation(); toggle(menu.hidden); });
    document.addEventListener("click", e => { if (!menu.hidden && !menu.contains(e.target)) toggle(false); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") toggle(false); });
    $("#regionSel").addEventListener("change", e => { setRegion(e.target.value); document.dispatchEvent(new CustomEvent("cs:region")); toast(`Where to watch: ${regionName(e.target.value)}`); });
    document.addEventListener("click", async e => {
    const add = e.target.closest("[data-add-show]");
    if (e.target.closest("[data-logout]")) logout();
    else if (e.target.closest("[data-random]")) openRandomizer();
    else if (e.target.closest("[data-activity]")) { toggle(false); showActivity(); }
    else if (e.target.closest("[data-sync]")) { toggle(false); await syncCatalog(); }
    else if (add) openShowForm({ title: add.dataset.title || "", type: add.dataset.type || "" });
    });

    const form = $("#globalSearchForm");
    if (form) {
    const input = $("#globalSearch");
    const go = () => {
        const q = input.value.trim();
        const ev = new CustomEvent("cs:search", { detail: q, cancelable: true });
        if (document.dispatchEvent(ev) && q.length >= 2) location.href = `index.html?q=${encodeURIComponent(q)}`;
    };
    form.addEventListener("submit", e => { e.preventDefault(); go(); });
    input.addEventListener("input", debounce(() => document.dispatchEvent(new CustomEvent("cs:search", { detail: input.value.trim(), cancelable: true })), 450));
    const q = new URLSearchParams(location.search).get("q");
    if (q) input.value = q;
    }
}

export async function syncCatalog() {
    toast("Syncing the catalog from TMDB, TVmaze and AniList. This can take a few seconds.");
    try {
    const r = await api("/api/catalog/sync", { method: "POST" });
    toast(`Catalog synced: ${r.count} titles (${r.added} new)`, r.warnings.length ? "" : "success", r.warnings.join(" | "));
    document.dispatchEvent(new CustomEvent("cs:synced"));
    } catch (e) { toastError(e); }
}

async function showActivity() {
    const m = openModal({ title: "Recent activity", wide: true, html: `<p class="hint" style="margin-bottom:12px">Every request has a reference you can quote when something goes wrong. Calls to outside services are listed under the request that caused them.</p><div class="activity"><div class="loading"><div class="spinner"></div></div></div>` });
    try {
    const r = await api("/api/account/activity");
    $(".activity", m.el).innerHTML = r.data.map(a => `<div class="act"><div class="top"><span>${esc(a.method)} ${esc(a.path)}</span><span class="${a.status < 400 ? "ok" : "bad"}">${a.status}</span></div>
        <code>${esc(a.requestId)} &middot; ${a.ms} ms &middot; ${esc(new Date(a.at).toLocaleTimeString())}</code>
        ${a.upstream.length ? `<div class="up">${a.upstream.map(u => `${esc(u.service)}: ${esc(u.outcome)} (${u.ms} ms)`).join("<br>")}</div>` : ""}</div>`).join("") || '<p class="hint">Nothing yet.</p>';
    } catch (e) { $(".activity", m.el).innerHTML = `<div class="alert alert-error">${esc(e.message)}</div>`; }
}

// ---------- randomizer ----------
// opts.defaults: { scope, type, mood, genre, franchise, tag } pre-filled from the current page's filters
export function openRandomizer(opts = {}) {
    const d = { scope: "any", type: "", mood: "", genre: "", ...opts.defaults };
    const m = openModal({
    title: "What should I watch?", wide: true,
    html: `<div class="rnd-opts">
        <div class="field"><label for="rScope">Pick from</label><select class="select" id="rScope">
        <option value="any">My library</option><option value="catalog">Discover: titles I haven't saved</option></select></div>
        <div class="field"><label for="rType">Type</label><select class="select" id="rType"><option value="">Any type</option><option value="movie">Movies</option><option value="series">TV shows</option><option value="anime">Anime</option></select></div>
        <div class="field"><label for="rMood">Mood</label><select class="select" id="rMood"><option value="">Any mood</option>${MOODS.map(x => `<option>${x}</option>`).join("")}</select></div>
    </div>
    <div class="dice-stage" id="rStage" aria-live="polite"><button class="btn btn-primary" type="button" id="rRoll" autofocus>${icon("dice")}Pick something for me</button></div>`
    });
    const $s = id => $(id, m.el);
    $s("#rScope").value = d.scope; $s("#rType").value = d.type; $s("#rMood").value = d.mood;
    let last = "";
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    async function roll() {
    const stage = $s("#rStage");
    stage.innerHTML = `<div class="rolling">${icon("dice")}</div>`;
    const scope = $s("#rScope").value;
    const p = new URLSearchParams({ scope: scope === "catalog" ? "catalog" : "library", status: "any" });
    if (scope === "catalog") p.delete("status");
    for (const [k, id] of [["type", "#rType"], ["mood", "#rMood"]]) if ($s(id).value) p.set(k, $s(id).value);
    for (const k of ["genre", "franchise", "tag"]) if (opts.defaults?.[k]) p.set(k, opts.defaults[k]);
    if (last) p.set("exclude", last);
    try {
        const [r] = await Promise.all([api(`/api/random?${p}`), new Promise(res => setTimeout(res, reduce ? 0 : 800))]);
        if (!r.data) { stage.innerHTML = `<div class="empty"><h3>Nothing to pick</h3><p>${esc(r.message || "No matches.")}</p></div>`; return; }
        const t = r.data.media || r.data, id = r.data.media ? r.data.id : t.key;
        last = id;
        const href = r.data.media ? entryUrl(r.data) : titleUrl(t.source, t.id);
        stage.innerHTML = `<div class="pick"><div>${posterImg(t.posterUrl, t.title)}</div>
        <div><h3>${esc(t.title)}</h3><div class="chips"><span class="chip chip-accent">${TYPE_LABEL[t.type]}</span>${t.year ? `<span class="chip">${t.year}</span>` : ""}${t.publicRating ? `<span class="chip">${icon("star", "fill")}${t.publicRating.value.toFixed(1)}</span>` : ""}${t.moods.slice(0, 2).map(x => `<span class="chip">${esc(x)}</span>`).join("")}</div>
        <p>${esc(t.synopsis || "No synopsis available.")}</p>
        <div class="row-actions"><a class="btn btn-primary" href="${href}">View details</a>${!r.data.media ? `<button class="btn" type="button" id="rAdd">${icon("plus")}Add to library</button>` : ""}<button class="btn btn-ghost" type="button" id="rAgain">${icon("dice")}Pick again</button></div>
        <p class="hint">${r.poolSize} ${r.poolSize === 1 ? "title matches" : "titles match"} your choices.</p></div></div>`;
        $s("#rAgain").addEventListener("click", roll);
        const add = $s("#rAdd");
        if (add) add.addEventListener("click", async () => { const e = await addToLibrary(t.source, t.id); if (e) { add.outerHTML = `<a class="btn" href="${entryUrl(e)}">${icon("check")}In your library</a>`; document.dispatchEvent(new CustomEvent("cs:library-changed")); } });
    } catch (e) { stage.innerHTML = `<div class="alert alert-error">${esc(e.message)}</div>`; }
    }
    $s("#rRoll").addEventListener("click", roll);
}

// ---------- alerts ----------
export function alertHtml(kind, messages, dismissible = true) {
    const list = [].concat(messages).filter(Boolean);
    if (!list.length) return "";
    return `<div class="alert alert-${kind}" role="${kind === "error" ? "alert" : "status"}">${icon(kind === "info" ? "info" : "alert")}<div>${list.length > 1 ? `<ul>${list.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : esc(list[0])}</div>${dismissible ? `<button class="close" type="button" data-dismiss aria-label="Dismiss">${icon("x")}</button>` : ""}</div>`;
}
document.addEventListener("click", e => { const b = e.target.closest("[data-dismiss]"); if (b) b.closest(".alert").remove(); });

// delegated data-action handlers: pages register what they handle
const handlers = {};
export const onAction = (name, fn) => { handlers[name] = fn; };
document.addEventListener("click", e => { const el = e.target.closest("[data-action]"); const h = el && handlers[el.dataset.action]; if (h && el.tagName !== "SELECT") { e.preventDefault(); h(el, e); } });
document.addEventListener("change", e => { const el = e.target.closest("select[data-action]"); const h = el && handlers[el.dataset.action]; if (h) h(el, e); });