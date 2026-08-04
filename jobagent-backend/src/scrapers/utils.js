// src/scrapers/utils.js
const crypto = require("crypto");

// ── Relevance filtering ────────────────────────────────────────────────────────
// Candidate: 5+ years, cloud/DevOps, AWS/Azure/GCP certified.
// Accept: cloud, devops, infra, SRE, platform, support roles at any level up to senior.
// Reject: director/VP/C-suite, clearly unrelated fields.

const MUST_HAVE = [
  "cloud", "devops", "dev ops", "aws", "azure", "gcp", "infrastructure",
  "sre", "site reliability", "platform engineer", "kubernetes", "docker",
  "terraform", "technical support", "cloud support", "it support",
  "support engineer", "systems engineer", "linux", "cloud operations",
  "automation engineer", "release engineer", "operations engineer",
];

const EXCLUDE_TITLES = [
  "director", "vp ", "vice president", "c-level", "chief",
  "10+ years", "15+ years",
  // Completely unrelated domains
  "sales engineer",  // usually pre-sales, not eng
  "nurse", "driver", "warehouse", "accountant",
];

function isRelevant(text) {
  const lower = text.toLowerCase();
  const hasKeyword = MUST_HAVE.some(kw => lower.includes(kw));
  const isExcluded = EXCLUDE_TITLES.some(ex => lower.includes(ex));
  return hasKeyword && !isExcluded;
}

// ── Work-authorization rejection ───────────────────────────────────────────────
// Phrases that signal a posting requires US work authorization (and we should skip it
// unless it also mentions Canada or worldwide).
const WORK_AUTH_PATTERNS = [
  /must be (?:eligible to|authorized to|able to) work in the (?:us|u\.s|united states)/i,
  /must have (?:us|u\.s\.) work auth/i,
  /requires? (?:us|u\.s\.) work authorization/i,
  /authorized to work in the (?:us|u\.s|united states)/i,
  /sponsorship (?:not )?available/i,
  /will not (?:sponsor|provide) (?:visa|work auth)/i,
  /no (?:visa )?sponsorship/i,
  /us citizens? (?:or|and) (?:permanent residents?|green card)/i,
  /must be a (?:us|u\.s\.) citizen/i,
  /clearance required/i,
  /security clearance/i,
];

/**
 * Returns true if the job description contains US-only work-auth requirements
 * AND there is no countervailing signal that Canada / worldwide is also accepted.
 */
function requiresUSWorkAuth(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  const hasAuthBlock = WORK_AUTH_PATTERNS.some(p => p.test(lower));
  if (!hasAuthBlock) return false;
  // If the posting also mentions Canada or worldwide it is probably globally accessible
  const hasCanadaOrWorldwide = /canada|worldwide|anywhere|global/i.test(lower);
  return !hasCanadaOrWorldwide;
}

// ── Location allowlist ─────────────────────────────────────────────────────────
// Accepted: Canada (any city), worldwide remote, or US remote without work-auth lock.
// Rejected: postings restricted to a non-CA region (Europe-only, APAC-only, etc.).

const CA_SIGNALS = [
  "canada", "toronto", "ontario", "vancouver", "british columbia",
  "montreal", "quebec", "calgary", "alberta", "ottawa", "edmonton",
  "winnipeg", "halifax", "nova scotia", "bc", "ab", " on,", "qc",
];

// Regions that are explicitly NOT Canada and NOT worldwide
const RESTRICTED_REGIONS = [
  /\buk\b|\bunited kingdom\b/i,
  /\beurope\b|\beu\b|\bemea\b/i,
  /\basia\b|\bapac\b|\bindia\b/i,
  /\baustralia\b|\bnew zealand\b/i,
  /\blatam\b|\blatin america\b/i,
  /\bafrica\b/i,
  /\buk only\b|\beurope only\b|\bindia only\b/i,
];

