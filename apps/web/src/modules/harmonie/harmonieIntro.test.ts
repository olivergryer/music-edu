import test from 'node:test'
import assert from 'node:assert/strict'

import {
  PAS_ARPEGE,
  SILENCE,
  TENUE_PLAQUE,
  avecIntro,
  estIntro,
  evenementsIntro,
} from './intro.ts'

// Un accord de tonique réalisé à quatre voix, dans l'ordre où
// `realiserProgression` les rend : basse, ténor, alto, soprano.
const TONIQUE = [48, 55, 60, 64]
const SUITE = [
  [50, 57, 62, 65],
  [43, 59, 62, 67],
  [48, 55, 60, 64],
]

// Le nombre d'événements d'une intro : une note par voix, le plaqué, le silence.
const EVENEMENTS = TONIQUE.length + 2

test('estIntro ne reconnaît que les deux positions', () => {
  assert.equal(estIntro('aucune'), true)
  assert.equal(estIntro('arpegee'), true)
  assert.equal(estIntro('plaquee'), false)
  assert.equal(estIntro(undefined), false)
})

// ─── Sans intro ──────────────────────────────────────────────────────────────

test('« aucune » rend la suite telle quelle, sans décalage', () => {
  const plan = avecIntro(SUITE, TONIQUE, 'aucune')
  assert.equal(plan.decalage, 0)
  assert.deepEqual(plan.accords, SUITE)
})

test('les durées par défaut de jouerSuite sont reconduites : dernier accord tenu double', () => {
  const plan = avecIntro(SUITE, TONIQUE, 'aucune')
  assert.deepEqual(plan.durees, [1, 1, 2])
  assert.deepEqual(plan.tenues, [1, 1, 2])
})

test('sans contexte tonal (tonique nulle) le style est sans effet', () => {
  for (const style of ['aucune', 'arpegee'] as const) {
    const plan = avecIntro(SUITE, null, style)
    assert.equal(plan.decalage, 0)
    assert.deepEqual(plan.accords, SUITE)
  }
})

test('une suite vide ne déclenche aucune intro', () => {
  const plan = avecIntro([], TONIQUE, 'arpegee')
  assert.equal(plan.decalage, 0)
  assert.deepEqual(plan.accords, [])
})

// ─── L'intro arpégée ─────────────────────────────────────────────────────────

test('l’intro ajoute autant d’événements que le décalage annoncé', () => {
  const plan = avecIntro(SUITE, TONIQUE, 'arpegee')
  assert.equal(plan.decalage, EVENEMENTS)
  assert.equal(plan.accords.length, SUITE.length + EVENEMENTS)
  // C'est ce décalage que les pages retranchent des index d'`onAccord` : s'il
  // ment, la trajectoire animée du cercle des tierces pointe le mauvais accord.
  assert.deepEqual(plan.accords.slice(plan.decalage), SUITE)
})

test('l’arpège EST l’accord plaqué, voix par voix et du grave à l’aigu', () => {
  const { accords } = evenementsIntro(TONIQUE, 'arpegee')
  const arpege = accords.slice(0, TONIQUE.length)

  assert.deepEqual(arpege, [[48], [55], [60], [64]])
  assert.deepEqual(arpege.flat(), TONIQUE)
  // Rien n'est recalculé : la réunion de l'arpège est exactement le plaqué.
  assert.deepEqual(accords[TONIQUE.length], TONIQUE)
})

test('le silence est un accord sans hauteur, en dernier', () => {
  const { accords, durees, tenues } = evenementsIntro(TONIQUE, 'arpegee')
  assert.deepEqual(accords[accords.length - 1], [])
  assert.equal(durees[durees.length - 1], SILENCE)
  assert.equal(tenues[tenues.length - 1], 0)
})

test('chaque note de l’arpège résonne au moins jusqu’à la fin du plaqué', () => {
  const { durees, tenues } = evenementsIntro(TONIQUE, 'arpegee')

  // Le pas rythmique reste celui de l'arpège : les notes se succèdent vite…
  for (let i = 0; i < TONIQUE.length; i++) {
    assert.equal(durees[i], PAS_ARPEGE)
  }
  // …mais chacune SONNE jusqu'après le plaqué. C'est ce qui sépare « tenues »
  // de « détachées » : sans cet écart, l'accord ne se construirait pas.
  for (let i = 0; i < TONIQUE.length; i++) {
    const avantFinDuPlaque = (TONIQUE.length - i) * PAS_ARPEGE + TENUE_PLAQUE
    assert.ok(
      tenues[i] >= avantFinDuPlaque,
      `voix ${i} : tenue ${tenues[i]} < ${avantFinDuPlaque}`,
    )
  }
})

test('les trois tableaux du plan ont la même longueur', () => {
  for (const style of ['aucune', 'arpegee'] as const) {
    const plan = avecIntro(SUITE, TONIQUE, style)
    // `jouerSuite` indexe les trois de front : une longueur qui diverge y lirait
    // `undefined`, donc une durée NaN.
    assert.equal(plan.durees.length, plan.accords.length)
    assert.equal(plan.tenues.length, plan.accords.length)
  }
})

test('un accord de tonique à trois sons donne une intro plus courte, pas une erreur', () => {
  const plan = avecIntro(SUITE, [48, 55, 64], 'arpegee')
  assert.equal(plan.decalage, 5)
})
