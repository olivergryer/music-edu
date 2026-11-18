// ─── Graphe de l'accord : horloge (défaut) ou échelle horizontale (brief UI v1, § 6.2–6.5) ──
// Le cercle vaut une octave (1200 ¢), 0° = fondamentale de l'accord. Une sphère par son, déplaçable :
// horizontal = intonation (4 px par cent, ±50 ¢, aimantée sur le tempéré et la cible juste), vertical =
// volume (120 px), toucher = silence. Clavier : ←/→ ±1 ¢ (Maj ±0,1), ↑/↓ volume ±5 %, Espace/Entrée muet.

import { useRef, useState, type KeyboardEvent, type PointerEvent as PE } from 'react'
import AnneauBattements, { type EtatAnneau } from './AnneauBattements.tsx'
import { JUSTE, formaterEcart } from './couleurs.ts'
import type { Role } from './phrase.ts'
import type { VueAccord } from './reglagesLocaux.ts'

export interface SonGraphe {
  role: Role
  nom: string                // nom écrit (« Si »)
  intervalle: number         // demi-tons au-dessus de la fondamentale
  cents: number              // réglés, absolus par rapport au tempéré
  centsJuste: number         // cible juste de l'accordage harmonique (repère vert)
  volume: number
  muet: boolean
  doublee: boolean
  couleurBordure: string     // écart des cents réglés au référentiel
  libelleRole: string        // « Tierce »
}

export interface EleveSurGraphe {
  pcCents: number            // position de la note jouée au-dessus de la fondamentale, 0–1200
  couleur: string | null     // null : note étrangère (neutre)
  role: Role | null          // son rattaché (intérieur de la sphère)
  ecart: number
  sigma: number
}

interface Props {
  sons: SonGraphe[]
  vue: VueAccord
  eleve: EleveSurGraphe | null
  lireAnneau: (role: Role) => EtatAnneau | null
  onChange: (role: Role, patch: { cents?: number; volume?: number; muet?: boolean }) => void
}

const CX = 340, CY = 178, R = 120
const xEchelle = (pc: number) => 70 + (pc / 1100) * 540
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

function position(vue: VueAccord, pc: number): [number, number] {
  if (vue === 'horloge') {
    const a = -Math.PI / 2 + (pc / 1200) * 2 * Math.PI
    return [CX + R * Math.cos(a), CY + R * Math.sin(a)]
  }
  return [xEchelle(pc), CY]
}

