// Tests pool + sélection d'items + génération de lignes.
// node --test "src/**/*.test.ts"

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildPool, resolveAmbitusStep } from './pool.ts'
import { selectNextItem, itemWeight, generateLine, DEFAULT_LINE_WEIGHTS, type SelectionContext } from './selection.ts'
import { READING_PROFILES } from './profiles.ts'
import { degreeOf } from './diatonic.ts'
import { mulberry32 } from './rng.ts'
import type { Mastery, NoteMastery } from './types.ts'

const tmid = READING_PROFILES['treble-mid']

const STABLE = new Set([0, 2, 4]) // do/mi/sol

// ── pool ──────────────────────────────────────────────────────────────────────
test('buildPool P0 = repères, triés et dédoublonnés', () => {
  const pool = buildPool(tmid, 'P0')
  assert.deepEqual(pool.map(p => p.diatonicIndex), [...tmid.landmarks].sort((a, b) => a - b))
  assert.ok(pool.every(p => p.clef === 'treble' && p.id === `treble:${p.diatonicIndex}`))
})

test('buildPool P1 = plage low..high de l\'étape', () => {
  const { low, high } = tmid.ambitusSequence[0]
  const pool = buildPool(tmid, 'P1', 0)
  assert.equal(pool.length, high - low + 1)
  assert.equal(pool[0].diatonicIndex, low)
  assert.equal(pool[pool.length - 1].diatonicIndex, high)
})

test('buildPool P2 sans étape = ambitus cible (dernière étape)', () => {
  const last = tmid.ambitusSequence.length - 1
  const pool = buildPool(tmid, 'P2')
  assert.equal(pool[0].diatonicIndex, tmid.ambitusSequence[last].low)
  assert.equal(resolveAmbitusStep(tmid, 'P2'), last)
  assert.equal(resolveAmbitusStep(tmid, 'P1', 99), last) // clamp
})

// ── itemWeight ──────────────────────────────────────────────────────────────
const ctx: SelectionContext = { rtTargetMs: 1500, floorWeight: 0.15, turn: 100 }

test('itemWeight : item précédent exclu (poids 0)', () => {
  const pool = buildPool(tmid, 'P1', 1)
  const w = itemWeight(pool[0], {}, { ...ctx, previousItemId: pool[0].id })
  assert.equal(w, 0)
})

test('itemWeight : item lent+fautif pèse plus qu\'un item rapide+juste', () => {
  const pool = buildPool(tmid, 'P1', 1)
  const hard: NoteMastery = { attempts: 5, correct: 1, recent: [false, false, true, false], rtSamples: [3000, 3200, 2900], lastPlayedTurn: 90 }
  const easy: NoteMastery = { attempts: 5, correct: 5, recent: [true, true, true, true], rtSamples: [700, 800, 750], lastPlayedTurn: 98 }
  const mastery: Mastery = { [pool[0].id]: hard, [pool[1].id]: easy }
  assert.ok(itemWeight(pool[0], mastery, ctx) > itemWeight(pool[1], mastery, ctx))
})

test('itemWeight : item maîtrisé garde le plancher de rétention', () => {
  const pool = buildPool(tmid, 'P1', 1)
  const perfect: NoteMastery = { attempts: 20, correct: 20, recent: [true, true, true, true, true], rtSamples: [400, 400, 400], lastPlayedTurn: 100 }
  const w = itemWeight(pool[0], { [pool[0].id]: perfect }, ctx)
  assert.ok(w >= ctx.floorWeight)
})

// ── selectNextItem ────────────────────────────────────────────────────────────
test('selectNextItem : jamais deux fois le même consécutivement', () => {
  const pool = buildPool(tmid, 'P1', 2)
  const rng = mulberry32(42)
  let prev: string | undefined
  for (let i = 0; i < 500; i++) {
    const it = selectNextItem(pool, {}, rng, { ...ctx, turn: i, previousItemId: prev })
    assert.notEqual(it.id, prev)
    prev = it.id
  }
})

test('selectNextItem : pool singleton renvoie l\'unique item', () => {
  const pool = buildPool(tmid, 'P1', 0).slice(0, 1)
  assert.equal(selectNextItem(pool, {}, mulberry32(1), ctx).id, pool[0].id)
})

test('selectNextItem : déterministe à graine fixe', () => {
  const pool = buildPool(tmid, 'P1', 2)
  const draw = (seed: number) => {
    const rng = mulberry32(seed)
    return Array.from({ length: 10 }, (_, i) => selectNextItem(pool, {}, rng, { ...ctx, turn: i }).id)
  }
  assert.deepEqual(draw(7), draw(7))
})

// ── generateLine ──────────────────────────────────────────────────────────────
test('generateLine : longueur, début/fin stables, tout dans le pool', () => {
  const pool = buildPool(tmid, 'P2')
  const idxSet = new Set(pool.map(p => p.diatonicIndex))
  const rng = mulberry32(9)
  for (let k = 0; k < 30; k++) {
    const line = generateLine(pool, DEFAULT_LINE_WEIGHTS, rng, 8)
    assert.equal(line.length, 8)
    assert.ok(STABLE.has(degreeOf(line[0].diatonicIndex)), 'début stable')
    assert.ok(STABLE.has(degreeOf(line[line.length - 1].diatonicIndex)), 'fin stable')
    assert.ok(line.every(it => idxSet.has(it.diatonicIndex) && it.clef === 'treble'))
  }
})

test('generateLine : le mouvement conjoint domine (~65%)', () => {
  const pool = buildPool(tmid, 'P2')
  const rng = mulberry32(3)
  let conjoint = 0, total = 0
  for (let k = 0; k < 200; k++) {
    const line = generateLine(pool, DEFAULT_LINE_WEIGHTS, rng, 8)
    for (let i = 1; i < line.length - 1; i++) { // hors dernière note (forcée stable)
      if (Math.abs(line[i].diatonicIndex - line[i - 1].diatonicIndex) === 1) conjoint++
      total++
    }
  }
  const ratio = conjoint / total
  assert.ok(ratio > 0.45, `mouvement conjoint dominant, reçu ${ratio.toFixed(2)}`)
})
