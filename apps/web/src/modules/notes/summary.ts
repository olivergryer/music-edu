// ─── Résumé de session (spec §11, §13.8) ──────────────────────────────────────
//
// cvIntervalles = coefficient de variation des intervalles ENTRE réponses. C'est
// le proxy passif d'automatisation : calculé et stocké dès la v1 même sans
// exploitation, car non reconstituable a posteriori. Si les horodatages absolus
// (`atMs`) sont présents on prend les vrais intervalles inter-réponses ; sinon on
// se rabat sur la série des RT comme proxy de régularité du débit.

import { coefficientOfVariation, median } from './stats.ts'
import type { Attempt, NotesSummary } from './types.ts'

function diffs(xs: number[]): number[] {
  const out: number[] = []
  for (let i = 1; i < xs.length; i++) out.push(xs[i] - xs[i - 1])
  return out
}

export function computeSessionSummary(attempts: Attempt[]): NotesSummary {
  const itemCount = attempts.length
  const nonGuess = attempts.filter(a => !a.flags.includes('guess'))

  const accuracy = nonGuess.length
    ? nonGuess.filter(a => a.correct).length / nonGuess.length
    : 0

  const medianRtMs = median(nonGuess.map(a => a.rtMs))

  // Débit notes/min : depuis le span d'horodatages si dispo, sinon somme des RT.
  const times = attempts.map(a => a.atMs).filter((t): t is number => t != null)
  let spanMs = 0
  if (times.length >= 2) {
    spanMs = times[times.length - 1] - times[0]
  } else {
    spanMs = attempts.reduce((s, a) => s + a.rtMs, 0)
  }
  const debitNotesMin = spanMs > 0 ? (itemCount / (spanMs / 60000)) : 0

  // Intervalles inter-réponses : vrais diffs d'horodatage si dispo, sinon RT.
  const intervals = times.length >= 3 ? diffs(times) : attempts.map(a => a.rtMs)
  const cvIntervalles = coefficientOfVariation(intervals)

  return { itemCount, accuracy, medianRtMs, debitNotesMin, cvIntervalles }
}
