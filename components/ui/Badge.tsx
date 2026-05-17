interface BadgeProps {
  type: 'success' | 'pending' | 'failed' | 'processing' | 'mtn' | 'telecel' | 'at';
  children: React.ReactNode;
  dot?: boolean;
}

export default function Badge({ type, children, dot = true }: BadgeProps) {
  return (
    <span className={`badge badge-${type}`}>
      {dot && <span className="badge-dot" />}
      {children}
    </span>
  );
}

export function NetworkBadge({ network }: { network: string }) {
  const labels: Record<string, string> = { mtn: 'MTN', telecel: 'Telecel', at: 'AirtelTigo' };
  const types: Record<string, 'mtn' | 'telecel' | 'at'> = { mtn: 'mtn', telecel: 'telecel', at: 'at' };
  return (
    <Badge type={types[network] || 'mtn'} dot={false}>
      {labels[network] || network}
    </Badge>
  );
}

export function DeliveryBadge({ status }: { status?: string }) {
  if (!status || status === 'pending') return <Badge type="pending">Pending</Badge>;
  if (status === 'processing') return <Badge type="processing">Processing</Badge>;
  if (status === 'delivered') return <Badge type="success">Delivered</Badge>;
  return <Badge type="failed">Failed</Badge>;
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, 'success' | 'pending' | 'failed' | 'processing'> = {
    success: 'success',
    pending: 'pending',
    failed: 'failed',
    processing: 'processing',
  };
  return (
    <Badge type={map[status] || 'pending'}>
      {status}
    </Badge>
  );
}
