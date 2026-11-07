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

// Small pop-up message in the corner, so feedback is visible wherever the page is scrolled.
function toast(text, type = 'success') {
    let box = document.getElementById('toastBox');
    if (!box) { box = document.createElement('div'); box.id = 'toastBox'; document.body.appendChild(box); }
    const el = document.createElement('div');
    el.className = `cs-toast cs-toast-${type}`;
    el.textContent = text;
    box.appendChild(el);
    setTimeout(() => el.remove(), 3200);
}

// Returns 'added', 'exists' (already saved) or 'error'.
async function addToWatchlist(source, id) {
    if (!localStorage.getItem(TOKEN_KEY)) { toast('Log in first to add titles to your watchlist.', 'warn'); return 'error'; }
    try {
        await api('/api/watchlist', { method: 'POST', body: JSON.stringify({ source, id }) });
        toast('Added to your watchlist.');
        return 'added';
    } catch (e) {
        if (e.message.startsWith('Already on your watchlist')) { toast('Already on your watchlist.', 'info'); return 'exists'; }
        toast(e.message, 'error');
        return 'error';
    }
}

// The "+" shortcut on a poster card: adds without opening the title page.
async function quickAdd(event, btn) {
    event.preventDefault();      // the card is a link: don't open it
    event.stopPropagation();
    if (btn.disabled) return;
    btn.disabled = true;
    btn.classList.add('busy');                  // spinner while the title is checked online
    const result = await addToWatchlist(btn.dataset.source, btn.dataset.id);
    btn.classList.remove('busy');
    if (result === 'error') { btn.disabled = false; return; }
    btn.textContent = '✓';
    btn.classList.add('done');
    btn.title = 'On your watchlist';
}

// Shows "Log in" only when logged out and "Log out" only when logged in (elements marked data-auth="out" / "in").
document.querySelectorAll('[data-auth]').forEach(el => {
    const loggedIn = !!localStorage.getItem(TOKEN_KEY);
    el.hidden = (el.dataset.auth === 'in') !== loggedIn;
});

