// Helpers shared by every page.
const TOKEN_KEY = "cinespace_token";

function esc(text) {
    return String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function showMessage(text, type = 'danger') {
    document.getElementById('message').innerHTML = `<div class="alert alert-${type}">${esc(text)}</div>`;
}

// Talks to the server: attaches the login token, reads the JSON, throws the server's message on errors.
async function api(url, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = await fetch(url, { ...options, headers });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((d.errors || ['Request failed.']).join(' '));
    return d;
}

function requireLogin() {
    if (!localStorage.getItem(TOKEN_KEY)) location.href = 'login.html';
}

function logout() {
    if (!confirm('Are you sure you want to log out?')) return;
    localStorage.removeItem(TOKEN_KEY);
    location.href = 'login.html';
}

async function addToWatchlist(source, id) {
    try {
        await api('/api/watchlist', { method: 'POST', body: JSON.stringify({ source, id }) });
        showMessage('Added to your watchlist.', 'success');
    } catch (e) {
        showMessage(e.message);
    }
}

// One poster card, used by the home page, the title page and the dice.
function posterCard(t) {
    return `<a class="poster-card" href="title.html?source=${encodeURIComponent(t.source)}&id=${encodeURIComponent(t.id)}">
        <div class="initial">${esc((t.title || '?').slice(0, 1))}</div>
        ${t.posterUrl ? `<img src="${esc(t.posterUrl)}" alt="" onerror="this.style.visibility='hidden'">` : ''}
        <span class="poster-tag">${esc(t.type)}</span>
        <div class="poster-info"><strong>${esc(t.title)}</strong><small>${esc(t.year ?? '')}${t.score ? ' ★ ' + esc(t.score) : ''}</small></div>
    </a>`;
}

// ---------- the dice: "can't decide?" picks a random title (GET /api/random) ----------
let lastPick = '';

function openDice() {
    let dlg = document.getElementById('diceDialog');
    if (!dlg) {
        dlg = document.createElement('dialog');
        dlg.id = 'diceDialog';
        dlg.className = 'dice';
        dlg.innerHTML = `
            <div class="p-4">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h4 class="mb-0">What should I watch?</h4>
                    <button class="btn-close" onclick="diceDialog.close()"></button>
                </div>
                <div class="row g-2 mb-3">
                    <div class="col">
                        <label class="form-label small">Pick from</label>
                        <select id="dScope" class="form-select">
                            <option value="watchlist">My unwatched list</option>
                            <option value="catalog">Catalog titles I haven't saved</option>
                        </select>
                    </div>
                    <div class="col">
                        <label class="form-label small">Type</label>
                        <select id="dType" class="form-select">
                            <option value="">Any</option>
                            <option value="movie">Movies</option>
                            <option value="series">Series</option>
                            <option value="anime">Anime</option>
                        </select>
                    </div>
                </div>
                <div class="dice-stage" id="dStage"><button class="btn btn-primary" onclick="rollDice()">🎲 Pick something for me</button></div>
            </div>`;
        document.body.appendChild(dlg);
    }
    dlg.showModal();
}

async function rollDice() {
    const stage = document.getElementById('dStage');
    stage.innerHTML = '<div class="rolling">🎲</div>';
    const params = new URLSearchParams({ scope: dScope.value, type: dType.value, exclude: lastPick });
    try {
        const [r] = await Promise.all([api(`/api/random?${params}`), new Promise(done => setTimeout(done, 700))]);
        if (!r.data) { stage.innerHTML = `<p class="text-muted">${esc(r.message)}</p>`; return; }
        const t = r.data;
        lastPick = t.key;
        const view = t.custom ? '' : `<a class="btn btn-primary btn-sm" href="title.html?source=${encodeURIComponent(t.source)}&id=${encodeURIComponent(t.id)}">View details</a>`;
        const add = r.scope === 'catalog' ? `<button class="btn btn-outline-primary btn-sm" data-source="${esc(t.source)}" data-id="${esc(t.id)}" onclick="diceAdd(this)">Add to watchlist</button>` : '';
        stage.innerHTML = `
            <div class="pick">
                <div class="poster-card">${t.posterUrl ? `<img src="${esc(t.posterUrl)}" alt="">` : `<div class="initial">${esc(t.title.slice(0, 1))}</div>`}</div>
                <div>
                    <h5>${esc(t.title)}</h5>
                    <p class="small text-muted mb-2">${esc(t.type)}${t.year ? ' · ' + esc(t.year) : ''}${t.genres.length ? ' · ' + esc(t.genres.join(', ')) : ''}</p>
                    <p class="small">${esc((t.synopsis || 'No synopsis saved.').slice(0, 220))}</p>
                    <div class="d-flex flex-wrap gap-2">${view}${add}<button class="btn btn-outline-secondary btn-sm" onclick="rollDice()">Roll again</button></div>
                    <p class="small text-muted mt-2 mb-0">${r.poolSize} title(s) to choose from.</p>
                </div>
            </div>`;
    } catch (e) {
        stage.innerHTML = `<div class="alert alert-danger mb-0">${esc(e.message)}</div>`;
    }
}

async function diceAdd(btn) {
    try {
        await api('/api/watchlist', { method: 'POST', body: JSON.stringify({ source: btn.dataset.source, id: btn.dataset.id }) });
        btn.outerHTML = '<span class="small text-success">Added to your watchlist</span>';
    } catch (e) {
        btn.outerHTML = `<span class="small text-danger">${esc(e.message)}</span>`;
    }
}