// ─── Encodage compact des items (spec §11) ────────────────────────────────────
//
// Tuple `[itemIndex, diatonicAttendu, degréRépondu, rtMs, flagsBitmask]` — coïncide
// avec `EncodedItem` de la couche de persistance générique (lib/moduleProgress).
// Pas d'écriture par item : ces tuples sont bufferisés puis flushés en 1 write.

import type { EncodedItem } from '../../lib/moduleProgress.ts'
import { degreeOfName } from './diatonic.ts'
import type { Attempt, AttemptFlag } from './types.ts'

// Bits de flags (ordre figé).
const FLAG_BITS: Record<AttemptFlag, number> = { guess: 1, slow: 2, firstOfLine: 4 }
const ALL_FLAGS: AttemptFlag[] = ['guess', 'slow', 'firstOfLine']

export function flagsToBitmask(flags: AttemptFlag[]): number {
  return flags.reduce((m, f) => m | (FLAG_BITS[f] ?? 0), 0)
}

export function bitmaskToFlags(mask: number): AttemptFlag[] {
  return ALL_FLAGS.filter(f => (mask & FLAG_BITS[f]) !== 0)
}

// Attempt → tuple compact. `expected` = index diatonique attendu (dérive le nom
// correct) ; `answered` = degré (0..6) du nom répondu.
export function encodeAttempt(attempt: Attempt, itemIndex: number): EncodedItem {
  return [
    itemIndex,
    attempt.diatonicIndex,
    degreeOfName(attempt.answered),
    Math.round(attempt.rtMs),
    flagsToBitmask(attempt.flags),
  ]
}
