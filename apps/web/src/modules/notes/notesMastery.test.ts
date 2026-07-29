// Tests classification d'essai, maîtrise, transitions de phase.
// node --test "src/**/*.test.ts"

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { classifyAttempt, updateMastery, shouldUnlock, shouldRegress, nextPhase, type PhaseEval } from './mastery.ts'
import type { Attempt, Mastery } from './types.ts'

const cfg = { guessFloorMs: 500, slowCeilingMs: 4000 }

const mkAttempt = (o: Partial<Attempt>): Attempt => ({
  itemId: 'treble:25', clef: 'treble', diatonicIndex: 25,
  answered: 'sol', correct: true, rtMs: 1200, flags: [], ...o,
})

// ── classifyAttempt ────────────────────────────────────────────────────────────
test('classifyAttempt : guess = RT sous plancher ET faux', () => {
  assert.deepEqual(classifyAttempt(300, false, cfg), ['guess'])
  assert.deepEqual(classifyAttempt(300, true, cfg), [])       // rapide mais juste ≠ guess
  assert.deepEqual(classifyAttempt(1200, false, cfg), [])     // faux mais pas rapide
})

test('classifyAttempt : slow + firstOfLine', () => {
  assert.deepEqual(classifyAttempt(5000, true, cfg), ['slow'])
  assert.deepEqual(classifyAttempt(300, false, cfg, { isFirstOfLine: true }), ['guess', 'firstOfLine'])
})

// ── updateMastery ──────────────────────────────────────────────────────────────
test('updateMastery : essai normal met à jour compteurs et récence', () => {
  const m0: Mastery = {}
  const m1 = updateMastery(m0, mkAttempt({ correct: true, rtMs: 900 }), 5)
  const e = m1['treble:25']
  assert.equal(e.attempts, 1)
  assert.equal(e.correct, 1)
  assert.deepEqual(e.recent, [true])
  assert.deepEqual(e.rtSamples, [900])
  assert.equal(e.lastPlayedTurn, 5)
  assert.deepEqual(m0, {}) // immuabilité
})

test('updateMastery : guess exclu de la maîtrise mais rafraîchit la récence', () => {
  const m1 = updateMastery({}, mkAttempt({ correct: false, rtMs: 300, flags: ['guess'] }), 8)
  const e = m1['treble:25']
  assert.equal(e.attempts, 0)      // non compté
  assert.equal(e.correct, 0)
  assert.deepEqual(e.recent, [])
  assert.deepEqual(e.rtSamples, [])
  assert.equal(e.lastPlayedTurn, 8) // récence mise à jour
})

test('updateMastery : fenêtre récente bornée à 10', () => {
  let m: Mastery = {}
  for (let i = 0; i < 15; i++) m = updateMastery(m, mkAttempt({ correct: i % 2 === 0, rtMs: 1000 + i }), i)
  assert.equal(m['treble:25'].recent.length, 10)
  assert.equal(m['treble:25'].rtSamples.length, 10)
  assert.equal(m['treble:25'].attempts, 15)
})

// ── déverrouillage / régression ─────────────────────────────────────────────
const base: PhaseEval = { recentAccuracies: [], ambitusAtTarget: false, currentErrorRate: 0, guessInLast10: 0 }

test('shouldUnlock P0 : ≥95% sur 2 sessions consécutives', () => {
  assert.equal(shouldUnlock('P0', { ...base, recentAccuracies: [0.96, 0.97] }), true)
  assert.equal(shouldUnlock('P0', { ...base, recentAccuracies: [0.90, 0.97] }), false)
  assert.equal(shouldUnlock('P0', { ...base, recentAccuracies: [0.97] }), false) // besoin de 2
})

test('shouldUnlock P1 : ambitus cible atteint ET <10% erreurs', () => {
  assert.equal(shouldUnlock('P1', { ...base, ambitusAtTarget: true, currentErrorRate: 0.05 }), true)
  assert.equal(shouldUnlock('P1', { ...base, ambitusAtTarget: true, currentErrorRate: 0.2 }), false)
  assert.equal(shouldUnlock('P1', { ...base, ambitusAtTarget: false, currentErrorRate: 0.0 }), false)
  assert.equal(shouldUnlock('P2', base), false) // pas de phase au-delà
})

test('shouldRegress : surcharge de devinette (≥3/10) et erreurs P2', () => {
  assert.equal(shouldRegress('P1', { ...base, guessInLast10: 3 }), true)
  assert.equal(shouldRegress('P0', { ...base, guessInLast10: 9 }), false) // déjà au plus bas
  assert.equal(shouldRegress('P2', { ...base, currentErrorRate: 0.15 }), true)
})

test('nextPhase : régression prioritaire, sinon déverrouillage', () => {
  assert.equal(nextPhase('P0', { ...base, recentAccuracies: [0.96, 0.98] }), 'P1')
  assert.equal(nextPhase('P1', { ...base, ambitusAtTarget: true, currentErrorRate: 0.02 }), 'P2')
  assert.equal(nextPhase('P2', { ...base, guessInLast10: 4 }), 'P1')        // régression
  assert.equal(nextPhase('P1', { ...base, guessInLast10: 5, ambitusAtTarget: true, currentErrorRate: 0.0 }), 'P0') // régression > déverrouillage
  assert.equal(nextPhase('P1', base), 'P1') // statu quo
})
