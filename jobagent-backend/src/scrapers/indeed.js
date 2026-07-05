// src/scrapers/indeed.js
// Indeed's public job search page — no auth needed.
// We parse their HTML results with cheerio.
//
// Search strategy:
//   - ca.indeed.com for Canada + Toronto hybrid roles
//   - www.indeed.com for worldwide remote roles
//   - fromage=5 = posted in last 5 days on all queries
//   - Direct job links: ca.indeed.com/viewjob?jk={jobKey}
//
// NOTE: Indeed has bot detection. The same caveats as LinkedIn apply.
// For production scale, consider the Indeed Publisher API (free for job seekers)
// at https://www.indeed.com/publisher

const axios   = require("axios");
const cheerio = require("cheerio");
const {
  makeId, isRelevant, isAllowedLocation, requiresUSWorkAuth, inferTags, randomDelay,
} = require("./utils");

const SOURCE = "Indeed";

const SEARCHES = [
  // ── Canada + Toronto hybrid ───────────────────────────────────────────────
  { query: "cloud support engineer",          location: "Toronto, ON",  country: "ca" },
  { query: "junior devops engineer",          location: "Toronto, ON",  country: "ca" },
  { query: "infrastructure engineer",         location: "Toronto, ON",  country: "ca" },
  { query: "it support cloud",                location: "Toronto, ON",  country: "ca" },
  { query: "junior cloud engineer",           location: "Canada",       country: "ca" },
  { query: "associate devops engineer",       location: "Canada",       country: "ca" },
  { query: "cloud operations engineer",       location: "Canada",       country: "ca" },
  // ── Worldwide remote ──────────────────────────────────────────────────────
  { query: "junior cloud support engineer",   location: "Remote",       country: "www" },
  { query: "associate devops engineer",       location: "Remote",       country: "www" },
  { query: "entry level cloud engineer",      location: "Remote",       country: "www" },
  { query: "technical support cloud",         location: "Remote",       country: "www" },
];

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "en-CA,en;q=0.9",
  "Accept": "text/html,application/xhtml+xml",
};

async function scrape(maxDaysOld = 5) {
  const jobs = [];
  const seen = new Set();

  for (const search of SEARCHES) {
    try {
      await randomDelay(2000, 4000);

      const url = buildUrl(search);
      const { data: html } = await axios.get(url, {
        headers: HEADERS,
        timeout: 20000,
      });

      const parsed = parseListings(html, search);

      for (const job of parsed) {
        if (seen.has(job.id)) continue;
        seen.add(job.id);

        if (!isRelevant(`${job.title} ${job.description}`)) continue;
        if (!isAllowedLocation(job.location)) continue;
        if (requiresUSWorkAuth(job.description)) continue;

        jobs.push(job);
      }
    } catch (err) {
      console.error(`[${SOURCE}] "${search.query}" @ "${search.location}" failed: ${err.message}`);
    }
  }

  return jobs;
}

function buildUrl({ query, location, country }) {
  const base = country === "ca" ? "https://ca.indeed.com" : "https://www.indeed.com";
  const q    = encodeURIComponent(query);
  const l    = encodeURIComponent(location);
  // fromage=5 = last 5 days, sort=date = newest first
  // Remote filter: sc=0kf%3Aattr(DSQF7)%3B
  const remoteFilter = location.toLowerCase() === "remote" ? "&sc=0kf%3Aattr(DSQF7)%3B" : "";
  return `${base}/jobs?q=${q}&l=${l}&fromage=5&sort=date${remoteFilter}`;
}

function parseListings(html, search) {
  const $ = cheerio.load(html);
  const jobs = [];
  const isCanada  = search.country === "ca";
  const isToronto = search.location.toLowerCase().includes("toronto");

  $(".job_seen_beacon, .tapItem, [data-jk]").each((_, el) => {
    try {
      const title    = $(el).find("[data-testid='jobTitle'], .jobTitle, h2.jobTitle").text().trim();
      const company  = $(el).find("[data-testid='company-name'], .companyName").text().trim();
      const jobKey   = $(el).attr("data-jk") || $(el).find("[data-jk]").attr("data-jk");
      const salary   = $(el).find("[data-testid='attribute_snippet_testid'], .salary-snippet").first().text().trim() || null;
      const dateText = $(el).find("[data-testid='myJobsStateDate'], .date").text().trim();

      if (!title || !jobKey) return;

      // Always use ca.indeed.com for CA searches — produces direct, accurate links
      const base = isCanada ? "https://ca.indeed.com" : "https://www.indeed.com";
      const url  = `${base}/viewjob?jk=${jobKey}`;

      // Derive human-readable location from search context
      let locationLabel;
      if (isToronto)      locationLabel = "Hybrid – Toronto, ON";
      else if (isCanada)  locationLabel = "Hybrid – Canada";
      else                locationLabel = "Remote – Worldwide";

      jobs.push({
        id: makeId("ind", jobKey),
        title,
        company: company || "Unknown",
        board: SOURCE,
        board_color: "#003087",
        salary: salary || null,
        location: locationLabel,
        location_type: isCanada ? "hybrid" : "remote",
        url,
        tags: inferTags(title),
        description: `${title} at ${company || "Unknown"}. Posted: ${dateText || "recently"}. Open the link to read the full job description.`,
        posted_at: parseIndeedDate(dateText),
      });
    } catch (_e) { /* skip malformed card */ }
  });

  return jobs;
}

function parseIndeedDate(text) {
  const now = new Date();
  if (!text) return now.toISOString();
  if (/just|today|hour/i.test(text)) return now.toISOString();
  const match = text.match(/(\d+)\s+day/i);
  if (match) {
    now.setDate(now.getDate() - parseInt(match[1], 10));
    return now.toISOString();
  }
  return now.toISOString();
}

module.exports = { scrape, SOURCE };
