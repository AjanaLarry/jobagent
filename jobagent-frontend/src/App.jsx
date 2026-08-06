import { Link } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { useTheme } from "./hooks/useTheme";

// ─── App (marketing landing page) ──────────────────────────────────────────────
export default function App() {
  const { isSignedIn } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <>
    <style>{`
      @media (max-width: 767px) {
        .lp-nav-links { display: none !important; }
        .lp-hero {
          padding: 90px 20px 40px !important;
          max-width: 100% !important;
        }
        .lp-hero h1 {
          font-size: 34px !important;
          line-height: 1.12 !important;
        }
        .lp-hero p { font-size: 14px !important; }
        .lp-actions {
          flex-direction: column !important;
          gap: 10px !important;
        }
        .lp-actions a, .lp-actions button {
          width: 100% !important;
          text-align: center !important;
          box-sizing: border-box !important;
        }
        .lp-stats {
          display: grid !important;
          grid-template-columns: repeat(2, 1fr) !important;
          border-radius: 10px !important;
        }
        .lp-stat {
          border-right: none !important;
          border-bottom: 1px solid rgba(255,255,255,0.08) !important;
        }
        .lp-section {
          padding: 40px 20px !important;
          max-width: 100% !important;
        }
        .lp-steps {
          grid-template-columns: 1fr !important;
          gap: 12px !important;
        }
        .lp-features {
          grid-template-columns: 1fr !important;
          gap: 10px !important;
        }
        .lp-cta {
          padding: 28px 20px !important;
          margin: 20px 16px !important;
        }
        .lp-cta h2 { font-size: 22px !important; }
      }
    `}</style>
    <div style={{ minHeight:"100vh", background:"var(--bg)", fontFamily:"'DM Mono','Fira Code',monospace", color:"#b0c8e8" }}>
      <style>{`
        @keyframes pulseDot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      <nav className="app-navbar" style={{
        position:"fixed", top:0, left:0, right:0, zIndex:100,
        background:"rgba(5,13,26,0.95)",
        backdropFilter:"blur(12px)",
        borderBottom:"1px solid rgba(255,255,255,0.06)",
        padding:"0 40px", height:"60px",
        display:"flex", alignItems:"center", justifyContent:"space-between",
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
          <span style={{ color:"#00c896", fontSize:"18px" }}>◈</span>
          <span style={{ fontSize:"16px", fontWeight:700, color:"#fff" }}>JobAgent</span>
        </div>

        {isSignedIn && (
          <div className="lp-nav-links" style={{ display:"flex", gap:"24px" }}>
            <Link to="/dashboard" style={{ color:"#6b8aaa", fontSize:"13px", textDecoration:"none" }}>Dashboard</Link>
            <Link to="/search" style={{ color:"#6b8aaa", fontSize:"13px", textDecoration:"none" }}>Search</Link>
            <Link to="/preferences" style={{ color:"#6b8aaa", fontSize:"13px", textDecoration:"none" }}>Preferences</Link>
          </div>
        )}

        <div style={{ display:"flex", alignItems:"center", gap:"12px" }}>
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '6px',
              padding: '6px 10px',
              cursor: 'pointer',
              fontSize: '14px',
              color: '#94a3b8',
              lineHeight: 1,
            }}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>

          {isSignedIn ? (
            <Link to="/dashboard" style={{
              background:"#00c896", color:"#050d1a",
              padding:"8px 18px", borderRadius:"8px",
              fontSize:"13px", fontWeight:600, textDecoration:"none",
            }}>
              Dashboard →
            </Link>
          ) : (
            <Link to="/signin" style={{
              background:"#00c896", color:"#050d1a",
              padding:"8px 18px", borderRadius:"8px",
              fontSize:"13px", fontWeight:600, textDecoration:"none",
            }}>
              Get started
            </Link>
          )}
        </div>
      </nav>

      <div className="lp-hero" style={{ padding:"180px 40px 60px", maxWidth:"820px", margin:"0 auto" }}>

        {/* Badge */}
        <div style={{
          display:"inline-flex", alignItems:"center", gap:"6px",
          fontSize:"11px", fontWeight:500, color:"#00c896",
          background:"rgba(0,200,150,0.1)", border:"1px solid rgba(0,200,150,0.2)",
          padding:"5px 12px", borderRadius:"20px",
          marginBottom:"24px", letterSpacing:"0.08em",
        }}>
          <span style={{ width:"6px", height:"6px", background:"#00c896", borderRadius:"50%", animation:"pulseDot 2s infinite", display:"inline-block" }} />
          ◈ AI-Powered Job Applications
        </div>

        {/* Headline */}
        <h1 style={{
          fontSize:"clamp(38px, 6vw, 58px)",
          fontWeight:800, color:"#ffffff",
          lineHeight:1.08, letterSpacing:"-0.03em",
          margin:"0 0 20px",
        }}>
          <span style={{ display:"block" }}>Your resume, tailored.</span>
          <span style={{ display:"block", color:"#00c896" }}>Every job. Every day.</span>
        </h1>

        {/* Subheadline */}
        <p style={{ fontSize:"16px", color:"#6b8aaa", lineHeight:1.65, maxWidth:"540px", margin:"0 0 36px" }}>
          Upload your resume once. JobAgent scrapes 6 job boards, scores each role with Gemini AI, rewrites your resume for it, and queues tailored applications — every morning at 9am.
        </p>

        {/* CTA row */}
        <div className="lp-actions" style={{ display:"flex", gap:"12px" }}>
          <Link to="/signin" style={{
            background:"#00c896", color:"#050d1a",
            fontSize:"14px", fontWeight:600,
            padding:"12px 24px", borderRadius:"9px",
            textDecoration:"none", display:"inline-block",
          }}>
            Start for free →
          </Link>
          <Link to="/search" style={{
            background:"rgba(255,255,255,0.05)", color:"#b8d0ee",
            fontSize:"14px", padding:"12px 24px", borderRadius:"9px",
            border:"1px solid rgba(255,255,255,0.1)",
            textDecoration:"none", display:"inline-block",
            fontFamily:"inherit",
          }}>
            View demo ↓
          </Link>
        </div>

        {/* Stats bar */}
        <div className="lp-stats" style={{
          display:"flex", marginTop:"52px",
          border:"1px solid rgba(255,255,255,0.08)", borderRadius:"12px",
          background:"rgba(255,255,255,0.02)", overflow:"hidden",
        }}>
          {[
            { value:"6+", label:"Job boards scraped" },
            { value:"Daily", label:"Automated at 9 AM Toronto" },
            { value:"AI", label:"Resume tailored per role" },
            { value:"Free", label:"To get started" },
          ].map((s, i, arr) => (
            <div key={s.label} className="lp-stat" style={{
              flex:1, padding:"18px 24px",
              borderRight: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.08)" : "none",
            }}>
              <div style={{ fontSize:"24px", fontWeight:700, color:"#fff" }}>{s.value}</div>
              <div style={{ fontSize:"11px", color:"#4a6278", marginTop:"3px" }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* How it works */}
        <div className="lp-section" style={{ marginTop:"80px" }}>
          <div style={{ fontSize:"11px", fontWeight:600, color:"#00c896", letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:"14px" }}>
            HOW IT WORKS
          </div>
          <h2 style={{ fontSize:"28px", fontWeight:700, color:"#fff", letterSpacing:"-0.025em", margin:"0 0 8px" }}>
            Three steps to hands-free applications
          </h2>
          <p style={{ fontSize:"14px", color:"#6b8aaa", margin:"0 0 32px" }}>
            Set up once, let the agent do the work every day.
          </p>

          <div className="lp-steps" style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:"14px" }}>
            {[
              { step:"01 — Upload", icon:"📄", title:"Upload your resume", body:"Drop your PDF or DOCX. AI parses your skills, experience, and certifications in seconds." },
              { step:"02 — Configure", icon:"⚙️", title:"Set your preferences", body:"Choose roles, location (remote Canada, worldwide), match threshold, and which job boards to search." },
              { step:"03 — Relax", icon:"🤖", title:"Agent runs every morning", body:"At 9am, JobAgent scores roles, tailors your resume for each one, and queues them for your review." },
            ].map(c => (
              <div key={c.step} style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:"14px", padding:"24px" }}>
                <div style={{ fontSize:"11px", fontWeight:600, color:"#00c896", letterSpacing:"0.1em", marginBottom:"14px" }}>{c.step}</div>
                <div style={{ width:"40px", height:"40px", background:"rgba(0,200,150,0.1)", borderRadius:"10px", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"22px", marginBottom:"14px" }}>
                  {c.icon}
                </div>
                <h3 style={{ fontSize:"14px", fontWeight:600, color:"#e2eaf4", margin:"0 0 8px" }}>{c.title}</h3>
                <p style={{ fontSize:"12px", color:"#4a6278", lineHeight:1.6, margin:0 }}>{c.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Features */}
        <div className="lp-section" style={{ marginTop:"52px" }}>
          <div style={{ fontSize:"11px", fontWeight:600, color:"#00c896", letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:"14px" }}>
            FEATURES
          </div>
          <h2 style={{ fontSize:"28px", fontWeight:700, color:"#fff", letterSpacing:"-0.025em", margin:"0 0 8px" }}>
            Built for serious job seekers
          </h2>
          <p style={{ fontSize:"14px", color:"#6b8aaa", margin:"0 0 32px" }}>
            Not just an aggregator — an intelligent agent that works while you sleep.
          </p>

          <div className="lp-features" style={{ display:"grid", gridTemplateColumns:"repeat(2, 1fr)", gap:"10px" }}>
            {[
              { icon:"🔍", title:"Multi-board scraping", body:"RemoteOK, We Work Remotely, Greenhouse, Lever, Otta, JSearch — all in one daily run." },
              { icon:"📊", title:"Semantic AI scoring", body:"Gemini evaluates each role against your profile — not just keyword matching." },
              { icon:"📝", title:"Per-role resume tailoring", body:"AI rewrites your profile and reorders bullets to match each job description." },
              { icon:"📄", title:"PDF ready to download", body:"Every tailored resume stored in R2 — download and apply with one click." },
              { icon:"🍁", title:"Canada and worldwide remote", body:"Filter for Canadian remote, worldwide remote, or hybrid roles. Exclude sponsorship requirements." },
              { icon:"✉️", title:"Daily email summary", body:"Wake up to a digest of scored roles, applied jobs, and manual queue items." },
            ].map(f => (
              <div key={f.title} style={{ display:"flex", alignItems:"flex-start", gap:"12px", background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:"10px", padding:"14px" }}>
                <div style={{ width:"32px", height:"32px", background:"rgba(0,200,150,0.08)", borderRadius:"8px", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"16px" }}>
                  {f.icon}
                </div>
                <div>
                  <h4 style={{ fontSize:"13px", fontWeight:600, color:"#b8d0ee", margin:"0 0 3px" }}>{f.title}</h4>
                  <p style={{ fontSize:"12px", color:"#4a6278", lineHeight:1.5, margin:0 }}>{f.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA banner */}
        <div className="lp-cta" style={{
          marginTop:"52px", marginBottom:"20px",
          background:"linear-gradient(135deg, rgba(0,200,150,0.1) 0%, rgba(0,100,200,0.06) 100%)",
          border:"1px solid rgba(0,200,150,0.18)",
          borderRadius:"16px", padding:"40px", textAlign:"center",
        }}>
          <h2 style={{ fontSize:"26px", fontWeight:700, color:"#fff", letterSpacing:"-0.02em", margin:"0 0 10px" }}>
            Start your job search on autopilot
          </h2>
          <p style={{ fontSize:"14px", color:"#6b8aaa", margin:"0 0 22px" }}>
            Upload your resume and set your preferences. JobAgent handles the rest — free to get started.
          </p>
          {isSignedIn ? (
            <Link to="/dashboard" style={{
              background:"#00c896", color:"#050d1a",
              fontSize:"14px", fontWeight:700,
              padding:"12px 26px", borderRadius:"9px",
              textDecoration:"none", display:"inline-block",
            }}>
              Go to your dashboard →
            </Link>
          ) : (
            <Link to="/signin" style={{
              background:"#00c896", color:"#050d1a",
              fontSize:"14px", fontWeight:700,
              padding:"12px 26px", borderRadius:"9px",
              textDecoration:"none", display:"inline-block",
            }}>
              Create your account →
            </Link>
          )}
        </div>  {/* CTA banner */}
      </div>  {/* content wrapper */}
    </div>
    </>
  );
}
