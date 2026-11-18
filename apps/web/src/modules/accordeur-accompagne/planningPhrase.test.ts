import { test } from 'node:test'
import assert from 'node:assert/strict'
import { voixSonnantes } from './dsp/synthese.ts'
import { PHRASES_FOURNIES, modifierSlot, type Phrase } from './phrase.ts'
import { MARGE_CHIRP_S, construirePlanningPhrase, slotEtTour, tempsMusical } from './planningPhrase.ts'

const [cadence, , troisQuatre] = PHRASES_FOURNIES
const FS = 48000
const noire = (p: Phrase) => 60 / p.tempo

test('tenu : un événement par entrée, enchaînés sans silence, sans décompte par défaut', () => {
  const { planning, t0 } = construirePlanningPhrase(cadence, { sampleRate: FS })
  assert.equal(t0, MARGE_CHIRP_S)
  assert.equal(planning.clics?.length, 0)
  const ev = planning.evenements.filter(e => e.tDebut < t0 + 16 * noire(cadence) - 1e-9)
  assert.deepEqual(ev.map(e => e.entree), [0, 4, 8, 12])
  assert.ok(Math.abs(ev[0].tDebut - 0.3) < 1e-9)
  for (let i = 1; i < ev.length; i++) assert.ok(Math.abs(ev[i].tDebut - ev[i - 1].tFin) < 1e-9)
  assert.ok(Math.abs(ev[1].tDebut - (0.3 + 4 * noire(cadence))) < 1e-9)
  assert.ok(planning.gain > 0)
})

test('décompte : un clic par temps avant le départ, le premier accentué ; musique décalée d’une mesure', () => {
  const pp = construirePlanningPhrase(cadence, { sampleRate: FS, avecDecompte: true })
  const n = noire(cadence)
  assert.ok(Math.abs(pp.t0 - (0.3 + 4 * n)) < 1e-9)
  assert.equal(pp.planning.clics!.length, 4)
  assert.ok(pp.planning.clics![0].accent && !pp.planning.clics![1].accent)
  assert.ok(Math.abs(pp.planning.clics![0].t - 0.3) < 1e-9)
  assert.ok(Math.abs(pp.planning.evenements[0].tDebut - pp.t0) < 1e-9)
  assert.equal(construirePlanningPhrase({ ...cadence, decompte: 0 }, { sampleRate: FS, avecDecompte: true }).planning.clics!.length, 0)
  assert.equal(construirePlanningPhrase(troisQuatre, { sampleRate: FS, avecDecompte: true }).planning.clics!.length, 3)
})

test('formule noire : une attaque par temps ; formule blanche : un ttous les deux temps', () => {
  const noires = construirePlanningPhrase({ ...cadence, entrees: { 0: { ...cadence.entrees[0], formule: 'noire' } }, nbMesures: 1 }, { sampleRate: FS }).planning.evenements
  assert.equal(noires.length, 4)
  const blanches = construirePlanningPhrase({ ...cadence, entrees: { 0: { ...cadence.entrees[0], formule: 'blanche' } }, nbMesures: 1 }, { sampleRate: FS }).planning.evenements
  assert.equal(blanches.length, 2)
  // le relâchement commence avant l'attaque suivante : fin = attaque suivante
  assert.ok(Math.abs(noires[0].tFin - noires[1].tDebut) < 1e-9)
})

test('départ à un slot : la musique commence là, dans l’entrée en cours', () => {
  const pp = construirePlanningPhrase(cadence, { sampleRate: FS, departSlot: 6, dureeS: 6 })
  const e0 = pp.planning.evenements[0]
  assert.equal(e0.entree, 4)                                     // le slot 6 est dans l'entrée du temps 4
  assert.ok(Math.abs(e0.tDebut - pp.t0) < 1e-9)
  assert.ok(Math.abs(e0.tFin - (pp.t0 + 2 * noire(cadence))) < 1e-9)   // jusqu'au slot 8
  assert.equal(pp.planning.evenements[1].entree, 8)
})

test('boucle : les tours se suivent sans silence, sur la durée demandée', () => {
  const d = 16 * noire(cadence) + 3
  const pp = construirePlanningPhrase(cadence, { sampleRate: FS, dureeS: d })
  const e = pp.planning.evenements
  const second = e.find(x => x.tDebut > pp.t0 + 16 * noire(cadence) - 1e-9)!
  assert.equal(second.entree, 0)
  assert.ok(Math.abs(second.tDebut - (pp.t0 + 16 * noire(cadence))) < 1e-9)
  const finTour = e.find(x => x.entree === 12)!
  assert.ok(Math.abs(finTour.tFin - second.tDebut) < 1e-9)
  const sansBoucle = construirePlanningPhrase({ ...cadence, boucle: false }, { sampleRate: FS, dureeS: d })
  assert.equal(sansBoucle.planning.evenements.length, 4)
})

test('son muet : exclu de la synthèse, conservé comme référence ; volume appliqué aux partiels', () => {
  const p = modifierSlot(cadence, 0, e => ({ ...e, sons: { '3': { muet: true }, '5': { volume: 0.4 } } })).phrase
  const ev = construirePlanningPhrase(p, { sampleRate: FS }).planning.evenements[0]
  const muets = ev.voix.filter(v => v.muet)
  assert.ok(muets.length >= 1 && muets.every(v => v.role === '3' && v.partiels.every(q => q.amp === 0)))
  assert.ok(!voixSonnantes(ev).some(v => v.role === '3'))
  const quinte = ev.voix.find(v => v.role === '5')!
  assert.ok(Math.abs(quinte.partiels[0].amp - 0.4) < 1e-12 && Math.abs(quinte.partiels[1].amp - 0.2) < 1e-12)
})

test('temps musical, slot et tour', () => {
  const pp = construirePlanningPhrase(cadence, { sampleRate: FS, avecDecompte: true })
  const n = noire(cadence)
  assert.ok(Math.abs(tempsMusical(pp, pp.t0 + 5 * n) - 5) < 1e-9)
  const a = slotEtTour(pp, pp.t0 + 5.5 * n)
  assert.equal(a.slot, 5); assert.equal(a.tour, 0); assert.ok(Math.abs(a.fraction - 0.5) < 1e-9)
  const s = slotEtTour(pp, pp.t0 + 17.25 * n)
  assert.equal(s.slot, 1); assert.equal(s.tour, 1)
  assert.ok(slotEtTour(pp, pp.t0 - 2 * n).tour === -1)          // pendant le décompte
})
