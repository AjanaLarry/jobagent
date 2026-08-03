async function sendRunSummary(user, runLog, manualJobs) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'onboarding@resend.dev';

  if (!apiKey) {
    console.warn('[Email] RESEND_API_KEY not set — skipping email');
    return { sent: false, reason: 'no_api_key' };
  }

  if (runLog.jobs_applied === 0 && runLog.jobs_manual === 0) {
    return { sent: false, reason: 'nothing_to_report' };
  }

  try {
    const { Resend } = require('resend');
    const resend = new Resend(apiKey);

    const profile = JSON.parse(user.resume_parsed || '{}');
    const name = profile.name || 'there';

    const subject = `JobAgent — ${runLog.jobs_applied} application${runLog.jobs_applied !== 1 ? 's' : ''} sent today`;

    const body = `Hi ${name},

Your job agent completed its daily run.

✓ ${runLog.jobs_applied} application${runLog.jobs_applied !== 1 ? 's' : ''} submitted automatically
⚠ ${runLog.jobs_manual} role${runLog.jobs_manual !== 1 ? 's' : ''} need your manual review
— ${runLog.jobs_skipped} roles skipped (below match threshold)

${manualJobs.length > 0 ? `NEEDS MANUAL REVIEW:\n${manualJobs.map(j => `• ${j.title} @ ${j.company}\n  ${j.url}`).join('\n')}` : ''}

Log in to view your dashboard:
https://jobagent-zeta.vercel.app/dashboard

—
JobAgent`;

    const result = await resend.emails.send({
      from,
      to: user.email,
      subject,
      text: body,
    });

    if (result.error) {
      console.error('[Email] Send failed:', result.error.message || result.error);
      return { sent: false, reason: result.error.message || 'resend_api_error' };
    }

    return { sent: true, id: result.data.id };
  } catch (err) {
    console.error('[Email] Send failed:', err.message);
    return { sent: false, reason: err.message };
  }
}

module.exports = { sendRunSummary };
