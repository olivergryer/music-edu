// ─── Anneau stroboscopique des battements (brief UI v1, § 8) ──────────────────────────
// 12 tirets autour d'une sphère ; l'anneau tourne d'UN TIRET PAR BATTEMENT (sens horaire =
// élève trop haut). Anneau continu vert si |Δ| < 0,15 Hz. Mouvement réduit : flèche ↻ / ↺ et
// battements en Hz, sans rotation. Mis à jour par rAF directement sur les nœuds SVG.

import { useRef } from 'react'
import { JUSTE } from './couleurs.ts'
import { useRaf, useReduireMouvement } from './useRaf.ts'

export interface EtatAnneau { vitesseHz: number; intensite: number }
export const SEUIL_ARRET_HZ = 0.15

function tirets(cx: number, cy: number, r: number): string[] {
  return Array.from({ length: 12 }, (_, i) => {
    const a0 = (i * Math.PI) / 6, a1 = a0 + Math.PI / 14
    return `M${(cx + r * Math.cos(a0)).toFixed(1)} ${(cy + r * Math.sin(a0)).toFixed(1)} A${r} ${r} 0 0 1 ${(cx + r * Math.cos(a1)).toFixed(1)} ${(cy + r * Math.sin(a1)).toFixed(1)}`
  })
}

interface Props {
  cx: number; cy: number; r: number
  /** Renvoie l'état du battement mesuré pour ce son, ou null s'il ne doit pas s'afficher. */
  lire: () => EtatAnneau | null
  etiquette?: boolean
}

export default function AnneauBattements({ cx, cy, r, lire, etiquette = true }: Props) {
  const groupe = useRef<SVGGElement>(null)
  const continu = useRef<SVGCircleElement>(null)
  const texte = useRef<SVGTextElement>(null)
  const phase = useRef(0)
  const reduit = useReduireMouvement()

  useRaf(dt => {
    const e = lire()
    const g = groupe.current, c = continu.current, t = texte.current
    if (!g || !c || !t) return
    if (!e) { g.setAttribute('opacity', '0'); c.setAttribute('opacity', '0'); t.textContent = ''; return }
    const arret = Math.abs(e.vitesseHz) < SEUIL_ARRET_HZ
    c.setAttribute('opacity', arret ? '1' : '0')
    if (arret) { g.setAttribute('opacity', '0'); t.textContent = etiquette ? 'battements arrêtés' : ''; return }
    if (reduit) {
      g.setAttribute('transform', `rotate(0 ${cx} ${cy})`)
      g.setAttribute('opacity', '0.9')
      t.textContent = `${e.vitesseHz > 0 ? '↻' : '↺'} ${Math.abs(e.vitesseHz).toFixed(1)} Hz`
      return
    }
    phase.current += 2 * Math.PI * e.vitesseHz * dt
    g.setAttribute('transform', `rotate(${((phase.current / 12) * 180) / Math.PI} ${cx} ${cy})`)
    g.setAttribute('opacity', String(0.25 + 0.7 * Math.min(1, e.intensite)))
    t.textContent = etiquette ? `battements ${Math.abs(e.vitesseHz).toFixed(1)} Hz` : ''
  })

  return (
    <g aria-hidden="true" pointerEvents="none">
      <circle ref={continu} cx={cx} cy={cy} r={r} fill="none" stroke={JUSTE} strokeWidth={3} opacity={0} />
      <g ref={groupe} opacity={0}>
        {tirets(cx, cy, r).map((d, i) => <path key={i} d={d} fill="none" stroke="var(--text)" strokeWidth={3} strokeLinecap="round" />)}
      </g>
      <text ref={texte} x={cx} y={cy - r - 8} textAnchor="middle" fontSize={12} fill="var(--text-muted)" />
    </g>
  )
}
