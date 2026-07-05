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

module.exports = {
  isRelevant,
  isAllowedLocation,
  requiresUSWorkAuth,
  isWithinDays,
  makeId,
  inferTags,
  randomDelay,
  matchScore,
  MUST_HAVE,
};
