// src/scrapers/jsearch.js
// JSearch API (RapidAPI / OpenWeb Ninja) — aggregates LinkedIn, Indeed, Glassdoor,
// ZipRecruiter, and more via Google for Jobs.
//
// Endpoint:   https://jsearch.p.rapidapi.com/search-v2  (updated from /search)
// Response:   { status, data: { jobs: [...], cursor } }
// Free tier:  200 req/month on RapidAPI
// Key:        JSEARCH_API_KEY in .env

const axios = require("axios");
const { makeId, isAllowedLocation, requiresUSWorkAuth, inferTags, matchScore } = require("./utils");

const SOURCE   = "JSearch";
const BASE_URL = "https://jsearch.p.rapidapi.com/search-v2";
const COLOR    = "#6366f1";

// Queries tuned to candidate profile: 5+ years cloud/DevOps, AWS/Azure/GCP certified.
// Remote worldwide + hybrid Canada. Kept to 8 queries to preserve free-tier credits.
const QUERIES = [
  { query: "cloud engineer remote",              remote: true  },
  { query: "devops engineer remote",             remote: true  },
  { query: "cloud support engineer remote",      remote: true  },
  { query: "site reliability engineer remote",   remote: true  },
  { query: "infrastructure engineer remote",     remote: true  },
  { query: "platform engineer remote",           remote: true  },
  { query: "devops engineer in Canada",          remote: false },
  { query: "cloud engineer in Toronto Ontario",  remote: false },
];

async function scrape(maxDaysOld = 7) {
  const apiKey = process.env.JSEARCH_API_KEY;
  if (!apiKey) {
    console.warn("[JSearch] JSEARCH_API_KEY not set — skipping");
    return [];
  }

  const jobs = [];
  const seen = new Set();

  for (const { query, remote } of QUERIES) {
    try {
      const { data: body } = await axios.get(BASE_URL, {
        params: {
          query,
          num_pages:      "1",   // 10 results per page; saves quota
          date_posted:    "week",
          work_from_home: remote ? "true" : "false",
        },
        headers: {
          "X-RapidAPI-Key":  apiKey,
          "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
        },
        timeout: 15000,
      });

      // v2 response shape: { status, data: { jobs: [...], cursor } }
      const raw = body?.data?.jobs || [];

      for (const job of raw) {
        const id = makeId("js", job.job_id);
        if (seen.has(id)) continue;
        seen.add(id);

        // Location filter
        const locationStr = [job.job_city, job.job_state, job.job_country]
          .filter(Boolean).join(", ");
        if (!isAllowedLocation(locationStr) && !job.job_is_remote) continue;

        // Skip US-only work-auth requirements
        if (requiresUSWorkAuth(job.job_description || "")) continue;

        // Title-level relevance check
        if (!isTitleRelevant(job.job_title)) continue;

        const isRemote    = job.job_is_remote === true || remote;
        const postedAt    = job.job_posted_at_datetime_utc
          ? new Date(job.job_posted_at_datetime_utc)
          : new Date();
        const description = (job.job_description || "").slice(0, 3000);
        const fullText    = `${job.job_title} ${description}`;

        jobs.push({
          id,
          title:         job.job_title,
          company:       job.employer_name || "Unknown",
          board:         `${SOURCE} · ${job.job_publisher || "LinkedIn/Indeed"}`,
          board_color:   COLOR,
          salary:        formatSalary(job),
          location:      isRemote
            ? "Remote – Worldwide"
            : locationStr || "Remote – Worldwide",
          location_type: isRemote ? "remote" : "hybrid",
          url:           job.job_apply_link || job.job_google_link || "",
          tags:          inferTags(fullText),
          description,
          match_score:   matchScore(fullText),
          posted_at:     postedAt.toISOString(),
        });
      }

      // Polite delay between requests
      await new Promise(r => setTimeout(r, 350));

    } catch (err) {
      const status = err.response?.status;
      if (status === 429) {
        console.warn(`[${SOURCE}] Rate limited — pausing 15s`);
        await new Promise(r => setTimeout(r, 15000));
      } else {
        console.error(`[${SOURCE}] "${query}" failed (${status || err.message})`);
      }
    }
  }

  console.log(`[${SOURCE}] Collected ${jobs.length} jobs across ${QUERIES.length} queries`);
  return jobs;
}

// Title-level relevance: keep cloud/devops/infra/support roles, drop clear mismatches.
// Intentionally broad — match_score handles ranking.
const TITLE_INCLUDE = [
  "cloud", "devops", "dev ops", "infrastructure", "infra", "sre", "site reliability",
  "platform", "linux", "systems engineer", "network engineer", "support engineer",
  "operations engineer", "cloud operations", "cloud support", "technical support",
  "it engineer", "automation engineer", "release engineer", "build engineer",
];

const TITLE_EXCLUDE = [
  "sales", "marketing", "account executive", "recruiter", "hr ",
  "accountant", "nurse", "driver", "warehouse", "mechanic",
  "data analyst", "data scientist", "machine learning", "frontend", "ios", "android",
  "game ", "3d ", "graphic ", "design", "content writer", "copywriter",
];

function isTitleRelevant(title) {
  if (!title) return false;
  const lower = title.toLowerCase();
  if (TITLE_EXCLUDE.some(ex => lower.includes(ex))) return false;
  return TITLE_INCLUDE.some(kw => lower.includes(kw));
}

function formatSalary(job) {
  if (!job.job_min_salary && !job.job_max_salary) return null;
  const currency = job.job_salary_currency || "USD";
  const period   = job.job_salary_period ? `/${job.job_salary_period.toLowerCase()}` : "";
  const min = job.job_min_salary;
  const max = job.job_max_salary;
  if (min && max) {
    return `${currency} ${Math.round(min / 1000)}k–${Math.round(max / 1000)}k${period}`;
  }
  return `${currency} ${Math.round((min || max) / 1000)}k${period}`;
}

module.exports = { scrape, SOURCE };
