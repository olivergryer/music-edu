// ─── Sparkline de justesse sous la portée (reprise de l'Accordeur d'origine) ─────────────
// Pour chaque note : la courbe de l'écart en cents trame par trame, contre l'accord en vigueur,
// échelle ±50 ¢, ligne à 0 ¢ et bande « juste » ; chaque segment est coloré selon son écart.
// Tracée en direct pendant le jeu (les notes provisoires) puis sur la prise.

import { useMemo } from 'react'
import type { ContexteAnnotation } from './annotation.ts'
import { couleurEcart } from './couleurs.ts'
import type { TeteAffichee } from './PorteeLive.tsx'
import { nbSlots, type Phrase } from './phrase.ts'
import { calculerSegments, ECHELLE_SPARK_CENTS, type PieceSpark, type PointHauteur } from './sparklines.ts'
import type { PlanningPhrase } from './planningPhrase.ts'

export const HAUTEUR_SPARK = 64

interface Props {
  phrase: Phrase
  pp: PlanningPhrase | null
  ctx: ContexteAnnotation | null
  tetes: TeteAffichee[]
  points: PointHauteur[]
  X0: number
  LS: number
  seuil: number
}

export default function SparklinesJustesse({ phrase, pp, ctx, tetes, points, X0, LS, seuil }: Props) {
  const n = nbSlots(phrase)
  const largeur = X0 + n * LS + 24
  const zero = HAUTEUR_SPARK / 2
  const demi = HAUTEUR_SPARK / 2 - 6
  const segments = useMemo(() => {
    if (!pp || !ctx || !points.length) return []
    const pieces: PieceSpark[] = tetes.map(t => ({ piece: t.piece, note: t.note, tour: t.tour }))
    return calculerSegments(pieces, points, {
      ctx, tempsDe: beat => pp.t0 + (beat - pp.departSlot) * pp.noireS, nSlots: n, X0, LS, zero, demiHauteur: demi,
    })
  }, [pp, ctx, tetes, points, n, X0, LS, zero, demi])

  const ySeuil = (seuil / ECHELLE_SPARK_CENTS) * demi
  return (
    <svg width={largeur} height={HAUTEUR_SPARK} style={{ display: 'block' }} role="img" aria-label="Justesse de chaque note, en cents, trame par trame">
      <rect x={X0} y={zero - ySeuil} width={n * LS} height={2 * ySeuil} fill="rgba(52,211,153,0.10)" />
      <line x1={X0 - 2} x2={X0 + n * LS} y1={zero} y2={zero} stroke="var(--text-muted)" strokeWidth={1} strokeDasharray="2 3" />
      <text x={X0 - 8} y={zero + 3} textAnchor="end" fontSize={9} fill="var(--text-muted)">0 ¢</text>
      <text x={X0 - 8} y={zero - demi + 3} textAnchor="end" fontSize={8} fill="var(--text-muted)">+{ECHELLE_SPARK_CENTS}</text>
      <text x={X0 - 8} y={zero + demi + 3} textAnchor="end" fontSize={8} fill="var(--text-muted)">−{ECHELLE_SPARK_CENTS}</text>
      {segments.map((s, i) => (
        <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={couleurEcart(s.ecart, seuil)} strokeWidth={1.8} strokeLinecap="round" />
      ))}
    </svg>
  )
}
