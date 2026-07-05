# JobAgent Backend

Autonomous job search backend for Juwon's JobAgent.  
Scrapes real job postings from 5 boards, deduplicates, stores in SQLite, and serves a REST API to the React frontend. Runs on a weekday 9am cron.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Node.js Backend                     │
│                                                      │
│  Cron (Mon–Fri 9am)                                  │
│       │                                              │
│       ▼                                              │
│  ┌──────────────────────────────────────────────┐   │
│  │              Scrapers (parallel)              │   │
│  │  RemoteOK  WWR  LinkedIn  Indeed  Greenhouse  │   │
│  └──────────────────────┬───────────────────────┘   │
│                         ▼                            │
│              SQLite DB (jobs.db)                     │
│              - deduplication                         │
│              - applied tracking                      │
│                         │                            │
│              REST API (Express)                      │
│              GET  /api/jobs                          │
│              GET  /api/status                        │
│              POST /api/scrape                        │
│              POST /api/jobs/:id/applied              │
└─────────────────────────┬───────────────────────────┘
                          │ HTTP
                          ▼
               React Frontend (job-agent.jsx)
               - Search → Review → Tailor → Apply
               - Claude API for resume tailoring
```

---

## Quick Start (Local)

### Prerequisites
- Node.js 18+
- npm

### 1. Install dependencies
```bash
cd jobagent-backend
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env if needed — defaults work for local dev
```

### 3. Start the server
```bash
npm start
# or for auto-reload during development:
npm run dev
```

Server starts at **http://localhost:3001**

### 4. Test it
```bash
# Health check
curl http://localhost:3001/api/status

# Trigger a manual scrape (runs in background ~30–60s)
curl -X POST http://localhost:3001/api/scrape

# Fetch fresh jobs (after scrape completes)
curl http://localhost:3001/api/jobs
```

### 5. Connect the frontend
In `frontend/job-agent.jsx`, set:
```js
const BACKEND_URL = "http://localhost:3001";
```
Then paste the file into your Claude artifact or React app.

---

## Deploy to Railway (Recommended — Free Tier)

Railway gives you a persistent server that runs 24/7, perfect for the 9am cron.

### Steps

1. **Push to GitHub**
```bash
git init
git add .
git commit -m "JobAgent backend"
git remote add origin https://github.com/YOUR_USERNAME/jobagent-backend.git
git push -u origin main
```

2. **Create Railway project**
   - Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
   - Select your `jobagent-backend` repo
   - Railway auto-detects Node.js via `railway.toml`

3. **Set environment variables in Railway dashboard**
   ```
   PORT=3001
   SCRAPE_ON_START=true
   MAX_DAYS_OLD=5
   MAX_JOBS=10
   FRONTEND_URL=https://your-frontend-url.com
   ```

4. **Get your deployment URL**
   - Railway gives you a URL like `https://jobagent-backend-production.up.railway.app`
   - Update `BACKEND_URL` in `frontend/job-agent.jsx` to this URL

5. **Done** — the cron runs automatically at 9am Toronto time every weekday.

---

## Deploy to Render (Alternative — Free Tier)

1. Push to GitHub (same as above)
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect your repo — Render reads `render.yaml` automatically
4. Add environment variables in the Render dashboard
5. Render provides a persistent disk for `data/jobs.db`

> **Note:** Render free tier spins down after 15min of inactivity.  
> Use Railway if you need the cron to fire reliably at 9am.

---

## Deploy to a VPS (DigitalOcean / Hetzner — $4–6/mo)

```bash
# On your server
git clone https://github.com/YOUR_USERNAME/jobagent-backend.git
cd jobagent-backend
npm install
cp .env.example .env

# Run with PM2 (keeps it alive + auto-restarts)
npm install -g pm2
pm2 start src/index.js --name jobagent
pm2 save
pm2 startup  # auto-start on reboot
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/status` | Health check, job counts, last scrape time |
| GET | `/api/jobs` | Fresh jobs (posted ≤5 days, not applied) |
| GET | `/api/jobs?limit=N&days=N` | With custom filters |
| GET | `/api/jobs/all` | All jobs in DB |
| GET | `/api/jobs/applied` | Applied jobs |
| POST | `/api/jobs/:id/applied` | Mark a job as applied |
| POST | `/api/scrape` | Manually trigger scrape (async) |

---

## Data Sources

| Board | Method | Auth Required |
|-------|--------|---------------|
| RemoteOK | Public JSON API | None |
| We Work Remotely | Public RSS feeds | None |
| LinkedIn | HTML scraping (cheerio) | None |
| Indeed | HTML scraping (cheerio) | None |
| Greenhouse | Public JSON API per company | None |

> **LinkedIn & Indeed note:** Both platforms use bot detection.  
> The scrapers use realistic User-Agents and rate limiting delays.  
> If they start returning empty results, consider using [Apify](https://apify.com) 
> actors for LinkedIn/Indeed instead (free tier available).

---

## Cron Schedule

```
0 9 * * 1-5   →  9:00am, Monday–Friday, America/Toronto
```

To change the time or timezone, edit `src/index.js`:
```js
cron.schedule("0 9 * * 1-5", handler, { timezone: "America/Toronto" });
```

---

## Project Structure

```
jobagent-backend/
├── src/
│   ├── index.js          # Express server + cron
│   ├── routes.js         # REST API endpoints
│   ├── db/
│   │   └── database.js   # SQLite schema + queries
│   └── scrapers/
│       ├── index.js      # Orchestrator
│       ├── utils.js      # Shared helpers, keyword filter
│       ├── remoteok.js   # RemoteOK JSON API
│       ├── weworkremotely.js  # WWR RSS feeds
│       ├── linkedin.js   # LinkedIn HTML scraper
│       ├── indeed.js     # Indeed HTML scraper
│       └── greenhouse.js # Greenhouse JSON API
├── frontend/
│   └── job-agent.jsx     # React frontend (paste into Claude artifact)
├── data/                 # SQLite DB lives here (git-ignored)
├── .env.example
├── .gitignore
├── railway.toml
├── render.yaml
└── README.md
```
