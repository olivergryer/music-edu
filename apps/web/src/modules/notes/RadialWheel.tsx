// ─── Roue radiale de saisie (spec §5) ─────────────────────────────────────────
//
// Deux modes (togglés par l'utilisateur, persistés) :
//   • 'drag' : menu radial *relatif* sans cadre — on pose le doigt N'IMPORTE OÙ,
//     la roue apparaît, sélection par ANGLE (contact→drag), validation au pointerup.
//     Angle TOUJOURS calculé depuis le point de contact, jamais depuis le centre
//     d'affichage (qui peut être décalé pour tenir à l'écran près des bords).
//   • 'fixed' : cadran FIXE affiché en permanence, noms toujours visibles, CLIC
//     SIMPLE sur le secteur du bon nom. Aide maximale (ignore l'étayage de phase).
//
// Haptique Android capability-gated. `onHover` remonte le nom courant (mode drag).

import { useEffect, useRef, useState } from 'react'
import { NOTE_NAMES, type Etayage, type NoteName } from './types.ts'
import { noteNameFromVector, sectorCenterAngle, DEFAULT_DEAD_RADIUS_PX, SECTOR_DEG } from './wheelGeometry.ts'

export const NOTE_LABELS: Record<NoteName, string> = {
  do: 'Do', re: 'Ré', mi: 'Mi', fa: 'Fa', sol: 'Sol', la: 'La', si: 'Si',
}

export type WheelMode = 'drag' | 'fixed'

const ACCENT = '#c084fc'
const ACCENT_DEEP = '#7c3aed'

interface Props {
  mode?: WheelMode
  etayage: Etayage
  onSelect: (name: NoteName | null) => void
  onHover?: (name: NoteName | null) => void
  onGestureStart?: () => void
  radiusPx?: number
  deadRadiusPx?: number
}

const CAN_VIBRATE = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'

export default function RadialWheel({
  mode = 'drag', etayage, onSelect, onHover, onGestureStart,
  radiusPx = 118, deadRadiusPx = DEFAULT_DEAD_RADIUS_PX,
}: Props) {
  const bandRef = useRef<HTMLDivElement>(null)
  const originRef = useRef<{ x: number; y: number } | null>(null)  // point de contact (angle)
  const lastSectorRef = useRef<number | null>(null)
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null)
  const [displayCenter, setDisplayCenter] = useState<{ x: number; y: number } | null>(null)
  const [activeSector, setActiveSector] = useState<number | null>(null)
  const [bandSize, setBandSize] = useState({ w: 0, h: 0 })

  // Mesure de la zone (centre du cadran fixe).
  useEffect(() => {
    const el = bandRef.current
    if (!el) return
    const update = () => setBandSize({ w: el.clientWidth, h: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const labelOpacity = etayage === 'visible' ? 1 : etayage === 'estompe' ? 0.35 : 0

  const localXY = (e: React.PointerEvent) => {
    const rect = bandRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  // ── Mode FIXE : cadran permanent, clic simple ────────────────────────────────
  const fixedCenter = {
    x: bandSize.w / 2,
    y: Math.min(Math.max(bandSize.h * 0.58, radiusPx + 8), Math.max(radiusPx + 8, bandSize.h - radiusPx - 8)),
  }
  const fixedSectorAt = (p: { x: number; y: number }): number | null => {
    const dx = p.x - fixedCenter.x, dy = p.y - fixedCenter.y
    if (Math.hypot(dx, dy) > radiusPx) return null            // tap hors du cadran
    const name = noteNameFromVector(dx, dy, deadRadiusPx)     // null en zone morte
    return name == null ? null : NOTE_NAMES.indexOf(name)
  }

  if (mode === 'fixed') {
    const onDown = (e: React.PointerEvent) => {
      onGestureStart?.()
      setActiveSector(fixedSectorAt(localXY(e)))
      bandRef.current?.setPointerCapture(e.pointerId)
    }
    const onMove = (e: React.PointerEvent) => {
      if (e.buttons === 0 && e.pointerType === 'mouse') return
      setActiveSector(fixedSectorAt(localXY(e)))
    }
    const onUp = (e: React.PointerEvent) => {
      const sector = fixedSectorAt(localXY(e))
      setActiveSector(null)
      if (sector != null) {
        if (CAN_VIBRATE) navigator.vibrate(5)
        onSelect(NOTE_NAMES[sector])
      }
    }
    return (
      <div ref={bandRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
        onPointerCancel={() => setActiveSector(null)}
        style={{ position: 'absolute', inset: 0, touchAction: 'none', userSelect: 'none', background: 'transparent', cursor: 'pointer' }}>
        {bandSize.h > 0 && (
          <Wheel cx={fixedCenter.x} cy={fixedCenter.y} r={radiusPx} deadR={deadRadiusPx}
            active={activeSector} labelOpacity={1} />
        )}
      </div>
    )
  }

  // ── Mode DRAG : menu radial relatif ──────────────────────────────────────────
  const clampCenter = (p: { x: number; y: number }) => {
    const m = radiusPx + 12
    const maxX = Math.max(m, bandSize.w - m)
    const maxY = Math.max(m, bandSize.h - m)
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