export default function GrapheAccord({ sons, vue, eleve, lireAnneau, onChange }: Props) {
  const drag = useRef<{ role: Role; x: number; y: number; cents: number; volume: number; axe: 'h' | 'v' | null } | null>(null)
  const [, force] = useState(0)

  const roleParSphere = (s: SonGraphe) => s.role
  const uniques = sons.filter(s => !s.doublee)                    // une sphère par rôle ; la doublure est un second anneau
  const doubles = new Set(sons.filter(s => s.doublee).map(roleParSphere))

  const debut = (e: PE<SVGGElement>, s: SonGraphe) => {
    drag.current = { role: s.role, x: e.clientX, y: e.clientY, cents: s.cents, volume: s.volume, axe: null }
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    e.stopPropagation()
  }
  const deplacer = (e: PE<SVGGElement>, s: SonGraphe) => {
    const d = drag.current
    if (!d || d.role !== s.role) return
    const dx = e.clientX - d.x, dy = e.clientY - d.y
    if (!d.axe && Math.hypot(dx, dy) > 6) d.axe = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
    if (d.axe === 'h') {
      let c = clamp(d.cents + dx * 0.25, -50, 50)
      if (Math.abs(c - s.centsJuste) < 1.5) c = s.centsJuste
      else if (Math.abs(c) < 1.5) c = 0
      if (c !== s.cents) { if ((c === 0 || c === s.centsJuste) && navigator.vibrate) navigator.vibrate(8); onChange(s.role, { cents: Math.round(c * 100) / 100 }) }
    } else if (d.axe === 'v') {
      const v = clamp(d.volume - dy / 120, 0, 1)
      onChange(s.role, { volume: Math.round(v * 100) / 100 })
    }
  }
  const fin = (_e: PE<SVGGElement>, s: SonGraphe) => {
    const d = drag.current
    if (d && d.role === s.role && !d.axe) onChange(s.role, { muet: !s.muet })      // toucher sans glisser : silence / retour
    drag.current = null
    force(x => x + 1)
  }
  const clavier = (e: KeyboardEvent<SVGGElement>, s: SonGraphe) => {
    const pas = e.shiftKey ? 0.1 : 1
    if (e.key === 'ArrowLeft') onChange(s.role, { cents: clamp(Math.round((s.cents - pas) * 100) / 100, -50, 50) })
    else if (e.key === 'ArrowRight') onChange(s.role, { cents: clamp(Math.round((s.cents + pas) * 100) / 100, -50, 50) })
    else if (e.key === 'ArrowUp') onChange(s.role, { volume: clamp(Math.round((s.volume + 0.05) * 100) / 100, 0, 1) })
    else if (e.key === 'ArrowDown') onChange(s.role, { volume: clamp(Math.round((s.volume - 0.05) * 100) / 100, 0, 1) })
    else if (e.key === ' ' || e.key === 'Enter') onChange(s.role, { muet: !s.muet })
    else return
    e.preventDefault()
  }

  return (
    <svg viewBox="0 0 680 360" width="100%" role="group" aria-label="Accord" style={{ display: 'block', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}>
      {vue === 'horloge' ? (
        <g>
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--border-c)" />
          {Array.from({ length: 12 }, (_, k) => {
            const a = -Math.PI / 2 + (k / 12) * 2 * Math.PI
            return <line key={k} x1={CX + (R - 6) * Math.cos(a)} y1={CY + (R - 6) * Math.sin(a)} x2={CX + (R + 6) * Math.cos(a)} y2={CY + (R + 6) * Math.sin(a)} stroke="var(--border-strong, var(--border-c))" />
          })}
          <polygon points={uniques.map(s => position(vue, s.intervalle * 100 + s.cents).map(v => v.toFixed(1)).join(',')).join(' ')} fill="rgba(128,128,128,0.08)" stroke="var(--border-strong, var(--border-c))" />
          <text x={CX} y={CY + 4} textAnchor="middle" fontSize={12} fill="var(--text-muted)">0° = fondamentale</text>
        </g>
      ) : (
        <g>
          <line x1={60} x2={630} y1={CY + 72} y2={CY + 72} stroke="var(--border-strong, var(--border-c))" />
          {Array.from({ length: 12 }, (_, k) => <line key={k} x1={xEchelle(k * 100)} x2={xEchelle(k * 100)} y1={CY + 66} y2={CY + 78} stroke="var(--border-strong, var(--border-c))" />)}
          <text x={630} y={CY + 100} textAnchor="end" fontSize={12} fill="var(--text-muted)">traits : tempéré · losanges : juste</text>
        </g>
      )}

      {/* repères justes : points verts hors du cercle (ou losanges sur l'échelle) */}
      {uniques.map(s => {
        const pc = s.intervalle * 100 + s.centsJuste
        if (vue === 'horloge') {
          const a = -Math.PI / 2 + (pc / 1200) * 2 * Math.PI
          return <circle key={`j${s.role}`} cx={CX + (R + 13) * Math.cos(a)} cy={CY + (R + 13) * Math.sin(a)} r={3} fill={JUSTE} />
        }
        const x = xEchelle(pc)
        return <rect key={`j${s.role}`} x={x - 3.5} y={CY + 68.5} width={7} height={7} fill={JUSTE} transform={`rotate(45 ${x} ${CY + 72})`} />
      })}

      {uniques.map(s => {
        const [px, py] = position(vue, s.intervalle * 100 + s.cents)
        const r = 14 + 16 * s.volume
        const joue = eleve && eleve.role === s.role
        const bat = () => (joue ? lireAnneau(s.role) : null)
        return (
          <g key={s.role}>
            {joue && eleve && (
              <circle cx={px} cy={py} r={r + 8 + 0.7 * (Number.isFinite(eleve.sigma) ? Math.min(eleve.sigma, 25) : 14)} fill={eleve.couleur ?? 'var(--text-muted)'} fillOpacity={0.14}
                stroke={Number.isFinite(eleve.sigma) ? 'none' : (eleve.couleur ?? 'var(--text-muted)')} strokeDasharray={Number.isFinite(eleve.sigma) ? undefined : '4 3'} style={{ transition: 'r 0.3s ease-out' }} />
            )}
            <g
              tabIndex={0} role="slider" aria-valuemin={-50} aria-valuemax={50} aria-valuenow={Math.round(s.cents * 10) / 10}
              aria-label={`${s.libelleRole}, ${s.nom}, ${formaterEcart(s.cents)}, volume ${Math.round(s.volume * 100)} %${s.muet ? ', muet' : ''}`}
              opacity={s.muet ? 0.35 : 1} style={{ cursor: 'grab', outline: 'none' }}
              onPointerDown={e => debut(e, s)} onPointerMove={e => deplacer(e, s)} onPointerUp={e => fin(e, s)} onPointerCancel={() => { drag.current = null }}
              onKeyDown={e => clavier(e, s)}
            >
              <circle cx={px} cy={py} r={r + 10} fill="transparent" />
              {doubles.has(s.role) && <circle cx={px} cy={py} r={r + 4} fill="none" stroke={s.couleurBordure} strokeWidth={1.5} />}
              <circle cx={px} cy={py} r={r} fill={joue && eleve?.couleur ? eleve.couleur : 'var(--bg)'} stroke={s.couleurBordure} strokeWidth={4} />
              <text x={px} y={py + 5} textAnchor="middle" fontSize={13} fill={joue && eleve?.couleur ? '#0D1026' : 'var(--text)'}>{s.nom}</text>
            </g>
            {joue && <AnneauBattements cx={px} cy={py} r={r + 7} lire={bat} />}
            <text x={px} y={py + r + 22} textAnchor="middle" fontSize={12} fill="var(--text-muted)">{s.role === 'F' ? 'F' : s.role} · {formaterEcart(s.cents)}</text>
          </g>
        )
      })}

      {eleve && (() => {
        const pc = ((eleve.pcCents % 1200) + 1200) % 1200
        const fill = eleve.couleur ?? 'var(--text-muted)'
        if (vue === 'horloge') {
          const a = -Math.PI / 2 + (pc / 1200) * 2 * Math.PI
          return <circle cx={CX + (R + 34) * Math.cos(a)} cy={CY + (R + 34) * Math.sin(a)} r={6} fill={fill} stroke="var(--bg)" strokeWidth={2} role="img" aria-label={`Élève ${formaterEcart(eleve.ecart)}`} />
        }
        const x = xEchelle(pc)
        return <path d={`M${x.toFixed(1)} ${CY - 58} l-7 -12 h14 z`} fill={fill} role="img" aria-label={`Élève ${formaterEcart(eleve.ecart)}`} />
      })()}
    </svg>
  )
}
