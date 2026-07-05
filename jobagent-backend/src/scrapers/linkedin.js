// src/scrapers/linkedin.js
// LinkedIn's public job search page (no auth required for basic search).
// We fetch HTML results and parse with cheerio.
//
// Search strategy:
//   - Hybrid (f_WT=3): Canada + Toronto specifically
//   - Remote (f_WT=2): Worldwide only
//   - f_E=2,3 = entry + associate level
//   - f_TPR=r432000 = posted in last 5 days (432000 seconds)
//
// NOTE: LinkedIn is aggressive about bot detection. For production scale,
// consider the official LinkedIn Jobs API or a service like Apify.

const axios   = require("axios");
const cheerio = require("cheerio");
const {
  isWithinDays, makeId, isRelevant, isAllowedLocation,
  requiresUSWorkAuth, inferTags, randomDelay,
} = require("./utils");

const SOURCE = "LinkedIn";

// f_TPR=r432000 = past 5 days, f_WT=2 = remote, f_WT=3 = hybrid
// f_E=2 = entry level, f_E=3 = associate level
const SEARCHES = [
  // ── Canada hybrid (Toronto + broader Canada) ──────────────────────────────
  { query: "cloud support engineer",      location: "Toronto, Ontario, Canada",  filters: "f_TPR=r432000&f_WT=3&f_E=2,3", locType: "hybrid" },
  { query: "devops engineer",             location: "Toronto, Ontario, Canada",  filters: "f_TPR=r432000&f_WT=3&f_E=2,3", locType: "hybrid" },
  { query: "junior cloud engineer",       location: "Toronto, Ontario, Canada",  filters: "f_TPR=r432000&f_WT=3&f_E=2,3", locType: "hybrid" },
  { query: "it support cloud",            location: "Toronto, Ontario, Canada",  filters: "f_TPR=r432000&f_WT=3&f_E=2,3", locType: "hybrid" },
  { query: "infrastructure engineer",     location: "Canada",                    filters: "f_TPR=r432000&f_WT=3&f_E=2,3", locType: "hybrid" },
  { query: "associate devops engineer",   location: "Canada",                    filters: "f_TPR=r432000&f_WT=3&f_E=2,3", locType: "hybrid" },
  { query: "cloud engineer",              location: "Canada",                    filters: "f_TPR=r432000&f_WT=2,3&f_E=2,3", locType: "hybrid" },
  // ── Worldwide remote ──────────────────────────────────────────────────────
  { query: "cloud support engineer",      location: "Worldwide",                 filters: "f_TPR=r432000&f_WT=2&f_E=2,3", locType: "remote" },
  { query: "junior devops engineer",      location: "Worldwide",                 filters: "f_TPR=r432000&f_WT=2&f_E=2,3", locType: "remote" },
  { query: "technical support cloud",     location: "Worldwide",                 filters: "f_TPR=r432000&f_WT=2&f_E=2,3", locType: "remote" },
  { query: "sre site reliability",        location: "Worldwide",                 filters: "f_TPR=r432000&f_WT=2&f_E=2,3", locType: "remote" },
  { query: "associate cloud engineer",    location: "Worldwide",                 filters: "f_TPR=r432000&f_WT=2&f_E=2,3", locType: "remote" },
];

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-CA,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Connection": "keep-alive",
  "Upgrade-Insecure-Requests": "1",
};

async function scrape(maxDaysOld = 5) {
  const jobs = [];
  const seen = new Set();

  for (const search of SEARCHES) {
    try {
      await randomDelay(1500, 3000); // be polite — LI rate-limits aggressively

      const url = buildSearchUrl(search);
      const { data: html } = await axios.get(url, {
        headers: HEADERS,
        timeout: 20000,
      });

      const parsed = parseListings(html, search);

      for (const job of parsed) {
        if (seen.has(job.id)) continue;
        seen.add(job.id);

        const fullText = `${job.title} ${job.description}`;
        if (!isRelevant(fullText)) continue;
        if (!isAllowedLocation(job.location)) continue;

        // Reject US-only work-auth postings
        if (requiresUSWorkAuth(job.description)) continue;

        jobs.push(job);
      }
    } catch (err) {
      console.error(`[${SOURCE}] Search "${search.query}" @ "${search.location}" failed: ${err.message}`);
    }
  }

  return jobs;
}

function buildSearchUrl({ query, location, filters }) {
  const q   = encodeURIComponent(query);
  const loc = encodeURIComponent(location);
  return `https://www.linkedin.com/jobs/search/?keywords=${q}&location=${loc}&${filters}&start=0`;
}

function parseListings(html, search) {
  const $ = cheerio.load(html);
  const jobs = [];

  $("li.jobs-search__results-list > div, .job-search-card, li > .base-card").each((_, el) => {
    try {
      const titleEl   = $(el).find(".base-search-card__title, h3.base-search-card__title");
      const companyEl = $(el).find(".base-search-card__subtitle, h4.base-search-card__subtitle");
      const linkEl    = $(el).find("a.base-card__full-link, a[data-tracking-control-name]");
      const timeEl    = $(el).find("time");

      const title   = titleEl.text().trim();
      const company = companyEl.text().trim();
      // Strip all query params except the job ID — produces a clean, direct job link
      const rawUrl  = linkEl.attr("href") || "";
      const url     = rawUrl.split("?")[0];
      const dateStr = timeEl.attr("datetime") || "";

      if (!title || !url) return;

      const postedAt = dateStr ? new Date(dateStr) : new Date();
      const isHybrid = search.locType === "hybrid";
      const jobId    = makeId("li", url);

      // Derive a human-readable location from the search context
      const locationLabel = isHybrid
        ? (search.location.includes("Toronto") ? "Hybrid – Toronto, ON" : "Hybrid – Canada")
        : "Remote – Worldwide";

      jobs.push({
        id: jobId,
        title,
        company,
        board: SOURCE,
        board_color: "#0a66c2",
        salary: null,
        location: locationLabel,
        location_type: isHybrid ? "hybrid" : "remote",
        url,
        tags: inferTags(title),
        description: `${title} at ${company}. See full job description at the link above.`,
        posted_at: postedAt.toISOString(),
      });
    } catch (_e) { /* skip malformed card */ }
  });

  return jobs;
}

module.exports = { scrape, SOURCE };
