import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, useUser, useClerk } from '@clerk/clerk-react';

export const NAV_HEIGHT = '52px';

function NavLink({ to, children }) {
  const location = useLocation();
  const active = location.pathname === to;
  return (
    <Link
      to={to}
      style={{
        color: active ? '#ffffff' : '#94a3b8',
        fontSize: '14px',
        textDecoration: 'none',
        fontWeight: active ? 600 : 400,
        borderBottom: active ? '2px solid #00c896' : 'none',
        paddingBottom: active ? '4px' : '0',
      }}
    >
      {children}
    </Link>
  );
}

export default function Navbar() {
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();
  const location = useLocation();
  const navigate = useNavigate();

  if (location.pathname === '/signin') return null;

  const email = user?.primaryEmailAddress?.emailAddress || '';
  const initial = email ? email[0].toUpperCase() : '?';

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        height: NAV_HEIGHT,
        background: 'rgba(4, 8, 20, 0.98)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <Link to="/" style={{ textDecoration: 'none' }}>
        <span
          style={{
            fontFamily: 'DM Mono, monospace',
            fontSize: '16px',
            fontWeight: 700,
            color: '#00e5a0',
            letterSpacing: '-0.02em',
          }}
        >
          ◈ JobAgent
        </span>
      </Link>

      {isSignedIn && (
        <div style={{ display: 'flex', gap: '24px' }}>
          <NavLink to="/dashboard">Dashboard</NavLink>
          <NavLink to="/search">Search</NavLink>
          <NavLink to="/preferences">Preferences</NavLink>
          <NavLink to="/onboard">Upload Resume</NavLink>
        </div>
      )}

      {!isSignedIn ? (
        <Link
          to="/signin"
          style={{
            background: '#00e5a0',
            color: '#020c18',
            padding: '7px 16px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          Sign In
        </Link>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: '#1a3050',
              color: '#00e5a0',
              fontSize: '13px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {initial}
          </div>
          <span style={{ color: '#3a5a78', fontSize: '12px' }}>{email}</span>
          <button
            type="button"
            onClick={handleSignOut}
            style={{
              background: 'transparent',
              border: '1px solid #1e2d45',
              color: '#3a5a78',
              padding: '6px 14px',
              borderRadius: '5px',
              fontSize: '11px',
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
