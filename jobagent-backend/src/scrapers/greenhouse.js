// src/scrapers/greenhouse.js
// Greenhouse exposes a fully public, no-auth JSON API for each company's job board.
// URL: https://boards-api.greenhouse.io/v1/boards/{company}/jobs?content=true
//
// We query a curated list of tech companies known to hire cloud/DevOps/support roles.
// Filters: relevant titles, within 5 days, allowed location, no US work-auth lock.

const axios = require("axios");
const {
  isWithinDays, makeId, isRelevant, isAllowedLocation,
  requiresUSWorkAuth, inferTags, randomDelay,
} = require("./utils");

const SOURCE = "Greenhouse";

// Companies with Greenhouse boards known to hire cloud/DevOps/support roles
const COMPANIES = [
  "cloudflare",
  "hashicorp",
  "elastic",
  "digitalocean",
  "netlify",
  "supabase",
  "vercel",
  "tailscale",
  "1password",
  "weaveworks",
  "render",
  "temporal",
  "grafana",
  "planetscale",
  "coreweave",
  "oxide",
  "fly",
];

async function scrape(maxDaysOld = 5) {
  const jobs = [];

  for (const company of COMPANIES) {
    try {
      await randomDelay(300, 800);

      const url = `https://boards-api.greenhouse.io/v1/boards/${company}/jobs?content=true`;
      const { data } = await axios.get(url, { timeout: 10000 });

      for (const job of data.jobs || []) {
        const titleText = `${job.title || ""} ${(job.departments || []).map(d => d.name).join(" ")}`;
        if (!isRelevant(titleText)) continue;

        // Use updated_at for freshness (Greenhouse doesn't expose created_at)
        const postedAt = job.updated_at ? new Date(job.updated_at) : new Date();
        if (!isWithinDays(postedAt, maxDaysOld)) continue;

        // Build a location string from offices array or job.location
        const officeList = Array.isArray(job.offices)
          ? job.offices.map(o => o.name).join(", ")
          : "";
        const locationStr = officeList || job.location?.name || "";

        if (!isAllowedLocation(locationStr)) continue;

        // Strip HTML to get plain description for work-auth check
        const descPlain = stripHtml(job.content || "").slice(0, 3000);
        if (requiresUSWorkAuth(descPlain)) continue;

        const isRemote = /remote/i.test(locationStr) || locationStr === "";

        jobs.push({
          id: makeId("gh", String(job.id)),
          title: job.title,
          company: data.company?.name || capitalize(company),
          board: SOURCE,
          board_color: "#00a550",
          salary: extractSalary(job.content || ""),
          location: isRemote ? "Remote – Worldwide" : locationStr,
          location_type: isRemote ? "remote" : "hybrid",
          // absolute_url is the direct job posting link — always reliable
          url: job.absolute_url || `https://boards.greenhouse.io/${company}/jobs/${job.id}`,
          tags: inferTags(job.title),
          description: descPlain.slice(0, 2000),
          posted_at: postedAt.toISOString(),
        });
      }
    } catch (err) {
      // 404 = company doesn't use Greenhouse — skip silently
      if (err.response?.status !== 404) {
        console.error(`[${SOURCE}] ${company} failed: ${err.message}`);
      }
    }
  }

  return jobs;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function extractSalary(text) {
  const match = text.match(/\$[\d,]+k?\s*[-–]\s*\$[\d,]+k?/i);
  return match ? match[0] : null;
}

function stripHtml(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

module.exports = { scrape, SOURCE };
