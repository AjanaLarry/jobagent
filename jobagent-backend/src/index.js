// src/index.js
require("dotenv").config();
const express   = require("express");
const cors      = require("cors");
const cron      = require("node-cron");
const rateLimit = require("express-rate-limit");
const routes    = require("./routes");
const { runAllScrapers } = require("./scrapers/index");
const { db } = require("./db/database");
const { runPipeline } = require("./pipeline/runner");

const { execSync } = require('child_process');
try {
  const p = execSync('which chromium || which chromium-browser').toString().trim();
  console.log('[Chromium] Found at:', p);
} catch(e) {
  console.log('[Chromium] NOT FOUND in PATH — PDF will fail');
}

const app  = express();
const PORT = process.env.PORT || 3001;

// Middleware
const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL,
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:5174",
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (origin.endsWith(".vercel.app") || ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-CSRF-Token",
  ],
  credentials: true,
}));
app.use(express.json());

// Rate limiting — prevents abuse if deployed publicly
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});
app.use("/api", limiter);

// Routes
app.use("/api", routes);

// Root health check
app.get("/", (req, res) => {
  res.json({ service: "JobAgent Backend", status: "running", time: new Date().toISOString() });
});

// Daily scrape — every day at 09:00 Toronto time (was weekdays only)
cron.schedule("0 9 * * *", async () => {
  console.log("[Cron] 09:00 daily trigger — starting scrape");
  try {
    const days = parseInt(process.env.MAX_DAYS_OLD) || 7;
    const summary = await runAllScrapers(days);
    console.log("[Cron] Scrape complete:", summary);
  } catch (err) {
    console.error("[Cron] Scrape failed:", err.message);
  }

  // NEW: per-user pipeline runs after global scrape
  try {
    const users = db.prepare(`
      SELECT id FROM users
      WHERE active = 1
        AND resume_parsed IS NOT NULL
    `).all();

    console.log(`[Cron] Running pipeline for ${users.length} active user(s)`);

    for (const { id } of users) {
      try {
        const result = await runPipeline(id, { skipScrape: true });
        console.log(`[Cron] Pipeline complete for user ${id}:`, result);
      } catch (err) {
        console.error(`[Cron] Pipeline failed for user ${id}:`, err.message);
      }
    }
  } catch (err) {
    console.error("[Cron] User pipeline loop failed:", err.message);
  }
}, { timezone: "America/Toronto" });

// Weekly DB cleanup — every Sunday at 00:00, removes jobs older than 30 days
cron.schedule("0 0 * * 0", () => {
  console.log("[Cron] Weekly cleanup — removing jobs older than 30 days");
  try {
    const result = db.prepare(
      "DELETE FROM jobs WHERE date(posted_at) < date('now', '-30 days') AND is_applied = 0"
    ).run();
    console.log(`[Cron] Cleanup complete — removed ${result.changes} old jobs`);
  } catch (err) {
    console.error("[Cron] Cleanup failed:", err.message);
  }
}, { timezone: "America/Toronto" });

console.log("[Cron] Scheduled: daily scrape at 09:00 + weekly cleanup on Sunday 00:00 (America/Toronto)");

// Scrape on startup if enabled
if (process.env.SCRAPE_ON_START === "true") {
  console.log("[Startup] SCRAPE_ON_START=true — running initial scrape...");
  const days = parseInt(process.env.MAX_DAYS_OLD) || 7;
  runAllScrapers(days).catch(err => console.error("[Startup] Scrape error:", err.message));
}

// Start server
const server = app.listen(PORT, () => {
  console.log(`\n JobAgent Backend running on http://localhost:${PORT}`);
  console.log(`   API:    http://localhost:${PORT}/api/jobs`);
  console.log(`   Status: http://localhost:${PORT}/api/status\n`);
});

// Graceful shutdown — ensures DB writes complete before exit
process.on("SIGTERM", () => {
  console.log("[Shutdown] SIGTERM received — closing server gracefully");
  server.close(() => {
    db.close();
    console.log("[Shutdown] Done");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  server.close(() => {
    db.close();
    process.exit(0);
  });
});

module.exports = app;
