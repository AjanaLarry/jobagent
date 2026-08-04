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

// PostgreSQL pool (only created when DB_TYPE=postgres; moved above module.exports
// so the query adapter functions below can reference it)
let pool = null;
if (DB_TYPE === 'postgres') {
  try {
    const { Pool } = require('pg');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    pool.query('SELECT NOW()', (err) => {
      if (err) console.error('[DB] PostgreSQL connection error:', err.message);
      else console.log('[DB] PostgreSQL connected successfully');
    });
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      console.warn('[DB] pg module not installed - install with: npm install pg');
    } else {
      console.error('[DB] Error initializing PostgreSQL pool:', err.message);
    }
  }
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

function getJobById(jobId) {
  const row = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);
  if (!row) return null;
  return deserializeJob(row);
}

function updateJobScoreAI(jobId, score) {
  db.prepare('UPDATE jobs SET match_score_ai = ? WHERE id = ?').run(score, jobId);
}

function updateJobTailored(jobId, resumeText, pdfUrl) {
  db.prepare(
    'UPDATE jobs SET tailored_resume_text = ?, tailored_resume_pdf_url = ? WHERE id = ?'
  ).run(resumeText, pdfUrl, jobId);
}

function getTailoredResumes(userId) {
  return db.prepare(`
    SELECT id, title, company, board, match_score_ai,
           tailored_resume_pdf_url, fetched_at
    FROM jobs
    WHERE user_id = ?
      AND tailored_resume_pdf_url IS NOT NULL
    ORDER BY fetched_at DESC
  `).all(userId);
}

function markManual(jobId, reason) {
  db.prepare(
    'UPDATE jobs SET status = ?, notes = ? WHERE id = ?'
  ).run('manual', reason || 'Manual review required', jobId);
}

function getDailyApplyCount(userId) {
  const row = db.prepare(`
    SELECT COUNT(*) as count FROM jobs
    WHERE user_id = ? AND status = 'applied'
      AND date(applied_at) = date('now')
  `).get(userId);
  return row ? row.count : 0;
}

function getManualJobs(userId) {
  return db.prepare(`
    SELECT id, title, company, board, url,
           match_score_ai, notes, fetched_at,
           tailored_resume_pdf_url
    FROM jobs
    WHERE user_id = ? AND status = 'manual'
    ORDER BY fetched_at DESC
  `).all(userId);
}

function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function insertRunLog({ id, user_id, jobs_fetched, jobs_scored,
                        jobs_applied, jobs_skipped,
                        jobs_manual, duration_seconds }) {
  db.prepare(`
    INSERT INTO run_logs
      (id, user_id, run_at, jobs_fetched, jobs_scored,
       jobs_applied, jobs_skipped, jobs_manual, duration_seconds)
    VALUES (?, ?, datetime('now'), ?, ?, ?, ?, ?, ?)
  `).run(id, user_id, jobs_fetched, jobs_scored,
         jobs_applied, jobs_skipped, jobs_manual,
         duration_seconds);
}

function getRunLogs(userId, limit = 10) {
  return db.prepare(`
    SELECT * FROM run_logs
    WHERE user_id = ?
    ORDER BY run_at DESC
    LIMIT ?
  `).all(userId, limit);
}

function saveUserResume(userId, resumeRaw, resumeParsed) {
  db.prepare(
    'UPDATE users SET resume_raw = ?, resume_parsed = ? WHERE id = ?'
  ).run(resumeRaw, JSON.stringify(resumeParsed), userId);
}

function assignJobToUser(jobId, userId) {
  db.prepare(
    'UPDATE jobs SET user_id = ? WHERE id = ?'
  ).run(userId, jobId);
}

// ---------------------------------------------------------------------------
// PostgreSQL implementations — mirror every SQLite function above.
// All async (pool.query is async); SQLite functions above are untouched.
// ---------------------------------------------------------------------------

async function pgInsertJob(job) {
  const existing = await pool.query('SELECT 1 FROM jobs WHERE id = $1', [job.id]);
  if (existing.rows.length > 0) return false;
  await pool.query(
    `INSERT INTO jobs (id, title, company, board, board_color, salary, location, location_type, url, tags, description, match_score, posted_at, fetched_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (LOWER(title), LOWER(company)) DO NOTHING`,
    [job.id, job.title, job.company, job.board, job.board_color, job.salary, job.location,
     job.location_type, job.url, JSON.stringify(job.tags || []), job.description,
     job.match_score || 0, job.posted_at, new Date().toISOString()]
  );
  return true;
}

async function pgInsertJobs(jobs) {
  let newCount = 0;
  for (const job of jobs) {
    if (await pgInsertJob(job)) newCount++;
  }
  return newCount;
}