/**
 * Returns true if the location is acceptable:
 *   - Blank / not specified (assume open)
 *   - Explicitly remote / worldwide / anywhere
 *   - Canada or a Canadian city (hybrid or remote CA)
 *   - US remote (will be filtered for work-auth separately)
 *
 * Returns false if restricted to a non-CA / non-worldwide region.
 */
function isAllowedLocation(locationText) {
  if (!locationText) return true;
  const lower = locationText.toLowerCase();

  // Accept worldwide / fully remote
  if (/remote|worldwide|anywhere|global/i.test(lower)) return true;

  // Accept Canada
  if (CA_SIGNALS.some(l => lower.includes(l))) return true;

  // Accept US (we handle work-auth separately via requiresUSWorkAuth)
  if (/united states|usa|\bu\.s\b|us remote|remote us/i.test(lower)) return true;

  // Reject explicitly restricted regions
  if (RESTRICTED_REGIONS.some(p => p.test(lower))) return false;

  // Default: allow unknown locations (better to over-include)
  return true;
}

// ── Date helpers ───────────────────────────────────────────────────────────────
function isWithinDays(date, maxDays) {
  if (!date) return true;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxDays);
  return new Date(date) >= cutoff;
}

// ── ID generation (SHA-256, for deduplication) ─────────────────────────────────
function makeId(source, raw) {
  return `${source}_${crypto.createHash("sha256").update(String(raw)).digest("hex").slice(0, 12)}`;
}

// ── Tag inference ──────────────────────────────────────────────────────────────
const TAG_MAP = [
  [/\baws\b/i,                  "AWS"],
  [/\bazure\b/i,                "Azure"],
  [/\bgcp\b|google cloud/i,     "GCP"],
  [/\bkubernetes\b|\bk8s\b/i,   "Kubernetes"],
  [/\bdocker\b/i,               "Docker"],
  [/\bterraform\b/i,            "Terraform"],
  [/\blinux\b/i,                "Linux"],
  [/\bci[\s/-]?cd\b/i,          "CI/CD"],
  [/\bgithub.actions\b/i,       "GitHub Actions"],
  [/\bpython\b/i,               "Python"],
  [/\bbash\b/i,                 "Bash"],
  [/\bjenkins\b/i,              "Jenkins"],
  [/\bzendesk\b/i,              "Zendesk"],
  [/\bansible\b/i,              "Ansible"],
  [/\bgrafana\b/i,              "Grafana"],
  [/\bsre\b|site reliability/i, "SRE"],
  [/\bdevops\b/i,               "DevOps"],
  [/\bcloud support\b/i,        "Cloud Support"],
  [/\bplatform\b/i,             "Platform Eng"],
];

function inferTags(text) {
  const tags = [];
  for (const [pattern, tag] of TAG_MAP) {
    if (pattern.test(text)) tags.push(tag);
    if (tags.length >= 5) break;
  }
  if (tags.length === 0) tags.push("Cloud");
  return tags;
}

// ── Match scoring: 0–100 based on candidate skill coverage ────────────────────
// Weighted: core cloud/devops skills count double
const MY_SKILLS_CORE = [
  "aws", "azure", "gcp", "cloud", "devops", "terraform", "kubernetes", "docker",
  "linux", "ci/cd", "iam", "infrastructure", "sre", "site reliability",
];

const MY_SKILLS_SECONDARY = [
  "python", "bash", "powershell", "github actions", "jenkins", "ansible",
  "grafana", "cloudwatch", "azure monitor", "networking", "dns", "ssl", "vpc",
  "node.js", "typescript", "postgresql", "mongodb", "rest api",
  "support", "troubleshoot", "helm", "kafka", "arm templates",
  "azure devops", "codepipeline", "sonarqube", "rollbar",
];

