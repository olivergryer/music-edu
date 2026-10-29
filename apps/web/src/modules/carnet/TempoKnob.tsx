// Potentiomètre de tempo : 30 → 300 BPM sur 3 tours (1080°).
// Geste circulaire en pointer events, angle CUMULÉ (pas de saut au passage de
// ±180°), butées dures aux deux extrémités. Flèches clavier = ±1.

import { useRef } from 'react'

export const TEMPO_MIN = 30
export const TEMPO_MAX = 300
const SPAN = 1080
const TAILLE = 160

export const bornerTempo = (n: number) => Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, Math.round(n)))

export default function TempoKnob({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<{ dernier: number; total: number } | null>(null)

  const angle = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI
  }

  const onDown = (e: React.PointerEvent) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { dernier: angle(e), total: (value - TEMPO_MIN) / (TEMPO_MAX - TEMPO_MIN) * SPAN }
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const a = angle(e)
    let delta = a - d.dernier
    if (delta > 180) delta -= 360
    if (delta < -180) delta += 360
    d.dernier = a
    d.total = Math.min(SPAN, Math.max(0, d.total + delta))
    const v = bornerTempo(TEMPO_MIN + d.total / SPAN * (TEMPO_MAX - TEMPO_MIN))
    if (v !== value) onChange(v)
  }
  const onUp = () => { drag.current = null }

  const onKey = (e: React.KeyboardEvent) => {
    const pas = e.shiftKey ? 10 : 1
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); onChange(bornerTempo(value + pas)) }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); onChange(bornerTempo(value - pas)) }
  }

  const deg = (value - TEMPO_MIN) / (TEMPO_MAX - TEMPO_MIN) * SPAN
  const tour = Math.min(3, Math.floor(deg / 360) + 1)
  const c = TAILLE / 2

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-label="Tempo"
        aria-valuemin={TEMPO_MIN}
        aria-valuemax={TEMPO_MAX}
        aria-valuenow={value}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
        style={{ width: TAILLE, height: TAILLE, touchAction: 'none', cursor: 'grab', borderRadius: '50%', userSelect: 'none' }}
      >
        <svg width={TAILLE} height={TAILLE} viewBox={`0 0 ${TAILLE} ${TAILLE}`} style={{ display: 'block' }}>
          <circle cx={c} cy={c} r={c - 2} fill="var(--surface-2)" stroke="var(--border-c)" strokeWidth={2} />
          <g transform={`rotate(${deg} ${c} ${c})`}>
            {Array.from({ length: 24 }, (_, i) => (
              <line key={i} x1={c} y1={8} x2={c} y2={i % 2 === 0 ? 20 : 15}
                transform={`rotate(${i * 15} ${c} ${c})`}
                stroke="var(--text-muted)" strokeWidth={i % 2 === 0 ? 2 : 1} strokeLinecap="round" />
            ))}
            <circle cx={c} cy={c} r={c - 32} fill="var(--surface)" stroke="var(--border-c)" strokeWidth={1.5} />
            <line x1={c} y1={c - (c - 34)} x2={c} y2={c - 16} stroke="#c084fc" strokeWidth={5} strokeLinecap="round" />
          </g>
        </svg>
      </div>
      <div aria-hidden style={{ display: 'flex', gap: 6 }}>
        {[1, 2, 3].map(n => (
          <span key={n} style={{ width: 8, height: 8, borderRadius: '50%',
            background: n <= tour ? '#c084fc' : 'var(--border-c)' }} />
        ))}
      </div>
    </div>
  )
}
