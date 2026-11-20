// Notes rapides (16 doubles croches à ♩ = 100, soit 150 ms chacune) sur un accompagnement à la noire :
// les attaques de l'accompagnement tombent sur 1 note sur 4 et la garde d'attaque + la fenêtre de la
// piste rapide en mangeaient le début. Le préréglage « Notes rapides » les retrouve toutes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PHRASES_FOURNIES } from '../phrase.ts'
import { construirePlanningPhrase } from '../planningPhrase.ts'
import { NOUVEAU_DEFAUT, PREREGLAGES_NOUVEAU, appliquerPreregalage, optionsFinaleDe, optionsPipelineDe } from '../reglagesNouveau.ts'
import { ajouterNote } from './eleveSynthetique.ts'
import { analyserEnregistrement, passeFinale } from './pipeline.ts'
import { rendrePlayback } from './synthese.ts'

const FS = 48000, TEMPO = 100, NOIRE = 60 / TEMPO, T0 = 1.0
const cad = PHRASES_FOURNIES[0]
const phrase = { ...cad, tempo: TEMPO, nbMesures: 2, boucle: false, decompte: 0 as const, entrees: { 0: { ...cad.entrees[0], formule: 'noire' as const } } }
const { planning } = construirePlanningPhrase(phrase, { sampleRate: FS })
const GAMME = [72, 74, 76, 77, 79, 81, 83, 84, 83, 81, 79, 77, 76, 74, 72, 74]
const hz = (m: number): number => 442 * Math.pow(2, (m - 69) / 12)

function prise(detache: boolean, avecEleve = true): Float32Array {
  const N = Math.round((T0 + 16 * NOIRE / 4 + 1) * FS)
  const micro = rendrePlayback(planning, N)
  if (!avecEleve) return micro
  const el = new Float32Array(N)
  GAMME.forEach((m, i) => ajouterNote(el, FS, { tDebut: T0 + i * NOIRE / 4, duree: NOIRE / 4 - (detache ? 0.035 : 0), f0Hz: hz(m), famille: 'ancheSimple', niveau: 0.05 }))
  for (let i = 0; i < N; i++) micro[i] += el[i]
  return micro
}

function analyser(micro: Float32Array, reg: typeof NOUVEAU_DEFAUT) {
  const o = { ...optionsPipelineDe(reg), depuisS: 0.8, jusqueS: T0 + 16 * NOIRE / 4 + 0.3 }
  const { trames } = analyserEnregistrement(micro, FS, planning, o)
  return passeFinale(micro, FS, planning, trames, optionsFinaleDe(reg, 442))
}

const rapides = appliquerPreregalage(PREREGLAGES_NOUVEAU.find(p => p.id === 'rapides')!)

function identifiees(notes: { tOn: number; tOff: number; f0Hz: number }[]): number {
  return GAMME.filter((m, i) => {
    const a = T0 + i * NOIRE / 4, b = a + NOIRE / 4
    return notes.some(n => n.tOn < b - 0.04 && n.tOff > a + 0.04 && Math.abs(12 * Math.log2(n.f0Hz / hz(m))) < 0.5)
  }).length
}

for (const detache of [false, true]) {
  test(`préréglage « Notes rapides » : 16 doubles croches ${detache ? 'détachées' : 'legato'} retrouvées`, () => {
    const notes = analyser(prise(detache), rapides)
    assert.ok(identifiees(notes) >= 15, `${identifiees(notes)}/16 identifiées (${notes.length} notes)`)
  })
}

test('le préréglage « Notes rapides » n\'invente aucune note sans élève', () => {
  assert.equal(analyser(prise(false, false), rapides).length, 0)
})

test('réglages standard : les doubles croches détachées sont manquées (raison d\'être du préréglage)', () => {
  assert.ok(identifiees(analyser(prise(true), NOUVEAU_DEFAUT)) < 12)
})
