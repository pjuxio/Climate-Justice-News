/* ===== State ===== */
let allArticles = [];
let activeFilter = 'All';
let activeSortBy  = 'popularity';
let activeDays    = 7;
let activeRegion  = 'global';
let bookmarks = new Set(JSON.parse(localStorage.getItem('cj_bookmarks') || '[]'));
// true = feed is filtered to show only Highlights; false = all articles interleaved by date
let picksFilterActive = false;

/* ===== Editor state ===== */
let isEditorMode = false;
let editorToken  = sessionStorage.getItem('cj_editor_token') || '';
// curationData mirrors what the server holds — updated after every editor action
let curationData = { hidden: [], pinned: [] };

/* ===== DOM refs ===== */
const feed        = document.getElementById('feed');
const errorState  = document.getElementById('error-state');
const errorMsg    = document.getElementById('error-msg');
const emptyState  = document.getElementById('empty-state');
const refreshBtn  = document.getElementById('refresh-btn');
const themeBtn    = document.getElementById('theme-btn');
const retryBtn    = document.getElementById('retry-btn');
const clearFilter = document.getElementById('clear-filter-btn');
const articleCount= document.getElementById('article-count');
const toast       = document.getElementById('toast');
const filterChips = document.querySelectorAll('.filter-chip');
const sortBtns    = document.querySelectorAll('[data-sort]');
const rangeBtns   = document.querySelectorAll('[data-days]');
const regionBtns  = document.querySelectorAll('[data-region]');
const brandSub    = document.getElementById('brand-sub');
const themeIconDark  = document.getElementById('theme-icon-dark');
const themeIconLight = document.getElementById('theme-icon-light');
const infoBtn        = document.getElementById('info-btn');
const modalOverlay   = document.getElementById('modal-overlay');
const modalClose     = document.getElementById('modal-close');
const picksToggleBtn = document.getElementById('picks-toggle-btn');

/* Editor DOM refs */
const editorBanner       = document.getElementById('editor-banner');
const editorCounts       = document.getElementById('editor-counts');
const editorManageBtn    = document.getElementById('editor-manage-btn');
const editorExitBtn      = document.getElementById('editor-exit-btn');
const editorLoginOverlay = document.getElementById('editor-login-overlay');
const editorLoginClose   = document.getElementById('editor-login-close');
const editorTokenInput   = document.getElementById('editor-token-input');
const editorLoginSubmit  = document.getElementById('editor-login-submit');
const editorLoginError   = document.getElementById('editor-login-error');
const editorManageOverlay= document.getElementById('editor-manage-overlay');
const editorManageClose  = document.getElementById('editor-manage-close');
const editorManageBody   = document.getElementById('editor-manage-body');

/* ===== Helpers ===== */
function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (h < 1)  return 'Just now';
  if (h < 24) return `${h}h ago`;
  if (d < 7)  return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function initials(name) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();
}

