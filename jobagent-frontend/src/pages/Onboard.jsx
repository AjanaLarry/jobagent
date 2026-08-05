import { useState, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useNavigate, Navigate } from 'react-router-dom';

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const cardStyle = {
  background: '#070f1e',
  border: '1px solid #0d1e30',
  borderRadius: '8px',
  padding: '24px',
};

const labelStyle = {
  color: '#6b7f99',
  fontSize: '12px',
};

export default function Onboard() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);

  if (!isLoaded) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#040c18',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#00e5a0',
          fontFamily: 'DM Mono, monospace',
        }}
      >
        Loading…
      </div>
    );
  }

  if (!isSignedIn) {
    return <Navigate to="/signin" replace />;
  }

  function validateAndSetFile(f) {
    if (!f) return;
    const nameLower = f.name.toLowerCase();
    const extOk = nameLower.endsWith('.pdf') || nameLower.endsWith('.docx');
    const typeOk = ALLOWED_MIME_TYPES.includes(f.type);

    if (!extOk && !typeOk) {
      setError('Only PDF and DOCX files accepted');
      return;
    }
    if (f.size > MAX_SIZE_BYTES) {
      setError('File must be under 5MB');
      return;
    }

    setFile(f);
    setError(null);
    setProfile(null);
  }

  function resetFile() {
    setFile(null);
    setProfile(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleDragOver(e) {
    e.preventDefault();
    setDragging(true);
  }

  function handleDragLeave() {
    setDragging(false);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    validateAndSetFile(e.dataTransfer.files[0]);
  }

  function handleZoneClick() {
    fileInputRef.current?.click();
  }

  function handleFileInputChange(e) {
    validateAndSetFile(e.target.files[0]);
  }

  async function getCsrfToken() {
    const res = await fetch(`${BACKEND}/api/csrf-token`);
    const data = await res.json();
    return data.csrfToken;
  }

  async function handleUpload() {
    setUploading(true);
    setError(null);
    try {
      const token = await getToken({ template: 'jobagent' });
      const csrf = await getCsrfToken();
      const formData = new FormData();
      formData.append('resume', file);

      const res = await fetch(`${BACKEND}/api/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-CSRF-Token': csrf,
          // NO Content-Type — let browser set multipart boundary
        },
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || data.message || 'Upload failed');
      }

      const data = await res.json();
      setProfile(data.profile);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#040c18',
        fontFamily: 'DM Mono, monospace',
        padding: '32px 20px',
      }}
    >
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        <h1
          style={{
            fontFamily: 'Syne, sans-serif',
            color: '#b8d0ee',
            fontSize: '24px',
            marginBottom: '24px',
          }}
        >
          ◈ Upload Your Resume
        </h1>

        {error && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '6px',
              marginBottom: '16px',
              fontSize: '13px',
              background: 'rgba(255,107,107,0.1)',
              border: '1px solid rgba(255,107,107,0.3)',
              color: '#ff6b6b',
            }}
          >
            {error}
          </div>
        )}

        {profile ? (
          <div style={cardStyle}>
            <div style={{ color: '#00e5a0', fontSize: '22px', fontWeight: 700, marginBottom: '4px' }}>
              {profile.name || 'Your Profile'}
            </div>
            <div style={{ ...labelStyle, marginBottom: '20px' }}>
              {[profile.email, profile.phone, profile.location].filter(Boolean).join(' · ')}
            </div>

            {Array.isArray(profile.skills) && profile.skills.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ ...labelStyle, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
                  Skills
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {profile.skills.map((skill) => (
                    <span
                      key={skill}
                      style={{
                        background: 'rgba(0,229,160,0.1)',
                        border: '1px solid rgba(0,229,160,0.3)',
                        borderRadius: '4px',
                        padding: '3px 10px',
                        color: '#00e5a0',
                        fontSize: '13px',
                      }}
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {profile.experience_years != null && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ ...labelStyle, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
                  Experience
                </div>
                <div style={{ color: '#b8d0ee', fontSize: '14px' }}>{profile.experience_years} years</div>
              </div>
            )}

            {Array.isArray(profile.titles_held) && profile.titles_held.length > 0 && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ ...labelStyle, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
                  Titles Held
                </div>
                <div style={{ color: '#b8d0ee', fontSize: '14px' }}>{profile.titles_held.join(', ')}</div>
              </div>
            )}

            {Array.isArray(profile.certifications) && profile.certifications.length > 0 && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ ...labelStyle, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
                  Certifications
                </div>
                <ul style={{ margin: 0, paddingLeft: '18px', color: '#b8d0ee', fontSize: '14px' }}>
                  {profile.certifications.map((cert) => (
                    <li key={cert}>{cert}</li>
                  ))}
                </ul>
              </div>
            )}

            {Array.isArray(profile.achievements) && profile.achievements.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ ...labelStyle, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
                  Top Achievements
                </div>
                <ul style={{ margin: 0, paddingLeft: '18px', color: '#b8d0ee', fontSize: '14px' }}>
                  {profile.achievements.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button
                type="button"
                onClick={resetFile}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: '1px solid #0d1e30',
                  borderRadius: '6px',
                  padding: '12px',
                  color: '#b8d0ee',
                  fontFamily: 'inherit',
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                Upload different file
              </button>
              <button
                type="button"
                onClick={() => navigate('/preferences')}
                style={{
                  flex: 1,
                  background: '#00e5a0',
                  color: '#020c18',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '12px',
                  fontWeight: 700,
                  fontFamily: 'inherit',
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                Looks good →
              </button>
            </div>
          </div>
        ) : (
          <div style={cardStyle}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx"
              hidden
              onChange={handleFileInputChange}
            />

            {!file ? (
              <div
                onClick={handleZoneClick}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                style={{
                  border: `2px dashed ${dragging ? '#00e5a0' : '#0d1e30'}`,
                  borderRadius: '8px',
                  padding: '48px 20px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s',
                }}
              >
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>📄</div>
                <div style={{ color: '#b8d0ee', fontSize: '16px', marginBottom: '6px' }}>
                  Drop your resume here
                </div>
                <div style={{ ...labelStyle, marginBottom: '16px' }}>PDF or DOCX · Max 5MB</div>
                <span style={{ color: '#00e5a0', fontSize: '13px', textDecoration: 'underline' }}>
                  Browse files
                </span>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <div style={{ color: '#b8d0ee', fontSize: '15px', marginBottom: '4px' }}>{file.name}</div>
                <div style={{ ...labelStyle, marginBottom: '20px' }}>{formatFileSize(file.size)}</div>

                {uploading && (
                  <div style={{ color: '#00e5a0', fontSize: '14px', marginBottom: '12px' }}>
                    Parsing your resume…
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={uploading}
                  style={{
                    width: '100%',
                    background: '#00e5a0',
                    color: '#020c18',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '12px',
                    fontWeight: 700,
                    fontFamily: 'inherit',
                    fontSize: '14px',
                    cursor: uploading ? 'not-allowed' : 'pointer',
                    opacity: uploading ? 0.7 : 1,
                    marginBottom: '10px',
                  }}
                >
                  {uploading ? 'Parsing…' : 'Upload & Parse Resume'}
                </button>
                <button
                  type="button"
                  onClick={resetFile}
                  disabled={uploading}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#6b7f99',
                    fontFamily: 'inherit',
                    fontSize: '13px',
                    textDecoration: 'underline',
                    cursor: uploading ? 'not-allowed' : 'pointer',
                    opacity: uploading ? 0.5 : 1,
                  }}
                >
                  Choose different file
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
