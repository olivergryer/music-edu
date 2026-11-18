// Passe finale découpée aux changements d'accord (brief UI v1, § 4.4.4).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PHRASES_FOURNIES } from '../phrase.ts'
import { construirePlanningPhrase } from '../planningPhrase.ts'
import { ajouterNote } from './eleveSynthetique.ts'
import { analyserEnregistrement, changementsDAccord, passeFinale } from './pipeline.ts'
import { rendrePlayback } from './synthese.ts'
import { centsEntre } from './types.ts'

const FS = 48000
const cad = PHRASES_FOURNIES[0]
const phrase = { ...cad, tempo: 120, nbMesures: 2, boucle: false, entrees: { 0: cad.entrees[0], 4: cad.entrees[4] } }   // I puis IV, 2 s chacun
const { planning } = construirePlanningPhrase(phrase, { sampleRate: FS })

test('changements d’accord : détectés entre deux entrées différentes seulement', () => {
  assert.deepEqual(changementsDAccord(planning, 1.3, 3.5).map(x => +x.toFixed(3)), [2.3])
  assert.deepEqual(changementsDAccord(planning, 0.5, 2.0), [])
  const noires = construirePlanningPhrase({ ...phrase, entrees: { 0: { ...cad.entrees[0], formule: 'noire' as const } }, nbMesures: 1 }, { sampleRate: FS }).planning
  assert.deepEqual(changementsDAccord(noires, 0, 2), [])        // ré-attaques d'une même entrée : pas un changement d'accord
})

test('une note tenue à travers un changement d’accord devient deux morceaux, chacun juste et rattaché à son accord', () => {
  const f0 = 493.88 * Math.pow(2, 4 / 1200)                      // Si4 +4 ¢ : étrangère à Do majeur comme à Fa majeur
  const N = Math.round(4.8 * FS)
  const micro = rendrePlayback(planning, N)
  const eleve = new Float32Array(N)
  ajouterNote(eleve, FS, { tDebut: 1.3, duree: 2.2, f0Hz: f0, famille: 'corde', niveau: 0.05 })
  for (let i = 0; i < N; i++) micro[i] += eleve[i]
  const { trames } = analyserEnregistrement(micro, FS, planning, { depuisS: 0.9, jusqueS: 4.0 })
  const notes = passeFinale(micro, FS, planning, trames)
  assert.equal(notes.length, 2, `notes : ${notes.map(n => `${n.tOn.toFixed(2)}-${n.tOff.toFixed(2)}`)}`)
  const [a, b] = notes
  assert.equal(a.entree, 0); assert.equal(b.entree, 4)
  assert.ok(a.coupeApres && !a.coupeAvant)
  assert.ok(b.coupeAvant && !b.coupeApres)
  assert.ok(Math.abs(a.tOff - 2.3) < 0.06 && Math.abs(b.tOn - 2.3) < 0.06, `${a.tOff} ${b.tOn}`)
  for (const n of notes) assert.ok(Math.abs(centsEntre(n.f0Hz, f0)) < 1.5, `erreur ${centsEntre(n.f0Hz, f0).toFixed(2)} ¢`)
})