// Preserves SQLite semantics: dedupe by lower(title)/lower(company) keeping the
// max posted_at row, filter out applied/skipped, filter on posted_at (not
// fetched_at). SQLite's GROUP BY/HAVING trick isn't valid Postgres, so this
// uses DISTINCT ON instead — see flags below.
async function pgGetFreshJobs(maxDaysOld = 7, limit = 20) {
  const result = await pool.query(
    `SELECT * FROM (
       SELECT DISTINCT ON (LOWER(title), LOWER(company)) *
       FROM jobs
       WHERE is_applied = 0 AND is_skipped = 0
         AND posted_at::date >= (CURRENT_DATE - ($1::int * INTERVAL '1 day'))
       ORDER BY LOWER(title), LOWER(company), posted_at DESC
     ) dedup
     ORDER BY match_score DESC, posted_at DESC
     LIMIT $2`,
    [maxDaysOld, limit]
  );
  return result.rows.map(deserializeJob);
}

async function pgGetAllJobs() {
  const result = await pool.query(
    `SELECT * FROM jobs ORDER BY match_score DESC, posted_at DESC LIMIT 100`
  );
  return result.rows.map(deserializeJob);
}

async function pgGetTrackerJobs() {
  const result = await pool.query(
    `SELECT * FROM jobs
     WHERE is_applied = 1 OR is_skipped = 1 OR status != 'pending'
     ORDER BY applied_at DESC, posted_at DESC`
  );
  return result.rows.map(deserializeJob);
}

async function pgMarkApplied(jobId) {
  await pool.query(
    `UPDATE jobs SET is_applied = 1, status = 'applied', applied_at = NOW() WHERE id = $1`,
    [jobId]
  );
}

async function pgMarkSkipped(jobId) {
  await pool.query(
    `UPDATE jobs SET is_skipped = 1, status = 'skipped' WHERE id = $1`,
    [jobId]
  );
}

async function pgUpdateStatus(jobId, status) {
  await pool.query('UPDATE jobs SET status = $1 WHERE id = $2', [status, jobId]);
}

async function pgUpdateNotes(jobId, notes) {
  await pool.query('UPDATE jobs SET notes = $1 WHERE id = $2', [notes, jobId]);
}

async function pgGetApplied() {
  const result = await pool.query(
    `SELECT * FROM jobs WHERE is_applied = 1 ORDER BY applied_at DESC`
  );
  return result.rows.map(deserializeJob);
}

async function pgLogScrape(source, jobsFound, jobsNew, error = null) {
  await pool.query(
    `INSERT INTO scrape_log (ran_at, source, jobs_found, jobs_new, error)
     VALUES (NOW(), $1, $2, $3, $4)`,
    [source, jobsFound, jobsNew, error]
  );
}

async function pgGetLastScrapeTime() {
  const result = await pool.query(`SELECT MAX(ran_at) as last_scrape FROM scrape_log`);
  return result.rows[0]?.last_scrape || null;
}

async function pgGetUserByClerkId(clerkId) {
  const result = await pool.query('SELECT * FROM users WHERE clerk_id = $1', [clerkId]);
  return result.rows[0] || null;
}

async function pgCreateUser(id, email, clerkId) {
  await pool.query(
    `INSERT INTO users (id, email, clerk_id, created_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (clerk_id) DO NOTHING`,
    [id, email, clerkId]
  );
  return pgGetUserByClerkId(clerkId);
}

async function pgGetUserPreferences(clerkId) {
  const result = await pool.query('SELECT preferences FROM users WHERE clerk_id = $1', [clerkId]);
  if (!result.rows[0]) return DEFAULT_PREFERENCES;
  try {
    return JSON.parse(result.rows[0].preferences);
  } catch (err) {
    return DEFAULT_PREFERENCES;
  }
}

async function pgUpdateUserPreferences(clerkId, preferences) {
  const { match_threshold, daily_limit } = preferences;
  if (typeof match_threshold !== "number" || match_threshold < 60 || match_threshold > 90) {
    throw new Error("match_threshold must be a number between 60 and 90");
  }
  if (typeof daily_limit !== "number" || daily_limit < 1 || daily_limit > 10) {
    throw new Error("daily_limit must be a number between 1 and 10");
  }
  await pool.query('UPDATE users SET preferences = $1 WHERE clerk_id = $2', [
    JSON.stringify(preferences), clerkId
  ]);
  return JSON.parse(JSON.stringify(preferences));
}

async function pgGetJobById(jobId) {
  const result = await pool.query('SELECT * FROM jobs WHERE id = $1', [jobId]);
  return result.rows[0] ? deserializeJob(result.rows[0]) : null;
}

async function pgUpdateJobScoreAI(jobId, score) {
  await pool.query('UPDATE jobs SET match_score_ai = $1 WHERE id = $2', [score, jobId]);
}

async function pgUpdateJobTailored(jobId, resumeText, pdfUrl) {
  await pool.query(
    `UPDATE jobs SET tailored_resume_text = $1, tailored_resume_pdf_url = $2 WHERE id = $3`,
    [resumeText, pdfUrl, jobId]
  );
}

async function pgGetTailoredResumes(userId) {
  const result = await pool.query(
    `SELECT id, title, company, board, match_score_ai,
            tailored_resume_pdf_url, fetched_at
     FROM jobs
     WHERE user_id = $1 AND tailored_resume_pdf_url IS NOT NULL
     ORDER BY fetched_at DESC`,
    [userId]
  );
  return result.rows;
}

