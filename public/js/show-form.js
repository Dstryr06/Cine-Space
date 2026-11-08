// Add or edit a movie, TV show or anime that isn't in the online catalog, including its poster.
//   openShowForm()               add a new show (optional { title, type } pre-fill the name and type, e.g. from a search that found nothing)
//   openShowForm({ show })       edit a show: `show` is the show as the API returned it
// New show -> opens its page. Edited show -> "cs:show-changed" is dispatched so the page behind the form can refresh itself.
import { api, apiUpload, openModal, esc, $, $$, icon, toast, toastError, posterSrc, titleUrl } from "./app.js";

const DEFAULTS = {
    genres: ["Action", "Adventure", "Animation", "Comedy", "Crime", "Drama", "Family", "Fantasy", "History", "Horror", "Kids", "Music", "Mystery", "Reality", "Romance", "Sci-Fi", "Slice of Life", "Sports", "Supernatural", "Thriller"],
    statuses: ["Ongoing", "Ended"], types: ["movie", "series", "anime"], limits: { title: 120, synopsis: 2000, genres: 5, seasons: 40, episodes: 500 },
  poster: { maxBytes: 8 * 1024 * 1024, minWidth: 600, minHeight: 900, minRatio: 0.6, maxRatio: 0.75, recommended: "1000 × 1500 px or larger" }
};
const TYPES = ["image/jpeg", "image/png", "image/webp"];
const mb = n => `${Math.round(n / 1024 / 1024)} MB`;

// reads the picture in the browser first, so a wrong file is explained instantly instead of after an upload
function inspectImage(file, rules) {
    return new Promise(resolve => {
    if (!TYPES.includes(file.type)) return resolve({ error: "Use a JPG, PNG or WebP image." });
    if (file.size > rules.maxBytes) return resolve({ error: `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${mb(rules.maxBytes)}.` });
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
        const w = img.naturalWidth, h = img.naturalHeight, ratio = w / h, problems = [];
        if (ratio < rules.minRatio || ratio > rules.maxRatio) problems.push(`The image is ${w} × ${h} px. Posters are portrait, about 2:3 (for example 1000 × 1500), so nothing gets cropped.`);
        if (w < rules.minWidth || h < rules.minHeight) problems.push(`The image is ${w} × ${h} px. Use at least ${rules.minWidth} × ${rules.minHeight} px so it stays sharp (${rules.recommended} is ideal).`);
        problems.length ? (URL.revokeObjectURL(url), resolve({ error: problems[0] })) : resolve({ url, width: w, height: h });
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve({ error: "That file couldn’t be read as an image. Try another one." }); };
    img.src = url;
    });
}

