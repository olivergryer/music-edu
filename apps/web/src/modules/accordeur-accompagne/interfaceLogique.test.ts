import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { TrameAnalyse } from './dsp/types.ts'
import { PHRASES_FOURNIES } from './phrase.ts'
import { construirePlanningPhrase } from './planningPhrase.ts'
import { realiserPhrase, sonsDeLEntree, hzDeMidi } from './realisation.ts'
import { annoterNote, entreeAuTemps, type ContexteAnnotation, type NoteAnnotee } from './annotation.ts'
import { bilanDe, formaterMoyenne, moyennePonderee } from './bilan.ts'
import { SuiviNotes } from './notesLive.ts'

const cad = PHRASES_FOURNIES[0]
const pp = construirePlanningPhrase(cad, { sampleRate: 48000, dureeS: 14 })
const ctx: ContexteAnnotation = { phrase: cad, real: realiserPhrase(cad), planning: pp.planning, ref: '5-limite', diapason: 442, tempUser: [] }
const noire = 60 / cad.tempo

test('entrée en vigueur à un instant donné', () => {
  assert.equal(entreeAuTemps(pp.planning, pp.t0 + 0.1), 0)
  assert.equal(entreeAuTemps(pp.planning, pp.t0 + 5 * noire), 4)
  assert.equal(entreeAuTemps(pp.planning, pp.t0 + 9 * noire), 8)
})

test('annotation : la tierce jouée sur la tierce réglée est rattachée à la tierce, écart signé', () => {
  const sons = sonsDeLEntree(cad.entrees[0], ctx.real.get(0)!, 442)
  const tierce = sons.find(s => s.role === '3')!
  const n = annoterNote({ tOn: pp.t0 + 0.2, tOff: pp.t0 + 1, f0Hz: tierce.hz * 2 * Math.pow(2, 9 / 1200) }, ctx, false)
  assert.equal(n.type, 'son'); assert.equal(n.role, '3'); assert.equal(n.entree, 0)
  assert.ok(Math.abs(n.ecart - 9) < 1e-6)
  assert.deepEqual(n.place, { degre: 2 })                        // Mi = degré III de do majeur
  assert.ok(!n.provisoire)
})

test('annotation : note étrangère comparée au référentiel depuis la tonique ; chromatique placée entre deux degrés', () => {
  const fad = hzDeMidi(66, 442) * Math.pow(2, 4 / 1200)           // Fa♯4 +4 ¢ (tempéré)
  const n = annoterNote({ tOn: pp.t0 + 0.2, tOff: pp.t0 + 1, f0Hz: fad }, { ...ctx, ref: 'tempere' }, true)
  assert.equal(n.type, 'etrangere'); assert.equal(n.role, null)
  assert.ok(Math.abs(n.ecart - 4) < 1e-6)
  assert.deepEqual(n.place, { entre: 3 })
  assert.ok(n.provisoire)
})

test('annotation : l’accord de référence est celui de l’entrée de la note (note finale découpée)', () => {
  const f = hzDeMidi(65, 442)                                     // Fa4 : quinte… non, fondamentale de IV, étrangère à I
  const surI = annoterNote({ tOn: pp.t0 + 0.2, tOff: pp.t0 + 1, f0Hz: f }, ctx, false)
  const surIV = annoterNote({ tOn: pp.t0 + 4.2 * noire, tOff: pp.t0 + 5 * noire, f0Hz: f, entree: 4 }, ctx, false)
  assert.equal(surI.type, 'etrangere'); assert.equal(surIV.type, 'son'); assert.equal(surIV.role, 'F')
})

const trame = (t: number, f0: number | null): TrameAnalyse => ({ t, f0Hz: f0, sigmaCents: 2, source: 'fusion', candidats: [], presence: f0 !== null, rmsResidu: 0, battements: [] })

test('suivi live : une note ne naît qu’après 100 ms, se ferme au silence, un saut de hauteur fait une nouvelle note', () => {
  const s = new SuiviNotes()
  assert.equal(s.ajouter(trame(1.00, 440)), null)                 // trop courte encore
  const n = s.ajouter(trame(1.12, 440.1))!
  assert.ok(n && n.ouverte)
  s.ajouter(trame(1.2, 440))
  assert.equal(s.notes.length, 1)
  s.ajouter(trame(1.3, 523.25))                                    // saut : nouvelle note
  s.ajouter(trame(1.45, 523.25))
  assert.equal(s.notes.length, 2)
  assert.ok(!s.notes[0].ouverte)
  s.ajouter(trame(1.5, null)); s.ajouter(trame(1.6, null))
  assert.ok(!s.notes[1].ouverte)
  assert.equal(s.enCours, null)
  assert.ok(Math.abs(s.notes[0].f0Hz - 440) < 0.2)
})

const mk = (o: Partial<NoteAnnotee>): NoteAnnotee => ({
  tOn: 0, tOff: 1, f0Hz: 440, sigma: 1, sigmaIntra: 2, entree: 0, type: 'son', role: '3', indexSon: 1, ecart: 0, midi: 64,
  place: { degre: 2 }, provisoire: false, coupeAvant: false, coupeApres: false, battements: [], ...o,
})

test('bilan : tableau par rôle pondéré par 1/σ², degrés, scores', () => {
  const notes = [
    mk({ role: '3', ecart: 10, sigma: 1 }), mk({ role: '3', ecart: 4, sigma: 3 }),           // pondération : 10 pèse 9× plus
    mk({ role: '5', ecart: -2, sigma: 1, place: { degre: 4 } }),
    mk({ type: 'etrangere', role: null, indexSon: null, ecart: 7, place: { entre: 3 } }),
  ]
  const b = bilanDe(notes, 5)
  assert.equal(b.n, 4)
  assert.deepEqual(b.lignes.map(l => l.poste), ['3', '5', 'etrangere'])
  const tierces = b.lignes[0]
  assert.equal(tierces.n, 2)
  assert.ok(Math.abs(tierces.moyenne - (10 * 1 + 4 / 9) / (1 + 1 / 9)) < 1e-9)
  assert.match(tierces.phrase, /^Tierces : \+9 ¢ \(2 notes\)$/)
  assert.equal(b.pedagogique.justes, 2)                            // la tierce à +4 ¢ et la quinte à −2 ¢ sont dans le seuil de 5 ¢
  assert.equal(b.degres[2].n, 2); assert.equal(b.degres[4].n, 1); assert.equal(b.degres[0].n, 0)
  assert.equal(b.chromatiques.n, 1)
  assert.ok(b.qualite >= 0 && b.qualite <= 100)
})

test('bilan : poids nuls → moyenne simple ; format signé', () => {
  assert.equal(moyennePonderee([{ ecart: 4, sigma: Infinity }, { ecart: 8, sigma: Infinity }]), 6)
  assert.equal(moyennePonderee([]), 0)
  assert.equal(formaterMoyenne(-9.4), '−9 ¢'); assert.equal(formaterMoyenne(0), '±0 ¢')
})