// One poster card, used by the home page, the title page and the dice.
function posterCard(t) {
    return `<a class="poster-card" href="title.html?source=${encodeURIComponent(t.source)}&id=${encodeURIComponent(t.id)}">
        <div class="initial">${esc((t.title || '?').slice(0, 1))}</div>
        ${t.posterUrl ? `<img src="${esc(t.posterUrl)}" alt="" loading="lazy" decoding="async" onerror="this.style.visibility='hidden'">` : ''}
        <span class="poster-tag">${esc(t.type)}</span>
        <button type="button" class="poster-add" title="Add to watchlist" aria-label="Add ${esc(t.title)} to watchlist"
            data-source="${esc(t.source)}" data-id="${esc(t.id)}" onclick="quickAdd(event, this)">+</button>
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
        enhanceSelects(dlg);
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

// ---------- fonts ----------
// Loaded from here instead of a CSS @import: an @import makes the whole page wait for Google Fonts before anything is drawn.
// Added this way the page shows at once with the fallback font, then switches when the fonts arrive.
(function loadFonts() {
    const add = (rel, href, crossorigin) => {
        const link = document.createElement('link');
        link.rel = rel; link.href = href;
        if (crossorigin) link.crossOrigin = '';
        document.head.appendChild(link);
    };
    add('preconnect', 'https://fonts.googleapis.com');
    add('preconnect', 'https://fonts.gstatic.com', true);
    add('stylesheet', 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');
})();

// grey placeholder cards shown while a list is loading
function skeletonCards(n) {
    return Array.from({ length: n }, () => '<div class="poster-card skeleton" aria-hidden="true"></div>').join('');
}

// ---------- light / dark mode ----------
const THEME_KEY = 'cinespace_theme';
const ICON_MOON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
const ICON_SUN = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';

function currentTheme() {
    let saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) { /* storage blocked */ }
    return saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-bs-theme', theme);   // Bootstrap 5.3 switches its colors with this
    const btn = document.getElementById('themeToggle');
    if (!btn) return;
    btn.innerHTML = theme === 'dark' ? ICON_SUN : ICON_MOON;
    const next = theme === 'dark' ? 'light' : 'dark';
    btn.title = `Switch to ${next} mode`;
    btn.setAttribute('aria-label', btn.title);
}

function toggleTheme() {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
    applyTheme(next);
}

function addThemeToggle() {
    const btn = document.createElement('button');
    btn.id = 'themeToggle';
    btn.type = 'button';
    btn.className = 'btn cs-theme-toggle';
    btn.onclick = toggleTheme;
    const bar = document.querySelector('.navbar .d-flex');
    if (bar) { btn.classList.add('btn-dark'); bar.appendChild(btn); }   // pages with a navbar
    else { btn.classList.add('floating'); document.body.appendChild(btn); }   // login and sign up
    applyTheme(currentTheme());
}

// ---------- custom dropdowns ----------
// Replaces every <select class="form-select"> with a styled dropdown. The real <select> stays in the page (hidden),
// so select.value, onchange="..." and form.reset() keep working exactly as before.
const nativeValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
let openDropdown = null;

function closeDropdown() {
    if (!openDropdown) return;
    openDropdown.menu.hidden = true;
    openDropdown.btn.setAttribute('aria-expanded', 'false');
    openDropdown.wrap.classList.remove('open');
    openDropdown = null;
}

function enhanceSelects(root = document) {
    root.querySelectorAll('select.form-select:not([data-enhanced])').forEach(buildDropdown);
}

function buildDropdown(select) {
    select.dataset.enhanced = '1';

    const wrap = document.createElement('div');
    wrap.className = 'cs-select';
    if (select.classList.contains('w-auto')) wrap.classList.add('cs-select-auto');
    if (select.classList.contains('form-select-sm')) wrap.classList.add('cs-select-sm');
    [...select.classList].filter(c => /^m[tbsexy]?-\d$/.test(c)).forEach(c => wrap.classList.add(c));   // keep spacing classes like mb-3
    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(select);
    select.classList.add('cs-native');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cs-select-btn';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<span class="cs-select-label"></span><span class="cs-select-caret"></span>';
    const menu = document.createElement('div');
    menu.className = 'cs-select-menu';
    menu.setAttribute('role', 'listbox');
    menu.hidden = true;
    wrap.append(btn, menu);

    const label = btn.querySelector('.cs-select-label');
    const state = { wrap, btn, menu };
    let active = -1, typed = '', typedTimer;

    // rebuild the label and the option list from the real <select>
    function sync() {
        const opts = [...select.options];
        const chosen = select.selectedOptions[0];
        // invisible copies of every option's text keep the button as wide as the longest one (no jumping)
        label.innerHTML = `<span class="cs-current">${esc(chosen ? chosen.text : '')}</span>` + opts.map(o => `<span class="cs-size">${esc(o.text)}</span>`).join('');
        menu.innerHTML = opts.map((o, i) =>
            `<div class="cs-opt" role="option" data-i="${i}" aria-selected="${o === chosen}"${o.disabled ? ' aria-disabled="true"' : ''}>${esc(o.text)}</div>`).join('');
        btn.disabled = select.disabled;
    }

    function setActive(i) {
        const items = [...menu.children];
        if (!items.length) return;
        active = (i + items.length) % items.length;
        items.forEach((el, n) => el.classList.toggle('active', n === active));
        items[active].scrollIntoView({ block: 'nearest' });
    }

    function open() {
        if (btn.disabled) return;
        if (openDropdown && openDropdown !== state) closeDropdown();
        const r = btn.getBoundingClientRect();
        menu.style.maxHeight = '280px';
        menu.hidden = false;
        menu.style.minWidth = `${r.width}px`;
        const h = Math.min(menu.scrollHeight + 2, 280);
        const below = innerHeight - r.bottom - 12, above = r.top - 12;
        const up = below < h && above > below;      // not enough room underneath: open upwards
        menu.style.maxHeight = `${Math.min(280, Math.max(120, up ? above : below))}px`;
        menu.style.left = `${Math.max(8, Math.min(r.left, innerWidth - menu.offsetWidth - 8))}px`;
        menu.style.top = up ? `${r.top - Math.min(h, above) - 6}px` : `${r.bottom + 6}px`;
        menu.style.transformOrigin = up ? 'bottom' : 'top';
        btn.setAttribute('aria-expanded', 'true');
        wrap.classList.add('open');
        openDropdown = state;
        setActive(select.selectedIndex);
    }

    function choose(i) {
        const opt = select.options[i];
        if (!opt || opt.disabled) return;
        const changed = select.selectedIndex !== i;
        nativeValue.set.call(select, opt.value);
        sync();
        closeDropdown();
        btn.focus();
        if (changed) select.dispatchEvent(new Event('change', { bubbles: true }));   // runs the page's onchange code
    }

    btn.addEventListener('click', () => openDropdown === state ? closeDropdown() : open());
    menu.addEventListener('click', e => { const o = e.target.closest('.cs-opt'); if (o) choose(Number(o.dataset.i)); });
    menu.addEventListener('mousemove', e => { const o = e.target.closest('.cs-opt'); if (o) setActive(Number(o.dataset.i)); });
    btn.addEventListener('keydown', e => {
        const isOpen = openDropdown === state;
        if (e.key === 'Escape' || e.key === 'Tab') { if (isOpen) closeDropdown(); return; }
        if (['ArrowDown', 'ArrowUp', 'Enter', ' ', 'Home', 'End'].includes(e.key)) {
            e.preventDefault();
            if (!isOpen) return open();
            if (e.key === 'ArrowDown') setActive(active + 1);
            else if (e.key === 'ArrowUp') setActive(active - 1);
            else if (e.key === 'Home') setActive(0);
            else if (e.key === 'End') setActive(menu.children.length - 1);
            else choose(active);
            return;
        }
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {      // type a letter to jump to a matching option
            typed += e.key.toLowerCase();
            clearTimeout(typedTimer);
            typedTimer = setTimeout(() => typed = '', 600);
            const hit = [...select.options].findIndex(o => o.text.toLowerCase().startsWith(typed));
            if (hit >= 0) isOpen ? setActive(hit) : choose(hit);
        }
    });

    // keep the dropdown in step when other code changes the real <select>
    Object.defineProperty(select, 'value', {
        configurable: true,
        get() { return nativeValue.get.call(this); },
        set(v) { nativeValue.set.call(this, v); sync(); }
    });
    new MutationObserver(sync).observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
    if (select.form) select.form.addEventListener('reset', () => setTimeout(sync));

    sync();
}

document.addEventListener('pointerdown', e => { if (openDropdown && !openDropdown.wrap.contains(e.target)) closeDropdown(); });
addEventListener('resize', closeDropdown);
addEventListener('scroll', e => { if (openDropdown && !openDropdown.menu.contains(e.target)) closeDropdown(); }, true);

applyTheme(currentTheme());
addThemeToggle();
enhanceSelects();