function getFaviconUrl(articleUrl) {
  try {
    const origin = new URL(articleUrl).origin;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(origin)}&sz=64`;
  } catch { return null; }
}

function showToast(msg, duration = 2400) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), duration);
}

/* ===== Theme ===== */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('cj_theme', theme);
  if (theme === 'dark') {
    themeIconDark.style.display  = '';
    themeIconLight.style.display = 'none';
  } else {
    themeIconDark.style.display  = 'none';
    themeIconLight.style.display = '';
  }
}

(function initTheme() {
  const saved = localStorage.getItem('cj_theme') || 'dark';
  applyTheme(saved);
})();

themeBtn.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
});

/* ===== Render a single card ===== */
function createCard(article) {
  const a = document.createElement('a');
  a.className = 'card';
  if (article.pinned) a.classList.add('card--pinned');
  a.href = article.url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.dataset.id  = article.id;
  a.dataset.url = article.url;
  a.dataset.category = article.category;

  const faviconUrl = getFaviconUrl(article.url);
  const isBookmarked = bookmarks.has(String(article.id));
  const isPinned = !!article.pinned;

  a.innerHTML = `
    <div class="card-body">
      ${isPinned ? `<div class="pinned-bar"><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M16 3a1 1 0 0 1 .7 1.7l-1.4 1.4 1 3.6a1 1 0 0 1-.3 1l-3 2.6V17a1 1 0 0 1-.3.7l-2 2a1 1 0 0 1-1.5-1.3l.1-.1 1.7-1.7v-4.3a1 1 0 0 1 .3-.7l3-2.6-.9-3.3 1.5-1.5A1 1 0 0 1 16 3zm-5.7 11.6L4 21.3a1 1 0 0 0 1.3 1.5l.1-.1 6.3-6.3-1.4-.8z"/></svg> Curated${article.note ? ` · <span class="pinned-note">${escHtml(article.note)}</span>` : ''}</div>` : ''}
      <div class="card-meta">
        <div class="source-avatar">
          ${faviconUrl
            ? `<img src="${faviconUrl}" alt="" onerror="this.style.display='none'">`
            : ''}
          <span>${initials(article.source)}</span>
        </div>
        <div class="source-info">
          <div class="source-name">${escHtml(article.source)}</div>
          <div class="source-time">${timeAgo(article.publishedAt)}</div>
        </div>
        <span class="category-badge">${escHtml(article.category)}</span>
      </div>
      <h2 class="card-title">${escHtml(article.title)}</h2>
    </div>
    ${article.image ? `<img class="card-image" src="${escHtml(article.image)}" alt="" loading="lazy" onerror="this.remove()">` : ''}
    ${article.description ? `<p class="card-desc">${escHtml(article.description)}</p>` : ''}
    <div class="card-footer">
      <span class="read-time">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        ${article.readTime} min read
      </span>
      <button class="card-action bookmark-btn ${isBookmarked ? 'bookmarked' : ''}" data-id="${article.id}" title="Bookmark">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="${isBookmarked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
        ${isBookmarked ? 'Saved' : 'Save'}
      </button>
      <button class="card-action share-btn" data-url="${escHtml(article.url)}" data-title="${escHtml(article.title)}" title="Share">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
        Share
      </button>
      <button class="card-open-btn" title="Open article">
        Read
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
      </button>
    </div>
  `;

  /* Bookmark button */
  a.querySelector('.bookmark-btn').addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    const id = String(article.id);
    const btn = e.currentTarget;
    const svg = btn.querySelector('svg');
    if (bookmarks.has(id)) {
      bookmarks.delete(id);
      btn.classList.remove('bookmarked');
      svg.setAttribute('fill', 'none');
      btn.innerHTML = btn.innerHTML.replace('Saved', 'Save');
      showToast('Removed from saved');
    } else {
      bookmarks.add(id);
      btn.classList.add('bookmarked');
      svg.setAttribute('fill', 'currentColor');
      btn.innerHTML = btn.innerHTML.replace('Save', 'Saved');
      showToast('Saved to bookmarks');
    }
    localStorage.setItem('cj_bookmarks', JSON.stringify([...bookmarks]));
  });

  /* Share button */
  a.querySelector('.share-btn').addEventListener('click', async e => {
    e.preventDefault();
    e.stopPropagation();
    const url   = e.currentTarget.dataset.url;
    const title = e.currentTarget.dataset.title;
    if (navigator.share) {
      try { await navigator.share({ title, url }); } catch {}
    } else {
      try {
        await navigator.clipboard.writeText(url);
        showToast('Link copied to clipboard');
      } catch {
        showToast('Unable to copy link');
      }
    }
  });

  /* Open btn — card is already an <a>, button just signals intent visually */
  a.querySelector('.card-open-btn').addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    window.open(article.url, '_blank', 'noopener,noreferrer');
  });

  /* Editor toolbar — injected when editor mode is active */
  if (isEditorMode) {
    const toolbar = document.createElement('div');
    toolbar.className = 'editor-toolbar';

    if (isPinned) {
      toolbar.innerHTML = `
        <button class="editor-btn editor-unpin-btn" title="Unpin article">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          Unpin
        </button>`;
      toolbar.querySelector('.editor-unpin-btn').addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        editorUnpin(article.url);
      });
    } else {
      toolbar.innerHTML = `
        <button class="editor-btn editor-pin-btn" title="Pin to top of feed">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M16 3a1 1 0 0 1 .7 1.7l-1.4 1.4 1 3.6a1 1 0 0 1-.3 1l-3 2.6V17a1 1 0 0 1-.3.7l-2 2a1 1 0 0 1-1.5-1.3l.1-.1 1.7-1.7v-4.3a1 1 0 0 1 .3-.7l3-2.6-.9-3.3 1.5-1.5A1 1 0 0 1 16 3zm-5.7 11.6L4 21.3a1 1 0 0 0 1.3 1.5l.1-.1 6.3-6.3-1.4-.8z"/></svg>
          Pin
        </button>
        <button class="editor-btn editor-hide-btn" title="Hide from feed">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          Hide
        </button>`;
      toolbar.querySelector('.editor-pin-btn').addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        editorPin(article);
      });
      toolbar.querySelector('.editor-hide-btn').addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        editorHide(article);
      });
    }

    a.appendChild(toolbar);
  }

  return a;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ===== Render filtered feed ===== */
function renderFeed() {
  let filtered = activeFilter === 'All'
    ? allArticles
    : allArticles.filter(a => a.category === activeFilter);

  // Filter to only Highlights when active; otherwise interleave picks by date.
  if (picksFilterActive) {
    filtered = filtered.filter(a => a.pinned);
  } else if (filtered.some(a => a.pinned)) {
    filtered = [...filtered].sort((a, b) =>
      new Date(b.publishedAt) - new Date(a.publishedAt)
    );
  }

  feed.innerHTML = '';
  errorState.style.display  = 'none';
  emptyState.style.display  = 'none';

  if (filtered.length === 0) {
    emptyState.style.display = 'flex';
    articleCount.textContent = '0 articles';
    return;
  }

  const frag = document.createDocumentFragment();
  filtered.forEach(a => frag.appendChild(createCard(a)));
  feed.appendChild(frag);
  articleCount.textContent = `${filtered.length} article${filtered.length !== 1 ? 's' : ''}`;
}

/* ===== Subtitle helper ===== */
const REGION_LABELS = {
  global:   'Global',
  americas: 'Americas',
  africa:   'Africa',
  asia:     'Asia Pacific',
  europe:   'Europe',
  mena:     'MENA',
};

function updateSubtitle() {
  const sortLabel  = activeSortBy === 'popularity' ? 'Top' : 'Latest';
  const rangeLabel = activeDays === 1 ? '24h'
    : activeDays === 3 ? '3 days'
    : activeDays === 7 ? '7 days'
    : '30 days';
  const regionLabel = REGION_LABELS[activeRegion] || 'Global';
  brandSub.textContent = `${sortLabel} · ${rangeLabel} · ${regionLabel}`;
}

/* ===== Fetch news ===== */
async function fetchNews(force = false) {
  refreshBtn.classList.add('spinning');
  errorState.style.display = 'none';
  emptyState.style.display = 'none';

  /* Show skeletons only on first load */
  if (allArticles.length === 0) {
    feed.innerHTML = [1,2,3].map(() => `
      <div class="skeleton-card">
        <div class="sk sk-header"></div>
        <div class="sk sk-title"></div>
        <div class="sk sk-title short"></div>
        <div class="sk sk-img"></div>
        <div class="sk sk-text"></div>
        <div class="sk sk-text short"></div>
        <div class="sk sk-footer"></div>
      </div>`).join('');
  }

  updateSubtitle();

  try {
    const params = new URLSearchParams({ sortBy: activeSortBy, days: activeDays, region: activeRegion });
    if (force) params.set('force', '1');
    const res  = await fetch(`/api/news?${params}`);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    allArticles = data.articles;
    renderFeed();

    if (force) showToast(data.cached ? 'Feed is up to date' : 'Feed refreshed');
  } catch (err) {
    feed.innerHTML = '';
    errorState.style.display = 'flex';
    errorMsg.textContent = err.message || 'Unable to connect to the server.';
  } finally {
    refreshBtn.classList.remove('spinning');
  }
}

/* ===== Filter chips ===== */
filterChips.forEach(chip => {
  chip.addEventListener('click', () => {
    filterChips.forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    activeFilter = chip.dataset.filter;
    renderFeed();
  });
});

clearFilter.addEventListener('click', () => {
  filterChips.forEach(c => c.classList.remove('active'));
  document.querySelector('[data-filter="All"]').classList.add('active');
  activeFilter = 'All';
  renderFeed();
});

/* ===== Sort buttons ===== */
sortBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.sort === activeSortBy) return;
    sortBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeSortBy = btn.dataset.sort;
    allArticles = [];
    fetchNews(true);
  });
});

/* ===== Range buttons ===== */
rangeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const d = Number(btn.dataset.days);
    if (d === activeDays) return;
    rangeBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeDays = d;
    allArticles = [];
    fetchNews(true);
  });
});

/* ===== Region buttons ===== */
regionBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.region === activeRegion) return;
    regionBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeRegion = btn.dataset.region;
    allArticles = [];
    fetchNews(true);
  });
});

/* ===== Refresh button ===== */
refreshBtn.addEventListener('click', () => fetchNews(true));
retryBtn.addEventListener('click', () => fetchNews(true));

/* ===== Info modal ===== */
function openModal() {
  modalOverlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  modalClose.focus();
}

function closeModal() {
  modalOverlay.style.display = 'none';
  document.body.style.overflow = '';
}

infoBtn.addEventListener('click', openModal);
modalClose.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });

/* ===== Keyboard shortcuts ===== */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (modalOverlay.style.display !== 'none') { closeModal(); return; }
    if (editorLoginOverlay.style.display !== 'none') { closeEditorLogin(); return; }
    if (editorManageOverlay.style.display !== 'none') { closeEditorManage(); return; }
  }
  if (e.key === 'r' || e.key === 'R') {
    if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      fetchNews(true);
    }
  }
  /* Ctrl+Shift+E → toggle editor mode */
  if ((e.key === 'E' || e.key === 'e') && e.ctrlKey && e.shiftKey) {
    e.preventDefault();
    toggleEditorMode();
  }
});

/* ===== Sync main padding-top to sticky stack height ===== */
const stickyStack = document.getElementById('sticky-stack');
const mainEl = document.querySelector('.main');

function syncPadding() {
  mainEl.style.paddingTop = (stickyStack.offsetHeight + 20) + 'px';
}

const resizeObserver = new ResizeObserver(syncPadding);
resizeObserver.observe(stickyStack);
syncPadding();

/* ===== Editor mode ===== */

function updateEditorCounts() {
  const p = curationData.pinned.length;
  const h = curationData.hidden.length;
  editorCounts.textContent =
    `${p} pinned · ${h} hidden`;
}

async function fetchCuration() {
  try {
    const res = await fetch('/api/curation');
    if (res.ok) {
      curationData = await res.json();
      updateEditorCounts();
    }
  } catch { /* non-fatal */ }
}

function enterEditorMode() {
  isEditorMode = true;
  editorBanner.style.display = '';
  fetchCuration();
  renderFeed(); // re-render cards with editor toolbars
  showToast('Editor mode active · Ctrl+Shift+E to exit');
}

function exitEditorMode() {
  isEditorMode = false;
  editorBanner.style.display = 'none';
  renderFeed(); // re-render cards without editor toolbars
}

function toggleEditorMode() {
  if (isEditorMode) {
    exitEditorMode();
    return;
  }
  /* If we already have a stored token, try entering directly */
  if (editorToken) {
    enterEditorMode();
  } else {
    openEditorLogin();
  }
}

/* ── Editor login modal ── */
function openEditorLogin() {
  editorLoginError.style.display = 'none';
  editorTokenInput.value = '';
  editorLoginOverlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  setTimeout(() => editorTokenInput.focus(), 60);
}

function closeEditorLogin() {
  editorLoginOverlay.style.display = 'none';
  document.body.style.overflow = '';
}

editorLoginClose.addEventListener('click', closeEditorLogin);
editorLoginOverlay.addEventListener('click', e => { if (e.target === editorLoginOverlay) closeEditorLogin(); });

async function submitEditorLogin() {
  const token = editorTokenInput.value.trim();
  if (!token) return;

  editorLoginSubmit.disabled = true;
  editorLoginSubmit.textContent = 'Verifying…';
  editorLoginError.style.display = 'none';

  try {
    /* Verify token using the dedicated read-only verification endpoint */
    const res = await fetch('/api/curation/verify', {
      headers: { 'X-Editor-Token': token },
    });

    if (res.status === 401) {
      editorLoginError.textContent = 'Incorrect token. Try again.';
      editorLoginError.style.display = '';
      editorTokenInput.select();
    } else if (res.ok) {
      editorToken = token;
      sessionStorage.setItem('cj_editor_token', token);
      closeEditorLogin();
      enterEditorMode();
    } else {
      editorLoginError.textContent = 'Server error. Please try again.';
      editorLoginError.style.display = '';
    }
  } catch {
    editorLoginError.textContent = 'Network error. Please try again.';
    editorLoginError.style.display = '';
  } finally {
    editorLoginSubmit.disabled = false;
    editorLoginSubmit.textContent = 'Enter Editor Mode';
  }
}

editorLoginSubmit.addEventListener('click', submitEditorLogin);
editorTokenInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitEditorLogin(); });

/* ── Editor banner controls ── */
editorExitBtn.addEventListener('click', () => {
  exitEditorMode();
  showToast('Exited editor mode');
});

editorManageBtn.addEventListener('click', openEditorManage);

/* ── Editor manage modal ── */
function openEditorManage() {
  renderEditorManage();
  editorManageOverlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeEditorManage() {
  editorManageOverlay.style.display = 'none';
  document.body.style.overflow = '';
}

editorManageClose.addEventListener('click', closeEditorManage);
editorManageOverlay.addEventListener('click', e => { if (e.target === editorManageOverlay) closeEditorManage(); });

function renderEditorManage() {
  const pinned = curationData.pinned || [];
  const hidden = curationData.hidden || [];

  editorManageBody.innerHTML = `
    <section class="info-section">
      <h3 class="info-heading">Pinned (${pinned.length})</h3>
      ${pinned.length === 0
        ? '<p style="font-size:0.875rem;color:var(--text-muted)">No pinned articles. Pin articles from the feed using editor mode.</p>'
        : pinned.map(p => `
          <div class="manage-row" data-url="${escHtml(p.url)}">
            <div class="manage-row-info">
              <div class="manage-row-title">${escHtml(p.title || p.url)}</div>
              <div class="manage-row-meta">${escHtml(p.source || '')}${p.note ? ` · <em>${escHtml(p.note)}</em>` : ''}</div>
            </div>
            <button class="editor-btn editor-unpin-btn manage-unpin-btn" data-url="${escHtml(p.url)}">Unpin</button>
          </div>`).join('')}
    </section>
    <section class="info-section">
      <h3 class="info-heading">Hidden (${hidden.length})</h3>
      ${hidden.length === 0
        ? '<p style="font-size:0.875rem;color:var(--text-muted)">No hidden articles.</p>'
        : hidden.map(url => `
          <div class="manage-row" data-url="${escHtml(url)}">
            <div class="manage-row-info">
              <div class="manage-row-title manage-row-url">${escHtml(url)}</div>
            </div>
            <button class="editor-btn editor-unhide-btn manage-unhide-btn" data-url="${escHtml(url)}">Unhide</button>
          </div>`).join('')}
    </section>`;

  editorManageBody.querySelectorAll('.manage-unpin-btn').forEach(btn => {
    btn.addEventListener('click', () => editorUnpin(btn.dataset.url));
  });
  editorManageBody.querySelectorAll('.manage-unhide-btn').forEach(btn => {
    btn.addEventListener('click', () => editorUnhide(btn.dataset.url));
  });
}

/* ── Curation actions ── */

async function curationRequest(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Editor-Token': editorToken },
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    /* Token rejected — clear it and drop out of editor mode */
    editorToken = '';
    sessionStorage.removeItem('cj_editor_token');
    exitEditorMode();
    showToast('Session expired. Please log in again.');
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function editorHide(article) {
  try {
    await curationRequest('POST', '/api/curation/hide', { url: article.url });
    curationData.hidden.push(article.url);
    updateEditorCounts();
    /* Remove the card from view immediately */
    const card = feed.querySelector(`[data-url="${CSS.escape(article.url)}"]`);
    if (card) {
      card.classList.add('card--removing');
      setTimeout(() => { card.remove(); updateArticleCount(); }, 300);
    }
    showToast('Article hidden from feed');
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
}

async function editorUnhide(url) {
  try {
    await curationRequest('DELETE', '/api/curation/hide', { url });
    curationData.hidden = curationData.hidden.filter(u => u !== url);
    updateEditorCounts();
    /* Refresh feed to bring the article back */
    await fetchNews(true);
    renderEditorManage();
    showToast('Article restored to feed');
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
}

async function editorPin(article) {
  const note = prompt('Optional editor note (leave blank for none):') ?? '';
  if (note === null) return; // cancelled

  try {
    await curationRequest('POST', '/api/curation/pin', {
      url: article.url,
      title: article.title,
      source: article.source,
      author: article.author,
      description: article.description,
      image: article.image,
      publishedAt: article.publishedAt,
      readTime: article.readTime,
      category: article.category,
      note: note.trim(),
    });
    curationData.pinned.unshift({ ...article, note: note.trim() });
    updateEditorCounts();
    /* Refresh feed so pinned article appears at top with badge */
    await fetchNews(true);
    showToast('Article pinned to top of feed');
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
}

async function editorUnpin(url) {
  try {
    await curationRequest('DELETE', '/api/curation/pin', { url });
    curationData.pinned = curationData.pinned.filter(p => p.url !== url);
    updateEditorCounts();
    await fetchNews(true);
    if (editorManageOverlay.style.display !== 'none') renderEditorManage();
    showToast('Article unpinned');
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
}

function updateArticleCount() {
  const cards = feed.querySelectorAll('.card:not(.card--removing)');
  articleCount.textContent = `${cards.length} article${cards.length !== 1 ? 's' : ''}`;
}

/* ===== Highlights toggle ===== */
function applyPicksToggle() {
  picksToggleBtn.classList.toggle('active', picksFilterActive);
  picksToggleBtn.title = picksFilterActive
    ? "Showing Highlights — click to show all"
    : "Show Highlights";
}

picksToggleBtn.addEventListener('click', () => {
  picksFilterActive = !picksFilterActive;
  applyPicksToggle();
  renderFeed();
  showToast(picksFilterActive ? "Showing Highlights" : "Showing all articles");
});

applyPicksToggle(); // sync button state on load

/* ===== Init ===== */
fetchNews();
