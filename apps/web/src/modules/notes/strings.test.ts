// node --test "src/**/*.test.ts"
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { STRING_OPEN, STRING_COLORS, isStringInstrument, stringColorOf, stringPool } from './strings.ts'
import { diatonic, noteNameOf, octaveOf } from './diatonic.ts'

test('les 4 instruments à cordes ont 4 cordes à vide', () => {
  for (const id of ['violon', 'alto', 'violoncelle', 'contrebasse']) {
    assert.ok(isStringInstrument(id), id)
    assert.equal(STRING_OPEN[id].length, 4, id)
  }
  assert.ok(!isStringInstrument('flute'))
})

test('cordes à vide du violon = sol2 ré3 la3 mi4', () => {
  assert.deepEqual(STRING_OPEN.violon, [diatonic(2, 4), diatonic(3, 1), diatonic(3, 5), diatonic(4, 2)])
  assert.deepEqual(STRING_OPEN.violon.map(noteNameOf), ['sol', 're', 'la', 'mi'])
})

test('P0 = cordes à vide (4 items), avec la clef donnée', () => {
  const pool = stringPool('violon', 'treble', 'P0', 1)
  assert.equal(pool.length, 4)
  assert.deepEqual(pool.map(p => p.diatonicIndex), STRING_OPEN.violon)
  assert.ok(pool.every(p => p.clef === 'treble'))
})

test('P1 +1 doigt inclut cordes à vide + 1 degré au-dessus', () => {
  const pool = stringPool('violon', 'treble', 'P1', 1).map(p => p.diatonicIndex)
  for (const o of STRING_OPEN.violon) {
    assert.ok(pool.includes(o), `open ${o}`)
    assert.ok(pool.includes(o + 1), `open+1 ${o + 1}`)
  }
  // pas de +2
  assert.ok(!pool.includes(STRING_OPEN.violon[0] + 2))
})

test('P1 +3 ⊂ P2 (ensemble complet), trié et dédoublonné', () => {
  const p1 = stringPool('violon', 'treble', 'P1', 3).map(p => p.diatonicIndex)
  const p2 = stringPool('violon', 'treble', 'P2', 3).map(p => p.diatonicIndex)
  assert.deepEqual(p1, p2)
  assert.deepEqual(p2, [...p2].sort((a, b) => a - b))
  assert.equal(new Set(p2).size, p2.length)
})

test('couleur par corde : chaque note prend la couleur de sa corde', () => {
  const [g, d] = STRING_OPEN.violon
  assert.equal(stringColorOf(g, 'violon'), STRING_COLORS[0])       // sol2 → corde 0
  assert.equal(stringColorOf(g + 1, 'violon'), STRING_COLORS[0])   // sol2+1 reste corde 0
  assert.equal(stringColorOf(d, 'violon'), STRING_COLORS[1])       // ré3 → corde 1
  assert.equal(stringColorOf(9999, 'violon'), STRING_COLORS[3])    // très aigu → corde la plus haute
  assert.equal(stringColorOf(20, 'flute'), undefined)
})

test('contrebasse : cordes ÉCRITES une octave au-dessus du son', () => {
  // mi1 écrit (E2) = diatonic(1,2)
  assert.equal(STRING_OPEN.contrebasse[0], diatonic(1, 2))
  assert.equal(octaveOf(STRING_OPEN.contrebasse[0]), 1)
})
