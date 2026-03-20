/* ===== State ===== */
let allArticles = [];
let activeFilter = 'All';
let activeDays   = 0;        // 0 = All time
let activeRegion = 'global';

const PAGE_SIZE = 15;
let _filteredArticles = [];
let _renderedCount    = 0;
let bookmarks = new Set(JSON.parse(localStorage.getItem('cj_bookmarks') || '[]'));

/* ===== Editor state ===== */
let isEditorMode = false;
let editorToken  = sessionStorage.getItem('cj_editor_token') || '';
let curationData = { pinned: [], manual: [] };

/* Browse state */
let browseArticles = [];
let browseSortBy   = 'popularity';
let browseDays     = 7;
let browseRegion   = 'global';

/* Pin modal state */
let _pinModalArticle = null;

/* ===== DOM refs ===== */
const feed         = document.getElementById('feed');
const sentinel     = document.getElementById('feed-sentinel');
const errorState   = document.getElementById('error-state');
const errorMsg     = document.getElementById('error-msg');
const emptyState   = document.getElementById('empty-state');
const themeBtn     = document.getElementById('theme-btn');
const retryBtn     = document.getElementById('retry-btn');
const clearFilter  = document.getElementById('clear-filter-btn');
const articleCount = document.getElementById('article-count');
const toast        = document.getElementById('toast');
const filterChips  = document.querySelectorAll('.filter-chip');
const rangeBtns    = document.querySelectorAll('[data-days]');
const regionBtns   = document.querySelectorAll('[data-region]');
const brandSub     = document.getElementById('brand-sub');
const themeIconDark  = document.getElementById('theme-icon-dark');
const themeIconLight = document.getElementById('theme-icon-light');
const infoBtn        = document.getElementById('info-btn');
const modalOverlay   = document.getElementById('modal-overlay');
const modalClose     = document.getElementById('modal-close');

/* Editor DOM refs */
const editorBanner        = document.getElementById('editor-banner');
const editorCounts        = document.getElementById('editor-counts');
const editorBrowseBtn     = document.getElementById('editor-browse-btn');
const editorManageBtn     = document.getElementById('editor-manage-btn');
const editorExitBtn       = document.getElementById('editor-exit-btn');
const editorLoginOverlay  = document.getElementById('editor-login-overlay');
const editorLoginClose    = document.getElementById('editor-login-close');
const editorTokenInput    = document.getElementById('editor-token-input');
const editorLoginSubmit   = document.getElementById('editor-login-submit');
const editorLoginError    = document.getElementById('editor-login-error');
const editorManageOverlay = document.getElementById('editor-manage-overlay');
const editorManageClose   = document.getElementById('editor-manage-close');
const editorManageBody    = document.getElementById('editor-manage-body');

/* Browse overlay DOM refs */
const editorBrowseOverlay = document.getElementById('editor-browse-overlay');
const editorBrowseClose   = document.getElementById('editor-browse-close');
const editorBrowseBody    = document.getElementById('editor-browse-body');
const browseSortBtns      = document.querySelectorAll('[data-browse-sort]');
const browseDaysBtns      = document.querySelectorAll('[data-browse-days]');
const browseRegionBtns    = document.querySelectorAll('[data-browse-region]');

/* Pin modal DOM refs */
const editorPinOverlay      = document.getElementById('editor-pin-overlay');
const editorPinClose        = document.getElementById('editor-pin-close');
const editorPinArticleTitle = document.getElementById('editor-pin-article-title');
const editorPinRegion       = document.getElementById('editor-pin-region');
const editorPinNote         = document.getElementById('editor-pin-note');
const editorPinSubmit       = document.getElementById('editor-pin-submit');
const editorPinError        = document.getElementById('editor-pin-error');

