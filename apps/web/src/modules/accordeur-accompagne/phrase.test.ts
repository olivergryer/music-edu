import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PHRASES_FOURNIES, entreeDuSlot, estExplicite, indiceEntreeDuSlot, modifierSlot, nbSlots, phraseDepuisURL,
  phraseValide, phraseVersURL, positionMesureTemps, supprimerEntree, tonalite, ajouterMesure, retirerMesure,
} from './phrase.ts'

const p1 = PHRASES_FOURNIES[0]

test('les trois phrases fournies sont valides et décrites par le brief', () => {
  assert.equal(PHRASES_FOURNIES.length, 3)
  for (const p of PHRASES_FOURNIES) assert.ok(phraseValide(p), p.nom)
  const [a, b, c] = PHRASES_FOURNIES
  assert.deepEqual([a.mesure, a.nbMesures, a.tempo, a.entrees[0].formule], ['4/4', 4, 72, 'tenu'])
  assert.deepEqual([b.mesure, b.nbMesures, b.tempo, b.entrees[0].formule], ['4/4', 4, 80, 'blanche'])
  assert.deepEqual([c.mesure, c.nbMesures, c.tempo, c.entrees[0].formule], ['3/4', 4, 76, 'noire'])
  assert.equal(nbSlots(c), 12)
  assert.deepEqual(Object.values(a.entrees).map((e) => e.degre), [1, 4, 5, 1])
  assert.equal(a.entrees[8].qualite, 'dom7')
})

test('un slot prend la dernière entrée d’index ≤ k', () => {
  assert.equal(indiceEntreeDuSlot(p1, 0), 0)
  assert.equal(indiceEntreeDuSlot(p1, 3), 0)
  assert.equal(indiceEntreeDuSlot(p1, 4), 4)
  assert.equal(indiceEntreeDuSlot(p1, 11), 8)
  assert.equal(entreeDuSlot(p1, 6).degre, 4)
  assert.ok(estExplicite(p1, 8))
  assert.ok(!estExplicite(p1, 9))
})

test('modifier un slot auto-rempli crée une entrée copiée de l’héritée', () => {
  const { phrase, creee } = modifierSlot(p1, 6, (e) => ({ ...e, formule: 'noire' }))
  assert.ok(creee)
  assert.ok(estExplicite(phrase, 6))
  assert.equal(phrase.entrees[6].degre, 4)          // copie de l’entrée du temps 4
  assert.equal(phrase.entrees[6].formule, 'noire')
  assert.equal(p1.entrees[4].formule, 'tenu')       // l’original n’est pas modifié
  assert.equal(entreeDuSlot(phrase, 7).formule, 'noire')   // héritage à partir de la nouvelle entrée
})

test('une entrée copiée garde la tonalité de l’entrée copiée', () => {
  const sol = { ...p1.entrees[4], tonalite: tonalite('Sol', 'majeur') }
  const p = { ...p1, entrees: { ...p1.entrees, 4: sol } }
  const { phrase } = modifierSlot(p, 6, (e) => e)
  assert.equal(phrase.entrees[6].tonalite.nomTonique, 'Sol')
})

test('modifier une entrée explicite ne crée rien', () => {
  const { creee } = modifierSlot(p1, 4, (e) => ({ ...e, formule: 'blanche' }))
  assert.ok(!creee)
})

test('supprimer l’entrée rend le slot à l’auto-remplissage, impossible au temps 0', () => {
  assert.throws(() => supprimerEntree(p1, 0))
  const q = supprimerEntree(p1, 4)
  assert.ok(!estExplicite(q, 4))
  assert.equal(entreeDuSlot(q, 5).degre, 1)
})

test('position mesure.temps à partir de 1', () => {
  assert.deepEqual(positionMesureTemps(p1, 6), { mesure: 2, temps: 3 })
  assert.deepEqual(positionMesureTemps(PHRASES_FOURNIES[2], 7), { mesure: 3, temps: 2 })
})

test('ajouter / retirer une mesure', () => {
  const plus = ajouterMesure(p1)
  assert.equal(plus.nbMesures, 5)
  const moins = retirerMesure(plus)
  assert.equal(moins.nbMesures, 4)
  const court = retirerMesure(retirerMesure(retirerMesure(p1)))   // 1 mesure : l’entrée au temps 4 sort
  assert.equal(court.nbMesures, 1)
  assert.deepEqual(Object.keys(court.entrees), ['0'])
})

test('aller-retour URL : sons réels conservés, accents compris', () => {
  const sib = { ...p1, nom: 'Étude en Sib — Réb', entrees: { 0: { ...p1.entrees[0], tonalite: tonalite('Sib', 'majeur') } } }
  const url = phraseVersURL(sib)
  assert.match(url, /^[A-Za-z0-9_-]+$/)
  const relu = phraseDepuisURL(url)
  assert.deepEqual(relu, sib)
  assert.equal(relu!.entrees[0].tonalite.tonique, 10)
})

test('une URL illisible ou une phrase invalide donne null', () => {
  assert.equal(phraseDepuisURL('%%%'), null)
  assert.equal(phraseDepuisURL(phraseVersURL({ ...p1, tempo: 500 })), null)
  assert.equal(phraseDepuisURL(phraseVersURL({ ...p1, entrees: {} })), null)
})
