const https = require('https');
const fs = require('fs');
const path = require('path');
const { getBrowser } = require('./browser');
const { detectForm } = require('./detectForm');
const { fillForm } = require('./fillForm');
const db = require('../db/database');

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          file.close();
          fs.unlink(destPath, () => {});
          reject(new Error(`Failed to download PDF: status ${response.statusCode}`));
          return;
        }
        response.pipe(file);
        file.on('finish', () => {
          file.close(() => resolve());
        });
      })
      .on('error', (err) => {
        file.close();
        fs.unlink(destPath, () => {});
        reject(err);
      });

    file.on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

async function applyToJob(job, user) {
  const pdfPath = path.join('/tmp', `${job.id}.pdf`);
  let page = null;

  try {
    // STEP 1 — Check daily limit
    const { count } = db.db.prepare(`
      SELECT COUNT(*) as count FROM jobs
      WHERE user_id = ?
        AND status = 'applied'
        AND date(applied_at) = date('now')
    `).get(user.id);

    const preferences = db.getUserPreferences(user.clerk_id);
    if (count >= preferences.daily_limit) {
      return { success: false, reason: 'daily_limit_reached', finalUrl: job.url };
    }

    // STEP 2 — Parse user profile
    const profile = JSON.parse(user.resume_parsed || '{}');
    const name = profile.name;
    const email = profile.email || user.email;
    const phone = profile.phone;
    const location = profile.location;
    const experience_years = profile.experience_years;

    // STEP 3 — Download PDF to temp file
    try {
      await downloadFile(job.tailored_resume_pdf_url, pdfPath);
    } catch (downloadErr) {
      db.markManual(job.id, 'PDF download failed');
      return { success: false, reason: 'pdf_download_failed', finalUrl: job.url };
    }

    // STEP 4 — Navigate to job URL
    const browser = await getBrowser();
    page = await browser.newPage();
    page.setDefaultTimeout(15000);
    await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 15000 });

    // STEP 5 — Detect form
    const detection = await detectForm(page);
    if (detection.formType !== 'standard') {
      await page.close();
      page = null;
      db.markManual(job.id, `Form type: ${detection.formType}`);
      return { success: false, reason: detection.formType, finalUrl: job.url };
    }

    // STEP 6 — Fill and submit
    const userProfile = { name, email, phone, location, experience_years };
    const result = await fillForm(page, userProfile, pdfPath);
    await page.close();
    page = null;

    // STEP 7 — Handle result
    if (result.submitted) {
      db.markApplied(job.id);
      return { success: true, finalUrl: result.finalUrl };
    } else {
      db.markManual(job.id, 'Submit button not found');
      return { success: false, reason: 'submit_failed', finalUrl: result.finalUrl };
    }
  } catch (err) {
    if (page) {
      try {
        await page.close();
      } catch (closeErr) {
        // ignore
      }
    }
    db.markManual(job.id, err.message || 'Unexpected error during apply');
    return { success: false, reason: 'unexpected_error', finalUrl: job.url };
  } finally {
    try {
      fs.unlinkSync(pdfPath);
    } catch (unlinkErr) {
      // ignore if file doesn't exist
    }
  }
}

module.exports = { applyToJob };