function matchScore(jobText) {
  const lower = jobText.toLowerCase();
  const coreHits = MY_SKILLS_CORE.filter(s => lower.includes(s)).length;
  const secHits  = MY_SKILLS_SECONDARY.filter(s => lower.includes(s)).length;
  // Core hits worth 2 points each, secondary 1 point each; max = coreMax*2 + secMax
  const maxScore = MY_SKILLS_CORE.length * 2 + MY_SKILLS_SECONDARY.length;
  const raw      = coreHits * 2 + secHits;
  return Math.min(100, Math.round((raw / maxScore) * 100));
}

// ── Rate-limit helper ─────────────────────────────────────────────────────────
function randomDelay(min = 500, max = 2000) {
  const ms = Math.floor(Math.random() * (max - min)) + min;
  return new Promise(r => setTimeout(r, ms));
}

// ── Semantic scoring: Gemini-backed match against a user profile ──────────────
const SEMANTIC_SCORE_FALLBACK = {
  score: 0,
  matched_keywords: [],
  missing_keywords: [],
  title_match: "unknown",
  recommendation: "Scoring failed",
};

const SEMANTIC_SCORE_SYSTEM_INSTRUCTION = `You are a job match scorer API.
You MUST respond with ONLY a JSON object. No text, no explanation,
no markdown, no code fences. Just the raw JSON object.

Required schema:
{
  "score": <integer 0-100>,
  "matched_keywords": <array of strings>,
  "missing_keywords": <array of strings>,
  "title_match": <"strong" | "partial" | "weak">,
  "recommendation": <string, max 15 words>
}

Score based on these weights:
- Skill keyword overlap: 40%
- Required experience vs candidate experience: 25%
- Job title alignment: 20%
- Certifications match: 15%`;

async function semanticScore(userProfile, job) {
  const MAX_RETRIES = 3; // 3 retries after the initial attempt = 4 attempts total
  const TOTAL_ATTEMPTS = MAX_RETRIES + 1;

  for (let attempt = 0; attempt < TOTAL_ATTEMPTS; attempt++) {
    try {
      const { GoogleGenerativeAI } = require("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({
        model: "gemini-3.5-flash",
        generationConfig: {
          responseMimeType: "application/json",
        },
        systemInstruction: SEMANTIC_SCORE_SYSTEM_INSTRUCTION,
      });

      const prompt = `CANDIDATE SKILLS: ${(userProfile.skills || []).join(", ")}
TITLES HELD: ${(userProfile.titles_held || []).join(", ")}
EXPERIENCE: ${userProfile.experience_years} years
CERTIFICATIONS: ${(userProfile.certifications || []).join(", ")}

JOB TITLE: ${job.title}
COMPANY: ${job.company}
DESCRIPTION: ${(job.description || "").substring(0, 1500)}`;

      const result = await model.generateContent(prompt);
      const rawText = result.response.text();

      // First try: clean and direct parse
      try {
        const cleaned = rawText
          .replace(/```json/gi, "")
          .replace(/```/g, "")
          .trim();
        return JSON.parse(cleaned);
      } catch {
        // Second try: extract JSON object with regex
        const match = rawText.match(/\{[\s\S]*\}/);
        if (match) {
          return JSON.parse(match[0]);
        }
        throw new Error("No valid JSON found in response");
      }

    } catch (err) {
      const is503 = err.message?.includes("503") ||
                    err.message?.includes("Service Unavailable") ||
                    err.message?.includes("overloaded");

      if (is503 && attempt < MAX_RETRIES) {
        const waitMs = Math.pow(2, attempt + 1) * 1000;
        console.warn(
          `[Scorer] Gemini 503 — retry ${attempt + 1}/${MAX_RETRIES} in ${waitMs / 1000}s`
        );
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }

      // Non-503 error or max retries reached
      console.error("[Scorer] semanticScore failed:", err.message);
      return SEMANTIC_SCORE_FALLBACK;
    }
  }

  return SEMANTIC_SCORE_FALLBACK;
}

module.exports = {
  isRelevant,
  isAllowedLocation,
  requiresUSWorkAuth,
  isWithinDays,
  makeId,
  inferTags,
  randomDelay,
  matchScore,
  semanticScore,
  MUST_HAVE,
};
