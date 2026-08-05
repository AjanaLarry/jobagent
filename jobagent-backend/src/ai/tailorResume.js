const { getGeminiClient } = require('./geminiClient');

async function tailorResume(resumeText, job) {
  const genAI = getGeminiClient();
  if (!genAI) throw new Error('GEMINI_API_KEY not configured');

  const model = genAI.getGenerativeModel({
    model: 'gemini-3.5-flash'
  });

  const prompt = `You are an elite technical resume strategist.
RULES:
1. NEVER soften or downplay the candidate's seniority.
2. Rewrite ONLY the PROFILE section to mirror this job.
3. Reorder bullets so most relevant achievements lead.
4. Embed ATS keywords naturally throughout.
5. Preserve every metric and certification exactly.
Return the complete tailored resume as clean plain text.

MY RESUME:
${resumeText}

---
JOB: ${job.title} @ ${job.company}
LOCATION: ${job.location || 'Remote'}
DESCRIPTION:
${(job.description || '').substring(0, 2000)}`;

  const MAX_RETRIES = 3;
  const TOTAL_ATTEMPTS = MAX_RETRIES + 1;

  for (let attempt = 0; attempt < TOTAL_ATTEMPTS; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      return result.response.text();

    } catch (err) {
      const is503 = err.message?.includes('503') ||
                    err.message?.includes('Service Unavailable') ||
                    err.message?.includes('overloaded');

      if (is503 && attempt < MAX_RETRIES) {
        const waitMs = Math.pow(2, attempt + 1) * 1000;
        console.warn(
          `[Tailor] Gemini 503 — retry ${attempt + 1}/${MAX_RETRIES} in ${waitMs / 1000}s`
        );
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }

      throw err;
    }
  }

  throw new Error('tailorResume: all retries exhausted');
}

module.exports = { tailorResume };
