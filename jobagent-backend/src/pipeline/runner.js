const { runAllScrapers } = require('../scrapers');
const { semanticScore, matchScore } = require('../scrapers/utils');
const { applyToJob } = require('../apply/applyToJob');
const { sendRunSummary } = require('../email/sendSummary');
const db = require('../db/database');
const { randomUUID } = require('crypto');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runPipeline(userId) {
  // STEP 1 — Load user
  const user = db.db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) throw new Error(`User not found: ${userId}`);
  if (!user.active) return { skipped: true, reason: 'user_inactive' };
  if (!user.resume_parsed) return { skipped: true, reason: 'no_resume' };

  // STEP 2 — Load preferences
  const prefs = db.getUserPreferences(user.clerk_id);

  // STEP 3 — Run global scrape
  const startTime = Date.now();
  await runAllScrapers(1); // maxDaysOld = 1 for pipeline runs (last 24h only)

  // STEP 4 — Get fresh jobs and filter for this user
  const allJobs = db.getFreshJobs(1, 100);
  const roleKeywords = (prefs.roles || []).map((r) => r.toLowerCase());

  const eligibleJobs = allJobs.filter((job) => {
    const boardMatch = prefs.boards.includes((job.board || '').toLowerCase());
    const roleMatch =
      roleKeywords.length === 0 ||
      roleKeywords.some((kw) => (job.title || '').toLowerCase().includes(kw));
    const statusOk = job.status === 'pending' || job.status === 'new';
    const unclaimed = !job.user_id;
    return boardMatch && roleMatch && statusOk && unclaimed;
  });

  for (const job of eligibleJobs) {
    db.db.prepare('UPDATE jobs SET user_id = ? WHERE id = ?').run(user.id, job.id);
  }

  // STEP 5 — Score each job
  const parsedResume = JSON.parse(user.resume_parsed);
  const scoredJobs = [];

  for (const job of eligibleJobs) {
    const keywordScore = matchScore(job.description || '');
    if (keywordScore < 40) {
      db.markSkipped(job.id);
      continue;
    }

    const scoreResult = await semanticScore(parsedResume, job);
    if (scoreResult.score >= prefs.match_threshold) {
      db.updateJobScoreAI(job.id, scoreResult.score);
      scoredJobs.push({ ...job, aiScore: scoreResult.score });
    } else {
      db.markSkipped(job.id);
    }

    await sleep(500);
  }

  // STEP 6 — Tailor and apply each scored job
  for (const scoredJob of scoredJobs) {
    const count = db.getDailyApplyCount(user.id);
    if (count >= prefs.daily_limit) break;

    await applyToJob(scoredJob, user);
    await sleep(300);
  }

  // STEP 7 — Compile run summary
  const endTime = Date.now();
  const manualJobs = db.getManualJobs(user.id);

  const jobs_fetched = allJobs.length;
  const jobs_scored = scoredJobs.length;
  const jobs_applied = db.getDailyApplyCount(user.id);
  const jobs_skipped = allJobs.length - scoredJobs.length;
  const jobs_manual = manualJobs.length;
  const duration_seconds = Math.round((endTime - startTime) / 1000);

  const runLogId = randomUUID();
  db.db.prepare(`
    INSERT INTO run_logs
      (id, user_id, run_at, jobs_fetched, jobs_scored,
       jobs_applied, jobs_skipped, jobs_manual,
       duration_seconds)
    VALUES (?, ?, datetime('now'), ?, ?, ?, ?, ?, ?)
  `).run(
    runLogId, user.id, jobs_fetched, jobs_scored,
    jobs_applied, jobs_skipped, jobs_manual, duration_seconds
  );

  const runLog = {
    id: runLogId,
    user_id: user.id,
    jobs_fetched,
    jobs_scored,
    jobs_applied,
    jobs_skipped,
    jobs_manual,
    duration_seconds,
  };

  // STEP 8 — Send email
  await sendRunSummary(user, runLog, manualJobs);

  return runLog;
}

module.exports = { runPipeline };
