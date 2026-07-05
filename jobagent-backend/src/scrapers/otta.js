// src/scrapers/otta.js
// Otta (now Welcometothejungle) has a public search API
const axios = require("axios");
const { makeId, isRelevant, isAllowedLocation, inferTags } = require("./utils");

const SOURCE = "Otta";

const QUERIES = [
  "junior devops engineer",
  "associate cloud engineer",
  "cloud support engineer",
  "entry level infrastructure",
  "junior site reliability",
];

async function scrape(maxDaysOld = 7) {
  const jobs = [];
  const seen = new Set();

  for (const query of QUERIES) {
    try {
      const { data } = await axios.get("https://api.otta.com/graphql", {
        params: {
          query: `{ jobsSearch(query: "${query}", limit: 20) { id title company { name } locations { name } url externalUrl salary { min max currency } } }`
        },
        timeout: 10000,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; JobAgentBot/1.0)" },
      });

      const results = data?.data?.jobsSearch || [];
      for (const job of results) {
        if (seen.has(job.id)) continue;
        seen.add(job.id);

        const locationStr = (job.locations || []).map(l => l.name).join(", ");
        if (!isAllowedLocation(locationStr) && !/remote/i.test(locationStr)) continue;

        const text = `${job.title || ""} ${locationStr}`;
        if (!isRelevant(text)) continue;

        const isRemote = /remote/i.test(locationStr);
        const salary = job.salary
          ? `${job.salary.currency || "$"}${job.salary.min}–${job.salary.max}`
          : null;

        jobs.push({
          id: makeId("otta", job.id),
          title: job.title || "Untitled",
          company: job.company?.name || "Unknown",
          board: SOURCE,
          board_color: "#ff6b35",
          salary,
          location: isRemote ? "Remote – Worldwide" : locationStr || "Remote – Worldwide",
          location_type: isRemote ? "remote" : "hybrid",
          url: job.externalUrl || job.url || "",
          tags: inferTags(job.title || ""),
          description: `${job.title} at ${job.company?.name}. See full description at the link above.`,
          posted_at: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error(`[${SOURCE}] "${query}" failed: ${err.message}`);
    }
  }

  return jobs;
}

module.exports = { scrape, SOURCE };