/* ===== Body scroll management ===== */
function updateBodyScroll() {
  const anyOpen = [modalOverlay, editorLoginOverlay, editorManageOverlay,
                   editorBrowseOverlay, editorPinOverlay]
    .some(el => el && el.style.display !== 'none');
  document.body.style.overflow = anyOpen ? 'hidden' : '';
}

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
  return name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
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

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

  a.href = article.url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.dataset.id  = article.id;
  a.dataset.url = article.url;
  a.dataset.category = article.category;

  const faviconUrl   = getFaviconUrl(article.url);
  const isBookmarked = bookmarks.has(String(article.id));
  const isPinned     = !!article.pinned;

  a.innerHTML = `
    <div class="card-body">
      <div class="card-meta">
        <div class="source-avatar">
          ${faviconUrl ? `<img src="${faviconUrl}" alt="" onerror="this.style.display='none'">` : ''}
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
    const id  = String(article.id);
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

  /* Open btn */
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
        <button class="editor-btn editor-unpin-btn">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          Unpin
        </button>`;
      toolbar.querySelector('.editor-unpin-btn').addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        editorUnpin(article.url);
      });
    } else if (article.manual) {
      toolbar.innerHTML = `
        <button class="editor-btn editor-remove-btn">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          Remove
        </button>`;
      toolbar.querySelector('.editor-remove-btn').addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        editorRemoveManual(article.url);
      });
    }

    if (toolbar.firstElementChild) a.appendChild(toolbar);
  }

  return a;
}

/* ===== Render filtered feed ===== */
function renderFeed() {
  let filtered = allArticles;

  // Date range filter (activeDays = 0 means "All time")
  if (activeDays > 0) {
    const cutoff = Date.now() - activeDays * 86_400_000;
    filtered = filtered.filter(a => new Date(a.publishedAt).getTime() >= cutoff);
  }

  // Region filter
  if (activeRegion !== 'global') {
    filtered = filtered.filter(a => (a.region || 'global') === activeRegion);
  }

  // Category filter
  if (activeFilter !== 'All') {
    filtered = filtered.filter(a => a.category === activeFilter);
  }

  _filteredArticles = filtered;
  _renderedCount    = 0;
  feed.innerHTML    = '';
  errorState.style.display = 'none';
  emptyState.style.display = 'none';

  if (filtered.length === 0) {
    emptyState.style.display = 'flex';
    articleCount.textContent = '0 articles';
    sentinel.style.display   = 'none';
    return;
  }

  appendBatch();
}

