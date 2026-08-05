import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";

const BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

const DEFAULT_PREFS = {
  roles: [],
  location_types: ["remote_worldwide"],
  location_city: "",
  match_threshold: 65,
  daily_limit: 5,
  boards: ["jsearch", "remoteok", "weworkremotely", "greenhouse", "lever", "otta"],
  exclude_sponsorship: true,
};

const LOCATION_OPTIONS = [
  { value: "remote_worldwide", label: "🌐 Remote Worldwide", desc: "Fully remote, open to candidates globally" },
  { value: "remote_canada", label: "🍁 Remote Canada", desc: "Remote roles requiring Canadian residency" },
  { value: "hybrid_canada", label: "🏢 Hybrid Canada", desc: "Hybrid roles — requires Canadian location" },
  { value: "onsite", label: "🏛 On-site", desc: "In-office roles" },
];

// Old backend shape stored a single `location_type` string. Convert to the
// new multi-select array shape when loading previously-saved preferences.
function normalizeLocationTypes(loaded) {
  if (Array.isArray(loaded?.location_types)) return loaded.location_types;
  const legacyMap = {
    remote: ["remote_worldwide"],
    hybrid: ["hybrid_canada"],
    onsite: ["onsite"],
  };
  return legacyMap[loaded?.location_type] || DEFAULT_PREFS.location_types;
}

const PREDEFINED_ROLES = [
  "Cloud Support Engineer",
  "Junior DevOps Engineer",
  "Platform Engineer",
  "Site Reliability Engineer (SRE)",
  "Technical Support Specialist",
  "Cloud Operations Analyst",
];

const BOARD_OPTIONS = [
  { id: "jsearch", label: "JSearch (LinkedIn / Indeed / Glassdoor)" },
  { id: "remoteok", label: "RemoteOK" },
  { id: "weworkremotely", label: "We Work Remotely" },
  { id: "greenhouse", label: "Greenhouse" },
  { id: "lever", label: "Lever" },
  { id: "otta", label: "Otta" },
];

const cardStyle = {
  background: "#070f1e",
  border: "1px solid #0d1e30",
  borderRadius: "8px",
  padding: "20px",
  marginBottom: "16px",
};

const sectionTitleStyle = {
  color: "#00e5a0",
  fontSize: "11px",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  marginBottom: "12px",
};

const labelStyle = {
  color: "#b8d0ee",
  fontSize: "13px",
};

