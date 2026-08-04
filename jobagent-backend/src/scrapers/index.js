// src/scrapers/index.js
const { insertJobs, logScrape } = require("../db/database");
const { matchScore } = require("./utils");
const remoteok        = require("./remoteok");
const weworkremotely  = require("./weworkremotely");
const greenhouse      = require("./greenhouse");
const lever           = require("./lever");
const otta            = require("./otta");
const jsearch         = require("./jsearch"); // replaces fragile LinkedIn/Indeed HTML scrapers

// LinkedIn and Indeed HTML scrapers kept as fallback if JSearch key not set
const linkedin        = require("./linkedin");
const indeed          = require("./indeed");

const SCRAPERS = [remoteok, weworkremotely, greenhouse, lever, otta, jsearch];
const FALLBACK_SCRAPERS = [linkedin, indeed]; // only used if JSEARCH_API_KEY not set

async function runAllScrapers(maxDaysOld = 7) {
  console.log(`[Scraper] Starting full scrape run at ${new Date().toISOString()}`);
  const summary = { total: 0, new: 0, bySource: {} };

  // Use JSearch if key is set, otherwise fall back to HTML scrapers
  const activeScrapers = process.env.JSEARCH_API_KEY
    ? SCRAPERS
    : [...SCRAPERS.filter(s => s.SOURCE !== "JSearch"), ...FALLBACK_SCRAPERS];

  const results = await Promise.allSettled(
    activeScrapers.map(async (scraper) => {
      try {
        console.log(`[Scraper] Running ${scraper.SOURCE}...`);
        const jobs = await scraper.scrape(maxDaysOld);
        const scored = jobs.map(j => ({
          ...j,
          match_score: matchScore(`${j.title} ${j.description}`),
        }));
        const newCount = await insertJobs(scored);
        await logScrape(scraper.SOURCE, scored.length, newCount, null);
        console.log(`[Scraper] ${scraper.SOURCE}: ${scored.length} found, ${newCount} new`);
        return { source: scraper.SOURCE, found: scored.length, new: newCount };
      } catch (err) {
        await logScrape(scraper.SOURCE, 0, 0, err.message);
        console.error(`[Scraper] ${scraper.SOURCE} failed: ${err.message}`);
        return { source: scraper.SOURCE, found: 0, new: 0, error: err.message };
      }
    })
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      const { source, found, new: newCount } = result.value;
      summary.total += found;
      summary.new += newCount;
      summary.bySource[source] = { found, new: newCount };
    }
  }

  console.log(`[Scraper] Run complete. Total: ${summary.total}, New: ${summary.new}`);
  return summary;
}

module.exports = { runAllScrapers };
