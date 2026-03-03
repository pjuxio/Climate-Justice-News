# Claude Context: ClimateJustice.news

A climate justice news aggregator that pulls articles from NewsAPI and displays them in a social media-style card feed with filtering, sorting, and editorial curation capabilities.

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
│  - Proxies NewsAPI with caching (5min TTL)                      │
│  - Serves static files                                          │
│  - Manages curation state (pin/hide articles)                   │
│  - Rate limiting: 30 req/min per IP                             │
└─────────────────────────────────────────────────────────────────┘
                              │
               ┌──────────────┴──────────────┐
               ▼                              ▼
┌──────────────────────────┐    ┌──────────────────────────┐
│       NewsAPI            │    │       PostgreSQL         │
│   /v2/everything         │    │   curation table         │
│   (external)             │    │   {hidden[], pinned[]}   │
└──────────────────────────┘    └──────────────────────────┘
```

## Key Files

| File | Purpose |
|------|---------|
| `server.js` | Express backend — API proxy, curation endpoints, static serving |
| `public/app.js` | Frontend state, fetch logic, DOM rendering, editor mode |
| `public/index.html` | App shell, filter controls, modals |
| `public/style.css` | CSS custom properties, dark/light themes, all component styles |

## Data Flow

1. **Fetch**: Frontend calls `/api/news?sortBy=X&days=Y&region=Z`
2. **Cache check**: Server checks in-memory cache (keyed by params, 5min TTL)
3. **NewsAPI**: On cache miss, fetches from NewsAPI with search query
4. **Process**: Filter removed/blocked → `normalizeArticle()` → `categorize()`
5. **Curate**: `applyCuration()` removes hidden URLs, prepends pinned articles
6. **Render**: Frontend renders cards via `createCard()` DOM builder

## API Endpoints

### Public
- `GET /api/news` — Fetch articles (params: `sortBy`, `days`, `region`, `force`)
- `GET /api/curation` — Get current curation state (hidden/pinned arrays)

### Editor (requires `X-Editor-Token` header)
- `POST /api/curation/hide` — Hide article by URL
- `DELETE /api/curation/hide` — Unhide article
- `POST /api/curation/pin` — Pin article (with full article data + optional note)
- `DELETE /api/curation/pin` — Unpin article

## Frontend State (app.js globals)

```javascript
let allArticles = [];           // Current feed data
let activeFilter = 'All';       // Category filter: All|Policy|Community|Science|Environment|General
let activeSortBy = 'popularity'; // Sort: popularity|publishedAt
let activeDays = 7;             // Range: 1|3|7|30
let activeRegion = 'global';    // Region: global|americas|africa|asia|europe|mena
let bookmarks = new Set();      // Client-side saved articles (localStorage)
let picksFilterActive = false;  // Show only Editor's picks

// Editor mode
let isEditorMode = false;
let editorToken = '';           // Stored in sessionStorage
let curationData = { hidden: [], pinned: [] };
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
- Editor token via `X-Editor-Token` header, validated by `editorAuth` middleware

## Adding Features

### New API endpoint
Add in `server.js` after security middleware, before `start()`:
```javascript
app.get('/api/new-endpoint', async (req, res) => {
  // Use editorAuth middleware for protected routes
});
```

### New filter/control
1. Add button in `index.html` controls-bar with `data-*` attribute
2. Add state variable and event handler in `app.js`
3. Wire to `fetchNews()` params (server-side) or `renderFeed()` filter (client-side)

### New article field
1. Add to `normalizeArticle()` in `server.js`
2. Update `createCard()` template in `app.js`

### New region
1. Add to `REGION_TERMS` in `server.js`
2. Add button with `data-region="key"` in `index.html`
3. Add label to `REGION_LABELS` in `app.js`

## Curation System

Editor mode is activated with `Ctrl+Shift+E`:

- **Pinned articles**: Stored with full article data, appear at feed top with "Editor's pick" badge
- **Hidden articles**: Just URLs, filtered out server-side
- Changes persist immediately to PostgreSQL via `saveCuration()`

```javascript
// Curation data structure
curation = {
  hidden: ['https://example.com/article-to-hide'],
  pinned: [{
    url, title, source, author, description, image,
    publishedAt, readTime, category, note, pinnedAt
  }]
}
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEWSAPI_KEY` | Yes | NewsAPI.org API key |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `EDITOR_TOKEN` | No | Token for editor curation mode |
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
- **Error handling** — Show toast for user feedback, log details to console

## Search Query Structure

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

Server-side categorization via `categorize()` based on keyword patterns:

| Category | Keywords |
|----------|----------|
| Policy | legislation, law, government, bill, regulation, COP |
| Community | community, grassroots, activist, protest, movement, indigenous |
| Science | research, study, data, report, temperature, emission |
| Environment | ecosystem, biodiversity, nature, ocean, forest, wildlife |
| General | everything else |
