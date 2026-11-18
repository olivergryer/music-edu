import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PHRASES_FOURNIES } from '../phrase.ts'
import { construirePlanningPhrase } from '../planningPhrase.ts'
import { appliquerReglage, prochaineFrontiere, remplacerAPartirDe } from './reglages.ts'
import { enveloppe, rendrePlayback, voixSonnantes } from './synthese.ts'

const FS = 16000
const cadence = PHRASES_FOURNIES[0]
const base = () => construirePlanningPhrase(cadence, { sampleRate: FS, dureeS: 5 }).planning

function rendu(p: ReturnType<typeof base>, a: number, b: number): Float32Array {
  const n0 = Math.round(a * FS)
  return rendrePlayback(p, Math.round((b - a) * FS), n0)
}

test('un réglage sans effet ne change pas le signal : phase continue, enveloppe continue', () => {
  const p = base()
  const q = appliquerReglage(p, 0, '3', { volume: 0.8 }, 1.0)   // volume par défaut : aucune différence
  const a = rendu(p, 0.8, 1.4), b = rendu(q, 0.8, 1.4)
  let maxi = 0
  for (let i = 0; i < a.length; i++) maxi = Math.max(maxi, Math.abs(a[i] - b[i]))
  assert.ok(maxi < 1e-4, `écart max ${maxi}`)
})

test('l’événement en cours est coupé à t et prolongé, la coupure est déclarée comme une attaque', () => {
  const p = base()
  const q = appliquerReglage(p, 0, '3', { cents: 10 }, 1.0)
  assert.equal(q.evenements.length, p.evenements.length + 1)
  const [avant, apres] = q.evenements.filter(e => e.entree === 0).slice(0, 2)
  assert.equal(avant.tFin, 1.0); assert.ok(avant.continuiteApres)
  assert.equal(apres.tDebut, 1.0); assert.ok(apres.continuiteAvant)
  assert.deepEqual(apres.attaques, [1.0])
  assert.ok(apres.glissS && apres.glissS <= 0.03 + 1e-12)
  assert.equal(enveloppe(1.0 - 1e-6, avant), 1)                  // pas de relâchement
  assert.equal(enveloppe(1.0 + 1e-6, apres), 1)                  // pas d'attaque
  const tierce0 = p.evenements[0].voix.find(v => v.role === '3')!
  const tierce1 = apres.voix.find(v => v.role === '3')!
  assert.ok(Math.abs(tierce1.cents - 10) < 1e-9)                      // cents = valeur absolue réglée
  assert.ok(Math.abs(tierce1.freqHz / tierce0.freqHz - Math.pow(2, (10 - tierce0.cents) / 1200)) < 1e-12)
  // les autres rôles n'ont pas bougé de fréquence
  assert.equal(apres.voix.find(v => v.role === '5')!.freqHz, p.evenements[0].voix.find(v => v.role === '5')!.freqHz)
  // après la transition, le partiel 1 de la tierce oscille à sa nouvelle fréquence
  const x = rendu(q, 1.2, 1.7)
  let re = 0, im = 0
  const f = tierce1.freqHz
  for (let i = 0; i < x.length; i++) { const t = 1.2 + i / FS; re += x[i] * Math.cos(2 * Math.PI * f * t); im += x[i] * Math.sin(2 * Math.PI * f * t) }
  const pic = Math.hypot(re, im)
  re = 0; im = 0
  const f2 = tierce0.freqHz
  for (let i = 0; i < x.length; i++) { const t = 1.2 + i / FS; re += x[i] * Math.cos(2 * Math.PI * f2 * t); im += x[i] * Math.sin(2 * Math.PI * f2 * t) }
  assert.ok(pic > 2 * Math.hypot(re, im), 'la nouvelle fréquence domine')
})

