// Tests du résumé de session (accuracy, débit, cvIntervalles).
// node --test "src/**/*.test.ts"

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { computeSessionSummary } from './summary.ts'
import type { Attempt } from './types.ts'

const mk = (o: Partial<Attempt>): Attempt => ({
  itemId: 'treble:25', clef: 'treble', diatonicIndex: 25,
  answered: 'sol', correct: true, rtMs: 1000, flags: [], ...o,
})

test('summary : accuracy hors guess', () => {
  const attempts = [
    mk({ correct: true }),
    mk({ correct: true }),
    mk({ correct: false }),
    mk({ correct: false, rtMs: 300, flags: ['guess'] }), // exclu
  ]
  const s = computeSessionSummary(attempts)
  assert.equal(s.itemCount, 4)
  assert.equal(s.accuracy, 2 / 3) // 2 justes sur 3 essais hors guess
})

test('summary : médiane des RT hors guess', () => {
  const attempts = [
    mk({ rtMs: 800 }), mk({ rtMs: 1200 }), mk({ rtMs: 1000 }),
    mk({ rtMs: 50, correct: false, flags: ['guess'] }),
  ]
  assert.equal(computeSessionSummary(attempts).medianRtMs, 1000)
})

test('summary : cvIntervalles = 0 pour un rythme régulier (atMs)', () => {
  const attempts = [
    mk({ atMs: 0 }), mk({ atMs: 1000 }), mk({ atMs: 2000 }), mk({ atMs: 3000 }),
  ]
  const s = computeSessionSummary(attempts)
  assert.equal(s.cvIntervalles, 0)          // intervalles [1000,1000,1000]
  assert.equal(s.debitNotesMin, 4 / (3000 / 60000)) // 4 items sur 3 s
})

test('summary : cvIntervalles > 0 pour un rythme irrégulier', () => {
  const attempts = [
    mk({ atMs: 0 }), mk({ atMs: 200 }), mk({ atMs: 2000 }), mk({ atMs: 2100 }),
  ]
  assert.ok(computeSessionSummary(attempts).cvIntervalles > 0)
})

test('summary : fallback sur les RT sans horodatage absolu', () => {
  const attempts = [mk({ rtMs: 1000 }), mk({ rtMs: 1000 }), mk({ rtMs: 1000 })]
  const s = computeSessionSummary(attempts)
  assert.equal(s.cvIntervalles, 0) // RT réguliers
  assert.ok(s.debitNotesMin > 0)
})

test('summary : session vide ne casse pas', () => {
  const s = computeSessionSummary([])
  assert.equal(s.itemCount, 0)
  assert.equal(s.accuracy, 0)
  assert.equal(s.cvIntervalles, 0)
  assert.equal(s.debitNotesMin, 0)
})
