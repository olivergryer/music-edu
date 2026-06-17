// Strip horizontale pass/fail pour un sweep d'un paramètre.
// Props:
//   label, sweep [{value, pass}], range {min, max, mid} | null, formatVal (fn).

export default function CalibrationStrip({ label, sweep, range, formatVal = v => v }) {
  if (!sweep?.length) return null
  const minV = sweep[0].value
  const maxV = sweep[sweep.length - 1].value
  const span = maxV - minV || 1
  const segW = 100 / sweep.length

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)' }}>{label}</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          {range
            ? <>plage : <strong style={{ color: '#34d399' }}>{formatVal(range.min)} → {formatVal(range.max)}</strong> · centre {formatVal(range.mid)}</>
            : <span style={{ color: '#f87171' }}>aucun pass</span>}
        </span>
      </div>
      <div style={{
        display: 'flex',
        width: '100%',
        height: 18,
        borderRadius: 4,
        overflow: 'hidden',
        border: '1px solid var(--border-c)',
      }}>
        {sweep.map(({ value, pass }, i) => (
          <div
            key={i}
            title={`${formatVal(value)} → ${pass ? 'pass' : 'fail'}`}
            style={{
              width: `${segW}%`,
              background: pass ? '#34d399' : '#1f2937',
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
        <span>{formatVal(minV)}</span>
        <span>{formatVal(maxV)}</span>
      </div>
    </div>
  )
}
