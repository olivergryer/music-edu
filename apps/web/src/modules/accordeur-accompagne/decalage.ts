// ─── Décalage temporel : caler les notes sur la grille de la phrase ───────────────────
// Un élève régulièrement en avance ou en retard sur la grille (ou une latence mal estimée)
// fait enjamber les barres de mesure et les changements d'accord à ses notes : chaque
// enjambement coupe une note en deux têtes, mesurées contre deux accords. Le décalage
// optimal est celui qui minimise ce nombre de têtes.

import { notesDepuisSegments, type OptionsNotes, type SegmentsAncien } from './ancienMoteur.ts'
import { decouperNote, coupuresDeTour } from './portee.ts'
import { tempsParMesure, type Phrase } from './phrase.ts'
import { tempsMusical, type PlanningPhrase } from './planningPhrase.ts'

export const DECALAGE_MAX_MS = 300
export const PAS_DECALAGE_MS = 5

/** Nombre de têtes de notes affichées : une par note, plus une par barre ou changement d'accord traversé. */
export function nombreDeTetes(notes: readonly { tOn: number; tOff: number }[], phrase: Phrase, pp: PlanningPhrase): number {
  if (!notes.length) return 0
  const pm = tempsParMesure(phrase.mesure)
  const maxBeat = Math.max(...notes.map(n => tempsMusical(pp, n.tOff))) + 1
  const coupures = coupuresDeTour(phrase, maxBeat)
  let total = 0
  for (const n of notes) {
    const on = tempsMusical(pp, n.tOn), off = tempsMusical(pp, n.tOff)
    if (off < 0) continue                                    // pendant le décompte
    total += decouperNote({ tOn: Math.max(0, on), tOff: Math.max(on + 0.05, off) }, coupures, pm).length
  }
  return total
}

export interface ScoreDecalage { decalageMs: number; tetes: number; notes: number }

/**
 * Décalage (ms) qui minimise le nombre de têtes. Parmi les valeurs optimales on prend le
 * milieu du plateau le plus proche de 0 : c'est la valeur la plus robuste (marge de part et
 * d'autre) et la moins intrusive.
 */
export function decalageOptimal(
  sg: SegmentsAncien, o: Omit<OptionsNotes, 'diapason' | 'decalageS'>, phrase: Phrase, pp: PlanningPhrase,
  maxMs = DECALAGE_MAX_MS, pasMs = PAS_DECALAGE_MS,
): ScoreDecalage {
  const scores: ScoreDecalage[] = []
  for (let d = -maxMs; d <= maxMs; d += pasMs) {
    const notes = notesDepuisSegments(sg, { ...o, decalageS: d / 1000 })
    scores.push({ decalageMs: d, tetes: nombreDeTetes(notes, phrase, pp), notes: notes.length })
  }
  const min = Math.min(...scores.map(s => s.tetes))
  const plateaux: ScoreDecalage[][] = []
  for (const s of scores) {
    if (s.tetes !== min) continue
    const dernier = plateaux[plateaux.length - 1]
    if (dernier && dernier[dernier.length - 1].decalageMs === s.decalageMs - pasMs) dernier.push(s); else plateaux.push([s])
  }
  const milieu = (p: ScoreDecalage[]): ScoreDecalage => p[Math.floor((p.length - 1) / 2)]
  return plateaux.map(milieu).sort((a, b) => Math.abs(a.decalageMs) - Math.abs(b.decalageMs))[0]
}
