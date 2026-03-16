import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { clearGuestMode, useAuth } from '@/lib/auth-context';

export default function LoginPage() {
  const router = useRouter();
  const { session, isLoading, enterGuestMode } = useAuth();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState<string | null>(null);
  const [pending,  setPending]  = useState(false);

  // Already authenticated — go straight to the dashboard
  useEffect(() => {
    if (!isLoading && session) {
      void router.replace('/');
    }
  }, [isLoading, session, router]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const sb = getSupabaseBrowser();
    if (!sb) {
      setError('Authentication is not configured.');
      setPending(false);
      return;
    }
    const { error: authError } = await sb.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (authError) {
      setError(authError.message);
      setPending(false);
    } else {
      clearGuestMode();
      void router.replace('/');
    }
  }

  function handleGuest() {
    enterGuestMode();
    void router.replace('/');
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <h1 className="login-title">ICT Data Viewer</h1>
        <p className="login-subtitle">Sign in to view live test data</p>

        <form onSubmit={(e) => { void handleSignIn(e); }} noValidate>
          <div className="login-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); }}
              required
              disabled={pending}
            />
          </div>

          <div className="login-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); }}
              required
              disabled={pending}
            />
          </div>

          {error && (
            <p className="login-error" role="alert">{error}</p>
          )}

          <button
            type="submit"
            className="btn-primary"
            disabled={pending || !email || !password}
          >
            {pending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {/* No sign-up — accounts are admin-managed */}

        <div className="login-divider" />

        <button
          type="button"
          className="btn-guest"
          onClick={handleGuest}
        >
          Continue as guest
        </button>
        <p className="login-guest-note">Guest mode shows demo fixture data only.</p>
      </div>
    </div>
  );
}
