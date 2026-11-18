import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tonalite, type EntreeSlot } from './phrase.ts'
import { hzDeMidi, realiserEntree, sonsDeLEntree } from './realisation.ts'
import { cibleReferentiel, classerNote, ecartBordure, ecartEtranger, ecartSurSon, estJuste } from './references.ts'

const doMaj: EntreeSlot = { tonalite: tonalite('Do', 'majeur'), degre: 1, qualite: 'maj', renversement: 0, formule: 'tenu', accordage: 'juste', sons: {} }
const sons = (e: EntreeSlot = doMaj) => sonsDeLEntree(e, realiserEntree(e), 442)

test('cibles du référentiel', () => {
  assert.equal(cibleReferentiel('tempere', 'maj', 4), 0)
  assert.ok(Math.abs(cibleReferentiel('5-limite', 'maj', 4) - -13.7) < 0.01)
  assert.ok(Math.abs(cibleReferentiel('5-limite', 'dom7', 10) - -31.175) < 0.01)
  assert.equal(cibleReferentiel('utilisateur', 'maj', 4, [0, 0, 0, 6]), 6)
})

test('bordure : cents réglés − cible ; accord et référentiel coïncidents → tout juste', () => {
  const ref = '5-limite'
  for (const s of sons()) assert.ok(Math.abs(ecartBordure(s.cents, ref, 'maj', s.intervalle)) < 0.01)
  const tierce = sons().find((s) => s.role === '3')!
  assert.ok(Math.abs(ecartBordure(0, ref, 'maj', tierce.intervalle) - 13.7) < 0.01)     // glissé au tempéré
  assert.equal(ecartBordure(-7, 'tempere', 'maj', 4), -7)
})

test('écart sur un son : octave la plus proche, signé', () => {
  const f = hzDeMidi(64, 442)
  assert.ok(Math.abs(ecartSurSon(f * Math.pow(2, 3 / 1200), f) - 3) < 1e-9)
  assert.ok(Math.abs(ecartSurSon(f * 2 * Math.pow(2, -5 / 1200), f) - -5) < 1e-9)
  assert.ok(Math.abs(ecartSurSon((f / 4) * Math.pow(2, 12 / 1200), f) - 12) < 1e-9)
})

test('note de l’élève rattachée au son de l’accord, sonnant ou muet', () => {
  const s = sons()
  const tierce = s.find((x) => x.role === '3')!
  const hz = tierce.hz * 2 * Math.pow(2, 9 / 1200)               // une octave plus haut, +9 ¢
  const c = classerNote(hz, s, 0, '5-limite')
  assert.equal(c.type, 'son')
  if (c.type === 'son') { assert.equal(c.son.role, '3'); assert.ok(Math.abs(c.ecart - 9) < 1e-9) }
  const mute: EntreeSlot = { ...doMaj, sons: { '3': { muet: true } } }
  const cm = classerNote(hz, sons(mute), 0, '5-limite')
  assert.equal(cm.type, 'son')                                    // le son muet sert de référence virtuelle
  if (cm.type === 'son') assert.ok(cm.son.muet)
})

test('l’écart suit le son réglé, pas une cible théorique', () => {
  const regle: EntreeSlot = { ...doMaj, sons: { '3': { cents: 8 } } }
  const s = sons(regle)
  const t = s.find((x) => x.role === '3')!
  const c = classerNote(t.hz, s, 0, '5-limite')
  assert.equal(c.type, 'son')
  if (c.type === 'son') assert.ok(Math.abs(c.ecart) < 1e-9)
})

test('note étrangère : comparée au référentiel depuis la tonique de la tonalité', () => {
  const s = sons()
  const re = hzDeMidi(74, 442) * Math.pow(2, 7 / 1200)            // Ré5 +7 ¢ (tempéré)
  const c = classerNote(re, s, 0, 'tempere')
  assert.equal(c.type, 'etrangere')
  assert.ok(Math.abs(c.ecart - 7) < 1e-6)
  // en 5-limite depuis Do, le Ré juste (9/8) est à +3,9 ¢ du tempéré
  const reJuste = hzDeMidi(74, 442) * Math.pow(2, 3.9 / 1200)
  assert.ok(Math.abs(ecartEtranger(reJuste, 0, '5-limite')) < 0.05)
  // l’écart dépend de la tonique : depuis Ré, la même fréquence est une tonique (0 en tempéré)
  assert.ok(Math.abs(ecartEtranger(hzDeMidi(74, 442), 2, '5-limite')) < 1e-6)
})

test('au-delà de 50 ¢ d’un son : étrangère', () => {
  const s = sons()
  const t = s.find((x) => x.role === '5')!
  assert.equal(classerNote(t.hz * Math.pow(2, 60 / 1200), s, 0, 'tempere').type, 'etrangere')
  assert.equal(classerNote(t.hz * Math.pow(2, 45 / 1200), s, 0, 'tempere').type, 'son')
})

test('seuil « juste »', () => {
  assert.ok(estJuste(5, 5)); assert.ok(estJuste(-4.9, 5)); assert.ok(!estJuste(5.1, 5))
})
