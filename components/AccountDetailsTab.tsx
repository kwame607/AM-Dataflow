// components/AccountDetailsTab.tsx — NEW FILE
// Drop inside app/dashboard/page.tsx as a new tab.
// Add 'account' to the Tab type and navItems array.
'use client';

import React, { useState, useRef } from 'react';
import type { Agent } from '@/types';
import { fmtDateShort } from '@/lib/utils';

interface AccountDetailsTabProps {
  agent: Agent & {
    store_description?: string;
    store_logo_url?: string;
    store_banner_text?: string;
    store_color?: string;
  };
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  toast: (msg: string, type?: 'warn' | 'error' | 'success' | 'info', duration?: number) => void;
  onAgentUpdate?: () => void;
}

export function AccountDetailsTab({ agent, authFetch, toast, onAgentUpdate }: AccountDetailsTabProps) {
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [phone, setPhone]       = useState(agent.phone || '');
  const [whatsapp, setWhatsapp] = useState(agent.whatsapp || '');
  const [storeName, setStoreName] = useState(agent.name || '');
  const [storeDescription, setStoreDescription] = useState(agent.store_description || '');

  const [showPwForm, setShowPwForm] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw]         = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwSaving, setPwSaving]   = useState(false);
  const [pwError, setPwError]     = useState('');

  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);

  async function saveProfile() {
    setSaving(true);
    try {
      const r = await authFetch('/api/agents/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          agentId: agent.id,
          phone,
          whatsapp,
          storeName,
          storeDescription,
        }),
      });
      const d = await r.json();
      if (!r.ok) { toast(d.error || 'Failed to save', 'error'); return; }
      toast('Profile updated!', 'success');
      setEditMode(false);
      onAgentUpdate?.();
    } catch { toast('Network error', 'error'); }
    finally { setSaving(false); }
  }

  async function changePassword() {
    setPwError('');
    if (!currentPw || !newPw) { setPwError('Fill in all fields'); return; }
    if (newPw.length < 8) { setPwError('New password must be at least 8 characters'); return; }
    if (newPw !== confirmPw) { setPwError('Passwords do not match'); return; }

    setPwSaving(true);
    try {
      const r = await authFetch('/api/agents/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const d = await r.json();
      if (!r.ok) { setPwError(d.error || 'Failed to update password'); return; }
      toast('Password updated!', 'success');
      setShowPwForm(false);
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } catch { setPwError('Network error'); }
    finally { setPwSaving(false); }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('agentId', agent.id);
      // Use plain fetch here — authFetch sets Content-Type: application/json
      // which breaks multipart/form-data. The route falls back to the
      // Supabase session cookie for auth (same pattern as support uploads).
      const r = await fetch('/api/agents/profile/upload-logo', { method: 'POST', body: fd });
      const d = await r.json();
      if (!r.ok) { toast(d.error || 'Upload failed', 'error'); return; }
      toast('Logo updated!', 'success');
      onAgentUpdate?.();
    } catch { toast('Upload error', 'error'); }
    finally { setUploadingLogo(false); if (logoRef.current) logoRef.current.value = ''; }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="page-title">Account Details</div>
          <div className="page-subtitle">Manage your profile and store information</div>
        </div>
        {!editMode && (
          <button className="btn btn-secondary btn-sm" onClick={() => setEditMode(true)}>✏ Edit Profile</button>
        )}
      </div>

      {/* Logo */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><div className="card-title">Store Logo</div></div>
        <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, overflow: 'hidden', background: 'var(--surface2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {agent.store_logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={agent.store_logo_url} alt="Store logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: 24, fontWeight: 800, color: 'var(--text3)' }}>{agent.name?.[0] || 'A'}</span>
            )}
          </div>
          <div>
            <input ref={logoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoUpload} />
            <button className="btn btn-secondary btn-sm" onClick={() => logoRef.current?.click()} disabled={uploadingLogo}>
              {uploadingLogo ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Uploading…</> : 'Change Logo'}
            </button>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>JPG, PNG or WEBP. Max 2MB.</div>
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><div className="card-title">Profile Information</div></div>
        <div className="card-body">
          {!editMode ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { label: 'Store Name', val: agent.name },
                { label: 'Email', val: agent.email },
                { label: 'Status', val: <span className="badge badge-success" style={{ textTransform: 'uppercase' }}>{agent.status}</span> },
                { label: 'Role', val: 'AGENT' },
                { label: 'Call Number', val: agent.phone || '—' },
                { label: 'WhatsApp Number', val: agent.whatsapp || '—' },
                { label: 'Store Slug', val: `/store/${agent.slug}` },
                { label: 'Joined', val: fmtDateShort(agent.created_at) },
                ...(agent.store_description ? [{ label: 'Store Description', val: agent.store_description }] : []),
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 600, flexShrink: 0 }}>{row.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, textAlign: 'right' }}>{row.val}</span>
                </div>
              ))}
            </div>
          ) : (
            <div>
              <div className="form-group">
                <label className="form-label">Store Name</label>
                <input className="form-input" value={storeName} onChange={e => setStoreName(e.target.value)} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Call Number</label>
                  <input className="form-input" type="tel" maxLength={10} value={phone} onChange={e => setPhone(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">WhatsApp Number</label>
                  <input className="form-input" type="tel" maxLength={10} value={whatsapp} onChange={e => setWhatsapp(e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Store Description</label>
                <textarea className="form-input" rows={3} placeholder="A short tagline customers will see on your store page" value={storeDescription} onChange={e => setStoreDescription(e.target.value)} style={{ resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-secondary" onClick={() => { setEditMode(false); setPhone(agent.phone || ''); setWhatsapp(agent.whatsapp || ''); setStoreName(agent.name || ''); setStoreDescription(agent.store_description || ''); }}>Cancel</button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={saveProfile} disabled={saving}>
                  {saving ? <><span className="spinner" /> Saving…</> : 'Save Changes'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Password */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Password</div>
          {!showPwForm && <button className="btn btn-secondary btn-sm" onClick={() => setShowPwForm(true)}>Change Password</button>}
        </div>
        {showPwForm && (
          <div className="card-body">
            {pwError && <div className="alert alert-error" style={{ marginBottom: 14 }}>{pwError}</div>}
            <div className="form-group">
              <label className="form-label">Current Password</label>
              <input className="form-input" type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">New Password</label>
              <input className="form-input" type="password" placeholder="At least 8 characters" value={newPw} onChange={e => setNewPw(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Confirm New Password</label>
              <input className="form-input" type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-secondary" onClick={() => { setShowPwForm(false); setPwError(''); setCurrentPw(''); setNewPw(''); setConfirmPw(''); }}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={changePassword} disabled={pwSaving}>
                {pwSaving ? <><span className="spinner" /> Updating…</> : 'Update Password'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
