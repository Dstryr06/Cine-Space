// One title: details, public rating, where to watch, and everything you track about it
// (status, season/episode progress, tags, personal review). Opens from the catalog/search (?source=&id=) or the library (?entry=).
import { api, ApiError, mountShell, requireLogin, esc, $, $$, icon, stars, STATUS, STATUS_KEYS, TYPE_LABEL, onAction, toast, toastError, confirmDialog, alertHtml, browseCard, posterImg, getRegion, setRegion, regionName, REGIONS, safeUrl, addToLibrary, openShowForm } from "../app.js";

if (requireLogin()) {
  mountShell({ active: "library" });
  const view = $("#view"), q = new URLSearchParams(location.search);
  const S = { media: null, entry: null, warnings: [], stale: false, editing: false, draft: { rating: 0, text: "" }, errors: [], similar: [] };
  const KIND_LABEL = { stream: "Stream", free: "Watch free", rent: "Rent", buy: "Buy", network: "Original network", official: "Official site", link: "Links" };

  const apiEntry = (path, opts) => api(`/api/watchlist/${S.entry.id}${path}`, opts);

  async function init() {
    view.innerHTML = `<div class="loading"><div class="spinner" role="status" aria-label="Loading"></div></div>`;
    try {
      if (q.get("entry")) {                       // from the library: show the saved copy right away, then refresh it from the online database
        S.entry = (await api(`/api/watchlist/${encodeURIComponent(q.get("entry"))}`)).data;
        S.media = S.entry.media; render();
        await loadLive();
      } else if (q.get("source") && q.get("id")) await loadLive();
      else throw new ApiError("No title selected.");
    } catch (e) { view.innerHTML = alertHtml("error", e.errors || e.message, false) + `<p><a class="btn" href="index.html">Back to Discover</a></p>`; return; }
    loadSimilar();
  }

  async function loadLive() {
    const src = S.entry ? S.entry.source : q.get("source"), id = S.entry ? S.entry.mediaId : q.get("id");
    const r = await api(`/api/catalog/${encodeURIComponent(src)}/${encodeURIComponent(id)}?region=${getRegion()}`);
    S.media = r.data; S.stale = r.stale; S.warnings = r.warnings;
    if (r.libraryEntry) S.entry = r.libraryEntry; else if (!S.entry) S.entry = null;
    document.title = `Cine Space | ${S.media.title}`;
    render();
  }

  async function loadSimilar() {
    try { const m = S.media; S.similar = (await api(`/api/catalog/${encodeURIComponent(m.source)}/${encodeURIComponent(m.id)}/similar`)).data; renderSimilar(); } catch (e) { /* optional */ }
  }

  // ---------------- render ----------------
  const isCustom = () => S.media.source === "custom";

  function render() {
    const m = S.media, e = S.entry, custom = isCustom();
    const keep = $("#reviewText") ? $("#reviewText").value : null; if (keep !== null) S.draft.text = keep;
    const facts = [m.ageRating, m.lengthMinutes ? `${m.lengthMinutes} min` : "", m.seasons.length ? `${m.seasons.length} ${m.seasons.length === 1 ? "season" : "seasons"}` : "", m.episodes ? `${m.episodes} episodes` : "", m.showStatus].filter(Boolean);
    view.innerHTML = `
      <a class="back" href="${custom ? "index.html?browse=1&mine=1" : "index.html"}">${icon("chevL")}Back</a>
      ${alertHtml("warn", S.warnings)}
      <section class="t-head">${posterImg(m.posterUrl, m.title, "large")}
        <div class="t-info">
          <div class="t-meta"><span>${TYPE_LABEL[m.type]}</span>${m.year ? `<span>${m.year}</span>` : ""}${facts.map(f => `<span>${esc(f)}</span>`).join("")}${custom ? '<span class="chip chip-accent">Added by you</span>' : ""}</div>
          <h1>${esc(m.title)}</h1>${m.originalTitle ? `<div class="orig">${esc(m.originalTitle)}</div>` : ""}${m.tagline ? `<div class="tagline">${esc(m.tagline)}</div>` : ""}
          ${m.genres.length || m.franchise ? `<div class="chips">${m.genres.map(g => `<span class="chip">${esc(g)}</span>`).join("")}${m.franchise ? `<a class="chip chip-accent" href="index.html?browse=1&franchise=${encodeURIComponent(m.franchise)}" title="Browse this franchise">${icon("film")}${esc(m.franchise)}</a>` : ""}</div>` : ""}
          <p class="t-syn">${esc(m.synopsis || "No synopsis yet.")}</p>
          ${m.publicRating ? `<div class="public-rating"><div class="num" aria-hidden="true">${m.publicRating.value.toFixed(1)}</div><div><b>${m.publicRating.value.toFixed(1)} out of 10</b><small>${esc(m.publicRating.source)}${m.publicRating.votes ? `, ${m.publicRating.votes.toLocaleString()} votes` : ""}</small></div></div>` : ""}
          <div class="facts">${m.creators.length ? `<span><b>${m.type === "movie" ? "Director" : "By"}</b> ${esc(m.creators.join(", "))}</span>` : ""}${m.studios.length ? `<span><b>Studio</b> ${esc(m.studios.slice(0, 3).join(", "))}</span>` : ""}${m.collection ? `<span><b>Collection</b> ${esc(m.collection)}</span>` : ""}</div>
          ${custom ? `<div class="row-actions owner-actions"><button class="btn" type="button" data-action="editShow">${icon("edit")}Edit show</button><button class="btn btn-danger" type="button" data-action="deleteShow">${icon("trash")}Delete show</button></div>` : ""}
        </div></section>
      <div class="title-layout"><div class="title-main">
          ${custom ? "" : `<section class="panel" id="watchPanel"><h2>Where to watch</h2>${platformsHtml(m)}</section>`}
          <section class="panel" id="similarPanel" hidden><h2>Similar titles</h2><div class="row-grid" id="similarRow"></div></section>
        </div><aside class="title-aside" aria-label="Your tracking">${e ? trackingHtml(e) : addPanelHtml()}</aside></div>`;
    renderSimilar();
  }

  function platformsHtml(m) {
    const region = getRegion();
    const groups = ["stream", "free", "rent", "buy", "network", "official", "link"].map(k => [k, m.platforms.filter(p => p.kind === k)]).filter(([, l]) => l.length);
    const note = m.platformRegion && m.platformRegion !== region ? `<p class="hint">This saved copy has data for ${esc(regionName(m.platformRegion))}. Refresh to update for ${esc(regionName(region))}.</p>` : "";
    const elsewhere = !groups.some(([k]) => ["stream", "free", "rent", "buy"].includes(k)) && m.watchRegions.length
      ? `<p class="hint">No streaming, rental or purchase options listed for ${esc(regionName(region))}. Available in:</p><div class="chips" style="margin-top:8px">${m.watchRegions.slice(0, 14).map(r => `<button class="chip" type="button" data-action="region" data-region="${r}">${esc(regionName(r))}</button>`).join("")}</div>` : "";
    return `<div class="region-row"><label class="label" for="titleRegion">Region</label><select class="select" id="titleRegion">${(REGIONS.includes(region) ? REGIONS : [region, ...REGIONS]).map(r => `<option value="${r}" ${r === region ? "selected" : ""}>${esc(regionName(r))} (${r})</option>`).join("")}</select></div>
      ${groups.map(([k, list]) => `<div class="platform-group"><h3>${KIND_LABEL[k]}</h3><div class="chips">${list.map(p => { const logo = p.logoUrl ? `<img src="${esc(safeUrl(p.logoUrl))}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="logo-fb">${esc(p.name[0])}</span>`; const url = safeUrl(p.url);
        return url ? `<a class="platform" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${logo}${esc(p.name)}<span class="sr-only"> (opens in a new tab)</span></a>` : `<span class="platform">${logo}${esc(p.name)}</span>`; }).join("")}</div></div>`).join("") || (elsewhere ? "" : `<p class="hint">No viewing options are listed for ${esc(regionName(region))} yet.</p>`)}
      ${elsewhere}${note}<p class="hint">Streaming data provided by JustWatch via TMDB where available.</p>`;
  }

  function addPanelHtml() {
    return `<section class="panel"><h2>Add to your library</h2><p class="hint" style="margin-bottom:14px">Track your status${S.media.type === "movie" ? "" : ", season and episode progress"}, tags and a personal review.</p>
      <div class="field"><label for="addStatus">Start as</label><select class="select" id="addStatus">${STATUS_KEYS.map(k => `<option value="${k}">${STATUS[k].label}</option>`).join("")}</select></div>
      <div class="row-actions"><button class="btn btn-primary" type="button" data-action="addLib">${icon("plus")}Add to library</button></div></section>`;
  }

  function trackingHtml(e) {
    return `<section class="panel"><h2>Your status<span class="status-pill s-${e.status}">${STATUS[e.status].label}</span></h2>
        <div class="status-seg" role="group" aria-label="Watch status">${STATUS_KEYS.map(k => `<button type="button" class="s-${k}" style="--c:var(--st-${k})" data-action="setStatus" data-status="${k}" aria-pressed="${e.status === k}">${STATUS[k].label}</button>`).join("")}</div>
        ${e.progress ? `<hr class="divider">${progressHtml(e)}` : ""}
        <hr class="divider">
        <div class="row-actions" style="margin-top:0"><button class="btn btn-sm" type="button" data-action="fav" aria-pressed="${e.favorite}">${icon("heart", e.favorite ? "fill" : "")}${e.favorite ? "Favorite" : "Add to favorites"}</button>
          ${isCustom() ? "" : `<button class="btn btn-sm btn-ghost" type="button" data-action="refresh">${icon("refresh")}Refresh details</button>`}
          <button class="btn btn-sm btn-ghost btn-danger" type="button" data-action="remove">${icon("trash")}Remove from library</button></div></section>
      <section class="panel" id="reviewPanel"><h2>Your review</h2>${reviewHtml(e)}</section>
      <section class="panel"><h2>Tags</h2>${tagsHtml(e)}</section>`;
  }

  function progressHtml(e) {
    const p = e.progress, m = S.media, seasons = m.seasons, cur = seasons.find(s => s.number === p.season);
    const max = cur ? cur.episodes : "";
    return `<div class="prog-head"><b>S${p.season} E${p.episode}</b><span>${p.total ? `${p.watched} of ${p.total} episodes · ${p.percent}%` : `${p.watched} episodes watched`}</span></div>
      <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p.percent ?? 0}"><i style="--p:${p.percent ?? 0}%"></i></div>
      <div class="prog-grid"><div class="field"><label for="seasonSel">Season</label>${seasons.length
          ? `<select class="select" id="seasonSel">${seasons.map(s => `<option value="${s.number}" ${s.number === p.season ? "selected" : ""}>Season ${s.number} (${s.episodes} eps)</option>`).join("")}</select>`
          : `<input class="input" id="seasonSel" type="number" min="1" value="${p.season}">`}</div>
        <div class="field"><label for="epInput">Episodes watched${max ? ` (of ${max})` : ""}</label><div class="stepper"><button class="btn" type="button" data-action="prevEp" aria-label="Back one episode">−</button><input class="input" id="epInput" type="number" min="0" ${max ? `max="${max}"` : ""} value="${p.episode}"><button class="btn" type="button" data-action="nextEp" aria-label="Forward one episode">+</button></div></div></div>
      <div class="row-actions">${p.next ? `<button class="btn btn-primary" type="button" data-action="nextEp">${icon("check")}Watched S${p.next.season} E${p.next.episode}</button>` : `<span class="chip chip-accent">${icon("check")}You've seen every episode</span>`}
        ${cur && p.episode < cur.episodes ? `<button class="btn btn-sm" type="button" data-action="finishSeason">Finish season ${cur.number}</button>` : ""}</div>`;
  }

  const tagsHtml = e => `<div class="tag-list" aria-live="polite">${e.tags.map(t => `<span class="tag">#${esc(t)}<button type="button" data-action="tagRemove" data-tag="${esc(t)}" aria-label="Remove tag ${esc(t)}">${icon("x")}</button></span>`).join("") || '<span class="hint">No tags yet. Tags help you group titles your own way.</span>'}</div>
    <div class="tag-add"><input class="input" id="tagInput" maxlength="24" placeholder="Add a tag, e.g. rewatch" aria-label="New tag"><button class="btn" type="button" data-action="tagAdd">Add</button></div>`;

  function reviewHtml(e) {
    const r = e.review;
    if (S.editing) {
      const n = S.draft.rating;
      return `${S.errors.length ? `<ul class="form-errors" role="alert">${S.errors.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
        <div class="field"><span class="label" id="starLabel">Your rating</span><div class="stars-input" role="radiogroup" aria-labelledby="starLabel">${[1, 2, 3, 4, 5].map(i => `<button type="button" class="${i <= n ? "on" : ""}" role="radio" aria-checked="${i === n}" data-action="star" data-n="${i}" aria-label="${i} ${i === 1 ? "star" : "stars"}">${icon("star", "fill")}</button>`).join("")}</div></div>
        <div class="field" style="margin-top:14px"><label for="reviewText">Review</label><textarea class="textarea" id="reviewText" maxlength="2000" placeholder="What did you think?" ${S.errors.length ? 'aria-invalid="true"' : ""}>${esc(S.draft.text)}</textarea><div class="counter"><span id="rCount">${S.draft.text.length}</span>/2000</div></div>
        <div class="row-actions"><button class="btn btn-primary" type="button" data-action="reviewSave">${r ? "Save changes" : "Save review"}</button><button class="btn" type="button" data-action="reviewCancel">Cancel</button></div>`;
    }
    if (!r) return `<p class="hint" style="margin-bottom:12px">Give it a star rating and write down what you thought.</p><button class="btn btn-primary" type="button" data-action="reviewEdit">${icon("edit")}Write a review</button>`;
    return `<div class="review-view"><div class="stars" role="img" aria-label="Your rating ${r.rating} of 5">${stars(r.rating)}</div><blockquote>${esc(r.text)}</blockquote>
      <small>${r.updatedAt !== r.createdAt ? "Edited" : "Written"} ${esc(new Date(r.updatedAt).toLocaleDateString(undefined, { dateStyle: "medium" }))}</small>
      <div class="row-actions"><button class="btn btn-sm" type="button" data-action="reviewEdit">${icon("edit")}Edit</button><button class="btn btn-sm btn-danger" type="button" data-action="reviewDelete">${icon("trash")}Delete</button></div></div>`;
  }

  function renderSimilar() {
    const panel = $("#similarPanel"); if (!panel) return;
    panel.hidden = !S.similar.length;
    $("#similarRow").innerHTML = S.similar.slice(0, 6).map(browseCard).join("");
  }

  // ---------------- actions ----------------
  async function run(fn, message) {
    try { const r = await fn(); if (r && r.data !== undefined && r.data && r.data.media) { S.entry = r.data; S.media = r.data.media; } if (message) toast(message); render(); }
    catch (e) { toastError(e); }
  }
  const patch = (body, message) => run(() => apiEntry("", { method: "PATCH", body }), message);

  onAction("addLib", async () => {
    const entry = await addToLibrary(S.media.source, S.media.id, $("#addStatus").value);
    if (entry) { S.entry = entry; S.media = entry.media; render(); }
  });
  // shows the user added by hand: edit (form handles the poster too) and delete (library entry goes with it)
  onAction("editShow", () => openShowForm({ show: S.media }));
  document.addEventListener("cs:show-changed", async () => { try { await loadLive(); } catch (e) { toastError(e); } });
  onAction("deleteShow", async () => {
    if (!await confirmDialog({ title: "Delete this show?", message: `“${S.media.title}”, its poster, and your progress, tags and review for it will be deleted. This can’t be undone.`, confirmLabel: "Delete show", danger: true })) return;
    try { await api(`/api/shows/${encodeURIComponent(S.media.id)}`, { method: "DELETE" }); toast("Show deleted"); setTimeout(() => { location.href = "index.html"; }, 600); } catch (err) { toastError(err); }
  });
  onAction("setStatus", el => patch({ status: el.dataset.status }, `Marked as ${STATUS[el.dataset.status].label}`));
  onAction("fav", () => patch({ favorite: !S.entry.favorite }));
  onAction("nextEp", () => run(() => apiEntry("/progress/next", { method: "POST" })));
  onAction("prevEp", () => run(() => apiEntry("/progress/prev", { method: "POST" })));
  onAction("finishSeason", () => { const p = S.entry.progress, s = S.media.seasons.find(x => x.number === p.season); patch({ progress: { season: p.season, episode: s.episodes } }); });
  onAction("refresh", () => run(() => apiEntry(`/refresh?region=${getRegion()}`, { method: "POST" }), "Details refreshed"));
  onAction("region", el => { setRegion(el.dataset.region); changeRegion(); });
  onAction("remove", async () => {
    if (!await confirmDialog({ title: "Remove from library?", message: `“${S.media.title}” will be removed from your library, along with your progress, tags and review.`, confirmLabel: "Remove", danger: true })) return;
    try {
      const e = S.entry; await apiEntry("", { method: "DELETE" });
      S.entry = null; S.editing = false; S.draft = { rating: 0, text: "" };
      history.replaceState(null, "", `title.html?source=${encodeURIComponent(e.source)}&id=${encodeURIComponent(e.mediaId)}`);
      toast("Removed from your library"); render();
    } catch (err) { toastError(err); }
  });

  const setTags = (tags, message) => patch({ tags }, message);
  const addTag = raw => { const t = String(raw || "").trim().toLowerCase(); if (t) setTags([...S.entry.tags, t]); };
  onAction("tagAdd", () => addTag($("#tagInput").value));
  onAction("tagRemove", el => setTags(S.entry.tags.filter(t => t !== el.dataset.tag)));

  onAction("reviewEdit", () => { S.editing = true; S.errors = []; S.draft = { rating: S.entry.review?.rating || 0, text: S.entry.review?.text || "" }; render(); $("#reviewText").focus(); });
  onAction("reviewCancel", () => { S.editing = false; S.errors = []; render(); });
  onAction("star", el => { S.draft.text = $("#reviewText").value; S.draft.rating = Number(el.dataset.n); render(); $("#reviewText").focus(); });
  onAction("reviewSave", async () => {
    S.draft.text = $("#reviewText").value;
    S.errors = [];
    if (!(S.draft.rating >= 1 && S.draft.rating <= 5)) S.errors.push("Choose a rating from 1 to 5 stars.");
    if (!S.draft.text.trim()) S.errors.push("Write something about the title: the review can't be empty.");
    if (S.errors.length) { render(); return; }
    try {                                                    // the server validates again and is the final authority
      const method = S.entry.review ? "PUT" : "POST";
      const r = await apiEntry("/review", { method, body: { rating: S.draft.rating, text: S.draft.text } });
      S.entry.review = r.data; S.editing = false; toast(r.message); render();
    } catch (e) { S.errors = e.errors || [e.message]; render(); }
  });
  onAction("reviewDelete", async () => {
    if (!await confirmDialog({ title: "Delete your review?", message: "Your star rating and written review will be removed.", confirmLabel: "Delete", danger: true })) return;
    try { await apiEntry("/review", { method: "DELETE" }); S.entry.review = null; toast("Review deleted"); render(); } catch (e) { toastError(e); }
  });

  // inputs that aren't buttons
  view.addEventListener("change", e => {
    if (e.target.id === "seasonSel") { const n = Number(e.target.value); if (n >= 1) patch({ progress: { season: n, episode: 0 } }); }
    else if (e.target.id === "epInput") patch({ progress: { season: S.entry.progress.season, episode: Number(e.target.value) } });
    else if (e.target.id === "titleRegion") { setRegion(e.target.value); changeRegion(); }
  });
  view.addEventListener("input", e => { if (e.target.id === "reviewText") { $("#rCount").textContent = e.target.value.length; S.draft.text = e.target.value; } });
  view.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.id === "tagInput") { e.preventDefault(); addTag(e.target.value); } });
  document.addEventListener("cs:region", changeRegion);

  async function changeRegion() {
    try { await loadLive(); } catch (e) { toastError(e); }
  }

  init();
}
