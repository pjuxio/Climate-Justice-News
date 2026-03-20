# Claude Context: ClimateJustice.news

A climate justice news feed with editorial curation at its core. Public users see only a hand-picked feed of articles stored in PostgreSQL. Editors use a private Browse overlay to discover articles from NewsAPI and pin them to the feed.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (public/)                       │
│  index.html ─ app.js ─ style.css                                │
│  Vanilla JS, no build step, ES2020+                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                         fetch /api/*
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Express Backend (server.js)                  │
│  - Public feed: returns curated articles from DB only           │
│  - Editor browse: proxies NewsAPI (5min cache, editor-only)     │
│  - Serves static files with cache-busting (git hash ?v=)        │
│  - Rate limiting: 30 req/min per IP                             │
└─────────────────────────────────────────────────────────────────┘
                              │
               ┌──────────────┴──────────────┐
               ▼                              ▼
┌──────────────────────────┐    ┌──────────────────────────┐
│       NewsAPI            │    │       PostgreSQL         │
│   /v2/everything         │    │   curation table         │
│   (editor Browse only)   │    │   {pinned[], manual[]}   │
└──────────────────────────┘    └──────────────────────────┘
```

## Key Files

| File | Purpose |
|------|---------|
| `server.js` | Express backend — public feed, editor browse, curation endpoints, static serving |
| `public/app.js` | Frontend state, fetch logic, DOM rendering, editor mode, browse overlay |
| `public/index.html` | App shell, filter controls, browse overlay, pin modal, info modal |
| `public/style.css` | CSS custom properties, dark/light themes, all component styles |

## Data Flow

### Public feed
1. Frontend calls `GET /api/news`
2. Server reads `curation.pinned` and `curation.manual` from in-memory state (loaded from PostgreSQL)
3. Merges and sorts by `publishedAt` descending → `buildPublicFeed()`
4. Frontend renders cards via `createCard()`, 15 at a time (infinite scroll)
5. Client-side filters (date range, region, category) applied in `renderFeed()`

### Editor browse
1. Editor opens Browse overlay, calls `GET /api/editor/browse` with `X-Editor-Token`
2. Server fetches from NewsAPI (5min in-memory cache per params)
3. Articles normalised and categorised server-side
4. Frontend renders as card grid; already-pinned/manual articles show a badge
5. Editor clicks "Pin to feed" → pin modal → `POST /api/curation/pin` with region + note

## API Endpoints

### Public
- `GET /api/news` — Returns merged pinned + manual articles sorted by date
- `GET /api/curation` — Returns `{ pinned[], manual[] }` curation state

### Editor (requires `X-Editor-Token` header)
- `GET /api/editor/browse` — NewsAPI discovery (params: `sortBy`, `days`, `region`, `force`)
- `POST /api/curation/pin` — Pin article (full article data + region + optional note)
- `DELETE /api/curation/pin` — Unpin article by URL
- `POST /api/curation/manual` — Add article manually (URL only, server fetches metadata)
- `DELETE /api/curation/manual` — Remove manual article by URL

## Frontend State (app.js globals)

```javascript
// Public feed
let allArticles = [];           // Full curated corpus from server
let activeFilter = 'All';       // Category: All|Policy|Community|Science|Environment|General
let activeRegion = 'global';    // Region filter: global|americas|africa|asia|europe|mena
let activeDays = 0;             // Date range: 0=All|1|3|7|30
let bookmarks = new Set();      // Client-side saved articles (localStorage)

// Infinite scroll
const PAGE_SIZE = 15;
let _filteredArticles = [];     // Articles after client-side filtering
let _renderedCount = 0;         // How many have been rendered so far

// Editor mode
let isEditorMode = false;
let editorToken = '';           // Stored in sessionStorage
let curationData = { pinned: [], manual: [] };

// Browse overlay
let browseArticles = [];
let browseSortBy = 'popularity';
let browseDays = 7;
let browseRegion = 'global';
let _pinModalArticle = null;    // Article staged for pinning
```

## Security Patterns

### Always validate URLs
```javascript
// Use isSafeUrl() before rendering any URL
function isSafeUrl(url) {
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:';
  } catch { return false; }
}
```

### Always escape HTML
```javascript
// Use escHtml() for all user/API-sourced strings in the frontend
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
```

### API key security
- Pass via `X-Api-Key` header to NewsAPI (never query strings)
- Editor token via `X-Editor-Token` header, validated by `editorAuth` middleware using `crypto.timingSafeEqual`

## Cache Busting

Static assets (`app.js`, `style.css`) are served with a 1-day cache. On each deploy, `server.js` reads the current git commit hash at startup and injects it as `?v=<hash>` into the script/link tags when serving `index.html`. This guarantees browsers load fresh assets after every deploy without disabling caching between deploys.

```javascript
// In server.js at startup:
ASSET_VERSION = execSync('git rev-parse --short HEAD').toString().trim();
// index.html served with replacements:
// href="style.css" → href="style.css?v=abc1234"
// src="app.js"    → src="app.js?v=abc1234"
```

## Adding Features

### New API endpoint
Add in `server.js` after security middleware, before `start()`:
```javascript
app.get('/api/new-endpoint', async (req, res) => {
  // Use editorAuth middleware for protected routes
});
```

### New client-side filter
1. Add button in `index.html` controls-bar with `data-*` attribute
2. Add state variable and event handler in `app.js`
3. Apply filter logic inside `renderFeed()` — do not call `fetchNews()` for curated-feed filters

### New article field
1. Add to `normalizeArticle()` in `server.js`
2. Update `createCard()` template in `app.js`

### New region
1. Add to `REGION_TERMS` in `server.js` (used by editor Browse)
2. Add button with `data-region="key"` in `index.html` (public filter bar + browse controls)
3. Add label to `REGION_LABELS` in `app.js`
4. Ensure `VALID_REGIONS` in `server.js` includes the new key (used for validation on pin)

## Curation System

Editor mode is activated with **Ctrl+Shift+E**.

- **Pinned articles**: Discovered via Browse overlay, stored with full metadata + region + optional editor note
- **Manual articles**: Added by URL, server fetches metadata automatically
- **No hidden list** — articles are simply not pinned; there is no blocklist
- Changes persist immediately to PostgreSQL via `saveCuration()`

```javascript
// Curation data structure (PostgreSQL JSONB)
curation = {
  pinned: [{
    url, title, source, author, description, image,
    publishedAt, readTime, category, region, note, pinnedAt
  }],
  manual: [{
    url, title, source, author, description, image,
    publishedAt, readTime, category, region, addedAt
  }]
}
```

### Browse overlay (editor only)
- Opened via the **Browse** button in the editor banner
- Shows NewsAPI results as a responsive card grid (same visual style as the public feed)
- Articles already in `pinned` or `manual` show a "✓ Pinned" / "✓ In Feed" badge
- Clicking "Pin to feed" opens the pin modal where the editor assigns a region and optional note

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEWSAPI_KEY` | Yes | NewsAPI.org API key |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `EDITOR_TOKEN` | No | Token for editor curation mode (Ctrl+Shift+E) |
| `PORT` | No | Server port (default: 3000) |

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Start with --watch (auto-restart)
npm start            # Production start
```

## Conventions

- **No TypeScript/transpilation** — Vanilla JS only, ES2020+ features OK
- **Single-file components** — CSS in `style.css`, JS in `app.js`
- **CSS custom properties** — Theme via `--bg`, `--accent`, etc. in `:root` / `[data-theme="light"]`
- **DOM building** — `createCard()` returns DOM elements with event handlers attached (not innerHTML strings)
- **Client-side filtering** — All feed filters (date, region, category) run in `renderFeed()`, not as server params. The full curated corpus is small enough to filter in-browser.
- **Infinite scroll** — `appendBatch()` renders PAGE_SIZE (15) articles at a time; `IntersectionObserver` on `#feed-sentinel` triggers the next batch
- **Error handling** — Show toast for user feedback, log details to console

## Search Query Structure (editor Browse / NewsAPI)

Base query (always included):
```
"climate justice" OR "environmental justice" OR "climate equity"
OR "climate racism" OR "just transition" OR "climate policy"
OR "fossil fuels" OR "environmental law" OR "carbon tax"
OR "COP29" OR "COP30" OR "COP31" OR "climate summit"
OR "data center permitting" OR "data center approval"
OR "data center controversy" OR "toxic pollution"
```

Regional focus (ANDed when region ≠ global):
```
(base query) AND (Africa OR Nigeria OR Kenya OR ...)
```

## Article Categories

Server-side categorisation via `categorize()` based on keyword patterns:

| Category | Keywords |
|----------|----------|
| Policy | legislation, law, government, bill, regulation, COP |
| Community | community, grassroots, activist, protest, movement, indigenous |
| Science | research, study, data, report, temperature, emission |
| Environment | ecosystem, biodiversity, nature, ocean, forest, wildlife |
| General | everything else |
