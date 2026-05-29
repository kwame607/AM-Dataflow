'use client';

import Image from 'next/image';
import { useState, useEffect } from 'react';
import { getSupabaseClient } from '@/lib/supabase';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase sets the session from the URL hash automatically
    const supabase = getSupabaseClient();
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true);
    });
    // Also check if already in a recovery session
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!password) { setError('Enter a new password'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true);
    try {
      const supabase = getSupabaseClient();
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) { setError(err.message); return; }
      setDone(true);
      setTimeout(() => { window.location.href = '/login'; }, 2500);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div style={{ width: 38, height: 38, borderRadius: 11, overflow: 'hidden', flexShrink: 0 }}>
  <Image src="/admunz.png" alt="ADMUNZ" width={38} height={38} style={{ objectFit: 'cover' }} />
</div>
          <div className="logo-text"><strong>ADMUNZ</strong><span>Data</span></div>
        </div>

        {done ? (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
            <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Password updated!</div>
            <div style={{ fontSize: 13, color: 'var(--text3)' }}>Redirecting you to sign in…</div>
          </div>
        ) : (
          <>
            <div className="auth-header">
              <div className="auth-title">New Password</div>
              <div className="auth-subtitle">Choose a strong new password</div>
            </div>

            {error && (
              <div className="alert alert-error" style={{ marginBottom: 16 }}>
                <span>⚠</span> <span>{error}</span>
              </div>
            )}

            {!ready && (
              <div className="alert alert-warn" style={{ marginBottom: 16, fontSize: 13 }}>
                Verifying reset link…
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">New Password</label>
                <input
                  className="form-input"
                  type="password"
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  disabled={!ready}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label">Confirm Password</label>
                <input
                  className="form-input"
                  type="password"
                  placeholder="Repeat new password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  disabled={!ready}
                />
              </div>
              <button className="btn btn-primary btn-full btn-lg" type="submit" disabled={loading || !ready}>
                {loading ? <><span className="spinner" /> Saving…</> : 'Set New Password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
