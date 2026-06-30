// components/AgentReferralBadge.tsx
// Drop this into your agents table row wherever you render agent details.
// Shows: "Main Store" if direct signup, "Referred by X" if came via referral link.

interface Props {
  referredBy?: string | null;       // slug — for display label only
  referredById?: string | null;     // UUID — to confirm the link is still valid
}

export function AgentReferralBadge({ referredBy, referredById }: Props) {
  if (!referredById && !referredBy) {
    return (
      <span style={{
        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 100,
        background: 'var(--surface2)', color: 'var(--text3)',
        whiteSpace: 'nowrap',
      }}>
        🏠 Main Store
      </span>
    );
  }

  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 100,
      background: 'var(--accent-dim)', color: 'var(--accent)',
      whiteSpace: 'nowrap',
    }} title={referredById ? `Referrer ID: ${referredById}` : undefined}>
      🔗 via {referredBy || 'referral'}
    </span>
  );
}
