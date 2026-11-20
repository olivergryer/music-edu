import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ajouterCorrection, appliquerCorrections, entreesVoisines, recouvrement, type Correction } from './corrections.ts'
import type { NoteBrute } from './annotation.ts'
import type { Planning } from './dsp/types.ts'

const planning = { sampleRate: 48000, gain: 0.1, evenements: [
  { tDebut: 0, tFin: 2, entree: 0 }, { tDebut: 2, tFin: 4, entree: 1 }, { tDebut: 4, tFin: 6, entree: 2 },
] } as unknown as Planning
const note = (tOn: number, tOff: number, extra: Partial<NoteBrute> = {}): NoteBrute => ({ tOn, tOff, f0Hz: 440, ...extra })

test('recouvrement et remplacement d\'une correction sur la même note', () => {
  assert.ok(recouvrement({ tOn: 0, tOff: 1 }, { tOn: 0.2, tOff: 0.9 }) === 1)
  assert.equal(recouvrement({ tOn: 0, tOff: 1 }, { tOn: 1, tOff: 2 }), 0)
  const a: Correction = { tOn: 0, tOff: 1, action: 'supprimer' }
  const l = ajouterCorrection(ajouterCorrection([], a), { tOn: 0.1, tOff: 1, action: 'entree', entree: 1 })
  assert.equal(l.length, 1)
  assert.equal(l[0].action, 'entree')
})

test('entrées voisines : accord d\'avant et d\'après', () => {
  assert.deepEqual(entreesVoisines(planning, 2.1, 3), { courante: 1, avant: 0, apres: 2 })
  assert.deepEqual(entreesVoisines(planning, 0.1, 1), { courante: 0, avant: null, apres: 1 })
})

test('supprimer retire la note', () => {
  const r = appliquerCorrections([note(0, 1), note(1.2, 1.8)], [{ tOn: 1.2, tOff: 1.8, action: 'supprimer' }], planning)
  assert.equal(r.length, 1)
  assert.equal(r[0].tOn, 0)
})

test('deux morceaux d\'une note tenue : rattacher le petit à l\'accord d\'avant fusionne en une seule note', () => {
  const p1 = note(1.5, 2.0, { coupeApres: true, entree: 0 })
  const p2 = note(2.0, 2.08, { coupeAvant: true, entree: 1 })
  const sans = appliquerCorrections([p1, p2], [], planning)
  assert.equal(sans.length, 2)
  const r = appliquerCorrections([p1, p2], [{ tOn: 2.0, tOff: 2.08, action: 'entree', entree: 0 }], planning)
  assert.equal(r.length, 1)
  assert.equal(r[0].tOn, 1.5)
  assert.equal(r[0].tOff, 2.08)
  assert.equal(r[0].entree, 0)
  assert.ok(!r[0].coupeApres && !r[0].coupeAvant)
})

test('le rattachement à un autre accord remet les battements à zéro', () => {
  const n = note(2.2, 2.6, { entree: 1, battements: [{ voix: 0, deltaHz: 1, resolu: true } as never] })
  const r = appliquerCorrections([n], [{ tOn: 2.2, tOff: 2.6, action: 'entree', entree: 0 }], planning)
  assert.equal(r[0].entree, 0)
  assert.deepEqual(r[0].battements, [])
})
