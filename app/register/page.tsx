'use client';

import Image from 'next/image';
import { useState } from 'react';
import { slugify } from '@/lib/utils';
import { useSimpleToast } from '@/components/ui/Toast';

type Step = 1 | 2 | 3 | 4;

interface FormData {
  firstName: string; lastName: string; email: string;
  phone: string; whatsapp: string;
  storeName: string; slug: string;
  password: string; confirmPassword: string; terms: boolean;
}

const init: FormData = {
  firstName: '', lastName: '', email: '', phone: '', whatsapp: '',
  storeName: '', slug: '', password: '', confirmPassword: '', terms: false,
};

export default function RegisterPage() {
  const { toast, ToastContainer } = useSimpleToast();
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormData>(init);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [storeUrl, setStoreUrl] = useState('');

  const set = (k: keyof FormData, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));

  function autoSlug(name: string) {
    const s = slugify(name);
    set('slug', s);
  }

  function stepClass(n: number) {
    if (n < step) return 'reg-step done';
    if (n === step) return 'reg-step active';
    return 'reg-step';
  }

  function validate1() {
    if (!form.firstName.trim() || !form.lastName.trim()) { setErr('Enter your full name'); return false; }
    if (!form.email || !form.email.includes('@')) { setErr('Enter a valid email'); return false; }
    if (form.phone.length !== 10) { setErr('Enter a valid 10-digit call number'); return false; }
    if (form.whatsapp.length !== 10) { setErr('Enter a valid 10-digit WhatsApp number'); return false; }
    return true;
  }

  function validate2() {
    if (!form.storeName.trim()) { setErr('Enter your store name'); return false; }
    if (!form.slug || !/^[a-z0-9]+$/.test(form.slug)) { setErr('Slug: lowercase letters and numbers only'); return false; }
    return true;
  }

  function next1() { if (!validate1()) return; setErr(''); setStep(2); }
  function next2() { if (!validate2()) return; setErr(''); setStep(3); }
  function back(n: Step) { setErr(''); setStep(n); }

  async function submit() {
    if (form.password.length < 8) { setErr('Password must be at least 8 characters'); return; }
    if (form.password !== form.confirmPassword) { setErr('Passwords do not match'); return; }
    if (!form.terms) { setErr('Please accept the Terms & Conditions'); return; }
    setErr('');
    setLoading(true);

    try {
      const res = await fetch('/api/agents/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone,
          whatsapp: form.whatsapp,
          storeName: form.storeName,
          slug: form.slug,
          password: form.password,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || 'Registration failed'); setLoading(false); return; }
      setStoreUrl(data.storeUrl || `${window.location.origin}/store/${form.slug}`);
      setStep(4);
    } catch {
      setErr('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page" style={{ alignItems: 'flex-start', padding: '32px 20px' }}>
      <div style={{ width: '100%', maxWidth: 480, margin: '0 auto' }}>
        <div className="auth-logo" style={{ justifyContent: 'center' }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, overflow: 'hidden', flexShrink: 0 }}>
  <Image src="/admunz.png" alt="ADMUNZ" width={38} height={38} style={{ objectFit: 'cover' }} />
</div>
          <div className="logo-text"><strong>ADMUNZ</strong><span>Reseller Programme</span></div>
        </div>

        {/* Benefits */}
        <div className="auth-card" style={{ marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'Syne,sans-serif', fontSize: 22, fontWeight: 800, marginBottom: 6 }}>Become a Reseller Agent</h2>
          <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20 }}>Get your own branded store and earn on every data sale.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              { icon: '🏪', title: 'Your Own Store', text: 'Custom link to share' },
              { icon: '💰', title: 'Set Your Prices', text: 'Earn on every sale' },
              { icon: '📊', title: 'Live Dashboard', text: 'Track in real time' },
              { icon: '💸', title: 'Easy Payouts', text: 'Withdraw to MoMo' },
            ].map(b => (
              <div key={b.title} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px 14px' }}>
                <div style={{ fontSize: 20, marginBottom: 6 }}>{b.icon}</div>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2 }}>{b.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>{b.text}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Form */}
        <div className="auth-card">
          {/* Steps indicator */}
          {step < 4 && (
            <div className="reg-steps" style={{ marginBottom: 28 }}>
              {([1,2,3] as const).map(n => (
                <div key={n} className={stepClass(n)}>
                  <div className="reg-step-num">{n < step ? '✓' : n}</div>
                  <div className="reg-step-label">{['Personal','Store','Security'][n-1]}</div>
                </div>
              ))}
            </div>
          )}

          {/* Step 1 */}
          {step === 1 && (
            <div>
              <h3 style={{ fontFamily: 'Syne,sans-serif', fontSize: 17, fontWeight: 700, marginBottom: 18 }}>Personal Information</h3>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">First Name</label>
                  <input className="form-input" placeholder="Kwame" value={form.firstName} onChange={e => set('firstName', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Last Name</label>
                  <input className="form-input" placeholder="Mensah" value={form.lastName} onChange={e => set('lastName', e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input className="form-input" type="email" placeholder="kwame@example.com" value={form.email} onChange={e => set('email', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Call Number <span style={{ color: 'var(--accent)' }}>*</span></label>
                <input className="form-input" type="tel" placeholder="0241234567" maxLength={10} value={form.phone} onChange={e => set('phone', e.target.value)} />
                <div className="form-hint">Customers will call you on this number</div>
              </div>
              <div className="form-group">
                <label className="form-label">WhatsApp Number <span style={{ color: 'var(--accent)' }}>*</span></label>
                <input className="form-input" type="tel" placeholder="0241234567" maxLength={10} value={form.whatsapp} onChange={e => set('whatsapp', e.target.value)} />
                <div className="form-hint">Customers will contact you via this number</div>
              </div>
              {err && <div className="alert alert-error" style={{ marginBottom: 12 }}>{err}</div>}
              <button className="btn btn-primary btn-full" onClick={next1}>Next →</button>
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <div>
              <h3 style={{ fontFamily: 'Syne,sans-serif', fontSize: 17, fontWeight: 700, marginBottom: 18 }}>Your Store</h3>
              <div className="form-group">
                <label className="form-label">Store / Brand Name</label>
                <input className="form-input" placeholder="e.g. Kofi Data Hub" value={form.storeName}
                  onChange={e => { set('storeName', e.target.value); autoSlug(e.target.value); }} />
              </div>
              <div className="form-group">
                <label className="form-label">Store URL Slug</label>
                <div style={{ background: 'rgba(255,190,0,0.08)', border: '1px solid rgba(255,190,0,0.3)', borderRadius: 8, padding: '10px 12px', marginBottom: 10, fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
                  ⚠️ <strong>No spaces, hyphens, or symbols.</strong> Letters and numbers only.<br />
                  Example: <em>"Caleb Data Hub"</em> → <code style={{ background: 'var(--surface2)', padding: '1px 5px', borderRadius: 4 }}>calebdatahub</code>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--text3)', whiteSpace: 'nowrap' }}>/store/</span>
                  <input className="form-input" placeholder="kofidatahub" value={form.slug}
                    onChange={e => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 20))} />
                </div>
              </div>
              {form.slug && (
                <div className="copy-box" style={{ marginBottom: 16 }}>
                  <span className="copy-url">{typeof window !== 'undefined' ? window.location.origin : ''}/store/{form.slug}</span>
                </div>
              )}
              {err && <div className="alert alert-error" style={{ marginBottom: 12 }}>{err}</div>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-secondary" style={{ flex: '0 0 auto' }} onClick={() => back(1)}>← Back</button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={next2}>Next →</button>
              </div>
            </div>
          )}

          {/* Step 3 */}
          {step === 3 && (
            <div>
              <h3 style={{ fontFamily: 'Syne,sans-serif', fontSize: 17, fontWeight: 700, marginBottom: 18 }}>Set Your Password</h3>
              <div className="form-group">
                <label className="form-label">Password</label>
                <input className="form-input" type="password" placeholder="Min 8 characters" value={form.password} onChange={e => set('password', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Confirm Password</label>
                <input className="form-input" type="password" placeholder="Repeat password" value={form.confirmPassword} onChange={e => set('confirmPassword', e.target.value)} />
              </div>
              <div className="form-group" style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                <input type="checkbox" id="terms" checked={form.terms} onChange={e => set('terms', e.target.checked)} style={{ marginTop: 3, accentColor: 'var(--accent)' }} />
                <label htmlFor="terms" style={{ fontSize: 13, color: 'var(--text2)' }}>
                  I agree to the <a href="#" style={{ color: 'var(--accent)' }}>Terms &amp; Conditions</a>
                </label>
              </div>
              {err && <div className="alert alert-error" style={{ marginBottom: 12 }}>{err}</div>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-secondary" style={{ flex: '0 0 auto' }} onClick={() => back(2)}>← Back</button>
                <button className="btn btn-primary" style={{ flex: 1 }} disabled={loading} onClick={submit}>
                  {loading ? <><span className="spinner" /> Creating…</> : 'Create Account'}
                </button>
              </div>
            </div>
          )}

          {/* Step 4 – Success */}
          {step === 4 && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--ok-dim)', border: '2px solid var(--ok)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 28 }}>✓</div>
              <h3 style={{ fontFamily: 'Syne,sans-serif', fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Registration Submitted!</h3>
              <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 20 }}>Your account is pending admin approval. You can log in once approved.</p>
              {storeUrl && (
                <div className="copy-box" style={{ marginBottom: 16 }}>
                  <span className="copy-url">{storeUrl}</span>
                  <button className="copy-btn" onClick={() => { navigator.clipboard.writeText(storeUrl); toast('Copied!', 'success', 1500); }}>Copy</button>
                </div>
              )}
              <a href="/login" className="btn btn-primary btn-full">Go to Login</a>
            </div>
          )}
        </div>

        <div className="auth-footer">Already have an account? <a href="/login">Sign in</a></div>
      </div>

      <ToastContainer />
    </div>
  );
}
