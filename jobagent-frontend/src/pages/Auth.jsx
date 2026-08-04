import { useState, useEffect } from 'react';
import { SignIn, SignedIn, SignedOut, useAuth, useUser } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

export default function Auth() {
  const navigate = useNavigate();
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const token = await getToken();
        const email = user?.primaryEmailAddress?.emailAddress;

        const res = await fetch(`${BACKEND}/api/auth/sync`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email }),
        });

        if (cancelled) return;

        if (res.status === 201) {
          navigate('/onboard');
        } else if (res.status === 200) {
          navigate('/dashboard');
        } else {
          const data = await res.json().catch(() => ({}));
          setError(data.error || data.message || 'Failed to sync account');
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, getToken, user, navigate]);

  return (
    <>
      <SignedOut>
        <div
          style={{
            minHeight: '100vh',
            background: '#040c18',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'DM Mono, monospace',
          }}
        >
          <SignIn routing="hash" afterSignInUrl="/signin" />
        </div>
      </SignedOut>

      <SignedIn>
        {error ? (
          <div
            style={{
              minHeight: '100vh',
              background: '#040c18',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'DM Mono, monospace',
              color: '#ff6b6b',
              textAlign: 'center',
              padding: '20px',
            }}
          >
            <div>{error}</div>
            <div style={{ color: '#6b7f99', fontSize: '13px', marginTop: '10px' }}>
              Try refreshing the page
            </div>
          </div>
        ) : loading ? (
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
            Setting up your account…
          </div>
        ) : null}
      </SignedIn>
    </>
  );
}
