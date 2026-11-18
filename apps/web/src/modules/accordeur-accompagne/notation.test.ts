import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tonalite } from './phrase.ts'
import {
  alterationsAffichees, armureParLettre, decalageTranspo, lignesSupplementaires, nbAlterations, noteEcrite, nomClasse,
  placerDansEchelle, positionPortee, tonaliteEcrite,
} from './notation.ts'

test('armures : dièses et bémols', () => {
  assert.equal(nbAlterations('Do', 'majeur'), 0)
  assert.equal(nbAlterations('Sol', 'majeur'), 1)
  assert.equal(nbAlterations('Fa', 'majeur'), -1)
  assert.equal(nbAlterations('La', 'mineur'), 0)
  assert.equal(nbAlterations('Mi', 'mineur'), 1)
  assert.deepEqual(armureParLettre('Ré', 'majeur'), [1, 0, 0, 1, 0, 0, 0])      // Fa♯ Do♯
  assert.deepEqual(armureParLettre('Sib', 'majeur'), [0, 0, -1, 0, 0, 0, -1])   // Si♭ Mi♭
})

test('tonalité écrite : sons réels si pas de transposition, sinon orthographe la plus légère', () => {
  assert.equal(tonaliteEcrite(tonalite('Réb', 'majeur'), 'C').nomTonique, 'Réb')
  assert.equal(decalageTranspo('Bb'), 2)
  const e = tonaliteEcrite(tonalite('Do', 'majeur'), 'Bb')         // Do réel → Ré écrit pour une clarinette en Si♭
  assert.equal(e.nomTonique, 'Ré'); assert.equal(e.decalage, 2)
  assert.equal(tonaliteEcrite(tonalite('Sol', 'majeur'), 'Bb').nomTonique, 'La')
  assert.equal(tonaliteEcrite(tonalite('La', 'mineur'), 'Bb').nomTonique, 'Si')
})

test('notes écrites : orthographe de la tonalité, octave de l’Accordeur (MIDI 60 = Do4)', () => {
  const doM = tonaliteEcrite(tonalite('Do', 'majeur'), 'C')
  assert.deepEqual(noteEcrite(60, doM), { lettre: 0, alt: 0, octave: 4, diatonique: 28, nom: 'Do' })
  assert.equal(noteEcrite(61, doM).nom, 'Ré♭')                    // l'échelle de Do donne Réb pour la classe 1
  const solM = tonaliteEcrite(tonalite('Sol', 'majeur'), 'C')
  assert.equal(noteEcrite(66, solM).nom, 'Fa♯')
  const fa = tonaliteEcrite(tonalite('Fa', 'majeur'), 'C')
  assert.equal(noteEcrite(70, fa).nom, 'Si♭')
  const bb = tonaliteEcrite(tonalite('Do', 'majeur'), 'Bb')
  assert.equal(noteEcrite(60, bb).nom, 'Ré')                      // son réel Do4 → Ré4 écrit
  assert.equal(noteEcrite(60, bb).octave, 4)
  const dob = noteEcrite(71, tonaliteEcrite(tonalite('Réb', 'majeur'), 'C'))
  assert.deepEqual([dob.nom, dob.octave], ['Do♭', 5])             // Do♭5 sonne comme Si4 mais s'écrit une octave plus haut
})

test('position sur la portée et lignes supplémentaires', () => {
  const mi4 = noteEcrite(64, tonaliteEcrite(tonalite('Do', 'majeur'), 'C'))
  assert.equal(positionPortee(mi4.diatonique, 'sol'), 0)          // ligne du bas
  const la5 = noteEcrite(81, tonaliteEcrite(tonalite('Do', 'majeur'), 'C'))
  assert.equal(positionPortee(la5.diatonique, 'sol'), 10)         // première ligne supplémentaire au-dessus
  const do4 = noteEcrite(60, tonaliteEcrite(tonalite('Do', 'majeur'), 'C'))
  assert.equal(positionPortee(do4.diatonique, 'sol'), -2)         // Do4 : première ligne supplémentaire sous la portée
  assert.deepEqual(lignesSupplementaires(-2), [-2])
  assert.deepEqual(lignesSupplementaires(-4), [-2, -4])
  assert.deepEqual(lignesSupplementaires(-3), [-2])
  assert.deepEqual(lignesSupplementaires(0), [])
  assert.deepEqual(lignesSupplementaires(10), [10])
  assert.deepEqual(lignesSupplementaires(12), [10, 12])
  const sol2 = noteEcrite(43, tonaliteEcrite(tonalite('Do', 'majeur'), 'C'))
  assert.equal(positionPortee(sol2.diatonique, 'fa'), 0)          // Sol2 : ligne du bas en clef de fa
})

test('altérations affichées : armure, mesure, bécarres, notes liées', () => {
  const armure = armureParLettre('Sol', 'majeur')                  // Fa♯
  const n = (lettre: number, alt: -1 | 0 | 1, mesure: number, liee = false) => ({ lettre, alt, octave: 4, mesure, liee })
  assert.deepEqual(alterationsAffichees([n(3, 1, 0)], armure), [null])                  // Fa♯ : dans l'armure
  assert.deepEqual(alterationsAffichees([n(3, 0, 0)], armure), ['becarre'])             // Fa♮ : à signaler
  assert.deepEqual(alterationsAffichees([n(3, 0, 0), n(3, 0, 0)], armure), ['becarre', null])   // pas deux fois dans la mesure
  assert.deepEqual(alterationsAffichees([n(3, 0, 0), n(3, 1, 0)], armure), ['becarre', 'diese'])  // retour au Fa♯
  assert.deepEqual(alterationsAffichees([n(3, 0, 0), n(3, 1, 1)], armure), ['becarre', null])     // nouvelle mesure : l'armure reprend
  assert.deepEqual(alterationsAffichees([n(0, 1, 0), n(0, 1, 0, true)], armureParLettre('Do', 'majeur')), ['diese', null])
  assert.deepEqual(alterationsAffichees([n(1, -1, 0), n(1, 0, 0)], armureParLettre('Do', 'majeur')), ['bemol', 'becarre'])
})

test('place dans l’échelle du mode et noms de classes', () => {
  assert.deepEqual(placerDansEchelle(0, 'majeur'), { degre: 0 })
  assert.deepEqual(placerDansEchelle(11, 'majeur'), { degre: 6 })
  assert.deepEqual(placerDansEchelle(6, 'majeur'), { entre: 3 })      // fa♯ : entre Fa et Sol
  assert.deepEqual(placerDansEchelle(3, 'mineur'), { degre: 2 })
  assert.deepEqual(placerDansEchelle(4, 'mineur'), { entre: 2 })
  assert.equal(nomClasse(6, tonaliteEcrite(tonalite('Sol', 'majeur'), 'C')), 'Fa♯')
})
