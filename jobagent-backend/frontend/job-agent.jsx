import { useState, useEffect } from "react";

// ─── Config ───────────────────────────────────────────────────────────────────
// Change this to your deployed backend URL (Railway / Render / VPS)
// e.g. "https://jobagent-backend.up.railway.app"
const BACKEND_URL = "http://localhost:3001";

// ─── Resume ───────────────────────────────────────────────────────────────────
const RESUME = `Juwon Larry Ajana
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

// ─── Backend resume tailor (proxies Claude API) ──────────────────────────────
async function tailorResume(job, resume, csrfToken) {
  const res = await fetch(`${BACKEND_URL}/api/tailor`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken,
    },
    body: JSON.stringify({ job, resume }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Backend tailor error");
  return data.tailored;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtDate   = () => new Date().toLocaleDateString([], { weekday:"long", month:"long", day:"numeric", year:"numeric" });
const daysLabel = n  => n === 0 ? "Today" : n === 1 ? "1d ago" : `${n}d ago`;

function postedDaysAgo(postedAt) {
  if (!postedAt) return 0;
  const diff = Date.now() - new Date(postedAt).getTime();
  return Math.floor(diff / 86400000);
}

// Deduplicate by normalised title+company — keeps first (most recent) occurrence
function dedupeJobs(jobs) {
  const seen = new Set();
  return jobs.filter(j => {
    const key = `${j.title.toLowerCase().trim()}|${j.company.toLowerCase().trim()}`;
    return seen.has(key) ? false : seen.add(key);
  });
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  // phase: "search" | "review" | "tailor" | "done"
  const [phase, setPhase]           = useState("search");
  const [searching, setSearching]   = useState(false);
  const [searchError, setSearchError] = useState("");
  const [backendStatus, setBackendStatus] = useState(null); // null | "ok" | "error"
  const [lastScrape, setLastScrape] = useState(null);
  const [jobs, setJobs]             = useState([]);
  const [selected, setSelected]     = useState(new Set());
  const [tailoring, setTailoring]   = useState(false);
  const [tailoringIdx, setTailoringIdx] = useState(0);
  const [results, setResults]       = useState([]);
  const [expandedJD, setExpandedJD]   = useState({});
  const [expandedRes, setExpandedRes] = useState({});
  const [copied, setCopied]         = useState("");
  const [csrfToken, setCsrfToken]   = useState("");

  // ── Fetch CSRF token on mount ──────────────────────────────────────────────
  useEffect(() => {
    fetch(`${BACKEND_URL}/api/csrf-token`)
      .then(r => r.json())
      .then(d => setCsrfToken(d.csrfToken))
      .catch(() => {});
  }, []);

  // ── Phase 1: Fetch real jobs from backend ──────────────────────────────────
  const runSearch = async () => {
    setSearching(true);
    setSearchError("");
    setBackendStatus(null);

    try {
      // First check backend health
      const statusRes = await fetch(`${BACKEND_URL}/api/status`, { signal: AbortSignal.timeout(8000) });
      if (!statusRes.ok) throw new Error(`Backend returned ${statusRes.status}`);
      const status = await statusRes.json();
      setBackendStatus("ok");
      setLastScrape(status.lastScrape);

      // Fetch fresh jobs
      const jobsRes = await fetch(`${BACKEND_URL}/api/jobs?limit=10&days=5`);
      if (!jobsRes.ok) throw new Error(`Jobs endpoint returned ${jobsRes.status}`);
      const data = await jobsRes.json();

      if (!data.jobs || data.jobs.length === 0) {
        // No fresh jobs — trigger a scrape and poll
        setSearchError("No fresh jobs in DB yet — triggering scrape. This takes ~30s, then click Search again.");
        await fetch(`${BACKEND_URL}/api/scrape`, {
          method: "POST",
          headers: { "X-CSRF-Token": csrfToken },
        });
        setSearching(false);
        return;
      }

      setJobs(dedupeJobs(data.jobs));
      setSelected(new Set());
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

  // ── Refresh jobs list (re-fetch from DB without full reset) ───────────────
  const [refreshing, setRefreshing] = useState(false);
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
    } catch {}
    setRefreshing(false);
  };

  // ── Trigger fresh scrape manually ─────────────────────────────────────────
  const triggerScrape = async () => {
    setSearchError("Scrape triggered — this takes ~30–60s. Click Search Jobs once done.");
    try {
      await fetch(`${BACKEND_URL}/api/scrape`, {
        method: "POST",
        headers: { "X-CSRF-Token": csrfToken },
      });
    } catch {
      setSearchError("Could not reach backend to trigger scrape.");
    }
  };

  // ── Phase 2: Toggle selection ──────────────────────────────────────────────
  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── Phase 3: Tailor resumes one at a time ─────────────────────────────────
  const runTailor = async () => {
    const picks = jobs.filter(j => selected.has(j.id));
    if (!picks.length) return;
    setTailoring(true);
    setResults([]);
    setPhase("tailor");

    const done = [];
    for (let i = 0; i < picks.length; i++) {
      setTailoringIdx(i);
      try {
        const tailored = await tailorResume(picks[i], RESUME, csrfToken);
        done.push({ ...picks[i], tailoredResume: tailored });
      } catch (err) {
        done.push({ ...picks[i], tailoredResume: `Error: ${err.message}` });
      }
      setResults([...done]);
    }

    setTailoring(false);
    setPhase("done");
  };

  // ── Mark applied (tells backend too) ──────────────────────────────────────
  const markApplied = async (jobId) => {
    try {
      await fetch(`${BACKEND_URL}/api/jobs/${jobId}/applied`, {
        method: "POST",
        headers: { "X-CSRF-Token": csrfToken },
      });
    } catch {}
    // Update local results regardless
    setResults(prev => prev.map(j => j.id === jobId ? { ...j, is_applied: true } : j));
  };

  const copy = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(""), 2000);
  };

  const reset = () => {
    setPhase("search"); setJobs([]); setSelected(new Set());
    setResults([]); setExpandedJD({}); setExpandedRes({});
    setSearchError(""); setTailoringIdx(0);
  };

  // ── Step tracker ───────────────────────────────────────────────────────────
  const STEPS = ["search", "review", "tailor", "done"];
  const STEP_LABELS = ["Search", "Review & Select", "Tailor Resumes", "Apply"];
  const stepIdx = STEPS.indexOf(phase);

  return (
    <div style={{ minHeight:"100vh", background:"#06080f", fontFamily:"'DM Mono','Fira Code',monospace", color:"#b0c8e8" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800;900&display=swap');
        @keyframes fadeUp  { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin    { to{transform:rotate(360deg)} }
        @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:.25} }
        @keyframes glow    { 0%,100%{box-shadow:0 0 0 0 rgba(0,229,160,.5)} 60%{box-shadow:0 0 0 9px rgba(0,229,160,0)} }
        * { box-sizing:border-box; }
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:#06080f} ::-webkit-scrollbar-thumb{background:#1a2a3e;border-radius:3px}
        .btn-cta   { background:#00e5a0;color:#020c18;border:none;font-weight:700;padding:13px 36px;border-radius:7px;cursor:pointer;font-family:inherit;font-size:13px;letter-spacing:.05em;transition:all .2s }
        .btn-cta:hover   { background:#00ffb3;transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,229,160,.28) }
        .btn-cta:disabled{ opacity:.25;cursor:not-allowed;transform:none;box-shadow:none }
        .btn-ghost { background:transparent;border:1px solid #1e3050;color:#4a7090;padding:7px 16px;border-radius:5px;cursor:pointer;font-family:inherit;font-size:11px;transition:all .15s }
        .btn-ghost:hover { border-color:#00e5a0;color:#00e5a0 }
        .card-sel  { border:2px solid #1a2a3e;border-radius:8px;cursor:pointer;transition:all .15s;display:flex;align-items:stretch;background:#0a1220 }
        .card-sel:hover { border-color:#2a4a6e }
        .card-sel.on    { border-color:#00e5a0;background:rgba(0,229,160,.04) }
        .jcard { background:#0a1220;border:1px solid #0f1e30;border-radius:10px;overflow:hidden;transition:border .15s;animation:fadeUp .3s ease both }
        .jcard:hover { border-color:#1e3050 }
        .apply-a { display:inline-flex;align-items:center;gap:6px;background:rgba(0,229,160,.08);border:1px solid rgba(0,229,160,.22);color:#00d090;padding:7px 16px;border-radius:5px;text-decoration:none;font-size:11px;font-weight:600;letter-spacing:.04em;transition:all .15s;font-family:inherit }
        .apply-a:hover { background:rgba(0,229,160,.15);transform:translateY(-1px) }
        .apply-a.done  { background:rgba(0,229,160,.04);color:#006a40;border-color:rgba(0,229,160,.12);pointer-events:none }
        textarea { width:100%;background:#04090f;border:1px solid #0f1e30;border-radius:6px;color:#80a8c8;font-family:'DM Mono',monospace;font-size:11px;line-height:1.8;padding:14px;resize:vertical;outline:none;transition:border .2s }
        textarea:focus { border-color:rgba(0,229,160,.2) }
        .tag { font-size:9px;background:rgba(0,229,160,.05);border:1px solid rgba(0,229,160,.1);color:#00805a;border-radius:3px;padding:2px 7px }
        .badge-r { font-size:9px;background:rgba(0,180,130,.07);border:1px solid rgba(0,180,130,.18);color:#00906a;border-radius:3px;padding:2px 8px;font-weight:600 }
        .badge-h { font-size:9px;background:rgba(80,120,240,.07);border:1px solid rgba(80,120,240,.18);color:#5080c8;border-radius:3px;padding:2px 8px;font-weight:600 }
        .err-box  { background:rgba(255,100,80,.06);border:1px solid rgba(255,100,80,.2);border-radius:6px;padding:12px 16px;font-size:11px;color:#ff8070;line-height:1.7;margin-bottom:16px }
        .info-box { background:rgba(0,160,229,.06);border:1px solid rgba(0,160,229,.18);border-radius:6px;padding:12px 16px;font-size:11px;color:#60b0d8;line-height:1.7;margin-bottom:16px }
        .nav-tab { background:transparent;border:none;border-bottom:2px solid transparent;color:#2a4a68;padding:11px 20px;cursor:pointer;font-family:inherit;font-size:10px;letter-spacing:.1em;text-transform:uppercase;transition:all .15s }
        .nav-tab.on { color:#00e5a0;border-bottom-color:#00e5a0 }
        .pill { font-size:9px;color:#1a3a58;background:#070f1e;border:1px solid #0d1e30;border-radius:4px;padding:3px 9px }
        .preview { background:#04090f;border:1px solid #0d1828;border-radius:6px;padding:12px 14px;font-size:11px;color:#2a4a68;line-height:1.75;cursor:pointer;transition:border .15s }
        .preview:hover { border-color:#1e3a58 }
      `}</style>

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div style={{ background:"#04080f", borderBottom:"1px solid #0d1828", padding:"12px 28px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:"17px", fontWeight:900, color:"#dff0ff", letterSpacing:"-.03em" }}>
            <span style={{ color:"#00e5a0" }}>◈</span> JobAgent
            <span style={{ fontSize:"8px", fontWeight:400, color:"#0a4030", letterSpacing:".15em", marginLeft:"8px" }}>LIVE</span>
          </div>
          <div style={{ fontSize:"8px", color:"#0d1e2e", letterSpacing:".14em", marginTop:"1px" }}>REAL JOBS · REMOTE WORLDWIDE · HYBRID CANADA · CLOUD · DEVOPS · TECH SUPPORT</div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
          {/* Backend status indicator */}
          <div style={{ display:"flex", alignItems:"center", gap:"6px", fontSize:"9px" }}>
            <div style={{ width:6, height:6, borderRadius:"50%", background: backendStatus === "ok" ? "#00e5a0" : backendStatus === "error" ? "#ff6060" : "#1a3050", transition:"background .3s" }} />
            <span style={{ color: backendStatus === "ok" ? "#006a40" : backendStatus === "error" ? "#884040" : "#1a3050" }}>
              {backendStatus === "ok" ? "Backend connected" : backendStatus === "error" ? "Backend offline" : "Backend"}
            </span>
          </div>
          <div style={{ width:1, height:16, background:"#0d1828" }} />
          <div style={{ fontSize:"9px", color:"#0a3a28", background:"rgba(0,229,160,.04)", border:"1px solid rgba(0,229,160,.08)", borderRadius:"4px", padding:"4px 11px" }}>
            ✓ Juwon Larry Ajana
          </div>
        </div>
      </div>

      {/* ── STEPPER ────────────────────────────────────────────────────────── */}
      <div style={{ background:"#04080f", borderBottom:"1px solid #0d1828", padding:"0 28px" }}>
        <div style={{ display:"flex", alignItems:"center" }}>
          {STEP_LABELS.map((label, i) => {
            const state = i < stepIdx ? "done" : i === stepIdx ? "active" : "idle";
            return (
              <div key={i} style={{ display:"flex", alignItems:"center" }}>
                <div style={{ padding:"12px 16px", display:"flex", alignItems:"center", gap:"7px" }}>
                  <div style={{
                    width:20, height:20, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"9px", fontWeight:700,
                    background: state==="done" ? "rgba(0,229,160,.15)" : state==="active" ? "rgba(0,229,160,.1)" : "transparent",
                    border: state==="done" ? "1px solid rgba(0,229,160,.4)" : state==="active" ? "1px solid rgba(0,229,160,.3)" : "1px solid #1a2a3e",
                    color: state==="done" ? "#00e5a0" : state==="active" ? "#00e5a0" : "#1e3050",
                  }}>
                    {state === "done" ? "✓" : i + 1}
                  </div>
                  <span style={{ fontSize:"10px", letterSpacing:".06em", color: state==="done" ? "#00805a" : state==="active" ? "#c0e0ff" : "#1e3050" }}>
                    {label}
                  </span>
                </div>
                {i < STEP_LABELS.length - 1 && (
                  <div style={{ width:32, height:1, background: i < stepIdx ? "#00e5a040" : "#0d1828" }} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── MAIN ───────────────────────────────────────────────────────────── */}
      <div style={{ maxWidth:"900px", margin:"0 auto", padding:"32px 22px" }}>

        {/* ═══ PHASE 1: SEARCH ═══════════════════════════════════════════════ */}
        {phase === "search" && (
          <div style={{ textAlign:"center", padding:"56px 20px", animation:"fadeUp .4s ease" }}>
            <div style={{ fontSize:"46px", color:"#00e5a0", opacity:.18, marginBottom:"20px", animation:"pulse 4s infinite" }}>◈</div>
            <h1 style={{ fontFamily:"'Syne',sans-serif", fontSize:"22px", fontWeight:900, color:"#daeeff", margin:"0 0 10px", letterSpacing:"-.03em" }}>
              Step 1 — Search Live Job Boards
            </h1>
            <p style={{ fontSize:"11px", color:"#1e3a58", lineHeight:2, maxWidth:"460px", margin:"0 auto 8px" }}>
              Fetches real, live postings from the backend — RemoteOK, We Work Remotely, LinkedIn, Indeed, and Greenhouse. Only roles posted in the last 5 days are shown.
            </p>
            <p style={{ fontSize:"10px", color:"#0d1e2e", marginBottom:"10px" }}>
              <span style={{color:"#006040"}}>🌐 Remote Worldwide</span> &nbsp;+&nbsp; <span style={{color:"#4060a8"}}>🏢 Hybrid Canada</span>
            </p>

            {/* Backend connection help */}
            <div style={{ maxWidth:"440px", margin:"0 auto 24px", textAlign:"left" }}>
              <div className="info-box">
                <strong style={{color:"#80c8e8"}}>Backend required.</strong> Start it locally with:<br/>
                <code style={{color:"#00a080", background:"#030a14", padding:"2px 6px", borderRadius:"3px", fontSize:"10px"}}>
                  cd jobagent-backend && npm install && npm start
                </code>
                <br/>Or deploy to Railway/Render — see <strong>README.md</strong>.
              </div>
            </div>

            {searchError && (
              <div style={{ maxWidth:"480px", margin:"0 auto 20px" }}>
                <div className="err-box">
                  {searchError}
                  {searchError.includes("No fresh jobs") && (
                    <div style={{ marginTop:"8px" }}>
                      <button className="btn-ghost" style={{fontSize:"10px"}} onClick={triggerScrape}>
                        ↻ Trigger Scrape Manually
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div style={{ display:"flex", gap:"6px", justifyContent:"center", flexWrap:"wrap", marginBottom:"24px" }}>
              {["RemoteOK","We Work Remotely","LinkedIn","Indeed","Greenhouse","≤ 5 days old","New roles only"].map(l=>(
                <span key={l} className="pill">{l}</span>
              ))}
            </div>

            <button className="btn-cta" onClick={runSearch} disabled={searching}>
              {searching
                ? <span style={{ display:"flex", alignItems:"center", gap:"10px" }}>
                    <span style={{ width:13, height:13, borderRadius:"50%", border:"2px solid #020c18", borderTopColor:"transparent", display:"inline-block", animation:"spin .7s linear infinite" }} />
                    Connecting to backend…
                  </span>
                : "⟳  Search Live Jobs"}
            </button>
            {lastScrape && (
              <p style={{ fontSize:"9px", color:"#0a2a1e", marginTop:"10px" }}>
                Last scraped: {new Date(lastScrape).toLocaleString()}
              </p>
            )}
          </div>
        )}

        {/* ═══ PHASE 2: REVIEW & SELECT ══════════════════════════════════════ */}
        {phase === "review" && (
          <div style={{ animation:"fadeUp .3s ease" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"20px", flexWrap:"wrap", gap:"10px" }}>
              <div>
                <div style={{ fontFamily:"'Syne',sans-serif", fontSize:"16px", fontWeight:900, color:"#d0ecff", marginBottom:"3px" }}>
                  {jobs.length} Live Roles — {fmtDate()}
                </div>
                <div style={{ fontSize:"10px", color:"#1e3a56" }}>
                  Click a card to select it · open the job link to verify · then tailor resumes for your picks.
                  {selected.size > 0 && <span style={{color:"#00a070", marginLeft:"8px"}}>{selected.size} selected</span>}
                </div>
              </div>
              <div style={{ display:"flex", gap:"8px", alignItems:"center" }}>
                <button className="btn-ghost" onClick={reset} style={{fontSize:"10px"}}>↺ New Search</button>
                <button className="btn-ghost" onClick={refreshJobs} disabled={refreshing} style={{fontSize:"10px"}}>
                  {refreshing
                    ? <span style={{display:"flex",alignItems:"center",gap:"6px"}}>
                        <span style={{width:9,height:9,borderRadius:"50%",border:"2px solid #1a3a56",borderTopColor:"#00e5a0",display:"inline-block",animation:"spin .7s linear infinite"}}/>
                        Refreshing…
                      </span>
                    : "⟳ Refresh"}
                </button>
                <button className="btn-cta" style={{padding:"10px 24px",fontSize:"12px"}} onClick={runTailor} disabled={selected.size === 0}>
                  Tailor {selected.size > 0 ? `${selected.size} Resume${selected.size>1?"s":""}` : "Resumes"} →
                </button>
              </div>
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
              {jobs.map((job, idx) => {
                const sel    = selected.has(job.id);
                const jdOpen = expandedJD[job.id];
                const days   = postedDaysAgo(job.posted_at);
                return (
                  <div key={job.id} className={`card-sel ${sel?"on":""}`}
                    onClick={() => toggleSelect(job.id)}
                    style={{ animationDelay:`${idx*35}ms`, animation:"fadeUp .3s ease both" }}>

                    {/* Checkbox */}
                    <div style={{ width:44, display:"flex", alignItems:"center", justifyContent:"center", borderRight:"1px solid #0d1828", flexShrink:0 }}>
                      <div style={{
                        width:18, height:18, borderRadius:"4px",
                        border: sel ? "2px solid #00e5a0" : "2px solid #1a2a3e",
                        background: sel ? "rgba(0,229,160,.15)" : "transparent",
                        display:"flex", alignItems:"center", justifyContent:"center",
                        fontSize:"11px", color:"#00e5a0", transition:"all .15s",
                      }}>
                        {sel && "✓"}
                      </div>
                    </div>

                    {/* Content */}
                    <div style={{ flex:1, padding:"13px 16px" }}>
                      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:"10px", marginBottom:"7px" }}>
                        <div>
                          <div style={{ display:"flex", alignItems:"center", gap:"6px", flexWrap:"wrap", marginBottom:"3px" }}>
                            <span style={{ fontFamily:"'Syne',sans-serif", fontSize:"14px", fontWeight:800, color: sel?"#c8f0e0":"#b8d8f8" }}>
                              {job.title}
                            </span>
                            <span style={{ fontSize:"8px", fontWeight:700, color:job.board_color, background:`${job.board_color}18`, border:`1px solid ${job.board_color}28`, borderRadius:"3px", padding:"2px 7px" }}>
                              {job.board}
                            </span>
                            <span className={job.location_type==="remote"?"badge-r":"badge-h"}>
                              {job.location_type==="remote"?"🌐 Remote":"🏢 Hybrid"}
                            </span>
                            <span style={{ fontSize:"9px", color:"#1a3a56" }}>{daysLabel(days)}</span>
                          </div>
                          <div style={{ fontSize:"10px", color:"#1e4060" }}>
                            {job.company} · {job.location} {job.salary ? `· ${job.salary}` : ""}
                          </div>
                        </div>
                        <div style={{ display:"flex", flexWrap:"wrap", gap:"4px", justifyContent:"flex-end", flexShrink:0 }}>
                          {(job.tags || []).map(t=><span key={t} className="tag">{t}</span>)}
                        </div>
                      </div>

                      {/* Action buttons — stopPropagation so they don't toggle selection */}
                      <div style={{ display:"flex", gap:"8px", alignItems:"center" }} onClick={e=>e.stopPropagation()}>
                        <a className="apply-a" href={job.url} target="_blank" rel="noopener noreferrer">
                          ↗ View Job Posting
                        </a>
                        <button className="btn-ghost" style={{fontSize:"10px",padding:"5px 12px"}}
                          onClick={() => setExpandedJD(p=>({...p,[job.id]:!p[job.id]}))}>
                          {jdOpen ? "▲ Hide Description" : "▼ Read Description"}
                        </button>
                      </div>

                      {jdOpen && (
                        <pre style={{ margin:"12px 0 0", whiteSpace:"pre-wrap", fontFamily:"inherit", fontSize:"10.5px", lineHeight:1.85, color:"#2e5878", background:"#04090f", border:"1px solid #0d1828", borderRadius:"6px", padding:"12px 14px" }}>
                          {job.description}
                        </pre>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {selected.size > 0 && (
              <div style={{ marginTop:"22px", display:"flex", justifyContent:"flex-end" }}>
                <button className="btn-cta" onClick={runTailor}>
                  Tailor {selected.size} Resume{selected.size>1?"s":""} →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ═══ PHASE 3: TAILORING ════════════════════════════════════════════ */}
        {phase === "tailor" && (
          <div style={{ animation:"fadeUp .3s ease" }}>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:"16px", fontWeight:900, color:"#d0ecff", marginBottom:"20px" }}>
              Step 3 — Tailoring Resumes
            </div>

            {/* Progress list */}
            <div style={{ display:"flex", flexDirection:"column", gap:"9px", marginBottom:"26px" }}>
              {jobs.filter(j=>selected.has(j.id)).map((job, i) => {
                const isDone   = i < results.length;
                const isActive = i === tailoringIdx && tailoring;
                return (
                  <div key={job.id} style={{
                    background:"#0a1220", border:`1px solid ${isDone?"rgba(0,229,160,.2)":isActive?"rgba(0,229,160,.1)":"#0d1828"}`,
                    borderRadius:"8px", padding:"13px 18px", display:"flex", alignItems:"center", gap:"14px", transition:"border .3s",
                  }}>
                    <div style={{ width:22, height:22, borderRadius:"50%", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center",
                      border: isDone?"1px solid rgba(0,229,160,.4)":isActive?"1px solid rgba(0,229,160,.25)":"1px solid #1a2a3e",
                      background: isDone?"rgba(0,229,160,.12)":"transparent",
                    }}>
                      {isDone
                        ? <span style={{color:"#00e5a0",fontSize:"11px"}}>✓</span>
                        : isActive
                          ? <span style={{width:10,height:10,borderRadius:"50%",border:"2px solid #1a3a56",borderTopColor:"#00e5a0",display:"inline-block",animation:"spin .7s linear infinite"}}/>
                          : <span style={{fontSize:"9px",color:"#1a3050"}}>{i+1}</span>
                      }
                    </div>
                    <div style={{flex:1}}>
                      <div style={{ fontSize:"12px", fontWeight:500, color: isDone?"#a0d8b0":isActive?"#c0e0ff":"#1e3a56", marginBottom:"1px" }}>
                        {job.title} @ {job.company}
                      </div>
                      <div style={{ fontSize:"9px", color: isDone?"#006040":isActive?"#1e4a68":"#0d1e30" }}>
                        {isDone?"Resume ready":isActive?"Generating tailored resume…":"Waiting…"}
                      </div>
                    </div>
                    {isDone && <span style={{ fontSize:"9px", color:"#006040", background:"rgba(0,229,160,.07)", border:"1px solid rgba(0,229,160,.14)", borderRadius:"3px", padding:"3px 9px" }}>Done</span>}
                  </div>
                );
              })}
            </div>

            {/* Completed resumes appear as they finish */}
            {results.length > 0 && (
              <>
                <div style={{ fontSize:"9px", color:"#0a3028", letterSpacing:".12em", textTransform:"uppercase", marginBottom:"12px" }}>
                  Completed ({results.length})
                </div>
                {results.map((job, idx) => (
                  <div key={job.id} className="jcard" style={{marginBottom:"14px", animationDelay:`${idx*50}ms`}}>
                    <div style={{padding:"13px 18px",borderBottom:"1px solid #0d1828",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:"8px"}}>
                      <div>
                        <div style={{fontFamily:"'Syne',sans-serif",fontSize:"13px",fontWeight:800,color:"#c8e8ff",marginBottom:"2px"}}>{job.title} @ {job.company}</div>
                        <div style={{fontSize:"9px",color:"#1e4060"}}>{job.location} {job.salary?`· ${job.salary}`:""}</div>
                      </div>
                      <a className="apply-a" href={job.url} target="_blank" rel="noopener noreferrer">↗ Apply</a>
                    </div>
                    <div style={{padding:"13px 18px"}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"8px"}}>
                        <span style={{fontSize:"9px",color:"#007a50",letterSpacing:".1em",textTransform:"uppercase"}}>✦ Tailored Resume</span>
                        <div style={{display:"flex",gap:"5px"}}>
                          <button className="btn-ghost" style={{fontSize:"10px",padding:"4px 11px"}} onClick={()=>copy(job.tailoredResume,`r${idx}`)}>
                            {copied===`r${idx}`?"✓ Copied":"Copy"}
                          </button>
                          <button className="btn-ghost" style={{fontSize:"10px",padding:"4px 11px"}} onClick={()=>setExpandedRes(p=>({...p,[job.id]:!p[job.id]}))}>
                            {expandedRes[job.id]?"▲ Collapse":"▼ Expand"}
                          </button>
                        </div>
                      </div>
                      {expandedRes[job.id]
                        ? <textarea defaultValue={job.tailoredResume} rows={26}/>
                        : <div className="preview" onClick={()=>setExpandedRes(p=>({...p,[job.id]:true}))}>
                            {job.tailoredResume.split("\n").slice(0,4).join("\n")}
                            <span style={{color:"#0d1828"}}> … click to expand</span>
                          </div>
                      }
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* ═══ PHASE 4: DONE ══════════════════════════════════════════════════ */}
        {phase === "done" && (
          <div style={{animation:"fadeUp .3s ease"}}>
            {/* Banner */}
            <div style={{background:"#0a1220",border:"1px solid rgba(0,229,160,.18)",borderRadius:"10px",padding:"16px 22px",marginBottom:"22px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:"10px"}}>
              <div>
                <div style={{fontFamily:"'Syne',sans-serif",fontSize:"15px",fontWeight:900,color:"#d0ecff",marginBottom:"3px"}}>
                  ◈ Ready to Apply — {fmtDate()}
                </div>
                <div style={{fontSize:"10px",color:"#1e3a56"}}>
                  {results.length} tailored resume{results.length!==1?"s":""} · Click Apply, then mark as applied to exclude from future searches
                </div>
              </div>
              <button className="btn-ghost" onClick={reset}>↺ New Search</button>
            </div>

            {/* Quick-apply bar */}
            <div style={{background:"#050a14",border:"1px solid #0d1828",borderRadius:"8px",padding:"12px 16px",marginBottom:"22px"}}>
              <div style={{fontSize:"9px",color:"#0a3028",letterSpacing:".12em",textTransform:"uppercase",marginBottom:"8px"}}>Apply Links</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:"7px"}}>
                {results.map(j=>(
                  <a key={j.id} href={j.url} target="_blank" rel="noopener noreferrer"
                    onClick={()=>markApplied(j.id)}
                    style={{fontSize:"10px",color: j.is_applied?"#006a40":"#00a070",background:"rgba(0,229,160,.06)",border:"1px solid rgba(0,229,160,.13)",borderRadius:"4px",padding:"5px 12px",textDecoration:"none"}}>
                    {j.is_applied?"✓ ":"↗ "}{j.company}
                  </a>
                ))}
              </div>
            </div>

            {/* Result cards */}
            {results.map((job, idx) => (
              <div key={job.id} className="jcard" style={{marginBottom:"18px",animationDelay:`${idx*55}ms`}}>
                <div style={{padding:"14px 18px",borderBottom:"1px solid #0d1828"}}>
                  <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:"10px",marginBottom:"9px"}}>
                    <div>
                      <div style={{display:"flex",alignItems:"center",gap:"6px",flexWrap:"wrap",marginBottom:"3px"}}>
                        <span style={{fontFamily:"'Syne',sans-serif",fontSize:"14px",fontWeight:900,color:"#c8e8ff"}}>{job.title}</span>
                        <span style={{fontSize:"8px",fontWeight:700,color:job.board_color,background:`${job.board_color}15`,border:`1px solid ${job.board_color}28`,borderRadius:"3px",padding:"2px 7px"}}>{job.board}</span>
                        <span className={job.location_type==="remote"?"badge-r":"badge-h"}>
                          {job.location_type==="remote"?"🌐 Remote":"🏢 Hybrid"}
                        </span>
                      </div>
                      <div style={{fontSize:"10px",color:"#1e4060"}}>{job.company} · {job.location} {job.salary?`· ${job.salary}`:""}</div>
                    </div>
                    <div style={{display:"flex",gap:"4px",flexWrap:"wrap",justifyContent:"flex-end"}}>
                      {(job.tags||[]).map(t=><span key={t} className="tag">{t}</span>)}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
                    <a className={`apply-a ${job.is_applied?"done":""}`} href={job.url} target="_blank" rel="noopener noreferrer"
                      onClick={()=>!job.is_applied && markApplied(job.id)}>
                      {job.is_applied ? "✓ Applied" : "↗ Apply Now"}
                    </a>
                    {!job.is_applied && (
                      <button className="btn-ghost" style={{fontSize:"10px"}} onClick={()=>markApplied(job.id)}>
                        Mark Applied
                      </button>
                    )}
                  </div>
                </div>
                <div style={{padding:"13px 18px"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"8px"}}>
                    <span style={{fontSize:"9px",color:"#007a50",letterSpacing:".1em",textTransform:"uppercase"}}>✦ Tailored Resume</span>
                    <div style={{display:"flex",gap:"5px"}}>
                      <button className="btn-ghost" style={{fontSize:"10px",padding:"4px 11px"}} onClick={()=>copy(job.tailoredResume,`d${idx}`)}>
                        {copied===`d${idx}`?"✓ Copied":"Copy"}
                      </button>
                      <button className="btn-ghost" style={{fontSize:"10px",padding:"4px 11px"}} onClick={()=>setExpandedRes(p=>({...p,[job.id]:!p[job.id]}))}>
                        {expandedRes[job.id]?"▲ Collapse":"▼ Expand"}
                      </button>
                    </div>
                  </div>
                  {expandedRes[job.id]
                    ? <textarea defaultValue={job.tailoredResume} rows={26}/>
                    : <div className="preview" onClick={()=>setExpandedRes(p=>({...p,[job.id]:true}))}>
                        {job.tailoredResume.split("\n").slice(0,4).join("\n")}
                        <span style={{color:"#0d1828"}}> … click to expand</span>
                      </div>
                  }
                </div>
              </div>
            ))}

            <div style={{textAlign:"center",paddingBottom:"24px"}}>
              <button className="btn-cta" onClick={reset} style={{fontSize:"12px",padding:"12px 28px"}}>
                ↺ Start New Search
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
