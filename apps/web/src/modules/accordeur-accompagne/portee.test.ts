import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PHRASES_FOURNIES, modifierSlot } from './phrase.ts'
import { coupuresDePhrase, coupuresDeTour, decouperNote, largeurMesure, liaisons, mesureDe, tempsDansTour, xDeTemps } from './portee.ts'

const [a, , c] = PHRASES_FOURNIES

test('coupures : barres de mesure et débuts d’entrées explicites', () => {
  assert.deepEqual(coupuresDePhrase(a), [4, 8, 12, 16])
  const { phrase } = modifierSlot(a, 6, (x) => x)
  assert.deepEqual(coupuresDePhrase(phrase), [4, 6, 8, 12, 16])
  assert.deepEqual(coupuresDePhrase(c), [3, 6, 9, 12])
})

test('une note qui passe la barre devient deux têtes liées', () => {
  const note = { tOn: 3.3, tOff: 4.3 }
  const m = decouperNote(note, coupuresDePhrase(a), 4)
  assert.equal(m.length, 2)
  assert.deepEqual(m.map((x) => [x.debut, x.fin, x.mesure]), [[3.3, 4, 0], [4, 4.3, 1]])
  assert.deepEqual(m.map((x) => [x.lieeAvant, x.lieeApres]), [[false, true], [true, false]])
  assert.deepEqual(liaisons(m), [[0, 1]])
})

test('une note à travers un changement d’accord est découpée, même dans une mesure', () => {
  const { phrase } = modifierSlot(a, 6, (x) => x)               // entrée explicite au temps 6
  const m = decouperNote({ tOn: 5, tOff: 7.5 }, coupuresDePhrase(phrase), 4)
  assert.equal(m.length, 2)
  assert.deepEqual(m.map((x) => [x.debut, x.fin, x.mesure]), [[5, 6, 1], [6, 7.5, 1]])
  assert.deepEqual(liaisons(m), [[0, 1]])
})

test('note sur deux coupures : trois morceaux, deux liaisons ; note simple : un morceau sans liaison', () => {
  const { phrase } = modifierSlot(a, 6, (x) => x)
  const m = decouperNote({ tOn: 5, tOff: 9 }, coupuresDePhrase(phrase), 4)
  assert.equal(m.length, 3)
  assert.deepEqual(liaisons(m), [[0, 1], [1, 2]])
  const s = decouperNote({ tOn: 1, tOff: 2 }, coupuresDePhrase(a), 4)
  assert.equal(s.length, 1)
  assert.deepEqual(liaisons(s), [])
  assert.equal(decouperNote({ tOn: 2, tOff: 4 }, coupuresDePhrase(a), 4).length, 1)   // finit pile sur la barre
})

test('coupures sur plusieurs tours de boucle', () => {
  const cs = coupuresDeTour(a, 32)
  assert.ok(cs.includes(16) && cs.includes(20) && cs.includes(32))
  const m = decouperNote({ tOn: 15.5, tOff: 16.5 }, cs, 4)
  assert.equal(m.length, 2)
  assert.deepEqual(tempsDansTour(a, 17), { tour: 1, t: 1 })
  assert.deepEqual(tempsDansTour(a, 3), { tour: 0, t: 3 })
})

test('placement : mesure d’un instant, abscisse, largeur de mesure', () => {
  assert.equal(mesureDe(a, 3.99), 0)
  assert.equal(mesureDe(a, 4), 1)
  assert.equal(mesureDe(c, 6), 2)
  assert.equal(xDeTemps(3.3, 44, 54), 44 + 3.3 * 54)
  assert.equal(largeurMesure(a, 54), 216)
  assert.equal(largeurMesure(c, 54), 162)
})
