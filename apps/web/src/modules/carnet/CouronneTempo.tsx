// Couronne de tempo : anneau de réglage 30 → 300 BPM sur 3 tours (1080°) autour
// de la valeur numérique. Geste circulaire en pointer events, angle CUMULÉ (pas
// de saut au passage de ±180°), butées dures. Au centre : appui = saisie
// exacte au clavier. Flèches clavier = ±1 (±10 avec Maj).

import { useRef, useState } from 'react'

export const TEMPO_MIN = 30
export const TEMPO_MAX = 300
const SPAN = 1080
const TAILLE = 208
const C = TAILLE / 2
const R = 88
const EPAISSEUR = 16

export const bornerTempo = (n: number) => Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, Math.round(n)))

const point = (deg: number): [number, number] => {
  const a = deg * Math.PI / 180
  return [C + R * Math.sin(a), C - R * Math.cos(a)]
}

export default function CouronneTempo({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<{ dernier: number; total: number } | null>(null)
  const [saisie, setSaisie] = useState<string | null>(null)
  const annule = useRef(false)

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

  const valider = () => {
    if (saisie === null) return
    if (annule.current) { annule.current = false; setSaisie(null); return }
    const n = parseInt(saisie, 10)
    if (Number.isFinite(n)) onChange(bornerTempo(n))
    setSaisie(null)
  }

  const deg = (value - TEMPO_MIN) / (TEMPO_MAX - TEMPO_MIN) * SPAN
  const tour = Math.min(3, Math.floor(deg / 360) + 1)
  const degTour = deg > 0 && deg % 360 === 0 ? 360 : deg % 360
  const [hx, hy] = point(degTour)
  const [fx, fy] = point(degTour >= 360 ? 359.99 : degTour)

  return (
    <div data-flash style={{ position: 'relative', width: TAILLE, height: TAILLE, borderRadius: '50%', flexShrink: 0 }}>
      <div ref={ref} role="slider" tabIndex={0} aria-label="Tempo" aria-valuemin={TEMPO_MIN} aria-valuemax={TEMPO_MAX} aria-valuenow={value}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onKeyDown={onKey}
        style={{ position: 'absolute', inset: 0, touchAction: 'none', cursor: 'grab', borderRadius: '50%', userSelect: 'none' }}>
        <svg width={TAILLE} height={TAILLE} viewBox={`0 0 ${TAILLE} ${TAILLE}`} style={{ display: 'block' }}>
          <circle cx={C} cy={C} r={R} fill="var(--surface)" stroke="var(--border-c)" strokeWidth={EPAISSEUR} />
          {/* Graduations : une tous les 30° d'un tour */}
          {Array.from({ length: 12 }, (_, i) => {
            const a = i * 30 * Math.PI / 180
            return <line key={i} x1={C + (R - 14) * Math.sin(a)} y1={C - (R - 14) * Math.cos(a)}
              x2={C + (R - 20) * Math.sin(a)} y2={C - (R - 20) * Math.cos(a)} stroke="var(--text-muted)" strokeWidth={1.5} strokeLinecap="round" opacity={0.6} />
          })}
          {/* Arc du tour en cours */}
          {degTour > 0 && (
            <path d={`M ${C} ${C - R} A ${R} ${R} 0 ${degTour > 180 ? 1 : 0} 1 ${fx} ${fy}`}
              fill="none" stroke="#7c3aed" strokeWidth={EPAISSEUR} strokeLinecap="round" />
          )}
          <circle cx={hx} cy={hy} r={EPAISSEUR / 2 + 3} fill="#c084fc" stroke="var(--surface)" strokeWidth={2} />
        </svg>
      </div>

      {/* Centre : valeur + tours */}
      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', display: 'flex',
        flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        {saisie === null ? (
          <button onClick={() => setSaisie(String(value))} aria-label={`Tempo ${value}. Modifier au clavier`}
            style={{ minWidth: 96, minHeight: 56, border: 'none', borderRadius: 12, background: 'transparent', color: 'var(--text)',
              fontSize: 42, fontWeight: 700, cursor: 'text', fontVariantNumeric: 'tabular-nums', padding: 0,
              fontFamily: "'Righteous', 'Inter', sans-serif" }}>
            {value}
          </button>
        ) : (
          <input autoFocus inputMode="numeric" value={saisie} aria-label="Tempo exact"
            onChange={e => setSaisie(e.target.value.replace(/\D/g, '').slice(0, 3))}
            onFocus={e => e.target.select()} onBlur={valider}
            onKeyDown={e => {
              if (e.key === 'Enter') valider()
              if (e.key === 'Escape') { annule.current = true; e.currentTarget.blur() }
            }}
            style={{ width: 96, height: 56, boxSizing: 'border-box', textAlign: 'center', fontSize: 42, fontWeight: 700,
              border: '2px solid #c084fc', borderRadius: 12, background: 'var(--input-bg)', color: 'var(--text)',
              fontFamily: "'Righteous', 'Inter', sans-serif" }} />
        )}
        <div aria-hidden style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
          BPM
          {[1, 2, 3].map(n => (
            <span key={n} style={{ width: 6, height: 6, borderRadius: '50%', background: n <= tour ? '#c084fc' : 'var(--border-c)' }} />
          ))}
        </div>
      </div>
    </div>
  )
}
