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

test('correction d\'un bout : la tête qui déborde est rattachée à un autre accord sans toucher le reste', () => {
  // une note de 1,6 s à 2,4 s, d'un seul tenant (entrée 1 au milieu : le planning change à 2)
  const n = note(1.5, 3.1, { entree: 1 })
  const r = appliquerCorrections([n], [{ tOn: 1.5, tOff: 3.1, action: 'entree', entree: 2, bout: { t0: 2.9, t1: 3.1 } }], planning)
  assert.equal(r.length, 2)
  assert.equal(r[0].entree, 1); assert.equal(r[1].entree, 2)
  assert.ok(Math.abs(r[0].tOff - 2.9) < 1e-9 && Math.abs(r[1].tOn - 2.9) < 1e-9)
})

test('retirer un bout au bord raccourcit la note (sans la fusionner de nouveau)', () => {
  const n = note(1.9, 3.0, { entree: 0, coupeApres: false })
  const r = appliquerCorrections([n], [{ tOn: 1.9, tOff: 3.0, action: 'supprimer', bout: { t0: 1.9, t1: 2.0 } }], planning)
  assert.equal(r.length, 1)
  assert.ok(Math.abs(r[0].tOn - 2.0) < 1e-9)
})

test('les corrections suivent la note quand le décalage temporel change', () => {
  const n = note(1.0, 1.5)
  // correction créée avec un décalage de +0,1 s : elle est enregistrée en temps sans décalage (0,9 à 1,4)
  const r = appliquerCorrections([{ ...n, tOn: 1.1, tOff: 1.6 }], [{ tOn: 0.9, tOff: 1.4, action: 'supprimer' }], planning, 0.1)
  assert.equal(r.length, 0)
  const r2 = appliquerCorrections([{ ...n, tOn: 1.3, tOff: 1.8 }], [{ tOn: 0.9, tOff: 1.4, action: 'supprimer' }], planning, 0.3)
  assert.equal(r2.length, 0)
})

test('une suppression de bout n\'écrase pas une correction de note entière', () => {
  const l = ajouterCorrection(ajouterCorrection([], { tOn: 0, tOff: 1, action: 'supprimer' }), { tOn: 0, tOff: 1, action: 'entree', entree: 1, bout: { t0: 0.8, t1: 1 } })
  assert.equal(l.length, 2)
})
