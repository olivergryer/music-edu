import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TESSITURES } from '../harmonie/dispositions.ts'
import type { Degre, Mode, Renversement } from '../harmonie/types.ts'
import { PHRASES_FOURNIES, tonalite, modifierSlot, type EntreeSlot, type Phrase, type QualiteAccord } from './phrase.ts'
import {
  attaquesDeFormule, centsAccordage, centsDuRole, clicsDecompte, doublureLibre, dureeTourS, hzDeMidi,
  realiserEntree, realiserPhrase, reinitialiserAccordage, segmentsDePhrase, sonsDeLEntree,
} from './realisation.ts'

function e(nom: string, mode: Mode, degre: Degre, qualite: QualiteAccord, renversement: Renversement = 0, accordage: EntreeSlot['accordage'] = 'juste'): EntreeSlot {
  return { tonalite: tonalite(nom, mode), degre, qualite, renversement, formule: 'tenu', accordage, sons: {} }
}
const pcs = (r: ReturnType<typeof realiserEntree>) => r.voix.map((v) => v.midi % 12)

test('accord diatonique à 3 sons : 4 voix, tessitures du quatuor, rôles F-3-5 dont un doublé', () => {
  const r = realiserEntree(e('Do', 'majeur', 1, 'maj'))
  assert.equal(r.voix.length, 4)
  assert.deepEqual([...new Set(pcs(r))].sort((a, b) => a - b), [0, 4, 7])
  const bornes = [TESSITURES.basse, TESSITURES.tenor, TESSITURES.alto, TESSITURES.soprano]
  r.voix.forEach((v, i) => assert.ok(v.midi >= bornes[i][0] && v.midi <= bornes[i][1], `voix ${i}`))
  assert.equal(r.voix.filter((v) => v.doublee).length, 1)
  assert.equal(r.voix[0].role, 'F')
  assert.equal(r.voix.find((v) => v.role === '3')!.intervalle, 4)
})

test('septième de dominante : 4 sons, F-3-5-7, aucun doublé', () => {
  const r = realiserEntree(e('Do', 'majeur', 5, 'dom7'))
  assert.deepEqual(r.voix.map((v) => v.role).sort(), ['3', '5', '7', 'F'])
  assert.ok(r.voix.every((v) => !v.doublee))
  assert.deepEqual([...pcs(r)].sort((a, b) => a - b), [2, 5, 7, 11])   // Ré Fa Sol Si
})

test('renversement : la basse porte le son demandé', () => {
  const r = realiserEntree(e('Do', 'majeur', 5, 'dom7', 1))
  assert.equal(r.voix[0].midi % 12, 11)       // Si à la basse
  assert.equal(r.voix[0].role, '3')
  const r2 = realiserEntree(e('Do', 'majeur', 1, 'maj', 2))
  assert.equal(r2.voix[0].midi % 12, 7)
})

test('hors tonalité : dispositionLibre et règle de doublure', () => {
  assert.equal(doublureLibre('min', 0), 0)
  assert.equal(doublureLibre('min', 1), 0)
  assert.equal(doublureLibre('min', 2), 2)           // basse doublée au 2e renversement
  assert.equal(doublureLibre('dim', 0), 1)           // diminué : tierce toujours doublée
  assert.equal(doublureLibre('dim', 2), 1)
  assert.equal(doublureLibre('dom7', 0), null)
  const r = realiserEntree(e('Do', 'majeur', 1, 'min'))
  assert.deepEqual([...new Set(pcs(r))].sort((a, b) => a - b), [0, 3, 7])
  assert.equal(r.voix.find((v) => v.doublee)!.role, 'F')
  const d = realiserEntree(e('Do', 'majeur', 7, 'dim'))
  assert.equal(d.voix.find((v) => v.doublee)!.role, '3')
  const q = realiserEntree(e('Do', 'majeur', 2, 'dom7'))   // Ré7 en do majeur : Ré Fa♯ La Do
  assert.deepEqual([...pcs(q)].sort((a, b) => a - b), [0, 2, 6, 9])
})

test('registre : décalage global de l’accompagnement', () => {
  const a = realiserEntree(e('Do', 'majeur', 1, 'maj'), 48, 0)
  const b = realiserEntree(e('Do', 'majeur', 1, 'maj'), 48, 12)
  b.voix.forEach((v, i) => assert.equal(v.midi, a.voix[i].midi + 12))
  assert.equal(b.basse, a.basse)           // `basse` reste hors registre, pour enchaîner
})

test('continuité de la basse sur une phrase', () => {
  const m = realiserPhrase(PHRASES_FOURNIES[0])
  const basses = [...m.values()].map((r) => r.basse)
  for (let i = 1; i < basses.length; i++) assert.ok(Math.abs(basses[i] - basses[i - 1]) <= 7, `${basses}`)
  assert.equal(basses[0] % 12, 0)
})

