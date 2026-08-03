const DB_TYPE = process.env.DB_TYPE || 'sqlite';

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

// DATA_DIR env var lets Railway (or any host) point to a persistent volume.
// Falls back to local ./data for development.
const DB_DIR  = process.env.DATA_DIR || path.join(__dirname, "../../data");
const DB_PATH = path.join(DB_DIR, "jobs.db");

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id            TEXT PRIMARY KEY,
    title         TEXT NOT NULL,
    company       TEXT NOT NULL,
    board         TEXT NOT NULL,
    board_color   TEXT,
    salary        TEXT,
    location      TEXT,
    location_type TEXT CHECK(location_type IN ('remote','hybrid')),
    url           TEXT NOT NULL,
    tags          TEXT,
    description   TEXT,
    match_score   INTEGER DEFAULT 0,
    posted_at     TEXT,
    fetched_at    TEXT NOT NULL,
    is_applied    INTEGER DEFAULT 0,
    is_skipped    INTEGER DEFAULT 0,
    status        TEXT DEFAULT 'pending',
    notes         TEXT,
    applied_at    TEXT
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_title_company
    ON jobs (lower(title), lower(company));

  CREATE TABLE IF NOT EXISTS scrape_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ran_at     TEXT NOT NULL,
    source     TEXT NOT NULL,
    jobs_found INTEGER DEFAULT 0,
    jobs_new   INTEGER DEFAULT 0,
    error      TEXT
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    clerk_id TEXT UNIQUE NOT NULL,
    resume_raw TEXT,
    resume_parsed TEXT,
    preferences TEXT DEFAULT '{"roles":[],"location_type":"remote","location_city":"","match_threshold":65,"daily_limit":5,"boards":["jsearch","remoteok","weworkremotely","greenhouse","lever","otta"]}',
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS run_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    run_at TEXT DEFAULT CURRENT_TIMESTAMP,
    jobs_fetched INTEGER DEFAULT 0,
    jobs_scored INTEGER DEFAULT 0,
    jobs_applied INTEGER DEFAULT 0,
    jobs_skipped INTEGER DEFAULT 0,
    jobs_manual INTEGER DEFAULT 0,
    duration_seconds INTEGER
  );
