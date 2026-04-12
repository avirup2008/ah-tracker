export function CardSkeleton() {
  return (
    <div className="card p-5 animate-pulse">
      <div style={{ height: 10, width: 80, background: 'var(--surface3)', borderRadius: 4, marginBottom: 16 }} />
      <div style={{ height: 48, width: '60%', background: 'var(--surface3)', borderRadius: 6, marginBottom: 12 }} />
      <div style={{ height: 7, background: 'var(--surface3)', borderRadius: 100, marginBottom: 16 }} />
      <div className="grid grid-cols-2 gap-2">
        {[1,2,3,4].map(i => (
          <div key={i} style={{ height: 54, background: 'var(--surface2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }} />
        ))}
      </div>
    </div>
  )
}

export function RowSkeleton() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ width: 30, height: 30, borderRadius: 'var(--radius-sm)', background: 'var(--surface2)' }} />
      <div style={{ flex: 1 }}>
        <div style={{ height: 11, width: '60%', background: 'var(--surface3)', borderRadius: 4, marginBottom: 5 }} />
        <div style={{ height: 9, width: '40%', background: 'var(--surface2)', borderRadius: 4 }} />
      </div>
      <div style={{ height: 12, width: 50, background: 'var(--surface3)', borderRadius: 4 }} />
    </div>
  )
}
