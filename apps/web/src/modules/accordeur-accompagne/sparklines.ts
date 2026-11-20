// ─── Sparkline de justesse : écart en cents de chaque trame, sous la portée ─────────────
// Reprise de l'Accordeur d'origine (courbe de cents par note, échelle ±50 ¢, ligne à 0 ¢),
// ici contre l'accord en vigueur et tracée en direct.

import type { ContexteAnnotation, NoteAnnotee } from './annotation.ts'
import { classerNote } from './references.ts'
import { sonsDeLEntree, type SonJoue } from './realisation.ts'

export interface PointHauteur { t: number; hz: number | null }
export const ECHELLE_SPARK_CENTS = 50

/** Écart signé d'une fréquence contre l'accord de l'entrée, comme `annoterNote`. */
export function fabriqueEcarts(c: ContexteAnnotation): (hz: number, entree: number) => number {
  const cache = new Map<number, { sons: SonJoue[]; tonique: number }>()
  return (hz, entree) => {
    const idx = c.phrase.entrees[entree] ? entree : 0
    let m = cache.get(idx)
    if (!m) {
      const e = c.phrase.entrees[idx]
      m = { sons: sonsDeLEntree(e, c.real.get(idx)!, c.diapason, c.tempUser), tonique: e.tonalite.tonique }
      cache.set(idx, m)
    }
    return classerNote(hz, m.sons, m.tonique, c.ref, c.diapason, c.tempUser).ecart
  }
}

/** Points d'une plage de temps (dichotomie : la série est triée par t). */
export function pointsEntre(pts: readonly PointHauteur[], t0: number, t1: number): PointHauteur[] {
  let a = 0, b = pts.length
  while (a < b) { const m = (a + b) >> 1; if (pts[m].t < t0) a = m + 1; else b = m }
  const out: PointHauteur[] = []
  for (let i = a; i < pts.length && pts[i].t <= t1; i++) out.push(pts[i])
  return out
}

export interface SegmentSpark { x1: number; y1: number; x2: number; y2: number; ecart: number }

export interface PieceSpark {
  piece: { debut: number; fin: number }   // en temps musicaux (noires)
  note: NoteAnnotee
  tour: number
}

export interface GeometrieSpark {
  ctx: ContexteAnnotation
  /** temps musical (noires) → instant du planning (s) */
  tempsDe: (beat: number) => number
  nSlots: number; X0: number; LS: number
  zero: number; demiHauteur: number          // px
}

/** Segments à tracer : un par couple de trames voisines d'une même note (les trous coupent la ligne). */
export function calculerSegments(pieces: readonly PieceSpark[], pts: readonly PointHauteur[], g: GeometrieSpark): SegmentSpark[] {
  const ecart = fabriqueEcarts(g.ctx)
  const out: SegmentSpark[] = []
  for (const p of pieces) {
    const t0 = g.tempsDe(p.piece.debut), t1 = g.tempsDe(p.piece.fin)
    const dBeat = (t: number): number => p.piece.debut + (t - t0) / (t1 - t0 || 1) * (p.piece.fin - p.piece.debut)
    let prec: { x: number; y: number } | null = null
    for (const q of pointsEntre(pts, t0, t1)) {
      if (q.hz === null) { prec = null; continue }
      const e = ecart(q.hz, p.note.entree)
      const cl = Math.max(-ECHELLE_SPARK_CENTS, Math.min(ECHELLE_SPARK_CENTS, e))
      const x = g.X0 + (dBeat(q.t) - p.tour * g.nSlots) * g.LS
      const y = g.zero - (cl / ECHELLE_SPARK_CENTS) * g.demiHauteur
      if (prec) out.push({ x1: prec.x, y1: prec.y, x2: x, y2: y, ecart: e })
      prec = { x, y }
    }
  }
  return out
}
