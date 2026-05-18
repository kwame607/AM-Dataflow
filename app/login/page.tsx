'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase';
import { useSimpleToast } from '@/components/ui/Toast';

export default function LoginPage() {
  const router = useRouter();
  const { toast, ToastContainer } = useSimpleToast();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function doLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier.trim()) { setError('Enter your email, phone, or username'); return; }
    if (!password) { setError('Enter your password'); return; }
    setError('');
    setLoading(true);

    try {
      // Resolve identifier → email
      const lookup = await fetch('/api/agents/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim() }),
      });
      const { email: resolvedEmail } = await lookup.json();
      if (!resolvedEmail) {
        setError('No account found with that email, phone, or username.');
        setLoading(false);
        return;
      }

      const supabase = getSupabaseClient();
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email: resolvedEmail, password });

      if (authError || !data.user) {
        setError('Invalid email or password. Please try again.');
        setLoading(false);
        return;
      }

      // Check agent profile
      const { data: agent } = await supabase.from('agents').select('*').eq('auth_user_id', data.user.id).single();

      if (!agent) {
        await supabase.auth.signOut();
        setError('No agent account found. Please register first.');
        setLoading(false);
        return;
      }

      if (agent.status === 'pending') {
        await supabase.auth.signOut();
        setError('Your account is awaiting admin approval. Check back soon.');
        setLoading(false);
        return;
      }

      if (agent.status === 'suspended') {
        await supabase.auth.signOut();
        setError('Your account has been suspended. Contact support.');
        setLoading(false);
        return;
      }

      toast('Welcome back, ' + agent.name + '!', 'success');
      setTimeout(() => { window.location.href = '/dashboard'; }, 600);
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-wrap">
        <div className="auth-logo" style={{ justifyContent: 'center' }}>
          <div className="logo-mark">A</div>
          <div className="logo-text">
            <strong>ADMUNZ</strong>
            <span>Agent Portal</span>
          </div>
        </div>

        <div className="auth-card">
          <div className="auth-title">Welcome back</div>
          <div className="auth-sub">Sign in to your reseller dashboard</div>

          <form onSubmit={doLogin}>
            <div className="form-group">
              <label className="form-label">Email, Phone Number, or Username</label>
              <input
                className="form-input"
                type="text"
                placeholder="email, 024xxxxxxx, or store-username"
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                autoComplete="username"
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
                <span>⚠</span> <span dangerouslySetInnerHTML={{ __html: error }} />
              </div>
            )}

            <button className="btn btn-primary btn-full btn-lg" type="submit" disabled={loading}>
              {loading ? <><span className="spinner" /> Signing in…</> : 'Sign In'}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: 14 }}>
            <a href="/forgot-password" style={{ fontSize: 13, color: 'var(--accent)' }}>Forgot password?</a>
          </div>
        </div>

        <div className="auth-footer">
          Don&apos;t have an account? <a href="/register">Register as Agent</a>
        </div>
      </div>

      <ToastContainer />
    </div>
  );
}
