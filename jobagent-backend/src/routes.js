// src/routes.js
const express = require("express");
const router  = express.Router();
const { requireAuth } = require('./auth/middleware');
const { randomUUID } = require('crypto');
const crypto  = require("crypto");
const axios   = require("axios");
const db      = require("./db/database");
const { runAllScrapers } = require("./scrapers/index");

// CSRF token store
const CSRF_TOKENS = new Set();
const CSRF_TTL_MS = 60 * 60 * 1000;

function generateCsrfToken() {
  const token = crypto.randomBytes(32).toString("hex");
  CSRF_TOKENS.add(token);
  setTimeout(() => CSRF_TOKENS.delete(token), CSRF_TTL_MS);
  return token;
}

function verifyCsrf(req, res, next) {
  const token = req.headers["x-csrf-token"];
  if (!token || !CSRF_TOKENS.has(token)) {
    return res.status(403).json({ error: "Invalid or missing CSRF token" });
  }
  next();
}

// GET /api/csrf-token
router.get("/csrf-token", (req, res) => {
  res.json({ csrfToken: generateCsrfToken() });
});

// GET /api/jobs
router.get("/jobs", (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || parseInt(process.env.MAX_JOBS) || 20;
    const days  = parseInt(req.query.days)  || parseInt(process.env.MAX_DAYS_OLD) || 7;
    const jobs  = db.getFreshJobs(days, limit);
    const lastRun = db.getLastScrapeTime();
    res.json({ jobs, lastRun, count: jobs.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/jobs/all
router.get("/jobs/all", (req, res) => {
  try { res.json(db.getAllJobs()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/jobs/tracker
router.get("/jobs/tracker", (req, res) => {
  try { res.json(db.getTrackerJobs()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/jobs/applied
router.get("/jobs/applied", (req, res) => {
  try { res.json(db.getApplied()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/jobs/:id/applied
router.post("/jobs/:id/applied", verifyCsrf, (req, res) => {
  try {
    db.markApplied(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/jobs/:id/skipped
router.post("/jobs/:id/skipped", verifyCsrf, (req, res) => {
  try {
    db.markSkipped(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/jobs/:id/status
router.post("/jobs/:id/status", verifyCsrf, (req, res) => {
  try {
    const { status } = req.body;
    const valid = ["pending", "applied", "interview", "offer", "rejected", "skipped"];
    if (!valid.includes(status)) return res.status(400).json({ error: "Invalid status" });
    db.updateStatus(req.params.id, status);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/jobs/:id/notes
router.post("/jobs/:id/notes", verifyCsrf, (req, res) => {
  try {
    db.updateNotes(req.params.id, req.body.notes || "");
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/scrape
router.post("/scrape", verifyCsrf, async (req, res) => {
  try {
    res.json({ message: "Scrape started", startedAt: new Date().toISOString() });
    const days = parseInt(process.env.MAX_DAYS_OLD) || 7;
    await runAllScrapers(days);
  } catch (err) {
    console.error("[/api/scrape]", err.message);
  }
});

// POST /api/tailor — Gemini proxy
router.post("/tailor", verifyCsrf, async (req, res) => {
  const { job, resume } = req.body;
  if (!job || !resume) return res.status(400).json({ error: "Missing job or resume" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY not configured" });

  const prompt = `You are an elite technical resume strategist for a senior cloud and DevOps professional.
RULES:
1. NEVER soften or downplay the candidate's seniority or technical depth.
2. Rewrite ONLY the PROFILE section to mirror this job's language.
3. Reorder bullet points so the most relevant achievements appear first.
4. Embed ATS keywords from the job description naturally throughout.
5. Preserve every metric, certification, and achievement exactly as stated.
Return the complete tailored resume as clean plain text.

MY RESUME:
${resume}

---
JOB: ${job.title} @ ${job.company}
LOCATION: ${job.location}

JOB DESCRIPTION:
${job.description}`;

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      { contents: [{ parts: [{ text: prompt }] }] },
      { headers: { "Content-Type": "application/json" } }
    );
    const text = response.data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    res.json({ tailored: text });
  } catch (err) {
    res.status(502).json({ error: err.response?.data?.error?.message || err.message });
  }
});

// GET /api/status
router.get("/status", (req, res) => {
  try {
    const lastRun = db.getLastScrapeTime();
    const allJobs = db.getAllJobs();
    res.json({
      status: "ok",
      lastScrape: lastRun,
      totalJobs: allJobs.length,
      freshJobs: db.getFreshJobs(7, 100).length,
      appliedJobs: db.getApplied().length,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/auth/sync — create or return user record
router.post('/auth/sync', requireAuth, (req, res) => {
  const clerkId = req.userId;
  const email = req.body.email;

  if (!email) {
    return res.status(400).json({ error: 'Missing email' });
  }

  try {
    const existing = db.getUserByClerkId(clerkId);
    if (existing) {
      return res.status(200).json({ user: existing });
    }

    const newUser = db.createUser(randomUUID(), email, clerkId);
    return res.status(201).json({ user: newUser });

  } catch (err) {
    return res.status(500).json({
      error: 'Database error',
      message: err.message
    });
  }
});

module.exports = router;
