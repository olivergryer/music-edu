// ─── Roue radiale relative (spec §5) ──────────────────────────────────────────
//
// Menu radial *relatif* SANS cadre : on pose le doigt N'IMPORTE OÙ (couche
// transparente plein écran) → la roue apparaît. L'ANGLE de sélection est calculé
// entre le POINT DE CONTACT et le point de drag (jamais depuis le centre d'affichage).
// Si le contact est trop près d'un bord, le CENTRE D'AFFICHAGE de la roue est décalé
// pour la montrer entièrement — sans changer le calcul d'angle. Toujours accessible
// (aucun délai/blocage). `onHover` remonte le nom courant pour l'afficher au-dessus
// de la portée. Haptique Android capability-gated.

import { useRef, useState } from 'react'
import { NOTE_NAMES, type Etayage, type NoteName } from './types.ts'
import { noteNameFromVector, sectorCenterAngle, DEFAULT_DEAD_RADIUS_PX, SECTOR_DEG } from './wheelGeometry.ts'

export const NOTE_LABELS: Record<NoteName, string> = {
  do: 'Do', re: 'Ré', mi: 'Mi', fa: 'Fa', sol: 'Sol', la: 'La', si: 'Si',
}

const ACCENT = '#c084fc'
const ACCENT_DEEP = '#7c3aed'

interface Props {
  etayage: Etayage
  onSelect: (name: NoteName | null) => void
  onHover?: (name: NoteName | null) => void
  onGestureStart?: () => void
  radiusPx?: number
  deadRadiusPx?: number
}

const CAN_VIBRATE = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'

export default function RadialWheel({
  etayage, onSelect, onHover, onGestureStart,
  radiusPx = 118, deadRadiusPx = DEFAULT_DEAD_RADIUS_PX,
}: Props) {
  const bandRef = useRef<HTMLDivElement>(null)
  const originRef = useRef<{ x: number; y: number } | null>(null)  // point de contact (angle)
  const lastSectorRef = useRef<number | null>(null)
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null)
  const [displayCenter, setDisplayCenter] = useState<{ x: number; y: number } | null>(null)
  const [activeSector, setActiveSector] = useState<number | null>(null)

  const labelOpacity = etayage === 'visible' ? 1 : etayage === 'estompe' ? 0.35 : 0

  const localXY = (e: React.PointerEvent) => {
    const rect = bandRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  // Décale le centre d'AFFICHAGE pour que la roue tienne entièrement à l'écran.
  const clampCenter = (p: { x: number; y: number }) => {
    const rect = bandRef.current!.getBoundingClientRect()
    const m = radiusPx + 12
    const maxX = Math.max(m, rect.width - m)
    const maxY = Math.max(m, rect.height - m)
    return { x: Math.min(Math.max(p.x, m), maxX), y: Math.min(Math.max(p.y, m), maxY) }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    onGestureStart?.()
    const p = localXY(e)
    originRef.current = p
    lastSectorRef.current = null
    setOrigin(p)
    setDisplayCenter(clampCenter(p))
    setActiveSector(null)
    bandRef.current?.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!originRef.current) return
    const p = localXY(e)
    // Angle TOUJOURS depuis le point de contact (origin), pas le centre d'affichage.
    const name = noteNameFromVector(p.x - originRef.current.x, p.y - originRef.current.y, deadRadiusPx)
    const sector = name == null ? null : NOTE_NAMES.indexOf(name)
    if (sector !== lastSectorRef.current) {
      if (CAN_VIBRATE && sector != null) navigator.vibrate(5)
      lastSectorRef.current = sector
      setActiveSector(sector)
      onHover?.(name)
    }
  }

  const endGesture = (e: React.PointerEvent, commit: boolean) => {
    const o = originRef.current
    originRef.current = null
    lastSectorRef.current = null
    setOrigin(null)
    setDisplayCenter(null)
    setActiveSector(null)
    onHover?.(null)
    if (!o) return
    if (commit) {
      const p = localXY(e)
      onSelect(noteNameFromVector(p.x - o.x, p.y - o.y, deadRadiusPx))
    }
  }

  return (
    <div
      ref={bandRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={e => endGesture(e, true)}
      onPointerCancel={e => endGesture(e, false)}
      style={{ position: 'absolute', inset: 0, touchAction: 'none', userSelect: 'none', background: 'transparent', cursor: 'pointer' }}
    >
      {origin == null && (
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 16, textAlign: 'center',
          color: 'var(--text-muted)', fontSize: 13, opacity: 0.7, pointerEvents: 'none',
        }}>
          Touche l’écran pour faire apparaître la roue
        </div>
      )}
      {displayCenter && (
        <Wheel cx={displayCenter.x} cy={displayCenter.y} r={radiusPx} deadR={deadRadiusPx}
          active={activeSector} labelOpacity={labelOpacity} />
      )}
    </div>
  )
}

function Wheel({ cx, cy, r, deadR, active, labelOpacity }: {
  cx: number; cy: number; r: number; deadR: number; active: number | null; labelOpacity: number
}) {
  const half = (SECTOR_DEG * Math.PI) / 180 / 2

  const wedge = (i: number): string => {
    const c = sectorCenterAngle(i)
    const a0 = c - half, a1 = c + half
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0)
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1)
    return `M ${cx} ${cy} L ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)} Z`
  }

  return (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
      <circle cx={cx} cy={cy} r={r} fill="rgba(124,58,237,0.10)" stroke="var(--border-c)" strokeWidth={1} />

      {NOTE_NAMES.map((name, i) => {
        const isActive = i === active
        return <path key={name} d={wedge(i)}
          fill={isActive ? 'rgba(124,58,237,0.32)' : 'transparent'}
          stroke={isActive ? ACCENT : 'var(--border-c)'} strokeWidth={isActive ? 2 : 1} />
      })}

      <circle cx={cx} cy={cy} r={deadR} fill="var(--surface-2)" stroke="var(--border-c)" strokeWidth={1} />

      {NOTE_NAMES.map((name, i) => {
        const isActive = i === active
        const c = sectorCenterAngle(i)
        const lr = r * 0.62
        const x = cx + lr * Math.cos(c), y = cy + lr * Math.sin(c)
        if (labelOpacity <= 0 && !isActive) return null
        return (
          <text key={`t-${name}`} x={x} y={y} textAnchor="middle" dominantBaseline="central"
            fontSize={isActive ? 30 : 18} fontWeight={isActive ? 800 : 600}
            fill={isActive ? '#fff' : 'var(--text)'} opacity={isActive ? 1 : labelOpacity}
            style={{ fontFamily: "'Poppins', sans-serif" }}>
            {NOTE_LABELS[name]}
          </text>
        )
      })}

      {active != null && (() => {
        const c = sectorCenterAngle(active)
        const hr = r * 0.62
        return <circle cx={cx + hr * Math.cos(c)} cy={cy + hr * Math.sin(c)} r={26}
          fill="none" stroke={ACCENT_DEEP} strokeWidth={3} opacity={0.9} />
      })()}
    </svg>
  )
}
