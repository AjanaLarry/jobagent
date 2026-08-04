const { runAllScrapers } = require('../scrapers');
const { semanticScore, matchScore } = require('../scrapers/utils');
const { applyToJob } = require('../apply/applyToJob');
const { sendRunSummary } = require('../email/sendSummary');
const { tailorResume } = require('../ai/tailorResume');
const { generatePDF } = require('../pdf/generatePDF');
const { uploadPDF } = require('../storage/uploadFile');
const db = require('../db/database');
const { randomUUID } = require('crypto');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runPipeline(userId, { skipScrape = false } = {}) {
  // STEP 1 — Load user
  const user = await db.getUserById(userId);
  if (!user) throw new Error(`User not found: ${userId}`);
  if (!user.active) return { skipped: true, reason: 'user_inactive' };
  if (!user.resume_parsed) return { skipped: true, reason: 'no_resume' };

  // STEP 2 — Load preferences
  const prefs = await db.getUserPreferences(user.clerk_id);

  // STEP 3 — Run global scrape
  const startTime = Date.now();
  if (!skipScrape) {
    await runAllScrapers(1); // maxDaysOld = 1 for pipeline runs (last 24h only)
  }

  // STEP 4 — Get fresh jobs and filter for this user
  const allJobs = await db.getFreshJobs(1, 100);
  const roleKeywords = (prefs.roles || []).map((r) => r.toLowerCase());

  const eligibleJobs = allJobs.filter((job) => {
    const boardMatch = prefs.boards.includes((job.board || '').toLowerCase());
    const roleMatch =
      roleKeywords.length === 0 ||
      roleKeywords.some((kw) => (job.title || '').toLowerCase().includes(kw));
    const statusOk = job.status === 'pending' || job.status === 'new';
    return boardMatch && roleMatch && statusOk;
  });

  for (const job of eligibleJobs) {
    await db.assignJobToUser(job.id, user.id);
  }

  // STEP 5 — Score each job
  const parsedResume = JSON.parse(user.resume_parsed);
  const scoredJobs = [];

  for (const job of eligibleJobs) {
    const keywordScore = matchScore(job.description || '');
    if (keywordScore < 10) {
      await db.markSkipped(job.id);
      continue;
    }

    const scoreResult = await semanticScore(parsedResume, job);
    if (scoreResult.score >= prefs.match_threshold) {
      await db.updateJobScoreAI(job.id, scoreResult.score);
      scoredJobs.push({ ...job, aiScore: scoreResult.score });
    } else {
      await db.markSkipped(job.id);
    }

    await sleep(500);
  }

  // STEP 6 — Tailor and apply each scored job
  for (const scoredJob of scoredJobs) {
    const count = await db.getDailyApplyCount(user.id);
    if (count >= prefs.daily_limit) break;

    const profile = JSON.parse(user.resume_parsed || '{}');
    let jobToApply = scoredJob;

    try {
      const tailored = await tailorResume(user.resume_raw || '', scoredJob);
      const pdfBuffer = await generatePDF(tailored, profile.name || 'Resume');
      const pdfUrl = await uploadPDF(pdfBuffer, user.id, scoredJob.id);
      await db.updateJobTailored(scoredJob.id, tailored, pdfUrl);
      jobToApply = { ...scoredJob, tailored_resume_pdf_url: pdfUrl };
    } catch (tailorErr) {
      console.error(`[Pipeline] Tailor failed for ${scoredJob.id}:`, tailorErr.message);
      // Continue with original job — applyToJob will
      // handle missing PDF by going to manual queue
    }

    await applyToJob(jobToApply, user);
    await sleep(300);
  }

  // STEP 7 — Compile run summary
  const endTime = Date.now();
  const manualJobs = await db.getManualJobs(user.id);

  const jobs_fetched = allJobs.length;
  const jobs_scored = scoredJobs.length;
  const jobs_applied = await db.getDailyApplyCount(user.id);
  const jobs_skipped = allJobs.length - scoredJobs.length;
  const jobs_manual = manualJobs.length;
  const duration_seconds = Math.round((endTime - startTime) / 1000);

  const runLog = {
    id: randomUUID(),
    user_id: user.id,
    jobs_fetched,
    jobs_scored,
    jobs_applied,
    jobs_skipped,
    jobs_manual,
    duration_seconds,
  };

  await db.insertRunLog(runLog);

  // STEP 8 — Send email
  await sendRunSummary(user, runLog, manualJobs);

  return runLog;
}

module.exports = { runPipeline };
