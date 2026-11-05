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
