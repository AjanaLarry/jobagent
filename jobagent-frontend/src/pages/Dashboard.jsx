import { useState, useEffect, useRef } from 'react';
import { useAuth, useUser, useClerk } from '@clerk/clerk-react';
import { useNavigate, Navigate } from 'react-router-dom';

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

const TABS = [
  { key: 'today', label: "Today's Run" },
  { key: 'applied', label: 'Applied' },
  { key: 'manual', label: 'Manual Queue' },
  { key: 'skipped', label: 'Skipped' },
  { key: 'resumes', label: 'Resume Versions' },
  { key: 'settings', label: 'Settings' },
];

const cardStyle = {
  background: '#070f1e',
  border: '1px solid #0d1e30',
  borderRadius: '8px',
  padding: '20px',
};

const labelStyle = {
  color: '#3a5a78',
  fontSize: '12px',
};

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

export default function Dashboard() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('today');
  const [tabData, setTabData] = useState({});
  const [tabLoading, setTabLoading] = useState({});
  const [tabError, setTabError] = useState({});
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState(null);
  const [markingId, setMarkingId] = useState(null);
  const [settingsMessage, setSettingsMessage] = useState(null);
  const csrfRef = useRef(null);

  async function getCsrfToken() {
    if (!csrfRef.current) {
      const res = await fetch(`${BACKEND}/api/csrf-token`);
      const data = await res.json();
      csrfRef.current = data.csrfToken;
    }
    return csrfRef.current;
  }

  async function apiFetch(path, options = {}) {
    const token = await getToken({ template: 'jobagent' });
    const csrf = await getCsrfToken();
    const res = await fetch(`${BACKEND}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-CSRF-Token': csrf,
        ...options.headers,
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || err.message || 'Request failed');
    }
    return res.json();
  }

  async function loadTab(tab) {
    setTabLoading((l) => ({ ...l, [tab]: true }));
    setTabError((e) => ({ ...e, [tab]: null }));
    try {
      let result;
      if (tab === 'today') {
        const { logs } = await apiFetch('/api/run-logs');
        console.log('[Dashboard] run-logs raw response:', JSON.stringify(logs));
        const meaningfulRun = (logs || []).find(
          log => log.jobs_fetched > 0
        ) || logs?.[0] || null;
        result = meaningfulRun;
      } else if (tab === 'applied') {
        const data = await apiFetch('/api/jobs/applied');
        result = data.jobs || [];
      } else if (tab === 'manual') {
        const { jobs } = await apiFetch('/api/jobs/manual');
        result = jobs;
      } else if (tab === 'skipped') {
        const data = await apiFetch('/api/jobs/tracker');
        result = (data.jobs || []).filter((j) => j.status === 'skipped');
      } else if (tab === 'resumes') {
        const { resumes } = await apiFetch('/api/resumes');
        result = resumes;
      }
      setTabData((d) => ({ ...d, [tab]: result }));
    } catch (err) {
      setTabError((e) => ({ ...e, [tab]: err.message }));
    } finally {
      setTabLoading((l) => ({ ...l, [tab]: false }));
    }
  }

  useEffect(() => {
    if (!isSignedIn || activeTab === 'settings') return;
    loadTab(activeTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isSignedIn]);

  if (!isLoaded) {
    return (
      <div style={{ minHeight: '100vh', background: '#040c18', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00e5a0', fontFamily: 'DM Mono, monospace' }}>
        Loading…
      </div>
    );
  }

  if (!isSignedIn) {
    return <Navigate to="/signin" replace />;
  }

  async function handleRunNow() {
    setRunning(true);
    setRunResult(null);

    try {
      // Get current last run time before triggering
      const beforeLogs = await apiFetch('/api/run-logs');
      const lastRunBefore = beforeLogs.logs?.[0]?.run_at || null;

      // Fire and forget — returns 202 immediately
      await apiFetch('/api/pipeline/run-now', { method: 'POST' });

      // Poll every 5 seconds for new run log
      let attempts = 0;
      const maxAttempts = 120; // 10 minutes max

      const poll = async () => {
        attempts++;
        try {
          const data = await apiFetch('/api/run-logs');
          const latest = data.logs?.[0];

          // Check if a new run has completed
          if (latest && latest.run_at !== lastRunBefore) {
            setRunResult(latest);
            setRunning(false);
            // Refresh today tab data
            loadTab('today');
            return;
          }

          if (attempts < maxAttempts) {
            setTimeout(poll, 5000);
          } else {
            // Timed out — stop polling, refresh anyway
            setRunning(false);
            loadTab('today');
          }
        } catch {
          setRunning(false);
        }
      };

      // Start polling after 10 seconds
      // (pipeline needs time to start)
      setTimeout(poll, 10000);

    } catch (err) {
      setRunResult({ error: err.message });
      setRunning(false);
    }
  }

  async function handleMarkApplied(jobId) {
    setMarkingId(jobId);
    try {
      const { csrfToken } = await apiFetch('/api/csrf-token');
      await apiFetch(`/api/jobs/${jobId}/applied`, {
        method: 'POST',
        headers: { 'X-CSRF-Token': csrfToken },
      });
      setTabData((d) => ({ ...d, manual: (d.manual || []).filter((j) => j.id !== jobId) }));
    } catch (err) {
      setTabError((e) => ({ ...e, manual: err.message }));
    } finally {
      setMarkingId(null);
    }
  }

  function TabButton({ tab }) {
    const active = activeTab === tab.key;
    return (
      <button
        type="button"
        onClick={() => setActiveTab(tab.key)}
        style={{
          background: 'none',
          border: 'none',
          borderBottom: active ? '2px solid #00e5a0' : '2px solid transparent',
          color: active ? '#00e5a0' : '#3a5a78',
          fontFamily: 'inherit',
          fontSize: '13px',
          padding: '12px 4px',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {tab.label}
      </button>
    );
  }

  function ErrorBox({ message }) {
    if (!message) return null;
    return (
      <div style={{
        padding: '10px 14px', borderRadius: '6px', marginBottom: '16px', fontSize: '13px',
        background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.3)', color: '#ff6b6b',
      }}>
        {message}
      </div>
    );
  }

  function renderToday() {
    const log = tabData.today;
    return (
      <div>
        <ErrorBox message={tabError.today} />

        {runResult && (
          <div style={{
            padding: '10px 14px', borderRadius: '6px', marginBottom: '16px', fontSize: '13px',
            background: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.3)', color: '#00e5a0',
          }}>
            Run complete — {runResult.jobs_applied} applied, {runResult.jobs_manual} need manual review.
          </div>
        )}

        <div style={{ ...labelStyle, marginBottom: '16px' }}>
          Last run: {log ? formatDateTime(log.run_at) : 'No runs yet'}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
          {[
            ['Searched', log?.jobs_fetched],
            ['Scored', log?.jobs_scored],
            ['Applied', log?.jobs_applied],
            ['Manual', log?.jobs_manual],
          ].map(([label, value]) => (
            <div key={label} style={cardStyle}>
              <div style={{ color: '#00e5a0', fontSize: '24px', fontWeight: 700 }}>{value ?? '—'}</div>
              <div style={labelStyle}>{label}</div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={handleRunNow}
          disabled={running}
          style={{
            width: '100%', background: '#00e5a0', color: '#020c18', border: 'none', borderRadius: '6px',
            padding: '14px', fontWeight: 700, fontFamily: 'inherit', fontSize: '14px',
            cursor: running ? 'not-allowed' : 'pointer', opacity: running ? 0.7 : 1, marginBottom: '12px',
          }}
        >
          {running ? 'Running… (checking every 5s)' : 'Run Now'}
        </button>

        <div style={{ ...labelStyle, textAlign: 'center' }}>
          Next scheduled: Daily at 9:00 AM (America/Toronto)
        </div>
      </div>
    );
  }

  function renderApplied() {
    const jobs = tabData.applied || [];
    if (tabLoading.applied) return <div style={labelStyle}>Loading…</div>;
    return (
      <div>
        <ErrorBox message={tabError.applied} />
        {jobs.length === 0 ? (
          <div style={labelStyle}>No applied jobs yet</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#3a5a78', borderBottom: '1px solid #0d1e30' }}>
                  <th style={{ padding: '8px' }}>Role</th>
                  <th style={{ padding: '8px' }}>Company</th>
                  <th style={{ padding: '8px' }}>Board</th>
                  <th style={{ padding: '8px' }}>Score</th>
                  <th style={{ padding: '8px' }}>Date</th>
                  <th style={{ padding: '8px' }}>PDF</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} style={{ borderBottom: '1px solid #0d1e30', color: '#b8d0ee' }}>
                    <td style={{ padding: '8px' }}>{job.title}</td>
                    <td style={{ padding: '8px' }}>{job.company}</td>
                    <td style={{ padding: '8px' }}>{job.board}</td>
                    <td style={{ padding: '8px' }}>{job.match_score_ai ?? job.match_score ?? '—'}</td>
                    <td style={{ padding: '8px' }}>{formatDate(job.applied_at)}</td>
                    <td style={{ padding: '8px' }}>
                      {job.tailored_resume_pdf_url ? (
                        <a href={job.tailored_resume_pdf_url} target="_blank" rel="noopener noreferrer" style={{ color: '#00e5a0' }}>
                          ↓ PDF
                        </a>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  function renderManual() {
    const jobs = tabData.manual || [];
    if (tabLoading.manual) return <div style={labelStyle}>Loading…</div>;
    return (
      <div>
        <ErrorBox message={tabError.manual} />
        {jobs.length === 0 ? (
          <div style={labelStyle}>No jobs in manual queue 🎉</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{
                  textAlign: 'left', color: '#00e5a0', fontSize: '11px', letterSpacing: '0.1em',
                  textTransform: 'uppercase', borderBottom: '1px solid #0d1e30',
                }}>
                  <th style={{ paddingBottom: '8px' }}>Role</th>
                  <th style={{ paddingBottom: '8px' }}>Company</th>
                  <th style={{ paddingBottom: '8px' }}>Score</th>
                  <th style={{ paddingBottom: '8px' }}>Reason</th>
                  <th style={{ paddingBottom: '8px' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} style={{ borderBottom: '1px solid #070f1e' }}>
                    <td style={{ padding: '12px 8px', color: '#b8d0ee', fontWeight: 600 }}>{job.title}</td>
                    <td style={{ padding: '12px 8px', color: '#3a5a78', fontSize: '12px' }}>{job.company}</td>
                    <td style={{ padding: '12px 8px' }}>
                      {job.match_score_ai != null ? (
                        <span style={{
                          background: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.3)',
                          borderRadius: '4px', padding: '2px 8px', color: '#00e5a0', fontSize: '12px',
                        }}>
                          {job.match_score_ai}% match
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '12px 8px', color: '#3a5a78', fontSize: '12px', fontStyle: 'italic' }}>
                      {job.notes || 'Manual review required'}
                    </td>
                    <td style={{ padding: '12px 8px' }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <a
                          href={job.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            textAlign: 'center', border: '1px solid #0d1e30', borderRadius: '6px',
                            padding: '6px 12px', color: '#b8d0ee', fontSize: '12px', textDecoration: 'none',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          ↗ Apply
                        </a>
                        <button
                          type="button"
                          onClick={() => handleMarkApplied(job.id)}
                          disabled={markingId === job.id}
                          style={{
                            background: '#00e5a0', color: '#020c18', border: 'none', borderRadius: '6px',
                            padding: '6px 12px', fontWeight: 700, fontSize: '12px', fontFamily: 'inherit',
                            cursor: markingId === job.id ? 'not-allowed' : 'pointer',
                            opacity: markingId === job.id ? 0.7 : 1,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {markingId === job.id ? '…' : 'Mark Applied'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  function renderSkipped() {
    const jobs = tabData.skipped || [];
    if (tabLoading.skipped) return <div style={labelStyle}>Loading…</div>;
    return (
      <div>
        <ErrorBox message={tabError.skipped} />
        {jobs.length === 0 ? (
          <div style={labelStyle}>No skipped jobs yet</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#3a5a78', borderBottom: '1px solid #0d1e30' }}>
                  <th style={{ padding: '8px' }}>Role</th>
                  <th style={{ padding: '8px' }}>Company</th>
                  <th style={{ padding: '8px' }}>Score</th>
                  <th style={{ padding: '8px' }}>Reason</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} style={{ borderBottom: '1px solid #0d1e30', color: '#b8d0ee' }}>
                    <td style={{ padding: '8px' }}>{job.title}</td>
                    <td style={{ padding: '8px' }}>{job.company}</td>
                    <td style={{ padding: '8px' }}>{job.match_score_ai ?? job.match_score ?? '—'}</td>
                    <td style={{ padding: '8px' }}>{job.notes || 'Below match threshold'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  function renderResumes() {
    const resumes = tabData.resumes || [];
    if (tabLoading.resumes) return <div style={labelStyle}>Loading…</div>;
    return (
      <div>
        <ErrorBox message={tabError.resumes} />
        {resumes.length === 0 ? (
          <div style={labelStyle}>No tailored resumes yet. Run the agent to generate your first.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {resumes.map((r) => (
              <div key={r.id} style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ color: '#b8d0ee', fontSize: '14px' }}>{r.title} @ {r.company}</div>
                  <div style={labelStyle}>{r.match_score_ai ?? '—'}% · {formatDate(r.fetched_at)}</div>
                </div>
                {r.tailored_resume_pdf_url && (
                  <a href={r.tailored_resume_pdf_url} target="_blank" rel="noopener noreferrer" style={{ color: '#00e5a0', fontSize: '13px' }}>
                    ↓ PDF
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderSettings() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={cardStyle}>
          <div style={{ ...labelStyle, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
            Account Info
          </div>
          <div style={{ color: '#b8d0ee', fontSize: '14px', marginBottom: '4px' }}>
            {user?.primaryEmailAddress?.emailAddress || '—'}
          </div>
          <div style={labelStyle}>
            Member since {user?.createdAt ? formatDate(user.createdAt) : '—'}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ ...labelStyle, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
            Quick Links
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={() => navigate('/preferences')}
              style={{ flex: 1, background: 'transparent', border: '1px solid #0d1e30', borderRadius: '6px', padding: '10px', color: '#b8d0ee', fontFamily: 'inherit', fontSize: '13px', cursor: 'pointer' }}
            >
              Edit Preferences
            </button>
            <button
              type="button"
              onClick={() => navigate('/onboard')}
              style={{ flex: 1, background: 'transparent', border: '1px solid #0d1e30', borderRadius: '6px', padding: '10px', color: '#b8d0ee', fontFamily: 'inherit', fontSize: '13px', cursor: 'pointer' }}
            >
              Upload New Resume
            </button>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ ...labelStyle, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
            Agent Control
          </div>
          <button
            type="button"
            onClick={() => setSettingsMessage('Coming soon — pausing the agent isn’t available yet.')}
            style={{ width: '100%', background: 'transparent', border: '1px solid #0d1e30', borderRadius: '6px', padding: '10px', color: '#b8d0ee', fontFamily: 'inherit', fontSize: '13px', cursor: 'pointer' }}
          >
            Pause Agent
          </button>
          {settingsMessage && (
            <div style={{ ...labelStyle, marginTop: '8px', color: '#6b7f99' }}>{settingsMessage}</div>
          )}
        </div>

        <div style={cardStyle}>
          <button
            type="button"
            onClick={() => signOut(() => navigate('/signin'))}
            style={{ width: '100%', background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.3)', borderRadius: '6px', padding: '10px', color: '#ff6b6b', fontFamily: 'inherit', fontSize: '13px', cursor: 'pointer' }}
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#040c18', fontFamily: 'DM Mono, monospace', padding: '32px 20px' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'Syne, sans-serif', color: '#b8d0ee', fontSize: '24px', marginBottom: '20px' }}>
          ▣ Dashboard
        </h1>

        <div style={{ display: 'flex', gap: '20px', borderBottom: '1px solid #0d1e30', marginBottom: '24px', overflowX: 'auto' }}>
          {TABS.map((tab) => <TabButton key={tab.key} tab={tab} />)}
        </div>

        {activeTab === 'today' && renderToday()}
        {activeTab === 'applied' && renderApplied()}
        {activeTab === 'manual' && renderManual()}
        {activeTab === 'skipped' && renderSkipped()}
        {activeTab === 'resumes' && renderResumes()}
        {activeTab === 'settings' && renderSettings()}
      </div>
    </div>
  );
}