test('le signal reste continu à la coupure (pas de saut de phase), même avec un changement de hauteur', () => {
  const q = appliquerReglage(base(), 0, '3', { cents: 10 }, 1.0)
  const x = rendu(q, 0.99, 1.01)
  let maxSaut = 0
  for (let i = 1; i < x.length; i++) maxSaut = Math.max(maxSaut, Math.abs(x[i] - x[i - 1]))
  const ref = rendu(base(), 0.99, 1.01)
  let maxRef = 0
  for (let i = 1; i < ref.length; i++) maxRef = Math.max(maxRef, Math.abs(ref[i] - ref[i - 1]))
  assert.ok(maxSaut < 1.5 * maxRef, `saut ${maxSaut} vs pente normale ${maxRef}`)
})

test('muet : le son glisse vers le silence puis sort du modèle d’analyse ; volume : amplitudes mises à l’échelle', () => {
  const q = appliquerReglage(base(), 0, '5', { muet: true }, 1.0)
  const apres = q.evenements.find(e => e.tDebut === 1.0)!
  const quinte = apres.voix.find(v => v.role === '5')!
  assert.ok(quinte.muet && quinte.partiels.every(x => x.amp === 0 && x.ampDe! > 0))
  assert.ok(!voixSonnantes(apres).some(v => v.role === '5'))
  const r = appliquerReglage(base(), 0, '3', { volume: 0.4 }, 1.0)
  const t = r.evenements.find(e => e.tDebut === 1.0)!.voix.find(v => v.role === '3')!
  assert.ok(Math.abs(t.partiels[0].amp - 0.4) < 1e-12 && Math.abs(t.partiels[0].ampDe! - 0.8) < 1e-12)
})

test('les événements futurs de l’entrée prennent la valeur d’office, les autres entrées sont intactes', () => {
  const noires = { ...cadence, entrees: { 0: { ...cadence.entrees[0], formule: 'noire' as const } }, nbMesures: 1 }
  const p = construirePlanningPhrase(noires, { sampleRate: FS, dureeS: 4 }).planning
  const q = appliquerReglage(p, 0, '3', { cents: 7 }, 0.5)
  const futurs = q.evenements.filter(e => e.tDebut > 0.5 + 1e-9)
  assert.ok(futurs.length >= 2)
  for (const e of futurs) { assert.ok(e.voix.filter(v => v.role === '3').every(v => Math.abs(v.cents - 7) < 1e-9)); assert.ok(!e.glissS) }
  const autre = appliquerReglage(base(), 4, '3', { cents: 7 }, 1.0)
  assert.equal(autre.evenements.filter(e => e.entree === 0).length, base().evenements.filter(e => e.entree === 0).length)
})

test('les deux sons d’un même rôle (doublure) partagent le réglage', () => {
  const p = base()
  const nbTierces = p.evenements[0].voix.filter(v => v.role === 'F').length
  const q = appliquerReglage(p, 0, 'F', { cents: 3 }, 1.0)
  const apres = q.evenements.find(e => e.tDebut === 1.0)!
  assert.equal(apres.voix.filter(v => v.role === 'F' && Math.abs(v.cents - 3) < 1e-9 + p.evenements[0].voix.find(x => x.role === 'F')!.cents).length, nbTierces)
})

test('remplacement à la frontière d’entrée : on garde le passé, on prend le futur du nouveau planning', () => {
  const ancien = base()
  const nouveau = construirePlanningPhrase({ ...cadence, entrees: { ...cadence.entrees, 4: { ...cadence.entrees[4], degre: 2 } } }, { sampleRate: FS, dureeS: 5 }).planning
  const tc = prochaineFrontiere(ancien, 1.0)!
  assert.ok(Math.abs(tc - (0.3 + 4 * 60 / 72)) < 1e-9)
  const m = remplacerAPartirDe(ancien, nouveau, tc)
  assert.equal(m.evenements[0].voix[0].midi, ancien.evenements[0].voix[0].midi)
  const e4 = m.evenements.find(e => e.entree === 4)!
  assert.equal(e4.accordId, nouveau.evenements.find(e => e.entree === 4)!.accordId)
  assert.deepEqual(e4.voix.map(v => v.midi), nouveau.evenements.find(e => e.entree === 4)!.voix.map(v => v.midi))
  assert.equal(m.evenements.filter(e => e.entree === 0).length, 1)
  assert.equal(prochaineFrontiere(ancien, 1.0, 10), null)
})
