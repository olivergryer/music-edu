// node --test "src/**/*.test.ts"
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  aggregatePerNote, mergePerNote, mergeContext, noteMasteryLevel, perNoteKey, contextKey,
} from './progressStats.ts'
import type { Attempt, AttemptFlag } from './types.ts'

function mk(itemId: string, correct: boolean, rtMs: number, flags: AttemptFlag[] = []): Attempt {
  const [clef, di] = itemId.split(':')
  return {
    itemId, clef: clef as Attempt['clef'], diatonicIndex: Number(di),
    answered: 'do', correct, rtMs, flags,
  }
}

test('aggregatePerNote agrège par note et exclut les guess', () => {
  const attempts = [
    mk('treble:25', true, 1000),
    mk('treble:25', false, 500, ['guess']),   // exclu
    mk('treble:25', false, 1500),
    mk('treble:27', true, 800),
  ]
  const agg = aggregatePerNote(attempts)
  assert.deepEqual(agg['treble:25'], { attempts: 2, correct: 1, sumRtMs: 2500 })
  assert.deepEqual(agg['treble:27'], { attempts: 1, correct: 1, sumRtMs: 800 })
})

test('mergePerNote cumule prev + delta sans muter', () => {
  const prev = { 'treble:25': { attempts: 2, correct: 2, sumRtMs: 2000 } }
  const delta = { 'treble:25': { attempts: 1, correct: 0, sumRtMs: 1500 }, 'treble:27': { attempts: 1, correct: 1, sumRtMs: 800 } }
  const merged = mergePerNote(prev, delta)
  assert.deepEqual(merged['treble:25'], { attempts: 3, correct: 2, sumRtMs: 3500 })
  assert.deepEqual(merged['treble:27'], { attempts: 1, correct: 1, sumRtMs: 800 })
  assert.equal(prev['treble:25'].attempts, 2) // prev intact
})

test('mergeContext incrémente et garde la meilleure exactitude', () => {
  const c1 = mergeContext(undefined, 16, 12, 20000, 0.75)
  assert.deepEqual(c1, { sessions: 1, items: 16, correct: 12, sumRtMs: 20000, bestAccuracy: 0.75 })
  const c2 = mergeContext(c1, 16, 16, 18000, 1)
  assert.equal(c2.sessions, 2)
  assert.equal(c2.items, 32)
  assert.equal(c2.bestAccuracy, 1)
  const c3 = mergeContext(c2, 10, 5, 12000, 0.5)
  assert.equal(c3.bestAccuracy, 1) // ne régresse pas
})

test('noteMasteryLevel : seuils et zone inconnue sous 3 essais', () => {
  assert.equal(noteMasteryLevel(undefined), 'unknown')
  assert.equal(noteMasteryLevel({ attempts: 2, correct: 2, sumRtMs: 0 }), 'unknown')
  assert.equal(noteMasteryLevel({ attempts: 10, correct: 10, sumRtMs: 0 }), 'strong')
  assert.equal(noteMasteryLevel({ attempts: 10, correct: 7, sumRtMs: 0 }), 'mid')
  assert.equal(noteMasteryLevel({ attempts: 10, correct: 3, sumRtMs: 0 }), 'weak')
})

test('clés stables', () => {
  assert.equal(perNoteKey('bass', 14), 'bass:14')
  assert.equal(contextKey('violon', 'treble', 'P1'), 'violon|treble|P1')
})