async function pgMarkManual(jobId, reason) {
  await pool.query(
    `UPDATE jobs SET status = 'manual', notes = $1 WHERE id = $2`,
    [reason || 'Manual review required', jobId]
  );
}

async function pgGetDailyApplyCount(userId) {
  const result = await pool.query(
    `SELECT COUNT(*) as count FROM jobs
     WHERE user_id = $1 AND status = 'applied' AND applied_at::date = CURRENT_DATE`,
    [userId]
  );
  return parseInt(result.rows[0]?.count || 0, 10);
}

async function pgGetManualJobs(userId) {
  const result = await pool.query(
    `SELECT id, title, company, board, url,
            match_score_ai, notes, fetched_at, tailored_resume_pdf_url
     FROM jobs
     WHERE user_id = $1 AND status = 'manual'
     ORDER BY fetched_at DESC`,
    [userId]
  );
  return result.rows;
}

async function pgGetUserById(id) {
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function pgInsertRunLog({ id, user_id, jobs_fetched, jobs_scored,
                                 jobs_applied, jobs_skipped,
                                 jobs_manual, duration_seconds }) {
  await pool.query(
    `INSERT INTO run_logs
       (id, user_id, run_at, jobs_fetched, jobs_scored,
        jobs_applied, jobs_skipped, jobs_manual, duration_seconds)
     VALUES ($1,$2,NOW(),$3,$4,$5,$6,$7,$8)`,
    [id, user_id, jobs_fetched, jobs_scored, jobs_applied, jobs_skipped,
     jobs_manual, duration_seconds]
  );
}

async function pgGetRunLogs(userId, limit = 10) {
  const result = await pool.query(
    `SELECT * FROM run_logs WHERE user_id = $1 ORDER BY run_at DESC LIMIT $2`,
    [userId, limit]
  );
  return result.rows;
}

async function pgSaveUserResume(userId, resumeRaw, resumeParsed) {
  await pool.query(
    'UPDATE users SET resume_raw = $1, resume_parsed = $2 WHERE id = $3',
    [resumeRaw, JSON.stringify(resumeParsed), userId]
  );
}

async function pgAssignJobToUser(jobId, userId) {
  await pool.query(
    'UPDATE jobs SET user_id = $1 WHERE id = $2',
    [userId, jobId]
  );
}

// Compatibility shim for call sites that use db.db.prepare(...).get/all/run
// directly. Converts `?` placeholders to $1,$2... All three methods are async;
// callers that don't await will receive a Promise instead of a result.
const pgDbShim = {
  prepare: (sql) => ({
    get: async (...params) => {
      let i = 0;
      const pgSql = sql.replace(/\?/g, () => `$${++i}`);
      const result = await pool.query(pgSql, params);
      return result.rows[0] || null;
    },
    all: async (...params) => {
      let i = 0;
      const pgSql = sql.replace(/\?/g, () => `$${++i}`);
      const result = await pool.query(pgSql, params);
      return result.rows;
    },
    run: async (...params) => {
      let i = 0;
      const pgSql = sql.replace(/\?/g, () => `$${++i}`);
      await pool.query(pgSql, params);
    },
  }),
};

if (DB_TYPE === 'sqlite') {
  module.exports = {
    insertJob, insertJobs, getFreshJobs, getAllJobs, getTrackerJobs,
    markApplied, markSkipped, updateStatus, updateNotes,
    getApplied, logScrape, getLastScrapeTime, db, getUserByClerkId, createUser,
    getUserPreferences, updateUserPreferences,
    getJobById, updateJobScoreAI, updateJobTailored,
    getTailoredResumes, markManual,
    getDailyApplyCount, getManualJobs,
    getUserById, insertRunLog, getRunLogs,
    saveUserResume, assignJobToUser,
  };
} else {
  module.exports = {
    insertJob: pgInsertJob, insertJobs: pgInsertJobs, getFreshJobs: pgGetFreshJobs,
    getAllJobs: pgGetAllJobs, getTrackerJobs: pgGetTrackerJobs,
    markApplied: pgMarkApplied, markSkipped: pgMarkSkipped,
    updateStatus: pgUpdateStatus, updateNotes: pgUpdateNotes,
    getApplied: pgGetApplied, logScrape: pgLogScrape, getLastScrapeTime: pgGetLastScrapeTime,
    db: pgDbShim, getUserByClerkId: pgGetUserByClerkId, createUser: pgCreateUser,
    getUserPreferences: pgGetUserPreferences, updateUserPreferences: pgUpdateUserPreferences,
    getJobById: pgGetJobById, updateJobScoreAI: pgUpdateJobScoreAI, updateJobTailored: pgUpdateJobTailored,
    getTailoredResumes: pgGetTailoredResumes, markManual: pgMarkManual,
    getDailyApplyCount: pgGetDailyApplyCount, getManualJobs: pgGetManualJobs,
    getUserById: pgGetUserById, insertRunLog: pgInsertRunLog, getRunLogs: pgGetRunLogs,
    saveUserResume: pgSaveUserResume, assignJobToUser: pgAssignJobToUser,
  };
}