export async function openShowForm({ show = null, title = "", type = "" } = {}) {
    let rules = DEFAULTS;
  try { rules = { ...DEFAULTS, ...(await api("/api/shows/options")).data }; } catch (e) { /* the built-in rules match the server's; the server checks again anyway */ }
    const editing = !!show;
    const S = {
    id: show ? show.id : null,
    type: show ? show.type : (rules.types.includes(type) ? type : "series"),
    genres: new Set(show ? show.genres : []),
    seasons: show && show.seasons.length ? show.seasons.map(s => s.episodes) : [""],
    file: null, previewUrl: show && show.posterUrl ? posterSrc(show.posterUrl, "large") : "", removePoster: false, posterNote: "", busy: false
    };

    const m = openModal({
    title: editing ? "Edit show" : "Add a show", size: "xl",
    html: `<form class="sf" id="showForm" novalidate>
        <div class="poster-side">
        <span class="label" id="posterLabel">Poster</span>
        <label class="uploader" id="drop"><input type="file" id="posterFile" accept="image/jpeg,image/png,image/webp" aria-labelledby="posterLabel" aria-describedby="posterHelp posterErr"><span id="dropInner"></span></label>
        <div class="row-actions" style="margin-top:0"><button class="btn btn-sm" type="button" id="posterPick">${icon("image")}<span id="posterPickTxt">Choose poster</span></button><button class="btn btn-sm btn-ghost btn-danger" type="button" id="posterRemove" hidden>Remove</button></div>
        <p class="poster-info" id="posterHelp">JPG, PNG or WebP. Portrait 2:3, at least ${rules.poster.minWidth} × ${rules.poster.minHeight} px (${esc(rules.poster.recommended)} is ideal), up to ${mb(rules.poster.maxBytes)}. It is saved exactly as you upload it.</p>
        <p class="field-error" id="posterErr" role="alert"></p>
        </div>
        <div class="sf-fields">
        <div id="formMsg" aria-live="polite"></div>
        <div class="field"><label for="sfType">What are you adding?</label><select class="select" id="sfType">${rules.types.map(t => `<option value="${t}">${{ movie: "Movie", series: "TV show", anime: "Anime" }[t]}</option>`).join("")}</select><span class="field-error" id="err-type"></span></div>
        <div class="field"><label for="sfTitle">Title</label><input class="input" id="sfTitle" maxlength="${rules.limits.title}" autocomplete="off" required value="${esc(show ? show.title : title)}"><span class="field-error" id="err-title"></span></div>
        <div class="sf-row">
            <div class="field"><label for="sfYear" id="sfYearLabel">First aired (year)</label><input class="input" id="sfYear" type="number" inputmode="numeric" min="1870" max="2100" placeholder="Optional" value="${show && show.year ? show.year : ""}"><span class="field-error" id="err-year"></span></div>
            <div class="field"><label for="sfStatus">Status</label><select class="select" id="sfStatus"><option value="">Not sure</option>${rules.statuses.map(x => `<option ${show && show.showStatus === x ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></div>
        </div>
        <div class="field"><span class="label" id="genreLabel">Genres <span class="hint">(up to ${rules.limits.genres})</span></span><div class="genre-pick" role="group" aria-labelledby="genreLabel" id="genres"></div><span class="field-error" id="err-genres"></span></div>
        <div class="field" id="seasonsField"><span class="label">Seasons and episodes <span class="hint">(lets you track progress)</span></span><div class="seasons" id="seasons"></div><div><button class="btn btn-sm" type="button" id="addSeason">${icon("plus")}Add season</button></div><span class="field-error" id="err-seasons"></span></div>
        <div class="field"><label for="sfSyn">Synopsis</label><textarea class="textarea" id="sfSyn" maxlength="${rules.limits.synopsis}" placeholder="Optional">${esc(show ? show.synopsis : "")}</textarea><span class="field-error" id="err-synopsis"></span></div>
        </div>
    </form>
    <div class="modal-actions"><button class="btn" type="button" data-close>Cancel</button><button class="btn btn-primary" type="submit" form="showForm" id="sfSave">${editing ? "Save changes" : "Add show"}</button></div>`
    });
    const root = m.el;
    const q = sel => $(sel, root);

  // ---------- poster ----------
    function drawPoster() {
    const has = !!S.previewUrl;
    q("#drop").classList.toggle("has-image", has);
    q("#dropInner").innerHTML = has ? `<img src="${esc(S.previewUrl)}" alt="Poster preview">` : `<span class="ph">${icon("image")}<b>Drop a poster here</b><span>or choose a file</span></span>`;
    q("#posterPickTxt").textContent = has ? "Replace poster" : "Choose poster";
    q("#posterRemove").hidden = !has;
    const info = q("#posterHelp");
    info.className = `poster-info ${S.posterNote ? "ok" : ""}`;
    if (S.posterNote) info.innerHTML = `${icon("check")} ${esc(S.posterNote)}`;
    }
    const posterError = msg => { q("#posterErr").textContent = msg || ""; q("#posterFile").setAttribute("aria-invalid", msg ? "true" : "false"); };

    async function pickFile(file) {
    if (!file) return;
    posterError("");
    const r = await inspectImage(file, rules.poster);
    if (r.error) { posterError(r.error); return; }
    if (S.file && S.previewUrl.startsWith("blob:")) URL.revokeObjectURL(S.previewUrl);
    S.file = file; S.previewUrl = r.url; S.removePoster = false;
    S.posterNote = `${r.width} × ${r.height} px, ${file.size < 1048576 ? Math.round(file.size / 1024) + " KB" : (file.size / 1024 / 1024).toFixed(1) + " MB"}. Good to use.`;
    drawPoster();
    }
    q("#posterFile").addEventListener("change", e => { pickFile(e.target.files[0]); e.target.value = ""; });
    q("#posterPick").addEventListener("click", () => q("#posterFile").click());
    q("#posterRemove").addEventListener("click", () => {
    if (S.previewUrl.startsWith("blob:")) URL.revokeObjectURL(S.previewUrl);
    S.removePoster = !!(show && show.posterUrl); S.file = null; S.previewUrl = ""; S.posterNote = ""; posterError(""); drawPoster();
    });
    const drop = q("#drop");
    ["dragenter", "dragover"].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add("is-drag"); }));
    ["dragleave", "drop"].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove("is-drag"); }));
    drop.addEventListener("drop", e => pickFile(e.dataTransfer.files[0]));

  // ---------- genres and seasons ----------
    function drawGenres() {
    q("#genres").innerHTML = rules.genres.map(g => `<button type="button" data-genre="${esc(g)}" aria-pressed="${S.genres.has(g)}">${esc(g)}</button>`).join("");
    }
    q("#genres").addEventListener("click", e => {
    const b = e.target.closest("[data-genre]"); if (!b) return;
    const g = b.dataset.genre;
    if (S.genres.has(g)) S.genres.delete(g);
    else if (S.genres.size >= rules.limits.genres) { fieldError("genres", `Choose up to ${rules.limits.genres} genres.`); return; }
    else S.genres.add(g);
    fieldError("genres", ""); drawGenres();
    });

    function drawSeasons() {
    q("#seasons").innerHTML = S.seasons.map((n, i) => `<div class="season-row"><span class="name">Season ${i + 1}</span>
        <input class="input" type="number" inputmode="numeric" min="1" max="${rules.limits.episodes}" data-season="${i}" value="${n}" aria-label="Episodes in season ${i + 1}" placeholder="0"><span class="suffix">episodes</span>
        <button class="icon-btn" type="button" data-drop-season="${i}" aria-label="Remove season ${i + 1}">${icon("x")}</button></div>`).join("");
    q("#addSeason").disabled = S.seasons.length >= rules.limits.seasons;
    }
    q("#seasons").addEventListener("input", e => { const el = e.target.closest("[data-season]"); if (el) S.seasons[Number(el.dataset.season)] = el.value; });
    q("#seasons").addEventListener("click", e => { const b = e.target.closest("[data-drop-season]"); if (b) { S.seasons.splice(Number(b.dataset.dropSeason), 1); drawSeasons(); } });
    q("#addSeason").addEventListener("click", () => { S.seasons.push(""); drawSeasons(); const last = $$("[data-season]", root).pop(); if (last) last.focus(); });

  // ---------- validation and saving ----------
    q("#sfTitle").addEventListener("input", () => fieldError("title", ""));
    q("#sfYear").addEventListener("input", () => fieldError("year", ""));
    function fieldError(name, msg) {
    const el = q(`#err-${name}`); if (el) el.textContent = msg || "";
    const input = { type: "#sfType", title: "#sfTitle", year: "#sfYear", synopsis: "#sfSyn" }[name];
    if (input) q(input).setAttribute("aria-invalid", msg ? "true" : "false");
    }
    const NAMES = ["type", "title", "year", "genres", "seasons", "synopsis"];

    function collect() {
    const type = q("#sfType").value;
    const seasons = type === "movie" ? [] : S.seasons.map(v => String(v).trim()).filter(Boolean).map(Number);      // blank rows are ignored; movies have none
    return {
        type, title: q("#sfTitle").value.replace(/\s+/g, " ").trim(), year: q("#sfYear").value.trim() === "" ? null : Number(q("#sfYear").value),
        showStatus: q("#sfStatus").value, genres: [...S.genres], synopsis: q("#sfSyn").value.trim(), seasons
    };
    }
    function check(v) {
    const e = {};
    if (!v.title) e.title = "Enter the show’s title.";
    if (v.year !== null && (!Number.isInteger(v.year) || v.year < 1870 || v.year > 2100)) e.year = "Year must be between 1870 and 2100.";
    if (v.seasons.some(n => !Number.isInteger(n) || n < 1 || n > rules.limits.episodes)) e.seasons = `Each season needs a whole number of episodes from 1 to ${rules.limits.episodes}.`;
    return e;
    }

    q("#showForm").addEventListener("submit", async ev => {
    ev.preventDefault();
    if (S.busy) return;
    NAMES.forEach(n => fieldError(n, "")); q("#formMsg").innerHTML = "";
    const v = collect(), problems = check(v);
    if (Object.keys(problems).length) {
        Object.entries(problems).forEach(([k, msg]) => fieldError(k, msg));
        const first = NAMES.find(n => problems[n]); const target = { title: "#sfTitle", year: "#sfYear", seasons: "[data-season]" }[first]; if (target) q(target).focus();
        return;
    }
    S.busy = true; const btn = q("#sfSave"); btn.disabled = true; btn.textContent = "Saving…";
    try {
        const r = S.id ? await api(`/api/shows/${S.id}`, { method: "PUT", body: v }) : await api("/api/shows", { method: "POST", body: v });
      S.id = r.data.id; let saved = r.data;                                        // from here on a retry edits this show instead of creating a second one
        if (S.file) saved = (await apiUpload(`/api/shows/${S.id}/poster`, S.file)).data;
        else if (S.removePoster) saved = (await api(`/api/shows/${S. id}/poster`, { method: "DELETE" })).data;
        m.close();
        toast(editing ? `Saved “${saved.title}”` : `Added “${saved.title}”`, "success");
        if (editing) document.dispatchEvent(new CustomEvent("cs:show-changed", { detail: saved }));
        else location.href = titleUrl("custom", saved.id);
    } catch (err) {
        S.busy = false; btn.disabled = false; btn.textContent = S.id ? "Save changes" : "Add show";
        const f = err.fields || {};
        Object.entries(f).forEach(([k, msg]) => k === "poster" ? posterError(msg) : fieldError(k, msg));
        if (S.id && !editing) q("#formMsg").innerHTML = `<div class="alert alert-warn" role="alert">${icon("alert")}<div>The show was saved, but the poster wasn’t. Fix the poster below and save again.</div></div>`;
        else if (!Object.keys(f).length) toastError(err);
        const first = Object.keys(f).find(k => k !== "poster"); if (first) { const t = { title: "#sfTitle", year: "#sfYear", synopsis: "#sfSyn" }[first]; if (t) q(t).focus(); }
    }
    });

    // the Type picker decides what the form asks for: a movie has no seasons, so that block hides and "First aired" becomes "Released"
    function syncType() {
    const t = q("#sfType").value;
    q("#seasonsField").hidden = t === "movie";
    q("#sfYearLabel").textContent = t === "movie" ? "Released (year)" : "First aired (year)";
    q("#sfStatus").closest(".field").hidden = t === "movie";
    if (t === "movie") q("#sfStatus").value = "";
    }
    q("#sfType").value = S.type;
    q("#sfType").addEventListener("change", syncType);
    syncType();

    drawPoster(); drawGenres(); drawSeasons();
    q("#sfTitle").focus();
}