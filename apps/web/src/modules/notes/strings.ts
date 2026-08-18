// ─── Progression « Spécial Cordes » (dev) ─────────────────────────────────────
//
// Pour les 4 instruments à cordes, la progression démarre par les CORDES À VIDE
// (repères, colorées par corde), puis l'Extension se divise en 3 sous-phases :
// « corde à vide + 1 doigt », « + 2 », « + 3 ». Fonctions pures (testables).
//
// Index diatoniques ÉCRITS (ce que lit l'élève), octave FR (do3 = do central).
// La contrebasse est notée une octave au-dessus du son → on prend les cordes
// ÉCRITES (mi1, la1, ré2, sol2), pas les cordes sonnantes.

import type { Clef, NoteItem, Phase } from './types.ts'
import { diatonic } from './diatonic.ts'

const n = diatonic

// Cordes à vide écrites, du grave à l'aigu.
export const STRING_OPEN: Record<string, number[]> = {
  violon:       [n(2, 4), n(3, 1), n(3, 5), n(4, 2)], // sol2 ré3 la3 mi4  (G3 D4 A4 E5)
  alto:         [n(2, 0), n(2, 4), n(3, 1), n(3, 5)], // do2 sol2 ré3 la3  (C3 G3 D4 A4)
  violoncelle:  [n(1, 0), n(1, 4), n(2, 1), n(2, 5)], // do1 sol1 ré2 la2  (C2 G2 D3 A3)
  contrebasse:  [n(1, 2), n(1, 5), n(2, 1), n(2, 4)], // mi1 la1 ré2 sol2  (écrit : E2 A2 D3 G3)
}

// Une couleur par corde (grave → aigu).
export const STRING_COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6']

export function isStringInstrument(id: string): boolean {
  return id in STRING_OPEN
}

// Couleur de la corde à laquelle appartient une note (la plus haute corde ≤ note).
export function stringColorOf(diatonicIndex: number, instrumentId: string): string | undefined {
  const opens = STRING_OPEN[instrumentId]
  if (!opens) return undefined
  let si = 0
  for (let i = 0; i < opens.length; i++) if (diatonicIndex >= opens[i]) si = i
  return STRING_COLORS[si]
}

// Ensemble des hauteurs : chaque corde + i demi-degrés diatoniques (0..maxFinger).
function fingerSet(opens: number[], maxFinger: number): number[] {
  const s = new Set<number>()
  for (const o of opens) for (let i = 0; i <= maxFinger; i++) s.add(o + i)
  return [...s].sort((a, b) => a - b)
}

// Pool d'items pour une phase de cordes :
//   P0        = cordes à vide.
//   P1 (step) = cordes à vide + jusqu'à `step` doigts (1..3).
//   P2        = ensemble complet (+ 3 doigts), joué en lignes.
export function stringPool(instrumentId: string, clef: Clef, phase: Phase, step: number): NoteItem[] {
  const opens = STRING_OPEN[instrumentId]
  if (!opens) return []
  const idxs = phase === 'P0'
    ? [...opens].sort((a, b) => a - b)
    : fingerSet(opens, phase === 'P2' ? 3 : Math.max(1, Math.min(3, step)))
  return idxs.map(i => ({ id: `${clef}:${i}`, clef, diatonicIndex: i }))
}
