// ─── Agrégation de progression détaillée (pur, testable) ──────────────────────
//
// Deux vues cumulatives stockées dans `progress/notes.payload` :
//   • perNote    : maîtrise par (clef, hauteur) → heatmap des notes à retravailler
//   • perContext : stats par (instrument × clef × phase)
// Les essais marqués `guess` sont EXCLUS de la maîtrise (spec §8). Fonctions pures :
// aucun accès React/Firestore. La fusion se fait en mémoire puis 1 seule écriture.

import type { Attempt, Clef, DiatonicIndex, Phase } from './types.ts'

export interface PerNoteStat {
  attempts: number
  correct: number
  sumRtMs: number
}

export interface ContextStat {
  sessions: number
  items: number
  correct: number
  sumRtMs: number
  bestAccuracy: number
}

export type PerNoteMap = Record<string, PerNoteStat>
export type PerContextMap = Record<string, ContextStat>

export function perNoteKey(clef: Clef, diatonicIndex: DiatonicIndex): string {
  return `${clef}:${diatonicIndex}`
}

export function contextKey(instrumentId: string, clef: Clef, phase: Phase): string {
  return `${instrumentId}|${clef}|${phase}`
}

// Delta d'une session : agrège les essais NON-guess par note.
export function aggregatePerNote(attempts: Attempt[]): PerNoteMap {
  const out: PerNoteMap = {}
  for (const a of attempts) {
    if (a.flags.includes('guess')) continue
    const k = a.itemId
    const s = out[k] ?? (out[k] = { attempts: 0, correct: 0, sumRtMs: 0 })
    s.attempts += 1
    s.correct += a.correct ? 1 : 0
    s.sumRtMs += a.rtMs
  }
  return out
}

// Fusion cumulative (prev + delta), immuable.
export function mergePerNote(prev: PerNoteMap, delta: PerNoteMap): PerNoteMap {
  const out: PerNoteMap = { ...prev }
  for (const k in delta) {
    const p = out[k] ?? { attempts: 0, correct: 0, sumRtMs: 0 }
    const d = delta[k]
    out[k] = {
      attempts: p.attempts + d.attempts,
      correct: p.correct + d.correct,
      sumRtMs: p.sumRtMs + d.sumRtMs,
    }
  }
  return out
}

export function mergeContext(prev: ContextStat | undefined, sessionItems: number, sessionCorrect: number, sessionSumRtMs: number, sessionAccuracy: number): ContextStat {
  const base = prev ?? { sessions: 0, items: 0, correct: 0, sumRtMs: 0, bestAccuracy: 0 }
  return {
    sessions: base.sessions + 1,
    items: base.items + sessionItems,
    correct: base.correct + sessionCorrect,
    sumRtMs: base.sumRtMs + sessionSumRtMs,
    bestAccuracy: Math.max(base.bestAccuracy, sessionAccuracy),
  }
}

export type MasteryLevel = 'strong' | 'mid' | 'weak' | 'unknown'

// Niveau de maîtrise d'une note pour la heatmap. `unknown` sous 3 essais.
export function noteMasteryLevel(stat: PerNoteStat | undefined): MasteryLevel {
  if (!stat || stat.attempts < 3) return 'unknown'
  const acc = stat.correct / stat.attempts
  if (acc >= 0.9) return 'strong'
  if (acc >= 0.6) return 'mid'
  return 'weak'
}
