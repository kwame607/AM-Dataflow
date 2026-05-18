'use client';

import { useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase';

export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function doLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email) { setError('Enter your email'); return; }
    if (!password) { setError('Enter your password'); return; }
    setError('');
    setLoading(true);

    try {
      const supabase = getSupabaseClient();
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });

      if (authError || !data.user) {
        setError('Invalid email or password.');
        setLoading(false);
        return;
      }

      // Server-side admin check
      const check = await fetch('/api/admin/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: data.user.id }),
      });
      const { isAdmin } = await check.json();

      if (!isAdmin) {
        await supabase.auth.signOut();
        setError('Access denied. This email is not authorised as admin.');
        setLoading(false);
        return;
      }

      window.location.href = '/xena-173424';
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-wrap">
        <div className="auth-logo" style={{ justifyContent: 'center' }}>
          <div className="logo-mark" style={{ background: 'var(--accent2)' }}>A</div>
          <div className="logo-text">
            <strong>Admin Panel</strong>
            <span>ADMUNZ</span>
          </div>
        </div>

        <div className="auth-card">
          <div className="auth-title">Admin Sign In</div>
          <div className="auth-sub">Restricted access — authorised personnel only</div>

          <form onSubmit={doLogin}>
            <div className="form-group">
              <label className="form-label">Admin Email</label>
              <input
                className="form-input"
                type="email"
                placeholder="admin@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  className="form-input"
                  type={showPass ? 'text' : 'password'}
                  placeholder="Your password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  style={{ paddingRight: 50 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', fontSize: 12, fontWeight: 600 }}
                >
                  {showPass ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            {error && (
              <div className="alert alert-error" style={{ marginBottom: 16 }}>
                <span>⚠</span> <span>{error}</span>
              </div>
            )}

            <button className="btn btn-primary btn-full btn-lg" type="submit" disabled={loading}>
              {loading ? <><span className="spinner" /> Signing in…</> : 'Sign In'}
            </button>
          </form>
        </div>

        <div className="auth-footer">
          <a href="/login">← Back to Agent Login</a>
        </div>
      </div>
    </div>
  );
}
