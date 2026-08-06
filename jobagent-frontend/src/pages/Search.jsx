import { useState, useEffect, useCallback } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";

// ─── Config ───────────────────────────────────────────────────────────────────
// In production set VITE_BACKEND_URL in your Railway/Vercel frontend env vars.
// e.g. VITE_BACKEND_URL=https://jobagent-backend.up.railway.app
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

// ─── Resume ───────────────────────────────────────────────────────────────────
const INITIAL_RESUME = `Juwon Larry Ajana
Toronto, ON | (647) 425-3816 | oluwajuwonajana@gmail.com | LinkedIn | GitHub | Portfolio

PROFILE
A collaborative, innovative, and results-driven IT Professional with 5+ years of experience designing, deploying, and supporting cloud-native, distributed, and AI-enabled systems across AWS, Azure, and GCP. Proven ability to automate infrastructure, build scalable microservices, and support production workloads in Linux and Windows environments. Strong background in cloud operations, CI/CD, reliability, and customer-facing engineering, with a track record of improving system performance, security, and deployment efficiency.

EDUCATION
Advanced Diploma, Software Engineering Technology – Artificial Intelligence | Centennial College | Toronto, Canada
- Built PCA and IPCA models on MNIST, improving dimensionality reduction efficiency by 35%
- Trained GANs on Fashion-MNIST, improving model classifier performance by 18%
- Designed deep learning chatbot using NLP and TensorFlow with 85%+ intent accuracy

Bachelor of Engineering, Petroleum Engineering | Covenant University | Nigeria

PROJECT HIGHLIGHTS
1. Voice-to-Insight Call Analytics Platform (AWS, Serverless, AI)
- Serverless pipeline: AWS Lambda, Step Functions, Transcribe, Translate, Comprehend — 500+ calls processed
- PII redaction and auto-translation, reducing manual review time by 70%
- Fault-tolerant workflows with retries, monitoring, and logging

2. Smart Grant Recommendation Engine (AI, NLP, RAG)
- FAISS + NLP synonym expansion; improved search relevance 40%, accuracy 25%
- Automated ETL with Airflow, enabling hourly data refreshes

3. E-Commerce Cloud Migration (AWS, Kubernetes, Terraform, CI/CD)
- Migrated global platform to AWS; cut deployment time from 2h to 20min
- Reduced infrastructure costs 30%; improved scalability and uptime

4. Multi-Cloud & Platform Automation (AWS, Azure, GCP)
- Reusable IaC modules across AWS, Azure, GCP; reduced manual effort 70%

EXPERIENCE

Operations & Process Specialist | Clipboard Health | Nov 2024 – Present
- Maintain 100+ SOPs for cloud-adjacent operations across 10,000+ facilities
- Workflow automation and audits — 20% efficiency improvement
- Optimized Zendesk workflows, reducing ticket resolution time by 25%

Cloud & DevOps Engineer | Upwork (Multiple Clients) | Mar 2019 – Present
- Designed and automated AWS environments, reducing deployment time by 50%
- Serverless and cloud-native apps; improved performance 40%, cut costs 30%
- Distributed systems with 99.9% uptime and fault tolerance
- Microservices architectures — scalability up 60%, flexibility up 35%
- Infrastructure automation reduced manual effort and human error by 70%
- IAM, least-privilege, encryption, secure networking — zero breaches, 100% compliance
- Cloud consulting increased client adoption by 25%

Cloud Support Engineer – Azure App Service (L2/L3) | Tek Experts (Microsoft Partner) | Jan 2021 – Aug 2021
- Azure PaaS support across North America and EMEA; 95% SLA resolution, 99.9% CSAT
- Triaged Windows and Linux (RedHat) issues; reduced MTTR by 50%
- Azure VNets, NSGs, security controls — 70% reduction in network incidents
- Azure Web App/Function App deployments via ARM + PowerShell; cut errors 50%
- CI/CD pipelines in Azure DevOps; reduced lead time by 40%
- DevSecOps: SonarQube, Aqua Security — 20% vulnerability reduction

Customer Success Manager | Access Bank Plc | Sept 2017 – Mar 2020
- Managed 80+ client accounts daily; 90%+ first-contact resolution
- Financial transaction reconciliation; improved audit accuracy by 20%

SKILLS
Cloud: AWS, Azure, GCP, Linux (RedHat), Windows Server
DevOps & CI/CD: Terraform, ARM Templates, Azure DevOps, Jenkins, GitHub Actions, CodePipeline, Git
Containers: Docker, Kubernetes, AKS, Helm, Apache Kafka
Programming: Python, Bash, PowerShell, JavaScript, TypeScript, Node.js, React, REST APIs, YAML
Databases: PostgreSQL, MySQL, SQL Server, MongoDB, DynamoDB
Monitoring: CloudWatch, Grafana, OpenSearch, Azure Monitor, Rollbar, SonarCloud
Networking & Security: TCP/IP, DNS, VPN, SSL/TLS, IAM, Firewalls, HIPAA

CERTIFICATIONS
AWS Certified Developer Associate | AWS Solutions Architect Associate | AWS Cloud Practitioner
Microsoft Certified Azure DevOps Expert | Azure Developer Associate | Azure Fundamentals | Azure Data Fundamentals
HashiCorp Certified Terraform Associate`;

// ─── Client-side prompt generators ───────────────────────────────────────────
function buildResumePrompt(job, resumeText) {
  return `You are an elite technical resume strategist for a senior cloud and DevOps professional.

RULES:
1. NEVER soften or downplay the candidate's seniority or technical depth.
2. Rewrite ONLY the PROFILE section to mirror this job's language.
3. Reorder bullet points so the most relevant achievements appear first.
4. Embed ATS keywords from the job description naturally throughout.
5. Preserve every metric, certification, and achievement exactly as stated.
Return the complete tailored resume as clean plain text.

MY RESUME:
${resumeText}

---
JOB: ${job.title} @ ${job.company}
LOCATION: ${job.location}

JOB DESCRIPTION:
${job.description || "(No description provided — tailor based on title and company)"}`;
}