`);

// Migration: Add missing columns to existing tables (safe ALTER TABLE)
const existingCols = db.pragma("table_info(jobs)").map(c => c.name);

if (!existingCols.includes("match_score")) {
  db.exec("ALTER TABLE jobs ADD COLUMN match_score INTEGER DEFAULT 0");
  console.log("[DB Migration] Added match_score column");
}

if (!existingCols.includes("is_skipped")) {
  db.exec("ALTER TABLE jobs ADD COLUMN is_skipped INTEGER DEFAULT 0");
  console.log("[DB Migration] Added is_skipped column");
}

if (!existingCols.includes("status")) {
  db.exec("ALTER TABLE jobs ADD COLUMN status TEXT DEFAULT 'pending'");
  console.log("[DB Migration] Added status column");
}

if (!existingCols.includes("notes")) {
  db.exec("ALTER TABLE jobs ADD COLUMN notes TEXT");
  console.log("[DB Migration] Added notes column");
}

if (!existingCols.includes("user_id")) {
  db.exec(`ALTER TABLE jobs ADD COLUMN user_id TEXT`);
  console.log("[DB Migration] Added user_id column");
}

if (!existingCols.includes("match_score_ai")) {
  db.exec(`ALTER TABLE jobs ADD COLUMN match_score_ai INTEGER`);
  console.log("[DB Migration] Added match_score_ai column");
}

if (!existingCols.includes("tailored_resume_text")) {
  db.exec(`ALTER TABLE jobs ADD COLUMN tailored_resume_text TEXT`);
  console.log("[DB Migration] Added tailored_resume_text column");
}

if (!existingCols.includes("tailored_resume_pdf_url")) {
  db.exec(`ALTER TABLE jobs ADD COLUMN tailored_resume_pdf_url TEXT`);
  console.log("[DB Migration] Added tailored_resume_pdf_url column");
}

// Prepared statements
const stmts = {
  upsertJob: db.prepare(`
    INSERT INTO jobs (id, title, company, board, board_color, salary, location, location_type, url, tags, description, match_score, posted_at, fetched_at)
    VALUES (@id, @title, @company, @board, @board_color, @salary, @location, @location_type, @url, @tags, @description, @match_score, @posted_at, @fetched_at)
    ON CONFLICT DO NOTHING
  `),

  getFreshJobs: db.prepare(`
    SELECT id, title, company, board, board_color, salary, location, location_type,
           url, tags, description, match_score, posted_at, fetched_at, is_applied, is_skipped, status, notes, applied_at
    FROM jobs
    WHERE is_applied = 0 AND is_skipped = 0
      AND date(posted_at) >= date('now', '-' || ? || ' days')
    GROUP BY lower(title), lower(company)
    HAVING posted_at = MAX(posted_at)
    ORDER BY match_score DESC, posted_at DESC
    LIMIT ?
  `),

  getAllJobs: db.prepare(`
    SELECT * FROM jobs ORDER BY match_score DESC, posted_at DESC LIMIT 100
  `),

  getTrackerJobs: db.prepare(`
    SELECT * FROM jobs
    WHERE is_applied = 1 OR is_skipped = 1 OR status != 'pending'
    ORDER BY applied_at DESC, posted_at DESC
  `),

  markApplied: db.prepare(`
    UPDATE jobs SET is_applied = 1, status = 'applied', applied_at = datetime('now') WHERE id = ?
  `),

  markSkipped: db.prepare(`
    UPDATE jobs SET is_skipped = 1, status = 'skipped' WHERE id = ?
  `),

  updateStatus: db.prepare(`
    UPDATE jobs SET status = ? WHERE id = ?
  `),

  updateNotes: db.prepare(`
    UPDATE jobs SET notes = ? WHERE id = ?
  `),

  getApplied: db.prepare(`
    SELECT * FROM jobs WHERE is_applied = 1 ORDER BY applied_at DESC
  `),

  jobExists: db.prepare(`SELECT 1 FROM jobs WHERE id = ? LIMIT 1`),

  logScrape: db.prepare(`
    INSERT INTO scrape_log (ran_at, source, jobs_found, jobs_new, error)
    VALUES (datetime('now'), ?, ?, ?, ?)
  `),

  getLastScrape: db.prepare(`
    SELECT ran_at FROM scrape_log ORDER BY ran_at DESC LIMIT 1
  `),
};

function insertJob(job) {
  const exists = stmts.jobExists.get(job.id);
  if (exists) return false;
  stmts.upsertJob.run({
    ...job,
    tags: JSON.stringify(job.tags || []),
    match_score: job.match_score || 0,
    fetched_at: new Date().toISOString(),
  });
  return true;
}

function insertJobs(jobs) {
  let newCount = 0;
  const insert = db.transaction((list) => {
    for (const job of list) {
      if (insertJob(job)) newCount++;
    }
  });
  insert(jobs);
  return newCount;
}

function getFreshJobs(maxDaysOld = 7, limit = 20) {
  return stmts.getFreshJobs.all(maxDaysOld, limit).map(deserializeJob);
}

function getAllJobs() {
  return stmts.getAllJobs.all().map(deserializeJob);
}

function getTrackerJobs() {
  return stmts.getTrackerJobs.all().map(deserializeJob);
}

function markApplied(jobId)          { stmts.markApplied.run(jobId); }
function markSkipped(jobId)          { stmts.markSkipped.run(jobId); }
function updateStatus(jobId, status) { stmts.updateStatus.run(status, jobId); }
function updateNotes(jobId, notes)   { stmts.updateNotes.run(notes, jobId); }
function getApplied()                { return stmts.getApplied.all().map(deserializeJob); }

function logScrape(source, jobsFound, jobsNew, error = null) {
  stmts.logScrape.run(source, jobsFound, jobsNew, error);
}

function getLastScrapeTime() {
  const row = stmts.getLastScrape.get();
  return row ? row.ran_at : null;
}

function deserializeJob(row) {
  return {
    ...row,
    tags: JSON.parse(row.tags || "[]"),
    is_applied: Boolean(row.is_applied),
    is_skipped: Boolean(row.is_skipped),
  };
}

function getUserByClerkId(clerkId) {
  return db.prepare('SELECT * FROM users WHERE clerk_id = ?').get(clerkId);
}

function createUser(id, email, clerkId) {
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO users (id, email, clerk_id, created_at) VALUES (?, ?, ?, ?)'
  ).run(id, email, clerkId, now);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

const DEFAULT_PREFERENCES = {
  roles: [],
  location_type: "remote",
  location_city: "",
  match_threshold: 65,
  daily_limit: 5,
  boards: ["jsearch", "remoteok", "weworkremotely", "greenhouse", "lever", "otta"],
};

function getUserPreferences(clerkId) {
  const row = db.prepare('SELECT preferences FROM users WHERE clerk_id = ?').get(clerkId);
  if (!row) return DEFAULT_PREFERENCES;
  try {
    return JSON.parse(row.preferences);
  } catch (err) {
    return DEFAULT_PREFERENCES;
  }
}

function updateUserPreferences(clerkId, preferences) {
  const { match_threshold, daily_limit } = preferences;
  if (typeof match_threshold !== "number" || match_threshold < 60 || match_threshold > 90) {
    throw new Error("match_threshold must be a number between 60 and 90");
  }
  if (typeof daily_limit !== "number" || daily_limit < 1 || daily_limit > 10) {
    throw new Error("daily_limit must be a number between 1 and 10");
  }
  db.prepare('UPDATE users SET preferences = ? WHERE clerk_id = ?')
    .run(JSON.stringify(preferences), clerkId);
  return JSON.parse(JSON.stringify(preferences));
}

module.exports = {
  insertJob, insertJobs, getFreshJobs, getAllJobs, getTrackerJobs,
  markApplied, markSkipped, updateStatus, updateNotes,
  getApplied, logScrape, getLastScrapeTime, db, getUserByClerkId, createUser,
  getUserPreferences, updateUserPreferences,
};

// DB_TYPE check and PostgreSQL pool setup (per Sprint 1a)
if (DB_TYPE === 'postgres') {
  try {
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    // Test connection
    pool.query('SELECT NOW()', (err, res) => {
      if (err) {
        console.error('[DB] PostgreSQL connection error:', err.message);
      } else {
        console.log('[DB] PostgreSQL connected successfully');
      }
    });
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      console.warn('[DB] pg module not installed - install with: npm install pg');
    } else {
      console.error('[DB] Error initializing PostgreSQL pool:', err.message);
    }
  }
}