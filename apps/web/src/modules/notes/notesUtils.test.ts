// Tests des utilitaires purs : diatonic, stats, rng, roue, encodage.
// node --test "src/**/*.test.ts"

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { degreeOf, octaveOf, noteNameOf, degreeOfName, toVexKey, diatonic } from './diatonic.ts'
import { mean, median, stddev, coefficientOfVariation } from './stats.ts'
import { mulberry32, weightedPick } from './rng.ts'
import { angleToNoteName, noteNameFromVector, sectorCenterAngle, sectorIndexFromAngle } from './wheelGeometry.ts'
import { encodeAttempt, flagsToBitmask, bitmaskToFlags } from './encode.ts'
import { NOTE_NAMES, type Attempt } from './types.ts'

// ── diatonic ────────────────────────────────────────────────────────────────
test('diatonic : do3 = index 21, do central', () => {
  assert.equal(diatonic(3, 0), 21)
  assert.equal(degreeOf(21), 0)
  assert.equal(octaveOf(21), 3)
  assert.equal(noteNameOf(21), 'do')
  assert.equal(toVexKey(21), 'c/4') // do3 = C4 scientifique
})

test('diatonic : positions de portée en clef de sol', () => {
  assert.equal(toVexKey(23), 'e/4') // mi3 = ligne du bas
  assert.equal(toVexKey(25), 'g/4') // sol3 = 2e ligne
  assert.equal(noteNameOf(25), 'sol')
  assert.equal(degreeOfName('sol'), 4)
  assert.equal(degreeOfName('si'), 6)
})

test('diatonic : index négatif reste cohérent', () => {
  assert.equal(degreeOf(-1), 6)   // si
  assert.equal(noteNameOf(-1), 'si')
})

// ── stats ─────────────────────────────────────────────────────────────────────
test('stats : moyenne, médiane, écart-type, CV', () => {
  assert.equal(mean([2, 4, 6]), 4)
  assert.equal(median([3, 1, 2]), 2)
  assert.equal(median([1, 2, 3, 4]), 2.5)
  assert.equal(stddev([5, 5, 5]), 0)
  assert.equal(coefficientOfVariation([5, 5, 5]), 0)      // moyenne ≠ 0, dispersion 0
  assert.ok(coefficientOfVariation([1, 5, 9]) > 0)
  assert.equal(coefficientOfVariation([42]), 0)           // < 2 points
})

// ── rng ─────────────────────────────────────────────────────────────────────
test('rng : mulberry32 déterministe pour une graine', () => {
  const a = mulberry32(123)
  const b = mulberry32(123)
  const seqA = [a(), a(), a()]
  const seqB = [b(), b(), b()]
  assert.deepEqual(seqA, seqB)
  for (const x of seqA) assert.ok(x >= 0 && x < 1)
  const c = mulberry32(124)
  assert.notEqual(c(), seqA[0])
})

test('rng : weightedPick respecte les poids nuls', () => {
  const rng = mulberry32(1)
  for (let i = 0; i < 50; i++) {
    assert.equal(weightedPick([0, 0, 1], rng), 2)   // seul index non nul
  }
  assert.equal(weightedPick([0, 0, 0], mulberry32(1)), -1)
  // index à poids nul jamais choisi
  const counts = [0, 0, 0]
  const r = mulberry32(7)
  for (let i = 0; i < 300; i++) counts[weightedPick([1, 0, 2], r)]++
  assert.equal(counts[1], 0)
  assert.ok(counts[0] > 0 && counts[2] > counts[0]) // poids 2 > poids 1
})

// ── roue radiale ──────────────────────────────────────────────────────────────
test('roue : do à 12 h, sens horaire', () => {
  // Haut (dx=0, dy=-1) → do
  assert.equal(angleToNoteName(Math.atan2(-1, 0)), 'do')
  // Droite (dx=1, dy=0) → mi (≈ 90° horaire depuis le haut)
  assert.equal(angleToNoteName(Math.atan2(0, 1)), 'mi')
  // Bas (dx=0, dy=1) → sol
  assert.equal(angleToNoteName(Math.atan2(1, 0)), 'sol')
})

test('roue : round-trip centre de secteur → nom', () => {
  for (let i = 0; i < 7; i++) {
    assert.equal(sectorIndexFromAngle(sectorCenterAngle(i)), i)
    assert.equal(angleToNoteName(sectorCenterAngle(i)), NOTE_NAMES[i])
  }
})

test('roue : zone morte → null', () => {
  assert.equal(angleToNoteName(0, 5, 20), null)        // dist < rayon mort
  assert.notEqual(angleToNoteName(0, 25, 20), null)
  assert.equal(noteNameFromVector(3, 4, 20), null)      // dist 5 < 20
  assert.equal(noteNameFromVector(0, -30, 20), 'do')    // haut, hors zone morte
})

// ── encodage ──────────────────────────────────────────────────────────────────
test('encode : bitmask aller-retour', () => {
  assert.equal(flagsToBitmask(['guess']), 1)
  assert.equal(flagsToBitmask(['slow']), 2)
  assert.equal(flagsToBitmask(['guess', 'firstOfLine']), 5)
  assert.deepEqual(bitmaskToFlags(5), ['guess', 'firstOfLine'])
  assert.deepEqual(bitmaskToFlags(0), [])
})

test('encode : tuple compact [index, attendu, degréRépondu, rt, flags]', () => {
  const attempt: Attempt = {
    itemId: 'treble:25', clef: 'treble', diatonicIndex: 25,
    answered: 'sol', correct: true, rtMs: 1200.6, flags: ['slow'],
  }
  assert.deepEqual(encodeAttempt(attempt, 3), [3, 25, 4, 1201, 2])
})
