// src/scrapers/remoteok.js
// RemoteOK has a free, public, no-auth JSON API at https://remoteok.com/api
// Returns real job postings with direct URLs. All listings are remote-worldwide.
//
// Filter: reject any posting whose description requires US work authorization
// and doesn't mention Canada / worldwide.

const axios = require("axios");
const { isWithinDays, makeId, isRelevant, requiresUSWorkAuth, inferTags } = require("./utils");

const SOURCE  = "RemoteOK";
const API_URL = "https://remoteok.com/api";

async function scrape(maxDaysOld = 5) {
  const jobs = [];

  try {
    const { data } = await axios.get(API_URL, {
      headers: {
        // RemoteOK requires a real User-Agent or returns 403
        "User-Agent": "Mozilla/5.0 (compatible; JobAgentBot/1.0; +https://github.com/jobagent)",
      },
      timeout: 15000,
    });

    // First item is metadata, rest are jobs
    const listings = Array.isArray(data) ? data.slice(1) : [];

    for (const item of listings) {
      // Filter by relevance keywords in title + tags
      const titleTagText = `${item.position || ""} ${(item.tags || []).join(" ")}`;
      if (!isRelevant(titleTagText)) continue;

      // Filter by date
      const postedAt = item.date ? new Date(item.date * 1000) : null;
      if (postedAt && !isWithinDays(postedAt, maxDaysOld)) continue;

      // Reject US-only work-auth postings
      const descText = stripHtml(item.description || "");
      if (requiresUSWorkAuth(descText)) continue;

      // RemoteOK job URL: prefer item.url, fallback to slug-based URL
      const url = item.url || (item.slug ? `https://remoteok.com/remote-jobs/${item.slug}` : "https://remoteok.com");

      jobs.push({
        id: makeId("rok", item.id || item.slug),
        title: item.position || "Untitled",
        company: item.company || "Unknown",
        board: SOURCE,
        board_color: "#f6821f",
        salary: item.salary || extractSalary(descText),
        location: "Remote – Worldwide",
        location_type: "remote",
        url,
        tags: (item.tags || []).slice(0, 6),
        description: descText,
        posted_at: postedAt ? postedAt.toISOString() : new Date().toISOString(),
      });
    }
  } catch (err) {
    throw new Error(`${SOURCE} scrape failed: ${err.message}`);
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
