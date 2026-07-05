// src/scrapers/remotive.js
// Remotive has a free, public, no-auth JSON API: https://remotive.com/api/remote-jobs
// Returns real remote job postings with direct URLs and publication dates.
//
// Replaces the defunct Otta/WelcomeToTheJungle scraper.
// Otta rebranded to Welcome to the Jungle and removed their public API.

const axios = require("axios");
const {
  isWithinDays, makeId, isRelevant, isAllowedLocation,
  requiresUSWorkAuth, inferTags,
} = require("./utils");

const SOURCE = "Remotive";

// Remotive category slugs relevant to cloud/devops/support roles
const CATEGORIES = [
  "devops-sysadmin",
  "customer-support",
  "software-dev",
];

async function scrape(maxDaysOld = 5) {
  const jobs = [];
  const seen = new Set();

  for (const category of CATEGORIES) {
    try {
      const { data } = await axios.get("https://remotive.com/api/remote-jobs", {
        params: { category, limit: 50 },
        headers: { "User-Agent": "Mozilla/5.0 (compatible; JobAgentBot/1.0)" },
        timeout: 15000,
      });

      for (const item of data.jobs || []) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);

        // Relevance check against title + tags
        const titleTagText = `${item.title || ""} ${(item.tags || []).join(" ")}`;
        if (!isRelevant(titleTagText)) continue;

        // Date check
        const postedAt = item.publication_date ? new Date(item.publication_date) : null;
        if (postedAt && !isWithinDays(postedAt, maxDaysOld)) continue;

        // Location check — Remotive uses candidate_required_location
        const locationStr = item.candidate_required_location || "Worldwide";
        if (!isAllowedLocation(locationStr)) continue;

        // Strip HTML from description for work-auth check
        const descPlain = stripHtml(item.description || "").slice(0, 3000);
        if (requiresUSWorkAuth(descPlain)) continue;

        jobs.push({
          id: makeId("rem", String(item.id)),
          title: item.title || "Untitled",
          company: item.company_name || "Unknown",
          board: SOURCE,
          board_color: "#28a745",
          salary: item.salary || extractSalary(descPlain) || null,
          location: locationStr.includes("Worldwide") || locationStr === ""
            ? "Remote – Worldwide"
            : locationStr,
          location_type: "remote",
          // item.url is the direct job page on Remotive — accurate and stable
          url: item.url || "https://remotive.com",
          tags: item.tags?.slice(0, 5) || inferTags(item.title || ""),
          description: descPlain.slice(0, 2000),
          posted_at: postedAt ? postedAt.toISOString() : new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error(`[${SOURCE}] Category "${category}" failed: ${err.message}`);
    }
  }

  return jobs;
}

function extractSalary(text) {
  const match = text.match(/\$[\d,]+k?\s*[-–]\s*\$[\d,]+k?/i);
  return match ? match[0] : null;
}

function stripHtml(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

module.exports = { scrape, SOURCE };
