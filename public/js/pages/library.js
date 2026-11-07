// My library: every saved title, with status tabs, search, type, sort, and the rest of the filters one click away.
import { api, mountShell, requireLogin, esc, $, icon, libraryCard, STATUS, STATUS_KEYS, onAction, toast, toastError, openRandomizer, alertHtml } from "../app.js";
import { readState, toQuery, writeUrl, filterBarHtml, syncFilterBar, bindFilters, pagerHtml } from "../filters.js";

if (requireLogin()) {
  mountShell({ active: "library" });
  const PAGE_SIZE = 24;
  const state = readState({ sort: "added" });
  const view = $("#view");
  document.title = "Cine Space | My library";

  view.innerHTML = `
    <div class="page-head"><div><h1 class="page-title">My library</h1><p class="page-sub" id="libSub"></p></div>
      <button class="btn" type="button" id="libRandom">${icon("dice")}Surprise me</button></div>
    <div id="libMsg"></div>
    <div class="tabs" id="libTabs" role="tablist" aria-label="Watch status"></div>
    <div id="libFilters">${filterBarHtml(state, { tags: true, favorite: true, sorts: [["added", "Recently added"], ["updated", "Recently updated"], ["title", "Title"], ["year", "Year"], ["rating", "Public rating"], ["myrating", "My rating"], ["progress", "Progress"]] })}</div>
    <div id="libGrid" aria-live="polite"></div><div class="pager" id="libPager"></div>`;

  const filtersEl = $("#libFilters");
  let loadSeq = 0, stats = null;

  async function load() {
    const seq = ++loadSeq;
    writeUrl(state);
    try {
      const r = await api(`/api/watchlist?${toQuery(state, { limit: PAGE_SIZE })}`);
      if (seq !== loadSeq) return;
      $("#libMsg").innerHTML = "";
      renderTabs(r);
      syncFilterBar(filtersEl, state, r.facets, { tags: true });
      renderGrid(r);
      $("#libPager").innerHTML = pagerHtml(r.page, r.pages);
      subline(r);
    } catch (e) { if (seq === loadSeq) $("#libMsg").innerHTML = alertHtml("error", e.message, false); }
  }

  // one calm line instead of a wall of statistics cards
  function subline(r) {
    const el = $("#libSub");
    if (!r.total) { el.textContent = "Nothing saved yet"; return; }
    if (r.count !== r.total) { el.textContent = `${r.count} of ${r.total} titles match your filters`; return; }
    el.textContent = stats ? `${stats.total} saved, ${stats.byStatus.watching} watching, ${stats.byStatus.completed} completed, ${stats.episodesWatched} episodes watched` : `${r.total} titles`;
  }
  async function loadStats() { try { stats = await api("/api/watchlist/stats"); } catch (e) { stats = null; } }

  function renderTabs(r) {
    const counts = r.facets.statuses, all = STATUS_KEYS.reduce((n, k) => n + counts[k], 0);
    const tab = (key, label, n) => `<button class="tab" type="button" role="tab" data-status="${key}" aria-selected="${(state.status || "") === key}">${label}<small>${n}</small></button>`;
    $("#libTabs").innerHTML = tab("", "All", all) + STATUS_KEYS.map(k => tab(k, STATUS[k].label, counts[k])).join("");
  }

  function renderGrid(r) {
    const el = $("#libGrid");
    if (r.total === 0) {
      el.innerHTML = `<div class="empty">${icon("library")}<h3>Your library is empty</h3><p>Search for a movie, TV show or anime and add what you want to watch.</p><a class="btn btn-primary" href="index.html">Find something to watch</a></div>`;
    } else if (!r.data.length) {
      el.innerHTML = `<div class="empty">${icon("search")}<h3>No titles match</h3><p>Try removing a filter or choosing a different status.</p><button class="btn" type="button" data-f-clear-all>Clear filters</button></div>`;
    } else el.innerHTML = `<div class="grid">${r.data.map(libraryCard).join("")}</div>`;
  }

  bindFilters(filtersEl, state, load);
  $("#libGrid").addEventListener("click", e => { if (e.target.closest("[data-f-clear-all]")) filtersEl.querySelector("[data-f-clear]").click(); });
  $("#libTabs").addEventListener("click", e => { const t = e.target.closest("[data-status]"); if (t) { state.status = t.dataset.status; state.page = 1; load(); } });
  $("#libPager").addEventListener("click", e => { const b = e.target.closest("[data-page]"); if (b && !b.disabled) { state.page = Number(b.dataset.page); load(); window.scrollTo({ top: 0, behavior: "smooth" }); } });
  $("#libRandom").addEventListener("click", () => openRandomizer({ defaults: { scope: state.status && state.status !== "to_watch" ? "any" : "to_watch", type: state.type, mood: state.mood, genre: state.genre, franchise: state.franchise, tag: state.tag } }));

  async function mutate(promise, okMessage) {
    try { await promise; if (okMessage) toast(okMessage); await loadStats(); await load(); } catch (e) { toastError(e); load(); }
  }
  onAction("status", el => mutate(api(`/api/watchlist/${el.dataset.id}`, { method: "PATCH", body: { status: el.value } }), `Moved to ${STATUS[el.value].label}`));
  onAction("fav", el => mutate(api(`/api/watchlist/${el.dataset.id}`, { method: "PATCH", body: { favorite: el.getAttribute("aria-pressed") !== "true" } })));
  onAction("next", el => mutate(api(`/api/watchlist/${el.dataset.id}/progress/next`, { method: "POST" })));

  loadStats().then(load);
}
