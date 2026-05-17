interface SkeletonProps {
  height?: number | string;
  width?: number | string;
  className?: string;
}

export default function Skeleton({ height = 20, width = '100%', className = '' }: SkeletonProps) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{ height, width }}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="stat-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Skeleton height={12} width={80} />
      <Skeleton height={28} width={120} />
      <Skeleton height={10} width={100} />
    </div>
  );
}

export function SkeletonRow() {
  return (
    <tr>
      {[1,2,3,4,5].map(i => (
        <td key={i} style={{ padding: '13px 16px' }}>
          <Skeleton height={14} />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <tbody>
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </tbody>
    </table>
  );
}
