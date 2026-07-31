// Modèle, qualité dérivée et contraintes de validation (spec §1).
// npm run test  →  node --test "src/**/*.test.ts"

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  DEGRES,
  MODES,
  accepteBasculeMode,
  accordId,
  assertAccord,
  creerAccord,
  estAccordValide,
  qualite,
  qualiteEffective,
  type Accord,
  type Degre,
  type Mode,
  type Qualite,
} from './types.ts'
import { triade } from './harmonieRef.ts'

// ── Qualité ──────────────────────────────────────────────────────────────────

test('qualite : table de la spec §1', () => {
  const attenduMajeur: Qualite[] = ['M', 'm', 'm', 'M', 'M', 'm', 'dim']
  const attenduMineur: Qualite[] = ['m', 'dim', 'M', 'm', 'M', 'M', 'dim']
  DEGRES.forEach((d, i) => {
    assert.equal(qualite('majeur', d), attenduMajeur[i], `majeur, degré ${d}`)
    assert.equal(qualite('mineur', d), attenduMineur[i], `mineur, degré ${d}`)
  })
})

// Contre-vérification indépendante : la qualité annoncée est bien celle des
// hauteurs réellement construites. Mineur harmonique, SAUF le III pris naturel.
test('qualite : cohérente avec les hauteurs construites (III mineur naturel, VII toujours sensible)', () => {
  const qualiteDesHauteurs = (mode: Mode, degre: Degre): Qualite => {
    const [f, t, q] = triade(mode, degre)
    const tierce = (t - f + 12) % 12
    const quinte = (q - f + 12) % 12
    if (tierce === 4 && quinte === 7) return 'M'
    if (tierce === 3 && quinte === 7) return 'm'
    if (tierce === 3 && quinte === 6) return 'dim'
    if (tierce === 4 && quinte === 8) return 'aug'
    throw new Error(`empilement inattendu : ${tierce}/${quinte}`)
  }
  for (const mode of MODES) {
    for (const d of DEGRES) {
      assert.equal(qualiteDesHauteurs(mode, d), qualite(mode, d), `${mode}, degré ${d}`)
    }
  }
  // Le point sensible de la spec : III mineur est M (naturel), pas aug.
  assert.equal(qualite('mineur', 3), 'M')
  assert.notEqual(qualite('mineur', 3), 'aug')
})

test('qualite : lève sur un couple invalide', () => {
  assert.throws(() => qualite('majeur', 8 as Degre))
  assert.throws(() => qualite('dorien' as Mode, 1))
})

// ── Bascule de mode (perturbation `'mode'`, §4) ──────────────────────────────

test('qualiteEffective : modeInverse bascule M ↔ m', () => {
  const base = creerAccord(0, { degre: 1 })
  assert.equal(qualiteEffective(base, 'majeur'), 'M')
  const inverse = creerAccord(0, { degre: 1, modeInverse: true })
  assert.equal(qualiteEffective(inverse, 'majeur'), 'm')
  assert.equal(qualiteEffective(creerAccord(0, { degre: 2, modeInverse: true }), 'majeur'), 'M')
})

test('qualiteEffective : pas de bascule définie sur un accord diminué', () => {
  assert.throws(() => qualiteEffective(creerAccord(0, { degre: 7, modeInverse: true }), 'majeur'))
  assert.throws(() => qualiteEffective(creerAccord(0, { degre: 2, modeInverse: true }), 'mineur'))
  assert.equal(accepteBasculeMode('majeur', 7), false)
  assert.equal(accepteBasculeMode('mineur', 2), false)
  assert.equal(accepteBasculeMode('mineur', 7), false)
  assert.equal(accepteBasculeMode('mineur', 3), true)
})

// ── Identité ─────────────────────────────────────────────────────────────────

test('accordId : dérivé du contenu, distinct dès qu’un champ chiffré change', () => {
  const vus = new Set<string>()
  for (const renv of [0, 1, 2] as const) {
    for (const sept of [false, true]) {
      for (const inv of [false, true]) {
        vus.add(accordId(3, 5, renv, sept, inv))
      }
    }
  }
  assert.equal(vus.size, 12)
  // Deux positions distinctes = deux événements distincts pour le log d'erreurs.
  assert.notEqual(accordId(0, 1, 0, false), accordId(1, 1, 0, false))
})

test('creerAccord : position métrique alternée par défaut, durée 1', () => {
  assert.equal(creerAccord(0, { degre: 1 }).positionMetrique, 'fort')
  assert.equal(creerAccord(1, { degre: 5 }).positionMetrique, 'faible')
  assert.equal(creerAccord(2, { degre: 1 }).duree, 1)
  assert.equal(creerAccord(0, { degre: 1 }).modeInverse, undefined)
  assert.equal(creerAccord(0, { degre: 1, modeInverse: true }).modeInverse, true)
})

// ── Validation ───────────────────────────────────────────────────────────────

test('assertAccord : renversement 3 exige la septième', () => {
  assert.throws(() => creerAccord(0, { degre: 5, renversement: 3, septieme: false }))
  assert.doesNotThrow(() => creerAccord(0, { degre: 5, renversement: 3, septieme: true }))
})

test('estAccordValide : rejette degré, renversement et durée hors bornes', () => {
  const base: Accord = creerAccord(0, { degre: 1 })
  assert.equal(estAccordValide(base), true)
  assert.equal(estAccordValide({ ...base, degre: 0 as Degre }), false)
  assert.equal(estAccordValide({ ...base, renversement: 4 as Accord['renversement'] }), false)
  assert.equal(estAccordValide({ ...base, renversement: 3 }), false) // sans septième
  assert.equal(estAccordValide({ ...base, duree: 0 }), false)
  assert.throws(() => assertAccord({ ...base, duree: -1 }))
})