function appendBatch() {
  const batch = _filteredArticles.slice(_renderedCount, _renderedCount + PAGE_SIZE);
  if (!batch.length) return;
  const frag = document.createDocumentFragment();
  batch.forEach(a => frag.appendChild(createCard(a)));
  feed.appendChild(frag);
  _renderedCount += batch.length;
  articleCount.textContent = `${_filteredArticles.length} article${_filteredArticles.length !== 1 ? 's' : ''}`;
  sentinel.style.display = _renderedCount < _filteredArticles.length ? '' : 'none';
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

function updateSubtitle() {}

/* ===== Fetch news ===== */
async function fetchNews(force = false) {
  errorState.style.display = 'none';
  emptyState.style.display = 'none';

  /* Show skeletons only on first load */
  if (allArticles.length === 0) {
    feed.innerHTML = [1, 2, 3].map(() => `
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
    const res  = await fetch('/api/news');
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    allArticles = data.articles;
    renderFeed();
    if (force) showToast('Feed refreshed');
  } catch (err) {
    feed.innerHTML = '';
    errorState.style.display = 'flex';
    errorMsg.textContent = err.message || 'Unable to connect to the server.';
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

/* ===== Range buttons ===== */
rangeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const d = Number(btn.dataset.days);
    if (d === activeDays) return;
    rangeBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeDays = d;
    updateSubtitle();
    renderFeed();
  });
});

/* ===== Region buttons ===== */
regionBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.region === activeRegion) return;
    regionBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeRegion = btn.dataset.region;
    updateSubtitle();
    renderFeed();
  });
});

/* ===== Retry button ===== */
retryBtn.addEventListener('click', () => fetchNews(true));

/* ===== Info modal ===== */
function openModal() {
  modalOverlay.style.display = 'flex';
  updateBodyScroll();
  modalClose.focus();
}

function closeModal() {
  modalOverlay.style.display = 'none';
  updateBodyScroll();
}

infoBtn.addEventListener('click', openModal);
modalClose.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });

/* ===== Keyboard shortcuts ===== */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (editorPinOverlay.style.display    !== 'none') { closePinModal();      return; }
    if (editorBrowseOverlay.style.display !== 'none') { closeBrowse();        return; }
    if (editorManageOverlay.style.display !== 'none') { closeEditorManage();  return; }
    if (editorLoginOverlay.style.display  !== 'none') { closeEditorLogin();   return; }
    if (modalOverlay.style.display        !== 'none') { closeModal();         return; }
  }
  /* Ctrl+Shift+E → toggle editor mode */
  if ((e.key === 'E' || e.key === 'e') && e.ctrlKey && e.shiftKey) {
    e.preventDefault();
    toggleEditorMode();
  }
});

/* ===== Sync main padding-top to sticky stack height ===== */
const stickyStack = document.getElementById('sticky-stack');
const mainEl      = document.querySelector('.main');

function syncPadding() {
  mainEl.style.paddingTop = (stickyStack.offsetHeight + 20) + 'px';
}

const resizeObserver = new ResizeObserver(syncPadding);
resizeObserver.observe(stickyStack);
syncPadding();

/* ===== Editor mode ===== */

function updateEditorCounts() {
  const p = curationData.pinned.length;
  const m = (curationData.manual || []).length;
  editorCounts.textContent = `${p} pinned · ${m} in feed`;
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
  renderFeed();
  showToast('Editor mode active · Ctrl+Shift+E to exit');
}

function exitEditorMode() {
  isEditorMode = false;
  editorBanner.style.display = 'none';
  renderFeed();
}

function toggleEditorMode() {
  if (isEditorMode) { exitEditorMode(); return; }
  if (editorToken)  { enterEditorMode(); } else { openEditorLogin(); }
}

/* ── Editor login modal ── */
function openEditorLogin() {
  editorLoginError.style.display = 'none';
  editorTokenInput.value = '';
  editorLoginOverlay.style.display = 'flex';
  updateBodyScroll();
  setTimeout(() => editorTokenInput.focus(), 60);
}

function closeEditorLogin() {
  editorLoginOverlay.style.display = 'none';
  updateBodyScroll();
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
editorExitBtn.addEventListener('click', () => { exitEditorMode(); showToast('Exited editor mode'); });
editorBrowseBtn.addEventListener('click', openBrowse);
editorManageBtn.addEventListener('click', openEditorManage);

/* ── Editor manage modal ── */
function openEditorManage() {
  renderEditorManage();
  editorManageOverlay.style.display = 'flex';
  updateBodyScroll();
}

function closeEditorManage() {
  editorManageOverlay.style.display = 'none';
  updateBodyScroll();
}

editorManageClose.addEventListener('click', closeEditorManage);
editorManageOverlay.addEventListener('click', e => { if (e.target === editorManageOverlay) closeEditorManage(); });

function renderEditorManage() {
  const pinned = curationData.pinned || [];
  const manual = curationData.manual || [];

  editorManageBody.innerHTML = `
    <section class="info-section">
      <h3 class="info-heading">Pinned (${pinned.length})</h3>
      ${pinned.length === 0
        ? '<p style="font-size:0.875rem;color:var(--text-muted)">No pinned articles.</p>'
        : pinned.map(p => `
          <div class="manage-row" data-url="${escHtml(p.url)}">
            <div class="manage-row-info">
              <div class="manage-row-title">${escHtml(p.title || p.url)}</div>
              <div class="manage-row-meta">${escHtml(p.source || '')}${p.note ? ` · <em>${escHtml(p.note)}</em>` : ''} · ${escHtml(REGION_LABELS[p.region] || 'Global')}</div>
            </div>
            <button class="editor-btn editor-unpin-btn manage-unpin-btn" data-url="${escHtml(p.url)}">Unpin</button>
          </div>`).join('')}
    </section>
    <section class="info-section">
      <h3 class="info-heading">In Feed (${manual.length})</h3>
      ${manual.length === 0
        ? '<p style="font-size:0.875rem;color:var(--text-muted)">No manually added articles.</p>'
        : manual.map(m => `
          <div class="manage-row" data-url="${escHtml(m.url)}">
            <div class="manage-row-info">
              <div class="manage-row-title">${escHtml(m.title || m.url)}</div>
              <div class="manage-row-meta">${escHtml(m.source || '')} · ${escHtml(REGION_LABELS[m.region] || 'Global')}</div>
            </div>
            <button class="editor-btn editor-remove-btn manage-remove-btn" data-url="${escHtml(m.url)}">Remove</button>
          </div>`).join('')}
    </section>`;

  editorManageBody.querySelectorAll('.manage-unpin-btn').forEach(btn => {
    btn.addEventListener('click', () => editorUnpin(btn.dataset.url));
  });
  editorManageBody.querySelectorAll('.manage-remove-btn').forEach(btn => {
    btn.addEventListener('click', () => editorRemoveManual(btn.dataset.url));
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

async function editorUnpin(url) {
  try {
    await curationRequest('DELETE', '/api/curation/pin', { url });
    curationData.pinned = curationData.pinned.filter(p => p.url !== url);
    updateEditorCounts();
    await fetchNews();
    if (editorManageOverlay.style.display !== 'none') renderEditorManage();
    showToast('Article unpinned');
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
}

async function editorRemoveManual(url) {
  try {
    await curationRequest('DELETE', '/api/curation/manual', { url });
    curationData.manual = (curationData.manual || []).filter(m => m.url !== url);
    updateEditorCounts();
    await fetchNews();
    if (editorManageOverlay.style.display !== 'none') renderEditorManage();
    showToast('Article removed from feed');
  } catch (err) {
    showToast(`Error: ${err.message}`);
  }
}

function updateArticleCount() {
  const cards = feed.querySelectorAll('.card:not(.card--removing)');
  articleCount.textContent = `${cards.length} article${cards.length !== 1 ? 's' : ''}`;
}

/* ===== Browse overlay ===== */

function openBrowse() {
  editorBrowseOverlay.style.display = 'flex';
  updateBodyScroll();
  fetchBrowse();
}

function closeBrowse() {
  editorBrowseOverlay.style.display = 'none';
  updateBodyScroll();
}

editorBrowseClose.addEventListener('click', closeBrowse);
editorBrowseOverlay.addEventListener('click', e => { if (e.target === editorBrowseOverlay) closeBrowse(); });

browseSortBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.browseSort === browseSortBy) return;
    browseSortBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    browseSortBy = btn.dataset.browseSort;
    fetchBrowse();
  });
});

browseDaysBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const d = Number(btn.dataset.browseDays);
    if (d === browseDays) return;
    browseDaysBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    browseDays = d;
    fetchBrowse();
  });
});

browseRegionBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.browseRegion === browseRegion) return;
    browseRegionBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    browseRegion = btn.dataset.browseRegion;
    fetchBrowse();
  });
});

async function fetchBrowse() {
  editorBrowseBody.innerHTML =
    '<p style="padding:20px;color:var(--text-muted);font-size:0.875rem">Loading…</p>';
  try {
    const params = new URLSearchParams({ sortBy: browseSortBy, days: browseDays, region: browseRegion });
    const res = await fetch(`/api/editor/browse?${params}`, {
      headers: { 'X-Editor-Token': editorToken },
    });

    if (res.status === 401) {
      editorToken = '';
      sessionStorage.removeItem('cj_editor_token');
      exitEditorMode();
      closeBrowse();
      showToast('Session expired. Please log in again.');
      return;
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    browseArticles = data.articles;
    renderBrowse();
  } catch (err) {
    editorBrowseBody.innerHTML =
      `<p style="padding:20px;color:#ef4444;font-size:0.875rem">Error: ${escHtml(err.message)}</p>`;
  }
}

function renderBrowse() {
  if (!browseArticles.length) {
    editorBrowseBody.innerHTML =
      '<p style="padding:20px;color:var(--text-muted);font-size:0.875rem">No articles found.</p>';
    return;
  }

  const pinnedUrls = new Set(curationData.pinned.map(p => p.url));
  const manualUrls = new Set((curationData.manual || []).map(m => m.url));

  editorBrowseBody.innerHTML = '';
  const frag = document.createDocumentFragment();

  browseArticles.forEach(article => {
    const isPinned = pinnedUrls.has(article.url);
    const isManual = manualUrls.has(article.url);

    const row = document.createElement('div');
    row.className = 'discovery-card';
    row.innerHTML = `
      <div class="discovery-card-info">
        <div class="discovery-card-meta">
          <span class="discovery-source">${escHtml(article.source)}</span>
          <span class="discovery-time">${timeAgo(article.publishedAt)}</span>
          <span class="category-badge">${escHtml(article.category)}</span>
        </div>
        <div class="discovery-card-title">${escHtml(article.title)}</div>
      </div>
      <div class="discovery-card-actions">
        ${isPinned
          ? '<span class="discovery-pinned-badge">✓ Pinned</span>'
          : isManual
            ? '<span class="discovery-pinned-badge">✓ In Feed</span>'
            : '<button class="editor-btn editor-pin-btn discovery-pin-btn">Pin</button>'}
      </div>`;

    if (!isPinned && !isManual) {
      row.querySelector('.discovery-pin-btn').addEventListener('click', () => showPinModal(article));
    }

    frag.appendChild(row);
  });

  editorBrowseBody.appendChild(frag);
}

/* ===== Pin modal ===== */

function showPinModal(article) {
  _pinModalArticle = article;
  editorPinArticleTitle.textContent = article.title;
  editorPinNote.value = '';
  editorPinRegion.value = 'global';
  editorPinError.style.display = 'none';
  editorPinOverlay.style.display = 'flex';
  updateBodyScroll();
  setTimeout(() => editorPinNote.focus(), 60);
}

function closePinModal() {
  editorPinOverlay.style.display = 'none';
  updateBodyScroll();
  _pinModalArticle = null;
}

async function submitPin() {
  const article = _pinModalArticle;
  if (!article) return;

  const note   = editorPinNote.value.trim();
  const region = editorPinRegion.value;

  editorPinSubmit.disabled = true;
  editorPinSubmit.textContent = 'Pinning…';
  editorPinError.style.display = 'none';

  try {
    await curationRequest('POST', '/api/curation/pin', {
      url:         article.url,
      title:       article.title,
      source:      article.source,
      author:      article.author,
      description: article.description,
      image:       article.image,
      publishedAt: article.publishedAt,
      readTime:    article.readTime,
      category:    article.category,
      note,
      region,
    });
    curationData.pinned.unshift({ ...article, note, region });
    updateEditorCounts();
    closePinModal();
    renderBrowse(); // refresh "✓ Pinned" badge in browse view
    await fetchNews();
    showToast('Article pinned to feed');
  } catch (err) {
    editorPinError.textContent = err.message;
    editorPinError.style.display = '';
  } finally {
    editorPinSubmit.disabled = false;
    editorPinSubmit.textContent = 'Pin Article';
  }
}

editorPinClose.addEventListener('click', closePinModal);
editorPinOverlay.addEventListener('click', e => { if (e.target === editorPinOverlay) closePinModal(); });
editorPinSubmit.addEventListener('click', submitPin);
editorPinNote.addEventListener('keydown', e => { if (e.key === 'Enter') submitPin(); });

/* ===== Infinite scroll ===== */
const scrollObserver = new IntersectionObserver(entries => {
  if (entries[0].isIntersecting) appendBatch();
}, { rootMargin: '300px' });
scrollObserver.observe(sentinel);

/* ===== Init ===== */
updateSubtitle();
fetchNews();
