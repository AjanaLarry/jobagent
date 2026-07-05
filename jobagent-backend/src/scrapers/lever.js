// src/scrapers/lever.js
// Lever exposes a public JSON API per company:
// https://api.lever.co/v0/postings/{company}?mode=json
//
// Filters: relevant titles, within 5 days, allowed location, no US work-auth lock.

const axios = require("axios");
const {
  isWithinDays, makeId, isRelevant, isAllowedLocation,
  requiresUSWorkAuth, inferTags, randomDelay,
} = require("./utils");

const SOURCE = "Lever";

const COMPANIES = [
  "cloudflare",
  "stripe",
  "shopify",
  "atlassian",
  "datadog",
  "pagerduty",
  "newrelic",
  "snyk",
  "lacework",
  "wiz-io",
  "orca-security",
  "drata",
  "vanta",
  "tailscale",
  "1password",
  "samsara",
  "cohere",
  "benchling",
  "scale-ai",
];

async function scrape(maxDaysOld = 5) {
  const jobs = [];

  for (const company of COMPANIES) {
    try {
      await randomDelay(300, 700);

      const { data } = await axios.get(
        `https://api.lever.co/v0/postings/${company}?mode=json`,
        { timeout: 10000 }
      );

      for (const job of Array.isArray(data) ? data : []) {
        const titleText = `${job.text || ""} ${job.categories?.team || ""} ${job.categories?.department || ""}`;
        if (!isRelevant(titleText)) continue;

        const locationStr = job.categories?.location || job.workplaceType || "";
        if (!isAllowedLocation(locationStr)) continue;

        const postedAt = job.createdAt ? new Date(job.createdAt) : new Date();
        if (!isWithinDays(postedAt, maxDaysOld)) continue;

        // descriptionPlain is the clean body text — use it for work-auth check
        const descPlain = (job.descriptionPlain || "").slice(0, 3000);
        if (requiresUSWorkAuth(descPlain)) continue;

        const isRemote = /remote/i.test(locationStr);

        jobs.push({
          id: makeId("lev", job.id),
          title: job.text || "Untitled",
          company: capitalize(company),
          board: SOURCE,
          board_color: "#4a90d9",
          salary: extractSalary(descPlain),
          location: isRemote ? "Remote – Worldwide" : locationStr || "Remote – Worldwide",
          location_type: isRemote ? "remote" : "hybrid",
          // hostedUrl is the canonical, direct job link on Lever's platform
          url: job.hostedUrl || `https://jobs.lever.co/${company}/${job.id}`,
          tags: inferTags(job.text || ""),
          description: descPlain.slice(0, 2000),
          posted_at: postedAt.toISOString(),
        });
      }
    } catch (err) {
      if (err.response?.status !== 404) {
        console.error(`[${SOURCE}] ${company} failed: ${err.message}`);
      }
    }
  }

  return jobs;
}

function capitalize(str) { return str.charAt(0).toUpperCase() + str.slice(1); }

function extractSalary(text) {
  const m = text.match(/\$[\d,]+k?\s*[-–]\s*\$[\d,]+k?/i);
  return m ? m[0] : null;
}

module.exports = { scrape, SOURCE };
