// src/scrapers/weworkremotely.js
// We Work Remotely exposes category RSS feeds — no auth needed.
// All WWR listings are remote-worldwide by default.
//
// Extra filters applied:
//   - Reject postings restricted to non-CA / non-worldwide regions
//   - Reject postings requiring US work authorization

const Parser = require("rss-parser");
const {
  isWithinDays, makeId, isRelevant, requiresUSWorkAuth, inferTags,
} = require("./utils");

const SOURCE = "We Work Remotely";

const FEEDS = [
  "https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss",
  "https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss",
  "https://weworkremotely.com/categories/remote-back-end-programming-jobs.rss",
  "https://weworkremotely.com/categories/remote-customer-support-jobs.rss",
];

const parser = new Parser({
  timeout: 15000,
  headers: { "User-Agent": "Mozilla/5.0 (compatible; JobAgentBot/1.0)" },
});

// Patterns that signal the role is restricted to a specific region that is
// NOT Canada and NOT worldwide (e.g. "Europe only", "UK only", "APAC only")
const REGION_BLOCK = /\b(?:europe|eu|uk|united kingdom|emea|apac|asia|india|australia|latam|latin america|africa)\s+only\b/i;

async function scrape(maxDaysOld = 5) {
  const jobs = [];

  for (const feedUrl of FEEDS) {
    try {
      const feed = await parser.parseURL(feedUrl);

      for (const item of feed.items || []) {
        const fullText = `${item.title || ""} ${item.contentSnippet || ""}`;
        const lower    = fullText.toLowerCase();

        if (!isRelevant(fullText)) continue;

        // Reject region-restricted postings that exclude CA/worldwide
        if (REGION_BLOCK.test(fullText)) continue;

        // Reject US work-auth lock (contentSnippet has the job body text)
        if (requiresUSWorkAuth(item.contentSnippet || "")) continue;

        const postedAt = item.pubDate ? new Date(item.pubDate) : null;
        if (postedAt && !isWithinDays(postedAt, maxDaysOld)) continue;

        // WWR titles: "CompanyName: Job Title"
        const [companyRaw, ...titleParts] = (item.title || "").split(":");
        const company = companyRaw.trim();
        const title   = titleParts.join(":").trim() || item.title || "Untitled";

        // WWR links are direct — item.link is the full job page URL
        const url = item.link || "";

        jobs.push({
          id: makeId("wwr", item.guid || url),
          title,
          company,
          board: SOURCE,
          board_color: "#7c5cbf",
          salary: null,
          location: "Remote – Worldwide",
          location_type: "remote",
          url,
          tags: inferTags(`${title} ${item.contentSnippet || ""}`),
          description: (item.contentSnippet || item.content || "").slice(0, 2000),
          posted_at: postedAt ? postedAt.toISOString() : new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error(`[${SOURCE}] Feed ${feedUrl} failed: ${err.message}`);
    }
  }

  return jobs;
}

module.exports = { scrape, SOURCE };
