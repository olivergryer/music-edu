import { useState, useEffect } from 'react'

const PAD = 10
const ACC = '#c084fc'

export default function TourGuide({ steps, onDone }) {
  const [idx, setIdx] = useState(0)
  const [rect, setRect] = useState(null)
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight })

  useEffect(() => {
    const step = steps[idx]
    if (!step) return
    const el = document.querySelector(`[data-tour="${step.tourId}"]`)
    if (!el) { setRect(null); return }
    const tid = setTimeout(() => {
      setRect(el.getBoundingClientRect())
      setVp({ w: window.innerWidth, h: window.innerHeight })
    }, 100)
    return () => clearTimeout(tid)
  }, [idx, steps])

  useEffect(() => {
    function onResize() {
      const step = steps[idx]
      setVp({ w: window.innerWidth, h: window.innerHeight })
      if (!step) return
      const el = document.querySelector(`[data-tour="${step.tourId}"]`)
      if (el) setRect(el.getBoundingClientRect())
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [idx, steps])

  const step = steps[idx]
  const { w, h } = vp

  const top    = rect ? Math.max(0, rect.top    - PAD) : 0
  const left   = rect ? Math.max(0, rect.left   - PAD) : 0
  const right  = rect ? Math.min(w, rect.right  + PAD) : w
  const bottom = rect ? Math.min(h, rect.bottom + PAD) : h

  const TOOLTIP_W = Math.min(300, w - 32)
  const spaceBelow = h - bottom - 8
  const spaceAbove = top - 8
  let tipTop, tipBottom
  if (rect) {
    if (spaceBelow >= 150 || spaceBelow >= spaceAbove) tipTop = bottom + 8
    else tipBottom = h - top + 8
  }
  const centerX = rect ? (rect.left + rect.right) / 2 : w / 2
  const tipLeft = Math.max(16, Math.min(w - TOOLTIP_W - 16, centerX - TOOLTIP_W / 2))

  const tipStyle = {
    position: 'fixed',
    left: tipLeft,
    width: TOOLTIP_W,
    ...(tipTop    !== undefined ? { top: tipTop }       : {}),
    ...(tipBottom !== undefined ? { bottom: tipBottom } : {}),
    ...(!rect ? { top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: TOOLTIP_W } : {}),
    background: '#0a0f1a',
    border: `1.5px solid rgba(192,132,252,0.45)`,
    borderRadius: 16,
    padding: '16px 18px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
    zIndex: 10001,
    pointerEvents: 'auto',
  }

  const stepIdx = idx

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, pointerEvents: 'none' }}>
      {/* Highlight ring only — no blocking overlay */}
      {rect && (
        <div style={{
          position: 'fixed',
          top: top, left: left, width: right - left, height: bottom - top,
          border: `2px solid ${ACC}`,
          borderRadius: 12,
          boxShadow: `0 0 0 3px rgba(192,132,252,0.18)`,
          pointerEvents: 'none',
        }} />
      )}

      {/* Tooltip */}
      <div style={tipStyle}>
        {/* Dots */}
        <div style={{ display: 'flex', gap: 5, marginBottom: 12 }}>
          {steps.map((_, i) => (
            <div key={i} style={{
              width: i === stepIdx ? 18 : 6, height: 6, borderRadius: 3,
              background: i <= stepIdx ? ACC : 'rgba(255,255,255,0.1)',
              transition: 'width 0.2s',
            }} />
          ))}
        </div>

        <div style={{ fontSize: 14, fontWeight: 800, color: '#f9fafb', marginBottom: 6 }}>
          {step.title}
        </div>
        <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.55, marginBottom: 14 }}>
          {step.desc}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={stepIdx < steps.length - 1 ? () => setIdx(i => i + 1) : onDone} style={{
            flex: 2, padding: '9px 0', borderRadius: 10, border: 'none',
            background: 'linear-gradient(135deg,#7c3aed,#c084fc)',
            color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer',
          }}>
            {stepIdx < steps.length - 1 ? 'Suivant →' : '✓ Terminé'}
          </button>
        </div>

        <button onClick={onDone} style={{
          display: 'block', width: '100%', marginTop: 8,
          background: 'none', border: 'none', color: '#6b7280',
          fontSize: 11, cursor: 'pointer', padding: '4px 0',
        }}>Fermer</button>
      </div>
    </div>
  )
}
