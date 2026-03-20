require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { execSync } = require('child_process');
const rateLimit = require('express-rate-limit');
const compression = require('compression');

// Cache-busting version string — use git commit hash if available, else timestamp
let ASSET_VERSION;
try {
  ASSET_VERSION = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString().trim();
} catch {
  ASSET_VERSION = Date.now().toString(36);
}

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.NEWSAPI_KEY;
const EDITOR_TOKEN = process.env.EDITOR_TOKEN;

// ─── Postgres: curation persistence ───────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS curation (
      id   INT  PRIMARY KEY DEFAULT 1,
      hidden JSONB NOT NULL DEFAULT '[]',
      pinned JSONB NOT NULL DEFAULT '[]',
      manual JSONB NOT NULL DEFAULT '[]'
    )
  `);
  // Add manual column if it doesn't exist (migration for existing DBs)
  await pool.query(`
    ALTER TABLE curation ADD COLUMN IF NOT EXISTS manual JSONB NOT NULL DEFAULT '[]'
  `);
  await pool.query(`INSERT INTO curation (id) VALUES (1) ON CONFLICT DO NOTHING`);
}

async function loadCuration() {
  const { rows } = await pool.query('SELECT hidden, pinned, manual FROM curation WHERE id = 1');
  return {
    hidden: Array.isArray(rows[0]?.hidden) ? rows[0].hidden : [],
    pinned: Array.isArray(rows[0]?.pinned)
      ? rows[0].pinned.map(p => ({ ...p, region: p.region || 'global' })) : [],
    manual: Array.isArray(rows[0]?.manual)
      ? rows[0].manual.map(m => ({ ...m, region: m.region || 'global' })) : [],
  };
}

async function saveCuration(data) {
  await pool.query(
    'UPDATE curation SET hidden = $1, pinned = $2, manual = $3 WHERE id = 1',
    [JSON.stringify(data.hidden), JSON.stringify(data.pinned), JSON.stringify(data.manual)]
  );
}

let curation = { hidden: [], pinned: [], manual: [] }; // populated in start()

// Build the public feed from curated content only: pinned first, then manual, sorted by date.
function buildPublicFeed() {
  const pinned = curation.pinned.map((p, i) => ({ ...p, id: `pinned-${i}`, pinned: true }));
  const manual = curation.manual.map((m, i) => ({ ...m, id: `manual-${i}`, manual: true }));
  return [...pinned, ...manual].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
}

// Per-param cache: key = `${sortBy}_${days}_${region}`
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Evict stale entries so they don't linger in memory indefinitely
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now - entry.timestamp >= CACHE_TTL) cache.delete(key);
  }
}, CACHE_TTL);

// Core climate justice search terms (kept under ~320 chars so regional AND clauses stay within NewsAPI's 500-char query limit)
const BASE_QUERY =
  '"climate justice" OR "environmental justice" OR "climate equity" OR "climate racism" OR "just transition" ' +
  'OR "climate policy" OR "fossil fuels" OR "environmental law" OR "carbon tax" OR "COP29" OR "COP30" OR "COP31" OR "climate summit" ' +
  'OR "data center permitting" OR "data center approval" OR "data center controversy" OR "toxic pollution"';

// Geographic focus terms appended with AND to narrow results by region.
// null = no regional restriction (global).
const REGION_TERMS = {
  global:   null,
  americas: '"North America" OR "Latin America" OR "South America" OR "United States" OR Canada OR Mexico OR Brazil OR Colombia OR Caribbean OR "Indigenous peoples"',
  africa:   'Africa OR Nigeria OR Kenya OR Ghana OR "South Africa" OR Ethiopia OR Uganda OR Mozambique OR Senegal OR "Sub-Saharan" OR "African continent"',
  asia:     'Asia OR India OR Bangladesh OR Philippines OR Indonesia OR Pakistan OR "Pacific Islands" OR "Southeast Asia" OR China OR "Global South"',
  europe:   'Europe OR "European Union" OR EU OR Britain OR Germany OR France OR "United Kingdom" OR Poland OR "climate litigation"',
  mena:     '"Middle East" OR MENA OR "North Africa" OR Egypt OR Morocco OR Jordan OR Lebanon OR "Arab world" OR "Gulf states"',
};

// Domains blocked from appearing in the feed.
const BLOCKED_DOMAINS = ['freerepublic.com', 'wattsupwiththat.com', 'dailysignal.com', 'globenewswire.com'];

// NewsAPI supports multiple comma-separated languages.
// For all regions we stay in English; going broader (es, fr, pt, ar) would
// require translation UI — add as a future enhancement.
const VALID_REGIONS = Object.keys(REGION_TERMS);

// Reject non-http(s) URLs to prevent javascript: / data: injection via API data
function isSafeUrl(url) {
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:';
  } catch { return false; }
}

function buildQuery(region) {
  const geo = REGION_TERMS[region];
  return geo ? `(${BASE_QUERY}) AND (${geo})` : BASE_QUERY;
}

function getDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

function estimateReadTime(text) {
  if (!text) return 1;
  const words = text.trim().split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 200));
}

function normalizeArticle(article, index) {
  return {
    id: index,
    title: article.title || 'Untitled',
    source: article.source?.name || 'Unknown Source',
    author: article.author || null,
    description: article.description || '',
    url: isSafeUrl(article.url) ? article.url : null,
    image: article.urlToImage && isSafeUrl(article.urlToImage) ? article.urlToImage : null,
    publishedAt: article.publishedAt,
    readTime: estimateReadTime((article.description || '') + ' ' + (article.content || '')),
  };
}

function categorize(article) {
  const text = (article.title + ' ' + article.description).toLowerCase();
  if (/policy|legislation|law|government|bill|act|regulation|cop\d/i.test(text)) return 'Policy';
  if (/communit|grassroot|activist|protest|movement|people|indigenous/i.test(text)) return 'Community';
  if (/science|research|study|data|report|scientist|temperature|emission/i.test(text)) return 'Science';
  if (/environment|ecosystem|biodiversity|nature|ocean|forest|wildlife/i.test(text)) return 'Environment';
  return 'General';
}

// Trust Heroku's load balancer so express-rate-limit can read the real client IP
app.set('trust proxy', 1);

// Gzip / deflate all responses
app.use(compression());

// Parse JSON bodies (needed for curation POST/DELETE endpoints).
// 10 KB limit prevents oversized-payload DoS on curation endpoints.
app.use(express.json({ limit: '10kb' }));

// Security headers
app.use((req, res, next) => {
  res.removeHeader('X-Powered-By');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'no-referrer-when-downgrade');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' https://www.googletagmanager.com 'sha256-GElfI/oqheGeYw+g3Ms5tafL8q8npSlt5mjW9zr7Aus='",
      "style-src 'self' https://fonts.googleapis.com 'unsafe-inline'",
      "font-src 'self' https://fonts.gstatic.com",
      // Article images can originate from any publisher domain; Google S2 serves favicons
      "img-src 'self' https://www.google.com data: blob: *",
      "connect-src 'self' https://www.google-analytics.com https://analytics.google.com",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  );
  next();
});

// Rate limiting: max 30 requests per IP per minute on the API
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait before refreshing again.' },
});
app.use('/api/', apiLimiter);

// Editor auth: validates X-Editor-Token header against EDITOR_TOKEN env var.
// Uses crypto.timingSafeEqual to prevent timing-based token enumeration attacks.
function editorAuth(req, res, next) {
  if (!EDITOR_TOKEN) {
    return res.status(503).json({ error: 'Editor mode is not configured. Set EDITOR_TOKEN in .env.' });
  }
  const token = req.headers['x-editor-token'];
  if (
    !token ||
    token.length !== EDITOR_TOKEN.length ||
    !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(EDITOR_TOKEN))
  ) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// index.html must not be cached so users always receive the latest deploy.
// Inject ?v= query string on app.js and style.css to bust browser caches on deploy.
const INDEX_HTML_PATH = path.join(__dirname, 'public', 'index.html');
let _indexHtmlCache = null;
function getIndexHtml() {
  if (!_indexHtmlCache) {
    _indexHtmlCache = fs.readFileSync(INDEX_HTML_PATH, 'utf8')
      .replace('href="style.css"', `href="style.css?v=${ASSET_VERSION}"`)
      .replace('src="app.js"', `src="app.js?v=${ASSET_VERSION}"`);
  }
  return _indexHtmlCache;
}
app.get('/', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(getIndexHtml());
});

// Serve other static assets (JS, CSS, images) with a 24-hour cache
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  etag: true,
  index: false, // handled explicitly above
}));

// Structured audit log for every editor mutation (hide/pin/unpin/unhide).
// Logs to stdout so they appear in Heroku logs and any log-drain integrations.
function auditLog(req, action, url) {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  console.log(JSON.stringify({ audit: true, action, url, ip, ts: new Date().toISOString() }));
}

// ─── Curation API ─────────────────────────────────────────────────────────────

// Token verification — returns 200 if the token is valid, 401 otherwise.
// Allows the frontend to confirm credentials without any write side-effects.
app.get('/api/curation/verify', editorAuth, (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true });
});

// Public: read current curation state (frontend loads this to show badges/counts)
app.get('/api/curation', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ pinned: curation.pinned, manual: curation.manual });
});

// Pin an article — stores full article data so it always appears at the top
app.post('/api/curation/pin', editorAuth, async (req, res) => {
  const { url, title, source, author, description, image, publishedAt, readTime, category, note, region } = req.body;
  if (!url || !isSafeUrl(url)) return res.status(400).json({ error: 'Invalid URL' });
  auditLog(req, 'pin', url);
  if (!curation.pinned.find(p => p.url === url)) {
    curation.pinned.unshift({
      url,
      title: String(title || '').slice(0, 500),
      source: String(source || '').slice(0, 200),
      author: author ? String(author).slice(0, 200) : null,
      description: String(description || '').slice(0, 2000),
      image: image && isSafeUrl(image) ? image : null,
      publishedAt: (publishedAt && !isNaN(Date.parse(publishedAt)))
        ? new Date(publishedAt).toISOString()
        : new Date().toISOString(),
      readTime: Math.min(Math.max(Number(readTime) || 1, 1), 60),
      category: ['Policy', 'Community', 'Science', 'Environment', 'General'].includes(category)
        ? category : 'General',
      note: String(note || '').slice(0, 500),
      region: VALID_REGIONS.includes(region) ? region : 'global',
      pinnedAt: new Date().toISOString(),
    });
    await saveCuration(curation);
  }
  res.json({ ok: true });
});

// Unpin an article
app.delete('/api/curation/pin', editorAuth, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });
  auditLog(req, 'unpin', url);
  curation.pinned = curation.pinned.filter(p => p.url !== url);
  await saveCuration(curation);
  res.json({ ok: true });
});

// Add a manual article — appears in feed sorted by date (not pinned)
app.post('/api/curation/manual', editorAuth, async (req, res) => {
  const { url, title, source, author, description, image, publishedAt, readTime, category, region } = req.body;
  if (!url || !isSafeUrl(url)) return res.status(400).json({ error: 'Invalid URL' });
  if (!curation.manual.find(m => m.url === url)) {
    curation.manual.push({
      url,
      title: String(title || '').slice(0, 500),
      source: String(source || '').slice(0, 200),
      author: author ? String(author).slice(0, 200) : null,
      description: String(description || '').slice(0, 2000),
      image: image && isSafeUrl(image) ? image : null,
      publishedAt: publishedAt || new Date().toISOString(),
      readTime: Math.min(Math.max(Number(readTime) || 1, 1), 60),
      category: ['Policy', 'Community', 'Science', 'Environment', 'General'].includes(category)
        ? category : 'General',
      region: VALID_REGIONS.includes(region) ? region : 'global',
      addedAt: new Date().toISOString(),
    });
    await saveCuration(curation);
  }
  res.json({ ok: true });
});

// Remove a manual article
app.delete('/api/curation/manual', editorAuth, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required' });
  curation.manual = curation.manual.filter(m => m.url !== url);
  await saveCuration(curation);
  res.json({ ok: true });
});

// ─── Public feed ──────────────────────────────────────────────────────────────

// Returns the curated feed (pinned + manual). Filtering by date/region/category
// is done client-side since the full corpus is small.
app.get('/api/news', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ articles: buildPublicFeed() });
});

// ─── Editor discovery (NewsAPI browse) ────────────────────────────────────────

// Editor-only: fetch live NewsAPI results for curation discovery.
app.get('/api/editor/browse', editorAuth, async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({ error: 'News service is not configured.' });
  }

  const sortBy = ['popularity', 'publishedAt'].includes(req.query.sortBy)
    ? req.query.sortBy : 'popularity';
  const days = [1, 3, 7, 30].includes(Number(req.query.days))
    ? Number(req.query.days) : 7;
  const region = VALID_REGIONS.includes(req.query.region)
    ? req.query.region : 'global';
  const force = req.query.force === '1';

  const cacheKey = `${sortBy}_${days}_${region}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);

  if (!force && cached && now - cached.timestamp < CACHE_TTL) {
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ articles: cached.data, cached: true });
  }

  const controller = new AbortController();
  const fetchTimeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const q = buildQuery(region);
    const from = getDaysAgo(days);
    const url =
      `https://newsapi.org/v2/everything` +
      `?q=${encodeURIComponent(q)}` +
      `&language=en` +
      `&sortBy=${sortBy}` +
      `&from=${from}` +
      `&pageSize=100`;

    const response = await fetch(url, {
      headers: { 'X-Api-Key': API_KEY },
      signal: controller.signal,
    });
    clearTimeout(fetchTimeout);
    const data = await response.json();

    if (data.status !== 'ok') {
      console.error('NewsAPI error:', data.message);
      return res.status(502).json({ error: 'Unable to fetch news at this time. Please try again.' });
    }

    const articles = data.articles
      .filter(a => a.title && a.title !== '[Removed]' && a.url)
      .filter(a => !BLOCKED_DOMAINS.some(d => a.url.includes(d)))
      .map(normalizeArticle)
      .filter(a => a.url)
      .map(a => ({ ...a, category: categorize(a) }));

    cache.set(cacheKey, { data: articles, timestamp: now });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ articles, cached: false });
  } catch (err) {
    clearTimeout(fetchTimeout);
    if (err.name === 'AbortError') {
      console.error('NewsAPI fetch timed out');
      return res.status(504).json({ error: 'News service request timed out. Please try again.' });
    }
    console.error('NewsAPI fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch news. Please try again.' });
  }
});

async function start() {
  await initDb();
  curation = await loadCuration();
  app.listen(PORT, () => {
    console.log(`\n  Climate Justice Newsfeed running at http://localhost:${PORT}\n`);
    if (!API_KEY)      console.warn('  WARNING: NEWSAPI_KEY not set. Create a .env file with your key.\n');
    if (!EDITOR_TOKEN) console.warn('  NOTE: EDITOR_TOKEN not set. Editor curation mode is disabled.\n');
  });
}

start().catch(err => { console.error('Failed to start:', err); process.exit(1); });
