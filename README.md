# ClimateJustice.news

[![CI](https://github.com/pjuxio/Climate-Justice-News/actions/workflows/ci.yml/badge.svg)](https://github.com/pjuxio/Climate-Justice-News/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Contributions welcome](https://img.shields.io/badge/contributions-welcome-brightgreen.svg)](CONTRIBUTING.md)

A curated climate justice news feed for the movement. Editors hand-pick articles from NewsAPI and publish them to a clean, filterable public feed. Visitors browse the curated selection — no algorithm, no noise.

**Live:** [climatejustice.news](https://climatejustice.news) · **Repo:** [github.com/pjuxio/Climate-Justice-News](https://github.com/pjuxio/Climate-Justice-News) · **Maintainer:** [@pjuxio](https://github.com/pjuxio)

---

## Stack

| Layer | Tech |
|---|---|
| Backend | Node.js · Express |
| Database | PostgreSQL (JSONB) |
| News source | [NewsAPI](https://newsapi.org) (`/v2/everything`) — editor only |
| Frontend | Vanilla HTML · CSS · JS (no build step) |
| Hosting | Heroku |

---

## How it works

### For visitors

The public feed shows only articles that an editor has pinned. Articles are filtered client-side by **date range**, **region**, and **category**. The feed loads 15 articles at a time with infinite scroll.

### For editors

Editors activate editor mode with **Ctrl+Shift+E** and enter their token. From there:

- **Browse** — opens a card-grid discovery view of live NewsAPI results. Editors browse by sort order, date range, and region.
- **Pin to feed** — clicking any card opens a modal to assign a region and optional editorial note before publishing to the public feed.
- **Manage** — view and remove currently pinned articles.

Pinned articles are stored in PostgreSQL and served instantly to all visitors.

---

## Project structure

```
.
├── server.js           # Express server — public feed, editor browse, curation endpoints
├── package.json
├── .env.example        # Environment variable template
├── .gitignore
└── public/
    ├── index.html      # App shell, filter controls, browse overlay, pin modal
    ├── style.css       # Design tokens, dark/light theme, all component styles
    └── app.js          # State management, fetch logic, card rendering, editor mode
```

---

## Getting started

### 1. Clone and install

```bash
git clone https://github.com/pjuxio/Climate-Justice-Feed.git
cd Climate-Justice-Feed
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env
```

Then edit `.env`:

```
NEWSAPI_KEY=your_newsapi_key
DATABASE_URL=your_postgres_connection_string
EDITOR_TOKEN=choose_a_secret_token
```

### 3. Run locally

```bash
npm run dev   # auto-restart on changes
# → http://localhost:3000
```

---

## API

### Public

| Endpoint | Description |
|---|---|
| `GET /api/news` | Returns the curated feed (merged pinned + manual articles, sorted by date) |
| `GET /api/curation` | Returns current curation state `{ pinned[], manual[] }` |

### Editor (`X-Editor-Token` header required)

| Endpoint | Description |
|---|---|
| `GET /api/editor/browse` | NewsAPI discovery (params: `sortBy`, `days`, `region`, `force`) |
| `POST /api/curation/pin` | Pin article (full article data + `region` + optional `note`) |
| `DELETE /api/curation/pin` | Unpin article by URL |
| `POST /api/curation/manual` | Add article by URL (server fetches metadata) |
| `DELETE /api/curation/manual` | Remove manual article by URL |

---

## Article categories

Articles are categorised server-side by scanning headlines and descriptions:

| Category | Keywords |
|---|---|
| Policy | legislation, law, government, bill, regulation, COP |
| Community | community, grassroots, activist, protest, movement, indigenous |
| Science | research, study, data, report, temperature, emission |
| Environment | ecosystem, biodiversity, nature, ocean, forest, wildlife |
| General | everything else |

---

## Deployment

### Heroku

```bash
heroku git:remote -a your-app-name
heroku config:set NEWSAPI_KEY=your_key
heroku config:set DATABASE_URL=your_postgres_url
heroku config:set EDITOR_TOKEN=your_secret_token
git push heroku main
```

### Cache busting

Static assets are cached for 24 hours. On each deploy, the server reads the current git commit hash and injects it as a `?v=<hash>` query string into the `app.js` and `style.css` references in `index.html`, so browsers always load fresh assets after a deploy.

### Custom domain

1. In Heroku Dashboard → **Settings → Domains**, add `climatejustice.news` and `www.climatejustice.news`
2. At your registrar:
   - `CNAME www → your-app.herokudns.com`
   - `ALIAS` / `ANAME` apex `@` → same target *(or use Cloudflare for CNAME flattening)*

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `NEWSAPI_KEY` | Yes | NewsAPI.org API key |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `EDITOR_TOKEN` | No | Secret token for editor curation mode |
| `PORT` | No | Server port (default: `3000`) |

---

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) to get started, and review the [Code of Conduct](CODE_OF_CONDUCT.md) before participating.

- Bug reports → [open an issue](https://github.com/pjuxio/Climate-Justice-News/issues/new/choose)
- Feature requests → [open an issue](https://github.com/pjuxio/Climate-Justice-News/issues/new/choose)
- Code → fork, branch, PR against `main`

---

## License

[MIT](LICENSE) © pjuxio
