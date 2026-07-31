// Métrique d'erreur à quatre canaux, classification diagnostique (spec §5, tests §7).

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { diagnostiquer, evaluerBasse, indiceDeDeduction, vecteurErreur } from './metrique.ts'
import { MATRICE_MAJEUR } from './matrice.ts'
import { distanceAngulaire, franchitArc } from './geometrie.ts'
import {
  DEGRES,
  creerAccord,
  type Accord,
  type AccordPartiel,
  type Degre,
  type Diagnostic,
  type Mode,
} from './types.ts'

const a = (partiel: AccordPartiel): Accord => creerAccord(0, partiel)

const diag = (attendu: Accord, repondu: Accord, mode: Mode = 'majeur'): Diagnostic =>
  diagnostiquer(vecteurErreur(attendu, repondu, mode), attendu, repondu, mode)

// ── Vecteur ──────────────────────────────────────────────────────────────────

test('vecteurErreur : le vecteur nul se diagnostique « exact »', () => {
  const accord = a({ degre: 5, renversement: 1, septieme: true })
  const v = vecteurErreur(accord, accord, 'majeur')
  assert.deepEqual(v, { angulaire: 0, radial: 0, cardinalite: 0, arcFranchi: false })
  assert.equal(diagnostiquer(v, accord, accord, 'majeur'), 'exact')
})

test('vecteurErreur : le canal angulaire est antisymétrique', () => {
  for (const x of DEGRES) {
    for (const y of DEGRES) {
      const ax = a({ degre: x })
      const ay = a({ degre: y })
      const direct = vecteurErreur(ax, ay, 'majeur').angulaire
      assert.equal(direct + vecteurErreur(ay, ax, 'majeur').angulaire, 0, `${x}/${y}`)
    }
  }
})

test('vecteurErreur : les quatre canaux sont indépendants et signés', () => {
  const attendu = a({ degre: 1, renversement: 0, septieme: false })
  const repondu = a({ degre: 5, renversement: 2, septieme: true })
  assert.deepEqual(vecteurErreur(attendu, repondu, 'majeur'), {
    angulaire: 2,
    radial: 2,
    cardinalite: 1,
    arcFranchi: true,
  })
  // Retrait de septième : cardinalité négative.
  assert.equal(
    vecteurErreur(a({ degre: 5, septieme: true }), a({ degre: 5 }), 'majeur').cardinalite,
    -1,
  )
})

test('vecteurErreur : refuse un accord à mode inversé (non chiffrable)', () => {
  const normal = a({ degre: 1 })
  const inverse = a({ degre: 1, modeInverse: true })
  assert.throws(() => vecteurErreur(normal, inverse, 'majeur'), /mode inversé/)
  assert.throws(() => vecteurErreur(inverse, normal, 'majeur'), /mode inversé/)
})

// ── Classification ───────────────────────────────────────────────────────────

test('I6 répondu pour I ⟹ basse_non_entendue', () => {
  assert.equal(diag(a({ degre: 1 }), a({ degre: 1, renversement: 1 })), 'basse_non_entendue')
})

test('V7 répondu pour V ⟹ cardinalite', () => {
  assert.equal(diag(a({ degre: 5 }), a({ degre: 5, septieme: true })), 'cardinalite')
  // La basse prime sur la cardinalité quand les deux dévient.
  assert.equal(
    diag(a({ degre: 5 }), a({ degre: 5, renversement: 1, septieme: true })),
    'basse_non_entendue',
  )
})

test('V répondu pour I ⟹ sonorite_sur_fonction (distance 2, arc franchi)', () => {
  assert.equal(diag(a({ degre: 1 }), a({ degre: 5 })), 'sonorite_sur_fonction')
})

// CORRECTION au test de la spec §7, qui annonçait `sonorite_sur_fonction` : III et
// V sont à distance 1 ET partagent l'arc D — la §5 à jour les classe `degre_voisin`.
test('III répondu pour V ⟹ degre_voisin (arc D partagé), pas sonorite_sur_fonction', () => {
  assert.equal(franchitArc(5, 3), false)
  assert.equal(distanceAngulaire(5, 3), 1)
  assert.equal(diag(a({ degre: 5 }), a({ degre: 3 })), 'degre_voisin')
})

test('IV répondu pour II ⟹ degre_voisin (arc S partagé)', () => {
  assert.equal(diag(a({ degre: 2 }), a({ degre: 4 })), 'degre_voisin')
})

test('II répondu pour VII ⟹ couture — et c’est la seule paire qui la déclenche', () => {
  assert.equal(diag(a({ degre: 7 }), a({ degre: 2 })), 'couture')
  assert.equal(diag(a({ degre: 2 }), a({ degre: 7 })), 'couture')
  assert.equal(diag(a({ degre: 7 }), a({ degre: 2 }), 'mineur'), 'couture')

  const paires = DEGRES.flatMap((x) => DEGRES.map((y) => [x, y] as [Degre, Degre]))
  const couture = paires
    .filter(([x, y]) => diag(a({ degre: x }), a({ degre: y })) === 'couture')
    .map(([x, y]) => [x, y].sort().join('-'))
  assert.deepEqual([...new Set(couture)], ['2-7'])
})

