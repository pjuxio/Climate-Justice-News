# Copilot Instructions: ClimateJustice.news

## Architecture Overview

A climate justice news aggregator with three layers:
- **Express backend** ([server.js](../server.js)) — proxies NewsAPI, serves static files, manages curation state
- **Vanilla frontend** ([public/](../public/)) — no build step, state in `app.js`, styles in `style.css`
- **PostgreSQL** — persists editor curation (pinned/hidden articles) via `curation` table

Data flow: Frontend → `/api/news` → NewsAPI (cached 5min) → `applyCuration()` filters → client render

## Key Patterns

### Security (CRITICAL)
- **URL validation**: Always use `isSafeUrl(url)` before rendering URLs to prevent `javascript:` injection
- **HTML escaping**: Use `escHtml()` in frontend for all user/API-sourced strings
- **API keys**: Pass via headers (`X-Api-Key`), never query strings
- **Editor auth**: Token in `X-Editor-Token` header, validated by `editorAuth` middleware

### Curation System
Editor mode (Ctrl+Shift+E) allows pinning/hiding articles:
```js
// Pinned articles appear at feed top with "Curated" badge
curation.pinned = [{ url, title, source, note, ... }]
// Hidden articles are filtered out server-side
curation.hidden = ["https://example.com/article"]
```
Changes persist to Postgres immediately via `saveCuration()`.

### Article Processing Pipeline
1. Fetch from NewsAPI → filter removed/blocked → `normalizeArticle()` → `categorize()` → cache
2. At serve-time: `applyCuration()` merges pinned articles and removes hidden ones

### Frontend State
Global state variables in `app.js`:
- `allArticles`, `activeFilter`, `activeSortBy`, `activeDays`, `activeRegion`
- `isEditorMode`, `editorToken`, `curationData`

Cards render via `createCard(article)` returning a DOM element with event handlers attached.

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Start with --watch (auto-restart)
npm start            # Production start
```

Required env vars: `NEWSAPI_KEY`, `DATABASE_URL`, `EDITOR_TOKEN` (optional)

## Conventions

- **No TypeScript/transpilation** — vanilla JS only, ES2020+ features OK
- **Single-file components** — CSS in `style.css`, JS in `app.js`
- **CSS custom properties** — theme via `--bg`, `--accent`, etc. in `:root` / `[data-theme="light"]`
- **Rate limiting** — 30 req/min per IP on `/api/*` routes

## Adding Features

### New API endpoint
Add in `server.js` after security middleware, before `start()`. Use `editorAuth` for protected routes.

### New filter/control
1. Add button in `index.html` controls-bar
2. Add state variable and handler in `app.js`
3. Wire to `fetchNews()` params if server-side, or `renderFeed()` filter if client-side

### New article field
1. Add to `normalizeArticle()` in `server.js`
2. Update `createCard()` template in `app.js`