function buildCoverLetterPrompt(job, resumeText) {
  return `Write a concise, high-impact cover letter for the following job. Match the tone of the job posting. Do not use generic filler phrases. Lead with the strongest relevant achievement. Keep it under 250 words.

CANDIDATE RESUME:
${resumeText}

---
JOB: ${job.title} @ ${job.company}
LOCATION: ${job.location}

JOB DESCRIPTION:
${job.description || "(No description provided — write based on title and company)"}

Format: 3 short paragraphs. No "Dear Hiring Manager" opener — start directly with a hook.`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtDate   = () => new Date().toLocaleDateString([], { weekday:"long", month:"long", day:"numeric", year:"numeric" });
const daysLabel = n  => n === 0 ? "Today" : n === 1 ? "1d ago" : `${n}d ago`;

function postedDaysAgo(postedAt) {
  if (!postedAt) return 0;
  return Math.floor((Date.now() - new Date(postedAt).getTime()) / 86400000);
}

function dedupeJobs(jobs) {
  const seen = new Set();
  return jobs.filter(j => {
    const key = `${j.title.toLowerCase().trim()}|${j.company.toLowerCase().trim()}`;
    return seen.has(key) ? false : seen.add(key);
  });
}

// Match score badge: green ≥70, yellow ≥40, red <40
function MatchBadge({ score }) {
  if (score == null || score === 0) return null;
  const color  = score >= 70 ? "#00e5a0" : score >= 40 ? "#f0c060" : "#ff6060";
  const bg     = score >= 70 ? "rgba(0,229,160,.1)" : score >= 40 ? "rgba(240,192,96,.1)" : "rgba(255,96,96,.1)";
  const border = score >= 70 ? "rgba(0,229,160,.28)" : score >= 40 ? "rgba(240,192,96,.28)" : "rgba(255,96,96,.28)";
  return (
    <span style={{
      fontSize:"12px", fontWeight:700, color, background:bg,
      border:`1px solid ${border}`, borderRadius:"4px",
      padding:"2px 9px", letterSpacing:".03em",
    }}>
      {score}% match
    </span>
  );
}

// ─── Job Description Formatter ────────────────────────────────────────────────
function JobDescription({ text }) {
  if (!text || !text.trim()) {
    return (
      <p style={{ fontSize:"10.5px", color:"#1e3a56", fontStyle:"italic", margin:0 }}>
        No description available. Open the job link to view the full posting.
      </p>
    );
  }

  const rawLines = text.split(/\r?\n/).map(l => l.trim());
  const HEADER_RE = /^([A-Z][A-Z\s&/,+]{3,}|About .+|What you.ll|What we.re|Requirements?|Responsibilities|Qualifications?|Benefits?|What.s in it|Who you are|The role|Nice to have|Experience|Skills|Compensation|Location):?$/i;
  const BULLET_RE = /^[-•*·▸▹►◆◇✓✔✗✘→•●–]\s+/;

  const sections = [];
  let current = { header: null, lines: [] };

  for (const line of rawLines) {
    if (!line) {
      if (current.lines.length > 0) { sections.push({ ...current }); current = { header: null, lines: [] }; }
      continue;
    }
    if (HEADER_RE.test(line)) {
      if (current.lines.length > 0) sections.push({ ...current });
      current = { header: line.replace(/:$/, ""), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.length > 0 || current.header) sections.push(current);

  return (
    <div style={{ fontSize:"13px", lineHeight:1.85, color:"#4a7090" }}>
      {sections.map((sec, si) => (
        <div key={si} style={{ marginBottom: sec.header ? "14px" : "10px" }}>
          {sec.header && (
            <div style={{ fontSize:"11px", fontWeight:700, letterSpacing:".08em", textTransform:"uppercase",
              color:"#00b080", marginBottom:"7px", paddingBottom:"5px", borderBottom:"1px solid rgba(0,160,112,.14)" }}>
              {sec.header}
            </div>
          )}
          <div style={{ display:"flex", flexDirection:"column", gap:"3px" }}>
            {sec.lines.map((line, li) => {
              const isBullet = BULLET_RE.test(line);
              const content  = isBullet ? line.replace(BULLET_RE, "") : line;
              return isBullet ? (
                <div key={li} style={{ display:"flex", gap:"7px", alignItems:"flex-start" }}>
                  <span style={{ color:"#00705a", flexShrink:0, marginTop:"1px", fontSize:"9px" }}>▸</span>
                  <span>{content}</span>
                </div>
              ) : (
                <p key={li} style={{ margin:0 }}>{content}</p>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Resume Editor Panel (collapsible) ─────────────────────────────────────
function ResumeEditorPanel({ resumeText, setResumeText }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom:"16px" }}>
      <div onClick={() => setOpen(o => !o)}
        style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
          background:"#060e1a", border:"1px solid #0f1e30", borderRadius:"8px",
          padding:"11px 16px", cursor:"pointer", userSelect:"none" }}>
        <span style={{ fontSize:"12px", color:"#00a070", fontWeight:700, letterSpacing:".08em", textTransform:"uppercase" }}>
          ✎ Your Resume
        </span>
        <span style={{ fontSize:"11px", color:"#3a6080" }}>{open ? "▲ Collapse" : "▼ Edit before tailoring"}</span>
      </div>
      {open && (
        <textarea value={resumeText} onChange={e => setResumeText(e.target.value)} rows={20}
          style={{ marginTop:"6px", background:"#04090f", border:"1px solid #0f1e30", borderRadius:"8px",
            color:"#80a8c8", fontFamily:"'DM Mono',monospace", fontSize:"12px",
            lineHeight:1.8, padding:"14px", resize:"vertical", outline:"none", width:"100%" }} />
      )}
    </div>
  );
}

// ─── Global styles ────────────────────────────────────────────────────────────
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Syne:wght@700;800;900&family=DM+Mono:wght@400;500&display=swap');
  @keyframes fadeUp    { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
  @keyframes spin      { to{transform:rotate(360deg)} }
  @keyframes pulse     { 0%,100%{opacity:1} 50%{opacity:.2} }
  @keyframes shimmer   { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
  * { box-sizing:border-box; }
  body { font-size:15px; }
  ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-track{background:#06080f} ::-webkit-scrollbar-thumb{background:#1e3050;border-radius:4px}

  /* Buttons */
  .btn-cta { background:#00e5a0;color:#020c18;border:none;font-weight:700;padding:14px 40px;border-radius:8px;cursor:pointer;font-family:inherit;font-size:15px;letter-spacing:.03em;transition:all .2s }
  .btn-cta:hover   { background:#00ffb3;transform:translateY(-2px);box-shadow:0 10px 28px rgba(0,229,160,.3) }
  .btn-cta:disabled{ opacity:.25;cursor:not-allowed;transform:none;box-shadow:none }
  .btn-ghost { background:transparent;border:1px solid #1e3050;color:#6090b0;padding:8px 18px;border-radius:6px;cursor:pointer;font-family:inherit;font-size:13px;transition:all .15s }
  .btn-ghost:hover { border-color:#00e5a0;color:#00e5a0 }
  .btn-skip  { background:transparent;border:1px solid #2e1e1e;color:#7a5050;padding:6px 14px;border-radius:6px;cursor:pointer;font-family:inherit;font-size:13px;transition:all .15s }
  .btn-skip:hover  { border-color:#ff6060;color:#ff8080 }

  /* Cards */
  .card-sel { border:2px solid #1a2a3e;border-radius:10px;cursor:pointer;transition:all .15s;display:flex;align-items:stretch;background:#0a1220 }
  .card-sel:hover { border-color:#2a4a6e;background:#0c1628 }
  .card-sel.on    { border-color:#00e5a0;background:rgba(0,229,160,.04) }
  .jcard { background:#0a1220;border:1px solid #0f1e30;border-radius:12px;overflow:hidden;transition:border .15s;animation:fadeUp .3s ease both }
  .jcard:hover { border-color:#1e3050 }

  /* Links */
  .apply-a { display:inline-flex;align-items:center;gap:7px;background:rgba(0,229,160,.08);border:1px solid rgba(0,229,160,.22);color:#00d090;padding:8px 18px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600;letter-spacing:.03em;transition:all .15s;font-family:inherit }
  .apply-a:hover { background:rgba(0,229,160,.16);transform:translateY(-1px) }
  .apply-a.done  { background:rgba(0,229,160,.04);color:#006a40;border-color:rgba(0,229,160,.12);pointer-events:none }

  /* Form elements */
  textarea { width:100%;background:#04090f;border:1px solid #0f1e30;border-radius:8px;color:#90b8d8;font-family:'DM Mono',monospace;font-size:13px;line-height:1.85;padding:16px;resize:vertical;outline:none;transition:border .2s }
  textarea:focus { border-color:rgba(0,229,160,.25) }
  select { background:#06101e;border:1px solid #1a2e48;border-radius:6px;color:#6090b0;font-family:inherit;font-size:13px;padding:7px 12px;outline:none;cursor:pointer }
  select:focus { border-color:rgba(0,229,160,.25) }

  /* Tags / badges */
  .tag     { font-size:11px;background:rgba(0,229,160,.05);border:1px solid rgba(0,229,160,.12);color:#00a070;border-radius:4px;padding:3px 9px }
  .badge-r { font-size:11px;background:rgba(0,180,130,.08);border:1px solid rgba(0,180,130,.2);color:#00b080;border-radius:4px;padding:3px 10px;font-weight:600 }
  .badge-h { font-size:11px;background:rgba(80,130,255,.08);border:1px solid rgba(80,130,255,.2);color:#6090e0;border-radius:4px;padding:3px 10px;font-weight:600 }

  /* Alert boxes */
  .err-box  { background:rgba(255,100,80,.06);border:1px solid rgba(255,100,80,.22);border-radius:8px;padding:14px 18px;font-size:13px;color:#ff9080;line-height:1.7;margin-bottom:18px }
  .info-box { background:rgba(0,160,229,.06);border:1px solid rgba(0,160,229,.2);border-radius:8px;padding:14px 18px;font-size:13px;color:#70c0e0;line-height:1.7;margin-bottom:18px }

  /* Nav */
  .nav-tab { background:transparent;border:none;border-bottom:2px solid transparent;color:#3a6080;padding:13px 22px;cursor:pointer;font-family:inherit;font-size:13px;font-weight:500;letter-spacing:.04em;transition:all .15s }
  .nav-tab.on { color:#00e5a0;border-bottom-color:#00e5a0 }

  /* Misc */
  .pill    { font-size:12px;color:#3a6080;background:#070f1e;border:1px solid #0f2030;border-radius:5px;padding:4px 11px }
  .preview { background:#04090f;border:1px solid #0d1828;border-radius:8px;padding:14px 16px;font-size:13px;color:#3a6080;line-height:1.8;cursor:pointer;transition:border .15s;white-space:pre-wrap }
  .preview:hover { border-color:#1e3a58 }

  /* Collapsible prompt sections */
  .collapsible-header { display:flex;align-items:center;justify-content:space-between;background:#060e1a;border:1px solid #0f1e30;border-radius:8px;padding:12px 16px;cursor:pointer;transition:border .15s;user-select:none }
  .collapsible-header:hover { border-color:#1e3a56 }

  /* Tracker */
  .tracker-row { background:#080f1a;border:1px solid #0d1828;border-radius:10px;padding:16px 18px;transition:border .15s }
  .tracker-row:hover { border-color:#1e3050 }
  .status-select { background:#04090f;border:1px solid #0f1e30;border-radius:6px;color:#5a8aaa;font-family:inherit;font-size:13px;padding:6px 10px;outline:none;cursor:pointer }
  .notes-input { width:100%;background:#04090f;border:1px solid #0f1e30;border-radius:6px;color:#5a7890;font-family:inherit;font-size:13px;padding:8px 12px;outline:none;resize:none;line-height:1.65 }
  .notes-input:focus { border-color:rgba(0,229,160,.18) }

  /* Filter bar */
  .filter-bar { display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:#060d18;border:1px solid #0f1e2e;border-radius:8px;padding:11px 16px;margin-bottom:18px }

  /* Landing page extras */
  .landing-feature { background:#080f1a;border:1px solid #0f1e30;border-radius:12px;padding:24px;transition:border .2s }
  .landing-feature:hover { border-color:#1e3a56 }
  .step-circle { width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0 }
`;

// ─── Search ───────────────────────────────────────────────────────────────────
export default function Search() {
  const { isSignedIn, isLoaded } = useAuth();

  // ── Tab ───────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState("jobs"); // "jobs" | "tracker"

  // ── Phase (within jobs tab): "search" | "review" | "apply" ───────────────
  const [phase, setPhase]             = useState("search");
  const [searching, setSearching]     = useState(false);
  const [searchError, setSearchError] = useState("");
  const [backendStatus, setBackendStatus] = useState(null);
  const [lastScrape, setLastScrape]   = useState(null);
  const [refreshing, setRefreshing]   = useState(false);

  // ── Jobs & selection ──────────────────────────────────────────────────────
  const [jobs, setJobs]       = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [skipped, setSkipped]   = useState(new Set()); // locally tracked skips

  // ── Apply-phase cards (selected jobs with prompts) ────────────────────────
  const [applyJobs, setApplyJobs] = useState([]); // enriched with appliedAt

  // ── UI state ──────────────────────────────────────────────────────────────
  const [resumeText, setResumeText]     = useState(INITIAL_RESUME);
  const [expandedJD, setExpandedJD]     = useState({});
  const [expandedRes, setExpandedRes]   = useState({}); // resume prompt collapse
  const [expandedCL, setExpandedCL]     = useState({}); // cover letter collapse
  const [copied, setCopied]             = useState("");
  const [csrfToken, setCsrfToken]       = useState("");
  const [tailoring, setTailoring]       = useState({}); // jobId -> boolean
  const [tailoredResume, setTailoredResume] = useState({}); // jobId -> string
  const [tailorError, setTailorError]   = useState({}); // jobId -> string

  // ── Filters (review phase) ────────────────────────────────────────────────
  const [filterBoard, setFilterBoard]     = useState("all");
  const [filterLocType, setFilterLocType] = useState("remote");
  const [filterMinScore, setFilterMinScore] = useState(0);

  // ── Tracker ───────────────────────────────────────────────────────────────
  const [trackerJobs, setTrackerJobs]     = useState([]);
  const [trackerLoading, setTrackerLoading] = useState(false);
  const [trackerNotes, setTrackerNotes]   = useState({});
  const [trackerFilter, setTrackerFilter] = useState("all"); // "all" | "applied"

  // ── CSRF token on mount ───────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${BACKEND_URL}/api/csrf-token`)
      .then(r => r.json())
      .then(d => setCsrfToken(d.csrfToken))
      .catch(() => {});
  }, []);

  // ── Load tracker when tab or filter changes ──────────────────────────────
  useEffect(() => {
    if (tab === "tracker") loadTracker(trackerFilter);
  }, [tab, trackerFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Core: fetch jobs from backend ─────────────────────────────────────────
  const runSearch = async () => {
    setSearching(true);
    setSearchError("");
    setBackendStatus(null);
    try {
      const statusRes = await fetch(`${BACKEND_URL}/api/status`, { signal: AbortSignal.timeout(8000) });
      if (!statusRes.ok) throw new Error(`Backend returned ${statusRes.status}`);
      const status = await statusRes.json();
      setBackendStatus("ok");
      setLastScrape(status.lastScrape);

      const jobsRes = await fetch(`${BACKEND_URL}/api/jobs?limit=20&days=5`);
      if (!jobsRes.ok) throw new Error(`Jobs endpoint returned ${jobsRes.status}`);
      const data = await jobsRes.json();

      if (!data.jobs || data.jobs.length === 0) {
        setSearchError("No fresh jobs in DB yet — triggering scrape. This takes ~30s, then click Search again.");
        await fetch(`${BACKEND_URL}/api/scrape`, { method:"POST", headers:{"X-CSRF-Token":csrfToken} });
        setSearching(false);
        return;
      }

      setJobs(dedupeJobs(data.jobs));
      setSelected(new Set());
      setSkipped(new Set());
      setPhase("review");
    } catch (err) {
      setBackendStatus("error");
      setSearchError(
        err.name === "TimeoutError"
          ? "Backend not reachable — is the server running? See README to start it."
          : `Backend error: ${err.message}`
      );
    } finally {
      setSearching(false);
    }
  };

  const refreshJobs = async () => {
    setRefreshing(true);
    try {
      const jobsRes = await fetch(`${BACKEND_URL}/api/jobs?limit=20&days=5`);
      const data = await jobsRes.json();
      if (data.jobs?.length) {
        const deduped = dedupeJobs(data.jobs);
        setJobs(deduped);
        setSelected(prev => new Set([...prev].filter(id => deduped.some(j => j.id === id))));
      }
    } catch (_e) { /* silent */ }
    setRefreshing(false);
  };

  const triggerScrape = async () => {
    setSearchError("Scrape triggered — this takes ~30–60s. Click Search Jobs once done.");
    try {
      await fetch(`${BACKEND_URL}/api/scrape`, { method:"POST", headers:{"X-CSRF-Token":csrfToken} });
    } catch {
      setSearchError("Could not reach backend to trigger scrape.");
    }
  };

  // ── Review phase helpers ───────────────────────────────────────────────────
  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const skipJob = useCallback(async (jobId) => {
    setSkipped(prev => new Set([...prev, jobId]));
    setSelected(prev => { const n = new Set(prev); n.delete(jobId); return n; });
    try {
      await fetch(`${BACKEND_URL}/api/jobs/${jobId}/skipped`, {
        method:"POST", headers:{"X-CSRF-Token":csrfToken}
      });
    } catch (_e) { /* best-effort */ }
  }, [csrfToken]);

  // ── Move to apply phase ────────────────────────────────────────────────────
  const goToApply = () => {
    const picks = jobs.filter(j => selected.has(j.id));
    if (!picks.length) return;
    setApplyJobs(picks.map(j => ({ ...j, is_applied: false })));
    setPhase("apply");
  };

  // ── Mark applied ───────────────────────────────────────────────────────────
  const markApplied = useCallback(async (jobId) => {
    try {
      await fetch(`${BACKEND_URL}/api/jobs/${jobId}/applied`, {
        method:"POST", headers:{"X-CSRF-Token":csrfToken}
      });
    } catch (_e) { /* best-effort */ }
    setApplyJobs(prev => prev.map(j => j.id === jobId ? { ...j, is_applied:true } : j));
  }, [csrfToken]);

  // ── Tailor resume via backend ─────────────────────────────────────────────
  const fetchTailoredResume = useCallback(async (jobId, resumeText, jobDescription) => {
    setTailoring(prev => ({ ...prev, [jobId]: true }));
    setTailorError(prev => ({ ...prev, [jobId]: "" }));
    try {
      const response = await fetch(`${BACKEND_URL}/api/tailor`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken
        },
        body: JSON.stringify({ resume: resumeText, jobDescription })
      });
      if (!response.ok) {
        throw new Error(`Tailoring failed: ${response.status}`);
      }
      const data = await response.json();
      // Assuming the API returns { tailoredResume: "..." } or just the text
      const tailored = data.tailoredResume !== undefined ? data.tailoredResume : data;
      setTailoredResume(prev => ({ ...prev, [jobId]: tailored }));
    } catch (err) {
      setTailorError(prev => ({ ...prev, [jobId]: err.message }));
    } finally {
      setTailoring(prev => ({ ...prev, [jobId]: false }));
    }
  }, [csrfToken]);

  // ── Copy helper ────────────────────────────────────────────────────────────
  const copy = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(""), 2000);
  };

  // ── Reset ──────────────────────────────────────────────────────────────────
  const reset = () => {
    setPhase("search"); setJobs([]); setSelected(new Set()); setSkipped(new Set());
    setApplyJobs([]); setExpandedJD({}); setExpandedRes({}); setExpandedCL({});
    setSearchError(""); setFilterBoard("all"); setFilterLocType("all"); setFilterMinScore(0);
  };

  // ── Tailor resume via backend ─────────────────────────────────────────────
  const tailorResume = async (jobId) => {
    const job = applyJobs.find(j => j.id === jobId);
    if (!job) return;
    setApplyJobs(prev => prev.map(j => j.id === jobId ? { ...j, tailoring: true, tailorError: null } : j));
    try {
      const res = await fetch(`${BACKEND_URL}/api/tailor`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({ job, resume: resumeText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Tailor failed");
      setApplyJobs(prev => prev.map(j => j.id === jobId ? { ...j, tailoring: false, tailored: data.tailored } : j));
    } catch (err) {
      setApplyJobs(prev => prev.map(j => j.id === jobId ? { ...j, tailoring: false, tailorError: err.message } : j));
    }
  };

  // ── Tracker helpers ────────────────────────────────────────────────────────
  const loadTracker = async (filter = trackerFilter) => {
    setTrackerLoading(true);
    try {
      const url = filter === "applied"
        ? `${BACKEND_URL}/api/jobs/applied`
        : `${BACKEND_URL}/api/jobs/tracker`;
      const res = await fetch(url);
      const data = await res.json();
      setTrackerJobs(Array.isArray(data) ? data : []);
    } catch (_e) { /* silent */ }
    setTrackerLoading(false);
  };

  const updateTrackerStatus = async (jobId, status) => {
    setTrackerJobs(prev => prev.map(j => j.id === jobId ? { ...j, status } : j));
    try {
      await fetch(`${BACKEND_URL}/api/jobs/${jobId}/status`, {
        method:"POST", headers:{"Content-Type":"application/json","X-CSRF-Token":csrfToken},
        body: JSON.stringify({ status }),
      });
    } catch (_e) { /* best-effort */ }
  };

  const saveTrackerNotes = async (jobId) => {
    const notes = trackerNotes[jobId] ?? trackerJobs.find(j => j.id === jobId)?.notes ?? "";
    setTrackerJobs(prev => prev.map(j => j.id === jobId ? { ...j, notes } : j));
    try {
      await fetch(`${BACKEND_URL}/api/jobs/${jobId}/notes`, {
        method:"POST", headers:{"Content-Type":"application/json","X-CSRF-Token":csrfToken},
        body: JSON.stringify({ notes }),
      });
    } catch (_e) { /* best-effort */ }
  };

  // ── Derived: filtered review-phase jobs ───────────────────────────────────
  const visibleJobs = jobs.filter(j => {
    if (skipped.has(j.id)) return false;
    if (filterBoard !== "all" && j.board !== filterBoard) return false;
    if (filterLocType !== "all" && j.location_type !== filterLocType) return false;
    if (filterMinScore > 0 && (j.match_score || 0) < filterMinScore) return false;
    return true;
  });

  const boardOptions = ["all", ...Array.from(new Set(jobs.map(j => j.board).filter(Boolean)))];

  // ── Step labels (3-phase) ─────────────────────────────────────────────────
  const STEPS       = ["search", "review", "apply"];
  const STEP_LABELS = ["Search", "Review & Select", "Apply"];
  const stepIdx     = STEPS.indexOf(phase);

  // ── Auth guard ────────────────────────────────────────────────────────────
  if (!isLoaded) {
    return (
      <div style={{ minHeight:"100vh", background:"#040c18", display:"flex", alignItems:"center", justifyContent:"center", color:"#00e5a0", fontFamily:"DM Mono, monospace" }}>
        Loading...
      </div>
    );
  }
  if (!isSignedIn) {
    return <Navigate to="/signin" />;
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:"100vh", background:"#06080f", fontFamily:"'DM Mono','Fira Code',monospace", color:"#b0c8e8" }}>
      <style>{STYLES}</style>

      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <div style={{ background:"#04080f", borderBottom:"1px solid #0d1828", padding:"14px 32px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:"20px", fontWeight:900, color:"#dff0ff", letterSpacing:"-.03em" }}>
            <span style={{ color:"#00e5a0" }}>◈</span> JobAgent
            <span style={{ fontSize:"10px", fontWeight:500, color:"#00604a", letterSpacing:".12em", marginLeft:"10px", verticalAlign:"middle" }}>LIVE</span>
          </div>
          <div style={{ fontSize:"12px", color:"#2a5070", letterSpacing:".08em", marginTop:"2px" }}>
            Real jobs · Remote worldwide · Hybrid Canada · Cloud / DevOps
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:"12px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:"7px", fontSize:"12px" }}>
            <div style={{ width:7, height:7, borderRadius:"50%", transition:"background .3s",
              background: backendStatus==="ok" ? "#00e5a0" : backendStatus==="error" ? "#ff6060" : "#1a3050" }} />
            <span style={{ color: backendStatus==="ok" ? "#00a070" : backendStatus==="error" ? "#c06050" : "#2a5070" }}>
              {backendStatus==="ok" ? "Backend connected" : backendStatus==="error" ? "Backend offline" : "Backend"}
            </span>
          </div>
          <div style={{ width:1, height:18, background:"#0d1828" }} />
          <div style={{ fontSize:"12px", color:"#0d7050", background:"rgba(0,229,160,.05)", border:"1px solid rgba(0,229,160,.1)", borderRadius:"5px", padding:"5px 13px" }}>
            ✓ Juwon Larry Ajana
          </div>
        </div>
      </div>

      {/* ── NAV TABS ────────────────────────────────────────────────────── */}
      <div style={{ background:"#04080f", borderBottom:"1px solid #0d1828", padding:"0 28px", display:"flex", alignItems:"flex-end", gap:"0" }}>
        <button className={`nav-tab ${tab==="jobs"?"on":""}`} onClick={() => setTab("jobs")}>
          Jobs Pipeline
        </button>
        <button className={`nav-tab ${tab==="tracker"?"on":""}`} onClick={() => setTab("tracker")}>
          Tracker
          {trackerJobs.length > 0 && (
            <span style={{ marginLeft:"6px", fontSize:"8px", background:"rgba(0,229,160,.1)", color:"#00a070",
              border:"1px solid rgba(0,229,160,.18)", borderRadius:"10px", padding:"1px 6px" }}>
              {trackerJobs.length}
            </span>
          )}
        </button>
      </div>

      {/* ── STEPPER (jobs tab only) ──────────────────────────────────────── */}
      {tab === "jobs" && (
        <div style={{ background:"#04080f", borderBottom:"1px solid #0d1828", padding:"0 28px" }}>
          <div style={{ display:"flex", alignItems:"center" }}>
            {STEP_LABELS.map((label, i) => {
              const state = i < stepIdx ? "done" : i === stepIdx ? "active" : "idle";
              return (
                <div key={i} style={{ display:"flex", alignItems:"center" }}>
                  <div style={{ padding:"12px 16px", display:"flex", alignItems:"center", gap:"7px" }}>
                    <div style={{
                      width:20, height:20, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center",
                      fontSize:"9px", fontWeight:700,
                      background: state==="done" ? "rgba(0,229,160,.15)" : state==="active" ? "rgba(0,229,160,.1)" : "transparent",
                      border: state==="done" ? "1px solid rgba(0,229,160,.4)" : state==="active" ? "1px solid rgba(0,229,160,.3)" : "1px solid #1a2a3e",
                      color: state==="done" ? "#00e5a0" : state==="active" ? "#00e5a0" : "#1e3050",
                    }}>
                      {state==="done" ? "✓" : i+1}
                    </div>
                    <span style={{ fontSize:"10px", letterSpacing:".06em",
                      color: state==="done" ? "#00805a" : state==="active" ? "#c0e0ff" : "#1e3050" }}>
                      {label}
                    </span>
                  </div>
                  {i < STEP_LABELS.length-1 && (
                    <div style={{ width:32, height:1, background: i < stepIdx ? "#00e5a040" : "#0d1828" }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── RESUME EDITOR ───────────────────────────────────────────────── */}
      {tab === "jobs" && (
        <div style={{ maxWidth:"920px", margin:"0 auto", padding:"16px 22px 0" }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: "20px", fontWeight: 900, color: "#d0ecff", marginBottom: "4px" }}>
            Your Resume (edit before tailoring)
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <textarea
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                style={{
                  width: "100%",
                  minHeight: "200px",
                  background: "#04090f",
                  border: "1px solid #0f1e30",
                  borderRadius: "8px",
                  color: "#90b8d8",
                  fontFamily: "'DM Mono',monospace",
                  fontSize: "13px",
                  lineHeight: "1.85",
                  padding: "16px",
                  resize: "vertical",
                  outline: "none",
                  transition: "border .2s"
                }}
                onFocus={(e) => e.target.style.borderColor = "rgba(0,229,160,.25)"}
                onBlur={(e) => e.target.style.borderColor = "#0f1e30"}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "center", justifyContent: "flex-start" }}>
              <button
                className="btn-ghost"
                style={{ fontSize: "10px", padding: "6px 12px" }}
                onClick={() => setResumeText(INITIAL_RESUME)}
              >
                Reset
              </button>
              <button
                className="btn-cta"
                style={{ fontSize: "10px", padding: "6px 12px" }}
                onClick={() => navigator.clipboard.writeText(resumeText)}
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MAIN CONTENT ────────────────────────────────────────────────── */}
      <div style={{ maxWidth:"920px", margin:"0 auto", padding:"32px 22px" }}>

        {/* ═══ TRACKER TAB ══════════════════════════════════════════════════ */}
        {tab === "tracker" && (
          <div style={{ animation:"fadeUp .3s ease" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"20px", flexWrap:"wrap", gap:"10px" }}>
              <div>
                <div style={{ fontFamily:"'Syne',sans-serif", fontSize:"20px", fontWeight:900, color:"#d0ecff", marginBottom:"4px" }}>
                  Application Tracker
                </div>
                <div style={{ fontSize:"14px", color:"#4a7090" }}>
                  All applied, skipped, and in-progress jobs — update status and notes inline.
                </div>
              </div>
              <div style={{ display:"flex", gap:"8px", alignItems:"center" }}>
                <button className={`btn-ghost ${trackerFilter==="all"?"on":""}`}
                  style={{ fontSize:"11px", ...(trackerFilter==="all" ? {borderColor:"#00e5a0",color:"#00e5a0"} : {}) }}
                  onClick={() => setTrackerFilter("all")}>
                  All
                </button>
                <button className={`btn-ghost ${trackerFilter==="applied"?"on":""}`}
                  style={{ fontSize:"11px", ...(trackerFilter==="applied" ? {borderColor:"#00e5a0",color:"#00e5a0"} : {}) }}
                  onClick={() => setTrackerFilter("applied")}>
                  Applied
                </button>
                <button className="btn-ghost" style={{fontSize:"11px"}} onClick={() => loadTracker(trackerFilter)}>
                  {trackerLoading ? "Loading…" : "⟳ Refresh"}
                </button>
              </div>
            </div>

            {trackerLoading && (
              <div style={{ textAlign:"center", padding:"40px", color:"#3a6080", fontSize:"14px" }}>
                <span style={{ width:16, height:16, borderRadius:"50%", border:"2px solid #1a3a56", borderTopColor:"#00e5a0",
                  display:"inline-block", animation:"spin .7s linear infinite", marginRight:"10px", verticalAlign:"middle" }} />
                Loading tracker…
              </div>
            )}

            {!trackerLoading && trackerJobs.length === 0 && (
              <div style={{ textAlign:"center", padding:"56px 20px", color:"#3a6080", fontSize:"14px" }}>
                <div style={{ fontSize:"36px", opacity:.12, marginBottom:"14px" }}>◈</div>
                No tracked jobs yet. Apply to or skip jobs in the pipeline to see them here.
              </div>
            )}

            {!trackerLoading && trackerJobs.map((job, idx) => {
              const statusColor = {
                pending:"#1e3a56", applied:"#00a070", interview:"#f0c060",
                offer:"#00e5a0", rejected:"#ff6060", skipped:"#3a2a2a",
              }[job.status] || "#1e3a56";
              const noteVal = trackerNotes[job.id] ?? job.notes ?? "";

              return (
                <div key={job.id} className="tracker-row" style={{ marginBottom:"10px", animationDelay:`${idx*30}ms`, animation:"fadeUp .3s ease both" }}>
                  <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:"12px", flexWrap:"wrap" }}>
                    {/* Title + meta */}
                    <div style={{ flex:1, minWidth:"200px" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:"8px", flexWrap:"wrap", marginBottom:"5px" }}>
                        <span style={{ fontFamily:"'Syne',sans-serif", fontSize:"15px", fontWeight:800, color:"#b8d8f8" }}>
                          {job.title}
                        </span>
                        <MatchBadge score={job.match_score} />
                        <span className={job.location_type==="remote"?"badge-r":"badge-h"}>
                          {job.location_type==="remote"?"🌐 Remote":"🏢 Hybrid"}
                        </span>
                      </div>
                      <div style={{ fontSize:"13px", color:"#3a6080", marginBottom:"6px" }}>
                        {job.company} · {job.location}
                        {job.applied_at && (
                          <span style={{ marginLeft:"8px", color:"#2a7050" }}>
                            · Applied {new Date(job.applied_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Status + link */}
                    <div style={{ display:"flex", alignItems:"center", gap:"8px", flexShrink:0 }}>
                      <select
                        className="status-select"
                        value={job.status || "pending"}
                        style={{ color: statusColor }}
                        onChange={e => updateTrackerStatus(job.id, e.target.value)}
                      >
                        <option value="pending">Pending</option>
                        <option value="applied">Applied</option>
                        <option value="interview">Interview</option>
                        <option value="offer">Offer</option>
                        <option value="rejected">Rejected</option>
                        <option value="skipped">Skipped</option>
                      </select>
                      <a href={job.url} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize:"10px", color:"#00a070", textDecoration:"none", background:"rgba(0,229,160,.06)",
                          border:"1px solid rgba(0,229,160,.14)", borderRadius:"4px", padding:"4px 10px" }}>
                        ↗ View
                      </a>
                    </div>
                  </div>

                  {/* Notes */}
                  <div style={{ marginTop:"8px" }}>
                    <textarea
                      className="notes-input"
                      rows={2}
                      placeholder="Add notes (interview dates, contacts, next steps)…"
                      value={noteVal}
                      onChange={e => setTrackerNotes(prev => ({ ...prev, [job.id]: e.target.value }))}
                      onBlur={() => saveTrackerNotes(job.id)}
                      style={{ background:"#04090f", border:"1px solid #0f1e30", borderRadius:"4px", color:"#4a6880",
                        fontFamily:"inherit", fontSize:"10px", padding:"6px 10px", outline:"none",
                        resize:"none", lineHeight:1.6, width:"100%" }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ═══ JOBS TAB ═════════════════════════════════════════════════════ */}
        {tab === "jobs" && (
          <>

            {/* ═══ PHASE 1: SEARCH ════════════════════════════════════════ */}
            {phase === "search" && (
              <div style={{ animation:"fadeUp .4s ease", maxWidth:"680px", margin:"0 auto" }}>

                {/* Hero */}
                <div style={{ textAlign:"center", padding:"52px 20px 40px" }}>
                  <div style={{ fontSize:"52px", color:"#00e5a0", opacity:.15, marginBottom:"16px", animation:"pulse 4s infinite", lineHeight:1 }}>◈</div>

                  {searchError && (
                    <div style={{ maxWidth:"500px", margin:"0 auto 20px", textAlign:"left" }}>
                      <div className="err-box">
                        {searchError}
                        {searchError.includes("No fresh jobs") && (
                          <div style={{ marginTop:"10px" }}>
                            <button className="btn-ghost" onClick={triggerScrape}>↻ Trigger Scrape Manually</button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <button className="btn-cta" onClick={runSearch} disabled={searching} style={{ fontSize:"16px", padding:"16px 52px" }}>
                    {searching
                      ? <span style={{ display:"flex", alignItems:"center", gap:"12px" }}>
                          <span style={{ width:16, height:16, borderRadius:"50%", border:"2px solid #020c18",
                            borderTopColor:"transparent", display:"inline-block", animation:"spin .7s linear infinite" }} />
                          Connecting…
                        </span>
                      : "Search Live Jobs →"}
                  </button>

                  {lastScrape && (
                    <p style={{ fontSize:"12px", color:"#2a5070", marginTop:"12px" }}>
                      Last scraped: {new Date(lastScrape).toLocaleString()}
                    </p>
                  )}
                </div>

                {/* Sources */}
                <div style={{ marginBottom:"32px" }}>
                  {/* Job sources */}
                  <div className="landing-feature">
                    <div style={{ fontSize:"12px", color:"#00a070", letterSpacing:".08em", textTransform:"uppercase", fontWeight:600, marginBottom:"14px" }}>
                      Job Sources
                    </div>
                    {[
                      { name:"JSearch (LinkedIn / Indeed / Glassdoor)", color:"#6366f1" },
                      { name:"RemoteOK",          color:"#00c896" },
                      { name:"We Work Remotely",  color:"#4ade80" },
                      { name:"Greenhouse",        color:"#22c55e" },
                      { name:"Lever",             color:"#a78bfa" },
                    ].map(s => (
                      <div key={s.name} style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom:"9px" }}>
                        <div style={{ width:8, height:8, borderRadius:"50%", background:s.color, flexShrink:0 }} />
                        <span style={{ fontSize:"13px", color:"#5080a0" }}>{s.name}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Source pills */}
                <div style={{ display:"flex", gap:"8px", justifyContent:"center", flexWrap:"wrap", paddingBottom:"40px" }}>
                  {["Remote Worldwide 🌐", "Hybrid Canada 🏢", "≤ 5 days old", "Match scored", "Auto-deduplicated"].map(l => (
                    <span key={l} className="pill">{l}</span>
                  ))}
                </div>

              </div>
            )}

            {/* ═══ PHASE 2: REVIEW & SELECT ═══════════════════════════════ */}
            {phase === "review" && (
              <div style={{ animation:"fadeUp .3s ease" }}>
                {/* Header row */}
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"16px", flexWrap:"wrap", gap:"10px" }}>
                  <div>
                    <div style={{ fontFamily:"'Syne',sans-serif", fontSize:"20px", fontWeight:900, color:"#d0ecff", marginBottom:"4px" }}>
                      {visibleJobs.length} Live Roles — {fmtDate()}
                    </div>
                    <div style={{ fontSize:"14px", color:"#4a7090" }}>
                      Select roles you want to apply to, skip irrelevant ones, then proceed.
                      {selected.size > 0 && <span style={{color:"#00c080", marginLeft:"10px", fontWeight:600}}>{selected.size} selected</span>}
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:"8px", alignItems:"center" }}>
                    <button className="btn-ghost" onClick={reset}>↺ New Search</button>
                    <button className="btn-ghost" onClick={refreshJobs} disabled={refreshing}>
                      {refreshing
                        ? <span style={{display:"flex",alignItems:"center",gap:"6px"}}>
                            <span style={{width:11,height:11,borderRadius:"50%",border:"2px solid #1a3a56",borderTopColor:"#00e5a0",
                              display:"inline-block",animation:"spin .7s linear infinite"}}/>
                            Refreshing…
                          </span>
                        : "⟳ Refresh"}
                    </button>
                    <button className="btn-cta" style={{padding:"11px 26px",fontSize:"14px"}}
                      onClick={goToApply} disabled={selected.size === 0}>
                      Apply to {selected.size > 0 ? `${selected.size} Selected` : "Selected"} →
                    </button>
                  </div>
                </div>

                {/* Filter bar */}
                <div className="filter-bar">
                  <span style={{ fontSize:"12px", color:"#3a6080", letterSpacing:".06em", textTransform:"uppercase", fontWeight:600, marginRight:"4px" }}>
                    Filter:
                  </span>
                  <select value={filterBoard} onChange={e => setFilterBoard(e.target.value)}>
                    {boardOptions.map(b => (
                      <option key={b} value={b}>{b === "all" ? "All boards" : b}</option>
                    ))}
                  </select>
                  <select value={filterLocType} onChange={e => setFilterLocType(e.target.value)}>
                    <option value="all">All locations</option>
                    <option value="remote">🌐 Remote only</option>
                    <option value="hybrid">🏢 Hybrid only</option>
                  </select>
                  <select value={filterMinScore} onChange={e => setFilterMinScore(Number(e.target.value))}>
                    <option value={0}>Any match score</option>
                    <option value={40}>≥ 40% match</option>
                    <option value={70}>≥ 70% match</option>
                  </select>
                  {(filterBoard !== "all" || filterLocType !== "all" || filterMinScore > 0) && (
                    <button className="btn-ghost" style={{fontSize:"9px",padding:"3px 10px"}}
                      onClick={() => { setFilterBoard("all"); setFilterLocType("all"); setFilterMinScore(0); }}>
                      ✕ Clear
                    </button>
                  )}
                  <span style={{ marginLeft:"auto", fontSize:"12px", color:"#3a6080" }}>
                    {visibleJobs.length} of {jobs.length - skipped.size} shown
                  </span>
                </div>

                {/* Job cards */}
                <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
                  {visibleJobs.map((job, idx) => {
                    const sel    = selected.has(job.id);
                    const jdOpen = expandedJD[job.id];
                    const days   = postedDaysAgo(job.posted_at);
                    return (
                      <div key={job.id} className={`card-sel ${sel?"on":""}`}
                        onClick={() => toggleSelect(job.id)}
                        style={{ animationDelay:`${idx*30}ms`, animation:"fadeUp .3s ease both" }}>

                        {/* Checkbox */}
                        <div style={{ width:44, display:"flex", alignItems:"center", justifyContent:"center",
                          borderRight:"1px solid #0d1828", flexShrink:0 }}>
                          <div style={{ width:18, height:18, borderRadius:"4px", transition:"all .15s",
                            border: sel ? "2px solid #00e5a0" : "2px solid #1a2a3e",
                            background: sel ? "rgba(0,229,160,.15)" : "transparent",
                            display:"flex", alignItems:"center", justifyContent:"center",
                            fontSize:"11px", color:"#00e5a0" }}>
                            {sel && "✓"}
                          </div>
                        </div>

                        {/* Content */}
                        <div style={{ flex:1, padding:"14px 18px" }}>
                          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:"10px", marginBottom:"8px" }}>
                            <div>
                              <div style={{ display:"flex", alignItems:"center", gap:"7px", flexWrap:"wrap", marginBottom:"4px" }}>
                                <span style={{ fontFamily:"'Syne',sans-serif", fontSize:"16px", fontWeight:800,
                                  color: sel?"#c8f0e0":"#c0daf8" }}>
                                  {job.title}
                                </span>
                                <span style={{ fontSize:"11px", fontWeight:600, color:job.board_color,
                                  background:`${job.board_color}18`, border:`1px solid ${job.board_color}28`,
                                  borderRadius:"4px", padding:"2px 8px" }}>
                                  {job.board}
                                </span>
                                <span className={job.location_type==="remote"?"badge-r":"badge-h"}>
                                  {job.location_type==="remote"?"🌐 Remote":"🏢 Hybrid"}
                                </span>
                                <MatchBadge score={job.match_score} />
                                <span style={{ fontSize:"12px", color:"#3a6080" }}>{daysLabel(days)}</span>
                              </div>
                              <div style={{ fontSize:"13px", color:"#3a6080" }}>
                                {job.company} · {job.location} {job.salary ? `· ${job.salary}` : ""}
                              </div>
                            </div>
                            <div style={{ display:"flex", flexWrap:"wrap", gap:"5px", justifyContent:"flex-end", flexShrink:0 }}>
                              {(job.tags || []).map(t=><span key={t} className="tag">{t}</span>)}
                            </div>
                          </div>

                          {/* Action buttons */}
                          <div style={{ display:"flex", gap:"8px", alignItems:"center" }}
                            onClick={e => e.stopPropagation()}>
                            <a className="apply-a" href={job.url} target="_blank" rel="noopener noreferrer">
                              ↗ View Posting
                            </a>
                            <button className="btn-ghost" style={{fontSize:"10px",padding:"5px 12px"}}
                              onClick={() => setExpandedJD(p=>({...p,[job.id]:!p[job.id]}))}>
                              {jdOpen ? "▲ Hide JD" : "▼ Read JD"}
                            </button>
                            <button className="btn-skip"
                              onClick={() => skipJob(job.id)}
                              title="Skip this job — moves it to Tracker as skipped">
                              ✕ Skip
                            </button>
                          </div>

                          {jdOpen && (
                            <div style={{ margin:"12px 0 0", background:"#04090f", border:"1px solid #0d1828",
                              borderRadius:"6px", padding:"14px 16px" }}>
                              <JobDescription text={job.description} />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {selected.size > 0 && (
                  <div style={{ marginTop:"22px", display:"flex", justifyContent:"flex-end" }}>
                    <button className="btn-cta" onClick={goToApply}>
                      Apply to {selected.size} Selected →
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ═══ PHASE 3: APPLY ══════════════════════════════════════════ */}
            {phase === "apply" && (
              <div style={{ animation:"fadeUp .3s ease" }}>
                {/* Banner */}
                <div style={{ background:"#0a1220", border:"1px solid rgba(0,229,160,.18)", borderRadius:"10px",
                  padding:"16px 22px", marginBottom:"22px", display:"flex", alignItems:"center",
                  justifyContent:"space-between", flexWrap:"wrap", gap:"10px" }}>
                  <div>
                    <div style={{ fontFamily:"'Syne',sans-serif", fontSize:"18px", fontWeight:900, color:"#d0ecff", marginBottom:"4px" }}>
                      ◈ Ready to Apply — {fmtDate()}
                    </div>
                    <div style={{ fontSize:"14px", color:"#4a7090" }}>
                      {applyJobs.length} role{applyJobs.length!==1?"s":""} · Copy prompts into Claude or ChatGPT, then submit your application.
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:"8px" }}>
                    <button className="btn-ghost" style={{fontSize:"10px"}} onClick={() => setPhase("review")}>
                      ← Back to Review
                    </button>
                    <button className="btn-ghost" style={{fontSize:"10px"}} onClick={reset}>
                      ↺ New Search
                    </button>
                  </div>
                </div>

                {/* Apply cards */}
                {applyJobs.map((job, idx) => {
                  const resumePrompt = buildResumePrompt(job, resumeText);
                  const clPrompt     = buildCoverLetterPrompt(job, resumeText);
                  const resOpen      = expandedRes[job.id];
                  const clOpen       = expandedCL[job.id];

                  return (
                    <div key={job.id} className="jcard"
                      style={{ marginBottom:"18px", animationDelay:`${idx*50}ms` }}>

                      {/* Card header */}
                      <div style={{ padding:"14px 18px", borderBottom:"1px solid #0d1828" }}>
                        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between",
                          gap:"10px", marginBottom:"9px" }}>
                          <div>
                            <div style={{ display:"flex", alignItems:"center", gap:"7px", flexWrap:"wrap", marginBottom:"4px" }}>
                              <span style={{ fontFamily:"'Syne',sans-serif", fontSize:"16px", fontWeight:900, color:"#c8e8ff" }}>
                                {job.title}
                              </span>
                              <span style={{ fontSize:"11px", fontWeight:600, color:job.board_color,
                                background:`${job.board_color}15`, border:`1px solid ${job.board_color}28`,
                                borderRadius:"4px", padding:"2px 8px" }}>
                                {job.board}
                              </span>
                              <span className={job.location_type==="remote"?"badge-r":"badge-h"}>
                                {job.location_type==="remote"?"🌐 Remote":"🏢 Hybrid"}
                              </span>
                              <MatchBadge score={job.match_score} />
                            </div>
                            <div style={{ fontSize:"13px", color:"#3a6080" }}>
                              {job.company} · {job.location} {job.salary ? `· ${job.salary}` : ""}
                            </div>
                          </div>
                          <div style={{ display:"flex", gap:"4px", flexWrap:"wrap", justifyContent:"flex-end" }}>
                            {(job.tags||[]).map(t=><span key={t} className="tag">{t}</span>)}
                          </div>
                        </div>

                        <div style={{ display:"flex", gap:"8px", alignItems:"center" }}>
                          <a className={`apply-a ${job.is_applied?"done":""}`}
                            href={job.url} target="_blank" rel="noopener noreferrer"
                            onClick={() => !job.is_applied && markApplied(job.id)}>
                            {job.is_applied ? "✓ Applied" : "↗ Apply Now"}
                          </a>
                          {!job.is_applied && (
                            <button className="btn-ghost" style={{fontSize:"10px"}} onClick={() => markApplied(job.id)}>
                              Mark Applied
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Prompt sections */}
                      <div style={{ padding:"13px 18px", display:"flex", flexDirection:"column", gap:"10px" }}>

                        {/* Resume Tailoring */}
                        <div>
                          <div className="collapsible-header"
                            onClick={() => setExpandedRes(p=>({...p,[job.id]:!p[job.id]}))}>
                            <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                              <span style={{ fontSize:"12px", color:"#00a070", letterSpacing:".08em", textTransform:"uppercase", fontWeight:700 }}>
                                ✦ Tailored Resume
                              </span>
                              <span style={{ fontSize:"12px", color:"#3a6080" }}>
                                — generated from backend
                              </span>
                            </div>
                            <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
                              {tailoring[job.id] ? (
                                <span style={{ display:"flex", alignItems:"center", gap:"6px" }}>
                                  <span style={{ width:16, height:16, borderRadius:"50%", border:"2px solid #020c18",
                                    borderTopColor:"transparent", display:"inline-block", animation:"spin .7s linear infinite" }} />
                                  Generating…
                                </span>
                              ) : (
                                <>
                                  {tailorError[job.id] ? (
                                    <div className="err-box" style={{ marginLeft:"8px" }}>
                                      {tailorError[job.id]}
                                      <button className="btn-ghost" style={{fontSize:"10px",padding:"3px 10px",marginLeft:"8px"}}
                                        onClick={() => fetchTailoredResume(job.id, resumeText, job.description || "")}>
                                        Retry
                                      </button>
                                    </div>
                                  ) : (
                                    <>
                                      {tailoredResume[job.id] ? (
                                        <>
                                          <button className="btn-ghost" style={{fontSize:"10px",padding:"3px 10px"}}
                                            onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(tailoredResume[job.id]); }}>
                                            {copied===`res-${job.id}` ? "✓ Copied" : "Copy"}
                                          </button>
                                          <span style={{ fontSize:"10px", color:"#1a3050" }}>{expandedRes[job.id]?"▲":"▼"}</span>
                                        </>
                                      ) : (
                                        <button className="btn-ghost" style={{fontSize:"10px",padding:"3px 10px"}}
                                          onClick={() => fetchTailoredResume(job.id, resumeText, job.description || "")}>
                                          Generate Tailored Resume
                                        </button>
                                      )}
                                    </>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                          {expandedRes[job.id] && (
                            <div style={{ marginTop:"8px" }}>
                              {tailoring[job.id] ? (
                                <div style={{ textAlign:"center", padding:"20px", color:"#3a6080", fontSize:"14px" }}>
                                  <span style={{ width:16, height:16, borderRadius:"50%", border:"2px solid #1a3a56", borderTopColor:"#00e5a0",
                                    display:"inline-block", animation:"spin .7s linear infinite", marginRight:"10px", verticalAlign:"middle" }} />
                                  Generating tailored resume…
                                </div>
                              ) : tailorError[job.id] ? (
                                <div className="err-box">
                                  {tailorError[job.id]}
                                </div>
                              ) : tailoredResume[job.id] ? (
                                <textarea value={tailoredResume[job.id]} readOnly rows={18}
                                  style={{ background:"#04090f", border:"1px solid #0f1e30", borderRadius:"6px",
                                    color:"#80a8c8", fontFamily:"'DM Mono',monospace", fontSize:"10.5px",
                                    lineHeight:1.75, padding:"14px", resize:"vertical", outline:"none",
                                    width:"100%", whiteSpace:"pre-wrap" }} />
                              ) : (
                                <div style={{ textAlign:"center", padding:"20px", color:"#3a6080", fontSize:"14px" }}>
                                  Click "Generate Tailored Resume" to create a customized resume for this job.
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Cover Letter Prompt */}
                        <div>
                          <div className="collapsible-header"
                            onClick={() => setExpandedCL(p=>({...p,[job.id]:!p[job.id]}))}>
                            <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                              <span style={{ fontSize:"12px", color:"#6090e0", letterSpacing:".08em", textTransform:"uppercase", fontWeight:700 }}>
                                ✉ Cover Letter Prompt
                              </span>
                              <span style={{ fontSize:"12px", color:"#3a6080" }}>
                                — paste into Claude / ChatGPT
                              </span>
                            </div>
                            <div style={{ display:"flex", alignItems:"center", gap:"6px" }}>
                              <button className="btn-ghost" style={{fontSize:"10px",padding:"3px 10px"}}
                                onClick={e => { e.stopPropagation(); copy(clPrompt, `cl-${idx}`); }}>
                                {copied===`cl-${idx}` ? "✓ Copied" : "Copy"}
                              </button>
                              <span style={{ fontSize:"10px", color:"#1a3050" }}>{clOpen?"▲":"▼"}</span>
                            </div>
                          </div>
                          {clOpen && (
                            <div style={{ marginTop:"8px" }}>
                              <textarea value={clPrompt} readOnly rows={14}
                                style={{ background:"#04090f", border:"1px solid #0f1e30", borderRadius:"6px",
                                  color:"#80a8c8", fontFamily:"'DM Mono',monospace", fontSize:"10.5px",
                                  lineHeight:1.75, padding:"14px", resize:"vertical", outline:"none",
                                  width:"100%", whiteSpace:"pre-wrap" }} />
                            </div>
                          )}
                        </div>

                      </div>
                    </div>
                  );
                })}

                <div style={{ textAlign:"center", paddingBottom:"24px" }}>
                  <button className="btn-cta" onClick={reset} style={{fontSize:"12px",padding:"12px 28px"}}>
                    ↺ Start New Search
                  </button>
                </div>
              </div>
            )}

          </>
        )}
      </div>
    </div>
  );
}