export default function Preferences() {
  const { getToken } = useAuth();
  const navigate = useNavigate();

  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [customRoleInput, setCustomRoleInput] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken({ template: 'jobagent' });
        if (!token) throw new Error("Not authenticated");
        const res = await fetch(`${BACKEND}/api/preferences`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        setPrefs({
          ...DEFAULT_PREFS,
          ...data.preferences,
          location_types: normalizeLocationTypes(data.preferences),
        });
      } catch (err) {
        setMessage({ text: err.message, type: "error" });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    if (!prefs.location_types || prefs.location_types.length === 0) {
      setMessage({ text: "Select at least one location preference", type: "error" });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const token = await getToken({ template: 'jobagent' });
      const csrf = await fetch(`${BACKEND}/api/csrf-token`)
        .then((r) => r.json())
        .then((d) => d.csrfToken);

      // The backend (PUT /api/preferences) still validates and persists a
      // single `location_type` string ("remote"|"hybrid"|"onsite") and
      // explicitly whitelists 6 fields when saving — location_types and
      // exclude_sponsorship are not in that whitelist yet, so they will NOT
      // persist server-side until routes.js/database.js are updated. Sending
      // a derived singular value here so the save at least doesn't 400.
      const derivedLocationType = prefs.location_types.includes("onsite")
        ? "onsite"
        : prefs.location_types.includes("hybrid_canada")
        ? "hybrid"
        : "remote";

      const res = await fetch(`${BACKEND}/api/preferences`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify({ ...prefs, location_type: derivedLocationType }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Save failed");
      }
      setMessage({ text: "Preferences saved ✓", type: "success" });
      setTimeout(() => navigate("/dashboard"), 1500);
    } catch (err) {
      setMessage({ text: err.message, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const togglePredefinedRole = (role) => {
    setPrefs((p) => ({
      ...p,
      roles: p.roles.includes(role)
        ? p.roles.filter((r) => r !== role)
        : [...p.roles, role],
    }));
  };

  const addCustomRole = () => {
    const role = customRoleInput.trim();
    if (role && !prefs.roles.includes(role)) {
      setPrefs((p) => ({ ...p, roles: [...p.roles, role] }));
    }
    setCustomRoleInput("");
  };

  const removeRole = (role) => {
    setPrefs((p) => ({ ...p, roles: p.roles.filter((r) => r !== role) }));
  };

  const toggleBoard = (boardId) => {
    setPrefs((p) => ({
      ...p,
      boards: p.boards.includes(boardId)
        ? p.boards.filter((b) => b !== boardId)
        : [...p.boards, boardId],
    }));
  };

  const toggleLocationType = (value) => {
    setPrefs((p) => ({
      ...p,
      location_types: p.location_types.includes(value)
        ? p.location_types.filter((v) => v !== value)
        : [...p.location_types, value],
    }));
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#040c18",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#00e5a0",
          fontFamily: "DM Mono, monospace",
        }}
      >
        Loading preferences…
      </div>
    );
  }

  const showCity = prefs.location_types.includes("hybrid_canada") || prefs.location_types.includes("onsite");

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#040c18",
        fontFamily: "DM Mono, monospace",
        padding: "32px 20px",
      }}
    >
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div style={{ maxWidth: "560px", margin: "0 auto" }}>
        <h1
          style={{
            fontFamily: "Syne, sans-serif",
            color: "#b8d0ee",
            fontSize: "24px",
            marginBottom: "24px",
          }}
        >
          ⟳ Job Preferences
        </h1>

        {message && (
          <div style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 1000,
            padding: '14px 20px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 600,
            fontFamily: 'DM Mono, monospace',
            background: message.type === 'success'
              ? 'rgba(0,229,160,0.15)'
              : 'rgba(255,107,107,0.15)',
            border: `1px solid ${message.type === 'success'
              ? 'rgba(0,229,160,0.4)'
              : 'rgba(255,107,107,0.4)'}`,
            color: message.type === 'success' ? '#00e5a0' : '#ff6b6b',
            boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
            animation: 'fadeUp 0.2s ease',
          }}>
            {message.text}
          </div>
        )}

        {/* SECTION 1 — Job Roles */}
        <div style={cardStyle}>
          <div style={sectionTitleStyle}>Job Roles</div>
          {PREDEFINED_ROLES.map((role) => (
            <label
              key={role}
              style={{ ...labelStyle, display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}
            >
              <input
                type="checkbox"
                checked={prefs.roles.includes(role)}
                onChange={() => togglePredefinedRole(role)}
                style={{ accentColor: "#00e5a0" }}
              />
              {role}
            </label>
          ))}

          {prefs.roles.filter((r) => !PREDEFINED_ROLES.includes(r)).length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", margin: "10px 0" }}>
              {prefs.roles
                .filter((r) => !PREDEFINED_ROLES.includes(r))
                .map((role) => (
                  <span
                    key={role}
                    style={{
                      background: "rgba(0,229,160,0.1)",
                      border: "1px solid rgba(0,229,160,0.3)",
                      borderRadius: "4px",
                      padding: "3px 10px",
                      color: "#00e5a0",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      fontSize: "13px",
                    }}
                  >
                    {role}
                    <span
                      onClick={() => removeRole(role)}
                      style={{ cursor: "pointer" }}
                    >
                      ×
                    </span>
                  </span>
                ))}
            </div>
          )}

          <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
            <input
              type="text"
              value={customRoleInput}
              onChange={(e) => setCustomRoleInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustomRole();
                }
              }}
              placeholder="Custom role"
              style={{
                flex: 1,
                background: "#040c18",
                border: "1px solid #0d1e30",
                borderRadius: "6px",
                padding: "8px 10px",
                color: "#b8d0ee",
                fontFamily: "inherit",
                fontSize: "13px",
              }}
            />
            <button
              type="button"
              onClick={addCustomRole}
              style={{
                background: "#0d1e30",
                border: "1px solid #0d1e30",
                borderRadius: "6px",
                padding: "8px 14px",
                color: "#00e5a0",
                fontFamily: "inherit",
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              Add
            </button>
          </div>
        </div>

        {/* SECTION 2 — Location Preference */}
        <div style={cardStyle}>
          <div style={sectionTitleStyle}>Location Preference</div>
          {LOCATION_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              style={{ ...labelStyle, display: "flex", alignItems: "flex-start", gap: "8px", marginBottom: "10px" }}
            >
              <input
                type="checkbox"
                checked={prefs.location_types.includes(opt.value)}
                onChange={() => toggleLocationType(opt.value)}
                style={{ accentColor: "#00e5a0", marginTop: "2px" }}
              />
              <span>
                <div>{opt.label}</div>
                <div style={{ color: "#6b7f99", fontSize: "11px", marginTop: "2px" }}>{opt.desc}</div>
              </span>
            </label>
          ))}

          {showCity && (
            <div style={{ marginTop: "10px" }}>
              <label style={{ ...labelStyle, display: "block", marginBottom: "6px" }}>
                City (e.g. Toronto, ON)
              </label>
              <input
                type="text"
                value={prefs.location_city}
                onChange={(e) => setPrefs((p) => ({ ...p, location_city: e.target.value }))}
                placeholder="Toronto, ON"
                style={{
                  width: "100%",
                  background: "#040c18",
                  border: "1px solid #0d1e30",
                  borderRadius: "6px",
                  padding: "8px 10px",
                  color: "#b8d0ee",
                  fontFamily: "inherit",
                  fontSize: "13px",
                  boxSizing: "border-box",
                }}
              />
            </div>
          )}
        </div>

        {/* SECTION 3 — Match Threshold */}
        <div style={cardStyle}>
          <div style={sectionTitleStyle}>Match Threshold</div>
          <label style={{ ...labelStyle, display: "block", marginBottom: "8px" }}>
            {prefs.match_threshold}% minimum match score
          </label>
          <input
            type="range"
            min={60}
            max={90}
            step={1}
            value={prefs.match_threshold}
            onChange={(e) =>
              setPrefs((p) => ({ ...p, match_threshold: Number(e.target.value) }))
            }
            style={{ width: "100%", accentColor: "#00e5a0" }}
          />
          <div style={{ color: "#6b7f99", fontSize: "11px", marginTop: "6px" }}>
            Jobs scoring below this are skipped
          </div>
        </div>

        {/* SECTION 4 — Daily Application Limit */}
        <div style={cardStyle}>
          <div style={sectionTitleStyle}>Daily Application Limit</div>
          <label style={{ ...labelStyle, display: "block", marginBottom: "8px" }}>
            Maximum applications per day
          </label>
          <input
            type="number"
            min={1}
            max={10}
            value={prefs.daily_limit}
            onChange={(e) =>
              setPrefs((p) => ({ ...p, daily_limit: Number(e.target.value) }))
            }
            style={{
              width: "100px",
              background: "#040c18",
              border: "1px solid #0d1e30",
              borderRadius: "6px",
              padding: "8px 10px",
              color: "#b8d0ee",
              fontFamily: "inherit",
              fontSize: "13px",
            }}
          />
        </div>

        {/* SECTION 5 — Job Boards */}
        <div style={cardStyle}>
          <div style={sectionTitleStyle}>Job Boards</div>
          {BOARD_OPTIONS.map((board) => (
            <label
              key={board.id}
              style={{ ...labelStyle, display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}
            >
              <input
                type="checkbox"
                checked={prefs.boards.includes(board.id)}
                onChange={() => toggleBoard(board.id)}
                style={{ accentColor: "#00e5a0" }}
              />
              {board.label}
            </label>
          ))}

          <label
            style={{ ...labelStyle, display: "flex", alignItems: "center", gap: "8px", marginTop: "14px", paddingTop: "14px", borderTop: "1px solid #0d1e30" }}
          >
            <input
              type="checkbox"
              checked={prefs.exclude_sponsorship}
              onChange={() => setPrefs((p) => ({ ...p, exclude_sponsorship: !p.exclude_sponsorship }))}
              style={{ accentColor: "#00e5a0" }}
            />
            Exclude jobs requiring US work authorization/sponsorship
          </label>
        </div>

        {/* SECTION 6 — Save */}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{
            background: "#00e5a0",
            color: "#020c18",
            width: "100%",
            padding: "12px",
            borderRadius: "6px",
            fontWeight: 700,
            border: "none",
            cursor: saving ? "not-allowed" : "pointer",
            fontSize: "14px",
            opacity: saving ? 0.7 : 1,
            fontFamily: "inherit",
          }}
        >
          {saving ? "Saving…" : "Save Preferences"}
        </button>
      </div>
    </div>
  );
}
