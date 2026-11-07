// Discover: today's pick, what you're watching, popular rows, franchises; online search; catalog browse.
import { api, mountShell, requireLogin, esc, $, $$, icon, browseCard, posterImg, TYPE_LABEL, onAction, toastError, addToLibrary, openRandomizer, alertHtml, entryUrl, titleUrl, syncCatalog, safeUrl, posterSrc } from "../app.js";
import { readState, toQuery, writeUrl, filterBarHtml, syncFilterBar, bindFilters, pagerHtml } from "../filters.js";

if (requireLogin()) {
  mountShell({ active: "home" });
  const view = $("#view");
  const params = new URLSearchParams(location.search);
  let mode = params.get("q") ? "search" : params.get("browse") ? "browse" : "home";
  const items = new Map();       // key -> title on screen (so a card can be redrawn after "Add")

  const remember = list => list.forEach(t => items.set(t.key, t));
  function redraw(key) {
    const t = items.get(key); if (!t) return;
    $$(`.card[data-key="${CSS.escape(key)}"]`).forEach(c => { c.outerHTML = browseCard(t); });
  }

  onAction("add", async el => {
    el.disabled = true;
    const key = `${el.dataset.source}:${el.dataset.id}`;
    const entry = await addToLibrary(el.dataset.source, el.dataset.id);
    if (entry) { const t = items.get(key); if (t) { t.library = { id: entry.id, status: entry.status }; redraw(key); } loadWatching(); }
    else el.disabled = false;
  });

  // =============== HOME ===============
  const row = (title, list, href) => list.length ? `<section class="section"><div class="section-head"><h2>${title}</h2><a class="link-btn" href="${href}">See all</a></div><div class="row-grid">${list.map(browseCard).join("")}</div></section>` : "";

  function feature(t) {
    return `<section class="section"><div class="section-head"><h2>Today’s pick</h2></div><div class="feature">
      <a href="${titleUrl(t.source, t.id)}" tabindex="-1" aria-hidden="true">${posterImg(t.posterUrl, t.title, "large")}</a>
      <div><h3><a href="${titleUrl(t.source, t.id)}">${esc(t.title)}</a></h3>
        <div class="meta"><span>${TYPE_LABEL[t.type]}</span>${t.year ? `<span>${t.year}</span>` : ""}${t.genres.slice(0, 3).map(g => `<span>${esc(g)}</span>`).join("")}${t.publicRating ? `<span class="rate">${icon("star", "fill")}${t.publicRating.value.toFixed(1)}</span>` : ""}</div>
        <p class="syn">${esc(t.synopsis)}</p>
        <div class="row-actions"><a class="btn btn-primary" href="${titleUrl(t.source, t.id)}">View details</a>${t.library ? `<a class="btn" href="${entryUrl(t.library)}">${icon("check")}In your library</a>` : `<button class="btn" type="button" data-action="add" data-source="${esc(t.source)}" data-id="${esc(t.id)}">${icon("plus")}Add to library</button>`}</div></div></div></section>`;
  }

  async function showHome() {
    document.title = "Cine Space";
    view.onclick = null;
    view.innerHTML = `<div class="loading"><div class="spinner" role="status" aria-label="Loading"></div></div>`;
    try {
      const h = await api("/api/catalog/home");
      [...h.featured, ...h.added, ...h.movies, ...h.series, ...h.anime].forEach(t => items.set(t.key, t));
      view.innerHTML = `<div class="page-head"><div><h1 class="page-title">Discover</h1><p class="page-sub">${h.total} titles in the catalog${h.lastSyncedAt ? `, last synced ${esc(new Date(h.lastSyncedAt).toLocaleDateString())}` : ""}.</p></div>
          <button class="btn" type="button" data-open-random>${icon("dice")}Surprise me</button></div>
        ${h.empty ? `<div class="empty">${icon("film")}<h3>Your catalog is empty</h3><p>Sync once to load popular movies, TV shows and anime. You can still search every title online, or add a TV show yourself.</p><button class="btn btn-primary" type="button" data-sync-now>${icon("refresh")}Sync catalog</button></div>` : feature(h.featured[0])}
        <div id="watching"></div>
        ${row("Added by you", h.added, "index.html?browse=1&mine=1")}
        ${row("Popular TV shows", h.series, "index.html?browse=1&type=series&sort=rating")}
        ${row("Popular movies", h.movies, "index.html?browse=1&type=movie&sort=rating")}
        ${row("Popular anime", h.anime, "index.html?browse=1&type=anime&sort=rating")}
        ${h.franchises.length ? `<section class="section"><div class="section-head"><h2>Franchises</h2></div><div class="chips">${h.franchises.map(f => `<a class="chip" href="index.html?browse=1&franchise=${encodeURIComponent(f.name)}">${esc(f.name)} <small>${f.count}</small></a>`).join("")}</div></section>` : ""}`;
      loadWatching();
    } catch (e) { view.innerHTML = alertHtml("error", e.message, false); }
  }

  async function loadWatching() {
    const box = $("#watching"); if (!box) return;
    try {
      const w = await api("/api/watchlist?status=watching&sort=updated&limit=6");
      box.innerHTML = w.data.length ? `<section class="section"><div class="section-head"><h2>Continue watching</h2><a class="link-btn" href="account.html?status=watching">See all</a></div><div class="watch-list">${w.data.map(e => { const p = e.progress, m = e.media, src = posterSrc(m.posterUrl);
        return `<div class="watch-item"><a class="thumb" href="${entryUrl(e)}" tabindex="-1" aria-hidden="true">${src ? `<img src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}</a>
          <div style="min-width:0"><a href="${entryUrl(e)}"><b>${esc(m.title)}</b></a><small>${p ? `S${p.season} E${p.episode}${p.total ? ` of ${p.total}` : ""}` : "Movie"}</small>${p ? `<div class="bar"><i style="--p:${p.percent ?? 0}%"></i></div>` : ""}</div>
          ${p && p.next ? `<button class="btn btn-sm" type="button" data-action="next" data-id="${esc(e.id)}" aria-label="Mark next episode of ${esc(m.title)} watched">+1 ep</button>` : ""}</div>`; }).join("")}</div></section>` : "";
    } catch (e) { box.innerHTML = ""; }
  }
  onAction("next", async el => { try { await api(`/api/watchlist/${el.dataset.id}/progress/next`, { method: "POST" }); loadWatching(); } catch (e) { toastError(e); } });

  document.addEventListener("click", async e => {
    if (e.target.closest("[data-open-random]")) openRandomizer();
    if (e.target.closest("[data-sync-now]")) await syncCatalog();
  });
  document.addEventListener("cs:synced", () => { if (mode === "home") showHome(); else if (mode === "browse") loadBrowse(); });
  document.addEventListener("cs:library-changed", () => { if (mode === "home") loadWatching(); });

  // =============== SEARCH (online) ===============
  let searchSeq = 0, results = [], typeFilter = "";
  async function runSearch(q) {
    mode = "search";
    history.replaceState(null, "", `index.html?q=${encodeURIComponent(q)}`);
    document.title = `Cine Space | ${q}`;
    const seq = ++searchSeq;
    view.innerHTML = `<div class="page-head"><div><h1 class="page-title">Results for “${esc(q)}”</h1><p class="page-sub">Searching…</p></div></div>
      <div class="grid">${Array.from({ length: 10 }, () => `<div class="skeleton" style="aspect-ratio:2/3"></div>`).join("")}</div>`;
    try {
      const r = await api(`/api/search?q=${encodeURIComponent(q)}`);
      if (seq !== searchSeq) return;
      results = r.data; remember(results);
      drawSearch(q, r);
    } catch (e) { if (seq === searchSeq) view.innerHTML = `<div class="page-head"><h1 class="page-title">Results for “${esc(q)}”</h1></div>${alertHtml("error", e.errors || e.message, false)}`; }
  }
  function drawSearch(q, r) {
    const shown = results.filter(t => !typeFilter || t.type === typeFilter);
    const count = type => results.filter(t => t.type === type).length;
    view.innerHTML = `<div class="page-head"><div><h1 class="page-title">Results for “${esc(q)}”</h1><p class="page-sub">${results.length} ${results.length === 1 ? "title" : "titles"} found</p></div>
      <div class="seg" role="group" aria-label="Type">${[["", `All (${results.length})`], ["movie", `Movies (${count("movie")})`], ["series", `TV (${count("series")})`], ["anime", `Anime (${count("anime")})`]].map(([v, l]) => `<button class="seg-btn" type="button" data-result-type="${v}" aria-pressed="${typeFilter === v}">${l}</button>`).join("")}</div></div>
      ${alertHtml(r.degraded ? "warn" : "info", r.warnings)}
      ${shown.length ? `<div class="grid">${shown.map(browseCard).join("")}</div>` : `<div class="empty">${icon("search")}<h3>No matches</h3><p>Check the spelling or try fewer words.</p></div>`}
      <div class="empty" style="margin-top:32px">${icon("tv")}<h3>Can’t find the TV show?</h3><p>Add it yourself, with its poster and episodes, and track it like any other show.</p><button class="btn" type="button" data-add-show data-title="${esc(q)}">${icon("plus")}Add “${esc(q.length > 30 ? q.slice(0, 30) + "…" : q)}” as a TV show</button></div>`;
    view.onclick = e => { const b = e.target.closest("[data-result-type]"); if (b) { typeFilter = b.dataset.resultType; drawSearch(q, r); } };
  }

  // =============== BROWSE (saved catalog + your own shows) ===============
  const bstate = readState({ sort: "rating" });
  let browseSeq = 0, browseReady = false;
  function showBrowse() {
    mode = "browse";
    document.title = "Cine Space | Browse";
    view.onclick = null;
    view.innerHTML = `<a class="back" href="index.html">${icon("chevL")}Discover</a>
      <div class="page-head"><div><h1 class="page-title">Browse the catalog</h1><p class="page-sub" id="bSub"></p></div></div>
      <div id="bFilters">${filterBarHtml(bstate, { mine: true, sorts: [["rating", "Public rating"], ["title", "Title"], ["year", "Year"]] })}</div><div id="bMsg"></div><div id="bGrid"></div><div class="pager" id="bPager"></div>`;
    bindFilters($("#bFilters"), bstate, loadBrowse);
    $("#bPager").addEventListener("click", e => { const b = e.target.closest("[data-page]"); if (b && !b.disabled) { bstate.page = Number(b.dataset.page); loadBrowse(); window.scrollTo({ top: 0, behavior: "smooth" }); } });
    browseReady = true;
    loadBrowse();
  }
  async function loadBrowse() {
    if (!browseReady) return;
    const seq = ++browseSeq;
    writeUrl(bstate, { browse: 1 });
    try {
      const r = await api(`/api/catalog/browse?${toQuery(bstate, { limit: 24 })}`);
      if (seq !== browseSeq) return;
      remember(r.data);
      syncFilterBar($("#bFilters"), bstate, r.facets);
      $("#bMsg").innerHTML = "";
      $("#bSub").textContent = `${r.count} ${r.count === 1 ? "title" : "titles"}${bstate.franchise ? ` in ${bstate.franchise}` : ""}`;
      $("#bGrid").innerHTML = r.data.length ? `<div class="grid">${r.data.map(browseCard).join("")}</div>`
        : `<div class="empty">${icon("film")}<h3>Nothing here yet</h3><p>No titles match. Clear a filter, sync the catalog from the account menu, or add a TV show yourself.</p></div>`;
      $("#bPager").innerHTML = pagerHtml(r.page, r.pages);
    } catch (e) { $("#bMsg").innerHTML = alertHtml("error", e.message, false); }
  }

  // =============== search box wiring ===============
  document.addEventListener("cs:search", e => {
    const q = e.detail;
    e.preventDefault();
    if (q.length >= 2) runSearch(q);
    else if (!q && mode === "search") { mode = "home"; history.replaceState(null, "", "index.html"); showHome(); }
  });

  if (mode === "search") runSearch(params.get("q"));
  else if (mode === "browse") showBrowse();
  else showHome();
}
