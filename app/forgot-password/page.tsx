'use client';

import { useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!email) { setError('Enter your email address'); return; }
    setLoading(true);
    try {
      const supabase = getSupabaseClient();
      const redirectTo = `${window.location.origin}/reset-password`;
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (err) { setError(err.message); return; }
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="logo-mark">A</div>
          <div className="logo-text"><strong>ADOMUN</strong><span>Data</span></div>
        </div>

        {sent ? (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📬</div>
            <div style={{ fontFamily: 'Syne,sans-serif', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Check your email</div>
            <div style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.6 }}>
              A password reset link has been sent to <strong style={{ color: 'var(--text)' }}>{email}</strong>.<br />
              Check your inbox (and spam folder).
            </div>
            <a href="/login" className="btn btn-primary btn-full" style={{ marginTop: 20, display: 'flex', justifyContent: 'center' }}>
              Back to Sign In
            </a>
          </div>
        ) : (
          <>
            <div className="auth-header">
              <div className="auth-title">Reset Password</div>
              <div className="auth-subtitle">Enter your email and we&apos;ll send a reset link</div>
            </div>

            {error && (
              <div className="alert alert-error" style={{ marginBottom: 16 }}>
                <span>⚠</span> <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input
                  className="form-input"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                  autoFocus
                />
              </div>
              <button className="btn btn-primary btn-full btn-lg" type="submit" disabled={loading}>
                {loading ? <><span className="spinner" /> Sending…</> : 'Send Reset Link'}
              </button>
            </form>

            <div style={{ textAlign: 'center', marginTop: 14 }}>
              <a href="/login" style={{ fontSize: 13, color: 'var(--text3)' }}>← Back to Sign In</a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