test('accordage : tempéré, juste (mémoire harmonique du générateur), utilisateur', () => {
  assert.equal(centsAccordage('tempere', 'maj', 4), 0)
  const j = (q: QualiteAccord, i: number) => centsAccordage('juste', q, i)
  assert.equal(j('maj', 0), 0)
  assert.ok(Math.abs(j('maj', 4) - -13.7) < 0.01)      // tierce majeure
  assert.ok(Math.abs(j('min', 3) - 15.6) < 0.01)       // tierce mineure
  assert.ok(Math.abs(j('maj', 7) - 2.0) < 0.01)        // quinte
  assert.ok(Math.abs(j('dim', 6) - -17.5) < 0.01)      // quinte diminuée
  assert.ok(Math.abs(j('min7', 10) - -3.9) < 0.01)     // septième mineure ordinaire
  assert.ok(Math.abs(j('dom7', 10) - -31.175) < 0.01)  // septième de dominante à 7:4
  assert.ok(Math.abs(j('maj7', 11) - -11.7) < 0.01)
  assert.ok(Math.abs(j('dim7', 9) - -15.6) < 0.01)     // septième diminuée
  assert.ok(Math.abs(j('minmaj7', 11) - -11.7) < 0.01)
  const temp = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
  assert.equal(centsAccordage('utilisateur', 'maj', 4, temp), 4)
  assert.equal(centsAccordage('utilisateur', 'maj', 0, temp), 0)
  assert.equal(centsAccordage('utilisateur', 'maj', 4, []), 0)    // clé absente
})

test('réglage manuel : remplace l’accordage pour tous les sons du rôle ; réinitialiser l’efface', () => {
  const base = e('Do', 'majeur', 1, 'maj')
  const reglee: EntreeSlot = { ...base, sons: { '3': { cents: 5, volume: 0.5 }, '5': { muet: true } } }
  assert.equal(centsDuRole(reglee, '3', 4), 5)
  assert.ok(Math.abs(centsDuRole(reglee, '5', 7) - 2) < 0.01)
  const r = realiserEntree(reglee)
  const sons = sonsDeLEntree(reglee, r)
  const tierces = sons.filter((s) => s.role === '3')
  assert.ok(tierces.every((s) => s.cents === 5 && s.volume === 0.5))
  assert.ok(sons.filter((s) => s.role === '5').every((s) => s.muet))
  const init = reinitialiserAccordage(reglee)
  assert.equal(init.sons['3']?.cents, undefined)
  assert.equal(init.sons['3']?.volume, 0.5)         // le volume reste
  assert.equal(centsDuRole(init, '3', 4), centsAccordage('juste', 'maj', 4))
})

test('fréquences : diapason et cents', () => {
  assert.equal(hzDeMidi(69, 442), 442)
  assert.ok(Math.abs(hzDeMidi(81, 442) - 884) < 1e-9)
  const x = e('La', 'mineur', 1, 'min', 0, 'tempere')
  const sons = sonsDeLEntree({ ...x, sons: { F: { cents: 1200 } } }, realiserEntree(x), 442)
  const f = sons.find((s) => s.role === 'F')!
  assert.ok(Math.abs(f.hz - hzDeMidi(f.midi, 442) * 2) < 1e-6)
})

test('attaques par formule', () => {
  assert.deepEqual(attaquesDeFormule('tenu', 0, 4), [0])
  assert.deepEqual(attaquesDeFormule('blanche', 0, 4), [0, 2])
  assert.deepEqual(attaquesDeFormule('blanche', 3, 8), [3, 5, 7])
  assert.deepEqual(attaquesDeFormule('noire', 4, 8), [4, 5, 6, 7])
  assert.deepEqual(attaquesDeFormule('croche', 0, 2), [0, 0.5, 1, 1.5])
})

test('segments : tenu prolongé sur les slots hérités, entrées explicites = nouvelle attaque', () => {
  const [a] = PHRASES_FOURNIES
  const seg = segmentsDePhrase(a)
  assert.deepEqual(seg.map((s) => [s.debut, s.fin]), [[0, 4], [4, 8], [8, 12], [12, 16]])
  assert.deepEqual(seg.map((s) => s.attaques), [[0], [4], [8], [12]])
  // deux entrées explicites au contenu identique : deux attaques
  const dup: Phrase = { ...a, entrees: { 0: a.entrees[0], 8: a.entrees[0] } }
  assert.deepEqual(segmentsDePhrase(dup).map((s) => s.attaques), [[0], [8]])
  // slots auto-remplis : l'entrée du temps 0 en noires sonne sur 8 temps
  const noire = { ...a, entrees: { 0: { ...a.entrees[0], formule: 'noire' as const }, 8: a.entrees[8] } }
  assert.deepEqual(segmentsDePhrase(noire)[0].attaques, [0, 1, 2, 3, 4, 5, 6, 7])
  const { phrase } = modifierSlot(a, 6, (x) => x)
  assert.deepEqual(segmentsDePhrase(phrase).map((s) => s.debut), [0, 4, 6, 8, 12])
})

test('décompte : un clic par temps de la mesure, premier accentué ; boucle sans silence', () => {
  const [a, , c] = PHRASES_FOURNIES
  assert.deepEqual(clicsDecompte(a), [{ t: -4, accent: true }, { t: -3, accent: false }, { t: -2, accent: false }, { t: -1, accent: false }])
  assert.equal(clicsDecompte(c).length, 3)
  assert.equal(clicsDecompte({ ...a, decompte: 0 }).length, 0)
  assert.ok(Math.abs(dureeTourS(a) - (16 * 60) / 72) < 1e-9)    // le tour suivant commence au temps 16, sans silence ajouté
})
