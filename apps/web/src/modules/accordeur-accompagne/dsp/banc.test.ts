import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ecrireWav, lireWav } from './wav.ts'
import { genererChirp, trouverChirp } from './chirp.ts'
import { construireJeuA } from './banc.ts'

test('WAV : aller-retour flottant 32 bits', () => {
  const x = Float32Array.from({ length: 1000 }, (_, i) => Math.sin(i / 7) * 0.5)
  const w = lireWav(ecrireWav({ sampleRate: 44100, donnees: x }))
  assert.equal(w.sampleRate, 44100)
  assert.equal(w.donnees.length, 1000)
  assert.ok(w.donnees.every((v, i) => Math.abs(v - x[i]) < 1e-7))
})

test('chirp retrouvé au bon échantillon, même sous un fort playback', () => {
  const fs = 48000, retard = 2160
  const x = new Float32Array(fs)
  const c = genererChirp(fs)
  for (let i = 0; i < c.length; i++) x[retard + i] += c[i]
  for (let i = 0; i < x.length; i++) x[i] += 0.3 * Math.sin(2 * Math.PI * 440 * i / fs) + 0.2 * Math.sin(2 * Math.PI * 1320 * i / fs)
  const r = trouverChirp(x, fs)
  assert.ok(Math.abs(r.indice - retard) <= 1, `indice ${r.indice}`)
  assert.ok(r.qualite > 5)
})

test('jeu A réduit : notes, relations à l’accord, phases sans élève', () => {
  const j = construireJeuA({ reduit: true })
  assert.equal(j.verite.notes.length, 5 * 3)
  const re5 = j.verite.notes.find(n => n.reference === 'tempéré')!
  assert.equal(re5.relation?.q, 3)              // Ré5 = douzième de Sol3 (écart de spec §8)
  assert.ok(j.verite.notes.filter(n => n.ecartCents === 0 && n.reference.startsWith('voix')).every(n => n.relation))
  assert.ok(j.verite.phasesSansEleve.length > 5)
  assert.equal(j.micro.length, j.sortie.length)
})
