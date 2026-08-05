const { runAllScrapers } = require('../scrapers');
const { semanticScore, matchScore, requiresUSWorkAuth } = require('../scrapers/utils');
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
  if (!user.resume_parsed) {
    console.warn(
      '[Pipeline] User has no parsed resume — ' +
      'skipping pipeline. Ask user to upload resume.'
    );
    return { skipped: true, reason: 'no_resume' };
  }

  // STEP 2 — Load preferences
  const prefs = await db.getUserPreferences(user.clerk_id);

  // STEP 3 — Run global scrape
  const startTime = Date.now();
  if (!skipScrape) {
    await runAllScrapers(1); // maxDaysOld = 1 for pipeline runs (last 24h only)
  }

  // STEP 4 — Get fresh jobs and filter for this user
  const allJobs = await db.getFreshJobs(7, 100);
  console.log(`[Pipeline] getFreshJobs returned ${allJobs.length} jobs for user ${userId}`);
  const roleKeywords = (prefs.roles || [])
    .flatMap(r => r.toLowerCase()
      .split(/[\s,()]+/)
      .filter(w => w.length >= 4)
    );

  // Normalize board name: strip publisher suffix ("JSearch · LinkedIn" → "jsearch")
  // and collapse whitespace variants ("we work remotely" → "weworkremotely")
  function normalizeBoard(board) {
    return (board || '')
      .toLowerCase()
      .split('·')[0]          // drop " · publisher" suffix
      .replace(/\s+/g, '')    // collapse spaces ("we work remotely" → "weworkremotely")
      .trim();
  }

  // Map user's location_types prefs to the job.location_type values actually
  // stored on jobs.
  const locationTypeMap = {
    remote_worldwide: 'remote',
    remote_canada: 'remote',
    hybrid_canada: 'hybrid',
    onsite: 'on-site'
  };
  const allowedJobLocations = (prefs.location_types || ['remote_worldwide'])
    .map(lt => locationTypeMap[lt])
    .filter(Boolean);

  const eligibleJobs = allJobs.filter((job) => {
    const boardMatch =
      prefs.boards.length === 0 ||
      prefs.boards.includes(normalizeBoard(job.board));
    const roleMatch =
      roleKeywords.length === 0 ||
      roleKeywords.some((kw) => (job.title || '').toLowerCase().includes(kw));
    const statusOk = job.status === 'pending' || job.status === 'new' || !job.status;
    const locationMatch = allowedJobLocations.length === 0 ||
      allowedJobLocations.includes((job.location_type || '').toLowerCase()) ||
      job.location_type === null; // include if unknown
    const sponsorshipOk = !prefs.exclude_sponsorship ||
      !requiresUSWorkAuth(job.description || '');
    if (!boardMatch || !roleMatch || !statusOk || !locationMatch || !sponsorshipOk) {
      console.log(`[Pipeline] SKIP "${job.title}" board=${normalizeBoard(job.board)} boardMatch=${boardMatch} roleMatch=${roleMatch} statusOk=${statusOk} locationMatch=${locationMatch} sponsorshipOk=${sponsorshipOk} status=${job.status} location_type=${job.location_type}`);
    }
    return boardMatch && roleMatch && statusOk && locationMatch && sponsorshipOk;
  });

  // Diagnostic: show filter breakdown
  const boardCounts = {};
  const statusCounts = {};
  for (const job of allJobs) {
    const b = (job.board || 'unknown').toLowerCase();
    boardCounts[b] = (boardCounts[b] || 0) + 1;
    const s = job.status || 'null';
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  }
  console.log(`[Pipeline] boards in DB:`, JSON.stringify(boardCounts));
  console.log(`[Pipeline] statuses in DB:`, JSON.stringify(statusCounts));
  console.log(`[Pipeline] prefs.boards:`, JSON.stringify(prefs.boards));

  for (const job of eligibleJobs) {
    await db.assignJobToUser(job.id, user.id);
  }
  console.log(`[Pipeline] ${eligibleJobs.length} eligible after board/role/status filter`);

  // STEP 5 — Score each job
  const parsedResume = JSON.parse(user.resume_parsed);
  const scoredJobs = [];

  const BATCH_SIZE = 3;
  for (let i = 0; i < eligibleJobs.length; i += BATCH_SIZE) {
    const batch = eligibleJobs.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (job) => {
      const descLen = (job.description || '').length;
      const keywordScore = matchScore(job.description || '');
      console.log(`[Pipeline] job ${job.id} "${job.title}" descLen=${descLen} keywordScore=${keywordScore}`);
      if (keywordScore < 5) {
        await db.markSkipped(job.id);
        return;
      }

      const scoreResult = await semanticScore(parsedResume, job);
      if (scoreResult.score >= prefs.match_threshold) {
        await db.updateJobScoreAI(job.id, scoreResult.score);
        scoredJobs.push({ ...job, aiScore: scoreResult.score });
      } else {
        await db.markSkipped(job.id);
      }
    }));
  }

  // STEP 6 — Tailor and apply each scored job
  const APPLY_BATCH = 2;
  for (let i = 0; i < scoredJobs.length; i += APPLY_BATCH) {
    // Check remaining quota once per batch (not once per job) and clamp the
    // batch to it, so daily_limit can't be overrun by concurrent applies
    // racing each other on the same stale count.
    const count = await db.getDailyApplyCount(user.id);
    if (count >= prefs.daily_limit) break;

    const remaining = prefs.daily_limit - count;
    const batch = scoredJobs.slice(i, i + Math.min(APPLY_BATCH, remaining));
    if (batch.length === 0) break;

    await Promise.all(batch.map(async (scoredJob) => {
      const profile = JSON.parse(user.resume_parsed || '{}');
      let jobToApply = scoredJob;

      try {
        const tailored = await tailorResume(user.resume_raw || '', scoredJob);
        const pdfBuffer = await generatePDF(tailored, profile.name || 'Resume');
        const pdfUrl = await uploadPDF(pdfBuffer, user.id, scoredJob.id);
        await db.updateJobTailored(scoredJob.id, tailored, pdfUrl);
        jobToApply = { ...scoredJob, tailored_resume_pdf_url: pdfUrl };
      } catch (tailorErr) {
        console.error(
          `[Pipeline] Tailor failed for ${scoredJob.id}:`,
          tailorErr.message
        );
        await db.markManual(
          scoredJob.id,
          'Tailoring failed — manual review needed'
        );
        return; // skip to next job — do not call applyToJob
      }

      await db.markManual(
        scoredJob.id,
        'Tailored — ready for manual apply'
      );
    }));

    await sleep(300);
  }

  // STEP 7 — Compile run summary
  const endTime = Date.now();
  const manualJobs = await db.getManualJobs(user.id);

  const jobs_fetched = allJobs.length;
  const jobs_scored = scoredJobs.length;
  const jobs_applied = await db.getDailyApplyCount(user.id);
  const jobs_skipped = eligibleJobs.length - scoredJobs.length;
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
