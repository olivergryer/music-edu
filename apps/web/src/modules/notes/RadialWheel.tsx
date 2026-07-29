// ─── Roue radiale relative (spec §5) ──────────────────────────────────────────
//
// Menu radial *relatif* : pointerdown N'IMPORTE OÙ dans la bande basse fixe
// l'origine du geste ; la roue apparaît centrée sur ce point. Sélection par ANGLE
// du vecteur origine→doigt, validation au pointerup. Zone morte centrale = annule.
// Aucun visé requis : le regard reste sur la portée (retour visuel périphérique,
// secteur actif surdimensionné et fortement contrasté). Haptique = amélioration
// facultative derrière détection de capacité (Android). Pas de son ici.

import { useRef, useState } from 'react'
import { NOTE_NAMES, type Etayage, type NoteName } from './types.ts'
import { noteNameFromVector, sectorCenterAngle, DEFAULT_DEAD_RADIUS_PX, SECTOR_DEG } from './wheelGeometry.ts'

const LABELS: Record<NoteName, string> = {
  do: 'Do', re: 'Ré', mi: 'Mi', fa: 'Fa', sol: 'Sol', la: 'La', si: 'Si',
}

const ACCENT = '#c084fc'
const ACCENT_DEEP = '#7c3aed'
const OK = '#34d399'

interface Props {
  etayage: Etayage
  disabled?: boolean
  /** Secteur à révéler en surbrillance (bonne réponse après une erreur). */
  reveal?: NoteName | null
  /** Appelé au pointerup : nom choisi, ou null si annulation (zone morte). */
  onSelect: (name: NoteName | null) => void
  radiusPx?: number
  deadRadiusPx?: number
}

const CAN_VIBRATE = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'

export default function RadialWheel({
  etayage, disabled = false, reveal = null, onSelect,
  radiusPx = 120, deadRadiusPx = DEFAULT_DEAD_RADIUS_PX,
}: Props) {
  const bandRef = useRef<HTMLDivElement>(null)
  const originRef = useRef<{ x: number; y: number } | null>(null)
  const lastSectorRef = useRef<number | null>(null)
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null)
  const [activeSector, setActiveSector] = useState<number | null>(null)

  const labelOpacity = etayage === 'visible' ? 1 : etayage === 'estompe' ? 0.35 : 0

  const localXY = (e: React.PointerEvent) => {
    const rect = bandRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return
    const p = localXY(e)
    originRef.current = p
    lastSectorRef.current = null
    setOrigin(p)
    setActiveSector(null)
    bandRef.current?.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (disabled || !originRef.current) return
    const p = localXY(e)
    const name = noteNameFromVector(p.x - originRef.current.x, p.y - originRef.current.y, deadRadiusPx)
    const sector = name == null ? null : NOTE_NAMES.indexOf(name)
    if (sector !== lastSectorRef.current) {
      if (CAN_VIBRATE && sector != null) navigator.vibrate(5) // amélioration facultative
      lastSectorRef.current = sector
      setActiveSector(sector)
    }
  }

  const endGesture = (e: React.PointerEvent, commit: boolean) => {
    const o = originRef.current
    originRef.current = null
    lastSectorRef.current = null
    setOrigin(null)
    setActiveSector(null)
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
      style={{
        position: 'relative',
        width: '100%',
        height: '35vh',
        minHeight: 220,
        touchAction: 'none',
        userSelect: 'none',
        borderRadius: 20,
        background: 'var(--surface)',
        border: '1px solid var(--border-c)',
        overflow: 'hidden',
        opacity: disabled ? 0.6 : 1,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {origin == null ? (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-muted)', fontSize: 14, textAlign: 'center', padding: 24, pointerEvents: 'none',
        }}>
          Pose et fais glisser le pouce ici — la roue apparaît sous ton doigt.
        </div>
      ) : (
        <Wheel
          cx={origin.x} cy={origin.y} r={radiusPx} deadR={deadRadiusPx}
          active={activeSector} reveal={reveal} labelOpacity={labelOpacity}
        />
      )}
    </div>
  )
}

// Rendu SVG de la roue centrée sur l'origine du geste.
function Wheel({ cx, cy, r, deadR, active, reveal, labelOpacity }: {
  cx: number; cy: number; r: number; deadR: number
  active: number | null; reveal: NoteName | null; labelOpacity: number
}) {
  const revealSector = reveal == null ? null : NOTE_NAMES.indexOf(reveal)
  const half = (SECTOR_DEG * Math.PI) / 180 / 2

  const wedge = (i: number): string => {
    const c = sectorCenterAngle(i)
    const a0 = c - half
    const a1 = c + half
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0)
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1)
    return `M ${cx} ${cy} L ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)} Z`
  }

  return (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
      {/* Disque de fond */}
      <circle cx={cx} cy={cy} r={r} fill="rgba(124,58,237,0.06)" stroke="var(--border-c)" strokeWidth={1} />

      {NOTE_NAMES.map((name, i) => {
        const isActive = i === active
        const isReveal = i === revealSector
        const fill = isReveal ? 'rgba(52,211,153,0.30)'
          : isActive ? 'rgba(124,58,237,0.30)' : 'transparent'
        const stroke = isReveal ? OK : isActive ? ACCENT : 'var(--border-c)'
        return <path key={name} d={wedge(i)} fill={fill} stroke={stroke} strokeWidth={isActive || isReveal ? 2 : 1} />
      })}

      {/* Zone morte centrale */}
      <circle cx={cx} cy={cy} r={deadR} fill="var(--surface-2)" stroke="var(--border-c)" strokeWidth={1} />

      {/* Étiquettes des secteurs (étayage) + secteur actif surdimensionné */}
      {NOTE_NAMES.map((name, i) => {
        const isActive = i === active
        const isReveal = i === revealSector
        const c = sectorCenterAngle(i)
        const lr = r * 0.62
        const x = cx + lr * Math.cos(c)
        const y = cy + lr * Math.sin(c)
        // Le secteur actif reste visible même en masqué (forme/contraste), les
        // NOMS suivent l'étayage. Actif/révélé : agrandi et fortement contrasté.
        const showText = labelOpacity > 0 || isActive || isReveal
        if (!showText) return null
        const op = isActive || isReveal ? 1 : labelOpacity
        const size = isActive || isReveal ? 30 : 18
        const color = isReveal ? OK : isActive ? '#fff' : 'var(--text)'
        return (
          <text key={`t-${name}`} x={x} y={y} textAnchor="middle" dominantBaseline="central"
            fontSize={size} fontWeight={isActive || isReveal ? 800 : 600}
            fill={color} opacity={op} style={{ fontFamily: "'Poppins', sans-serif" }}>
            {isActive || isReveal || labelOpacity > 0 ? LABELS[name] : ''}
          </text>
        )
      })}

      {/* Halo du secteur actif pour lisibilité périphérique */}
      {active != null && (() => {
        const c = sectorCenterAngle(active)
        const hr = r * 0.62
        return <circle cx={cx + hr * Math.cos(c)} cy={cy + hr * Math.sin(c)} r={26}
          fill="none" stroke={ACCENT_DEEP} strokeWidth={3} opacity={0.9} />
      })()}
    </svg>
  )
}