test('IV répondu pour V ⟹ erreur_franche (distance 3)', () => {
  assert.equal(distanceAngulaire(5, 4), 3)
  assert.equal(diag(a({ degre: 5 }), a({ degre: 4 })), 'erreur_franche')
})

test('sonorite_sur_fonction : exactement quatre paires — I–V, V–II, VII–IV, IV–I', () => {
  const paires = DEGRES.flatMap((x) => DEGRES.map((y) => [x, y] as [Degre, Degre]))
  const trouvees = paires
    .filter(([x, y]) => diag(a({ degre: x }), a({ degre: y })) === 'sonorite_sur_fonction')
    .map(([x, y]) => [x, y].sort().join('-'))
  assert.deepEqual([...new Set(trouvees)].sort(), ['1-4', '1-5', '2-5', '4-7'])
})

test('diagnostiquer : classification totale, aucun cas non couvert', () => {
  const renversements = [0, 1, 2] as const
  const valides: Diagnostic[] = [
    'exact',
    'basse_non_entendue',
    'cardinalite',
    'degre_voisin',
    'couture',
    'sonorite_sur_fonction',
    'erreur_franche',
  ]
  let cas = 0
  for (const mode of ['majeur', 'mineur'] as Mode[]) {
    for (const dx of DEGRES) {
      for (const dy of DEGRES) {
        for (const rx of renversements) {
          for (const ry of renversements) {
            for (const sx of [false, true]) {
              const attendu = a({ degre: dx, renversement: rx, septieme: sx })
              const repondu = a({ degre: dy, renversement: ry, septieme: false })
              assert.ok(valides.includes(diag(attendu, repondu, mode)), `${dx}/${dy}`)
              cas++
            }
          }
        }
      }
    }
  }
  assert.equal(cas, 2 * 7 * 7 * 3 * 3 * 2)
})

// ── Indice de déduction ──────────────────────────────────────────────────────

test('indiceDeDeduction : 0 sans faute exploitable', () => {
  const suite = [1, 5, 1].map((d) => ({ attendu: a({ degre: d as Degre }), repondu: a({ degre: d as Degre }) }))
  assert.equal(indiceDeDeduction(suite, MATRICE_MAJEUR), 0)
  assert.equal(indiceDeDeduction([], MATRICE_MAJEUR), 0)
})

test('indiceDeDeduction : 1 quand la faute est la continuation la plus probable', () => {
  // Attendu I–V–I. L'élève répond IV au lieu de V : depuis I, IV pèse .25 —
  // autant que le maximum de la ligne. Réponse entièrement explicable par la syntaxe.
  const suite = [
    { attendu: a({ degre: 1 }), repondu: a({ degre: 1 }) },
    { attendu: a({ degre: 5 }), repondu: a({ degre: 4 }) },
    { attendu: a({ degre: 1 }), repondu: a({ degre: 1 }) },
  ]
  assert.equal(indiceDeDeduction(suite, MATRICE_MAJEUR), 1)
})

test('indiceDeDeduction : faible quand la faute est syntaxiquement improbable', () => {
  // III depuis I pèse .05 contre un maximum de ligne à .25 → 0.2.
  const suite = [
    { attendu: a({ degre: 1 }), repondu: a({ degre: 1 }) },
    { attendu: a({ degre: 5 }), repondu: a({ degre: 3 }) },
  ]
  assert.ok(Math.abs(indiceDeDeduction(suite, MATRICE_MAJEUR) - 0.2) < 1e-9)
})

test('indiceDeDeduction : toujours dans [0, 1]', () => {
  for (const x of DEGRES) {
    for (const y of DEGRES) {
      for (const z of DEGRES) {
        const suite = [
          { attendu: a({ degre: x }), repondu: a({ degre: x }) },
          { attendu: a({ degre: y }), repondu: a({ degre: z }) },
        ]
        const indice = indiceDeDeduction(suite, MATRICE_MAJEUR)
        assert.ok(indice >= 0 && indice <= 1, `${x}/${y}/${z} → ${indice}`)
      }
    }
  }
})

// ── Dictée de basse (niveau 1) ───────────────────────────────────────────────

test('evaluerBasse : réponse exacte, aucune erreur', () => {
  assert.deepEqual(evaluerBasse([1, 4, 5, 1], { hauteurs: [1, 4, 5, 1] }), [])
})

test('evaluerBasse : écart signé en degrés de gamme', () => {
  const erreurs = evaluerBasse([1, 4, 5, 1], { hauteurs: [1, 5, 5, 1] })
  assert.deepEqual(erreurs, [{ index: 1, attendu: 4, repondu: 5, ecart: 1 }])
})

test('evaluerBasse : sentinelle 0 pour les positions manquantes ou surnuméraires', () => {
  assert.deepEqual(evaluerBasse([1, 4, 5], { hauteurs: [1, 4] }), [
    { index: 2, attendu: 5, repondu: 0, ecart: -5 },
  ])
  assert.deepEqual(evaluerBasse([1, 4], { hauteurs: [1, 4, 5] }), [
    { index: 2, attendu: 0, repondu: 5, ecart: 5 },
  ])
})
