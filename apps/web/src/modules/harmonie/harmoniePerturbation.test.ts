// Moteur de perturbation (spec §4, tests §7 · annexe §4, tests §6).

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  DIFFICULTE_BASE,
  difficulte,
  perturbationsPossibles,
  perturber,
} from './perturbation.ts'
import { violations } from './contraintes.ts'
import { genererProgression, longueursDisponibles } from './generateur.ts'
import { distanceAngulaire, franchitArc } from './geometrie.ts'
import { NIVEAU_MAX_IMPLEMENTE, niveauSpec, perturbationsAutorisees } from './niveaux.ts'
import { qualite, type Mode, type Progression, type TypePerturbation } from './types.ts'

const MODES_TEST: Mode[] = ['majeur', 'mineur']

function echantillon(nombre: number): Progression[] {
  const liste: { mode: Mode; niveau: number; longueur: number }[] = []
  for (let niveau = 2; niveau <= NIVEAU_MAX_IMPLEMENTE; niveau++) {
    for (const longueur of longueursDisponibles(niveauSpec(niveau))) {
      for (const mode of MODES_TEST) liste.push({ mode, niveau, longueur })
    }
  }
  return Array.from({ length: nombre }, (_, i) => {
    const { mode, niveau, longueur } = liste[i % liste.length]
    return genererProgression(mode, niveau, longueur, 5000 + i)
  })
}

// Toutes les perturbations réellement praticables sur l'échantillon.
function* toutesLesPerturbations(progressions: Progression[]) {
  for (const prog of progressions) {
    for (let index = 0; index < prog.accords.length; index++) {
      for (const type of perturbationsPossibles(prog, index, prog.niveau)) {
        yield { prog, index, type, perturbation: perturber(prog, index, type) }
      }
    }
  }
}

// ── Invariants (§4) ──────────────────────────────────────────────────────────

test('perturber ne retourne jamais l’accord original', () => {
  let compte = 0
  for (const { perturbation } of toutesLesPerturbations(echantillon(200))) {
    const { original, substitut } = perturbation
    assert.notEqual(substitut.id, original.id, `${perturbation.type}`)
    assert.ok(
      substitut.degre !== original.degre ||
        substitut.renversement !== original.renversement ||
        substitut.septieme !== original.septieme ||
        Boolean(substitut.modeInverse) !== Boolean(original.modeInverse),
      `substitut identique sur tous les champs (${perturbation.type})`,
    )
    compte++
  }
  assert.ok(compte > 500, `échantillon trop maigre : ${compte} perturbations`)
})

test('chaque type respecte son invariant de préservation', () => {
  for (const { prog, perturbation } of toutesLesPerturbations(echantillon(200))) {
    const { type, original: o, substitut: s } = perturbation
    const angulaire = distanceAngulaire(o.degre, s.degre)

    switch (type) {
      case 'renversement':
        assert.equal(s.degre, o.degre)
        assert.equal(s.septieme, o.septieme)
        assert.notEqual(s.renversement, o.renversement)
        break
      case 'cardinalite':
        assert.equal(s.degre, o.degre)
        assert.notEqual(s.septieme, o.septieme)
        break
      case 'mode':
        assert.equal(s.degre, o.degre)
        assert.equal(s.renversement, o.renversement)
        assert.equal(s.septieme, o.septieme)
        assert.equal(Boolean(s.modeInverse), !o.modeInverse)
        assert.notEqual(qualite(prog.mode, o.degre), 'dim')
        break
      case 'degre_associe':
        assert.equal(angulaire, 1)
        assert.equal(franchitArc(o.degre, s.degre), false)
        break
      case 'fonction_proche':
        assert.ok(angulaire === 1 || angulaire === 2, `angulaire ${angulaire}`)
        assert.equal(franchitArc(o.degre, s.degre), true)
        break
      case 'fonction_lointaine':
        assert.equal(angulaire, 3)
        break
    }
  }
})

// LE PIÈGE PRINCIPAL DU MOTEUR (§4) : une perturbation détectable par la
// grammaire ne mesure plus l'oreille de l'élève.
test('aucune perturbation ne produit un accord violant les contraintes dures', () => {
  let compte = 0
  for (const { prog, index, perturbation } of toutesLesPerturbations(echantillon(300))) {
    const perturbee = prog.accords.slice()
    perturbee[index] = perturbation.substitut
    assert.deepEqual(
      violations(perturbee, prog.mode, prog.niveau),
      [],
      `${prog.id} · index ${index} · ${perturbation.type}`,
    )
    compte++
  }
  assert.ok(compte > 800, `échantillon trop maigre : ${compte} perturbations`)
})

test('type « mode » impossible sur un degré diminué', () => {
  let dimRencontres = 0
  for (const prog of echantillon(300)) {
    prog.accords.forEach((accord, index) => {
      if (qualite(prog.mode, accord.degre) !== 'dim') return
      dimRencontres++
      assert.ok(
        !perturbationsPossibles(prog, index, 7).includes('mode'),
        `${prog.id} · index ${index} · degré ${accord.degre}`,
      )
    })
  }
  assert.ok(dimRencontres > 0, 'aucun accord diminué dans l’échantillon')
})

test('perturber est déterministe : même appel, même substitut', () => {
  const prog = genererProgression('majeur', 6, 6, 31)
  for (let index = 0; index < prog.accords.length; index++) {
    for (const type of perturbationsPossibles(prog, index, 6)) {
      assert.deepEqual(perturber(prog, index, type), perturber(prog, index, type))
    }
  }
})

test('perturber lève quand le type est impraticable à cet index', () => {
  const prog = genererProgression('majeur', 6, 6, 12)
  const impraticables = perturbationsAutorisees(6).filter(
    (type) => !perturbationsPossibles(prog, 0, 6).includes(type),
  )
  for (const type of impraticables) {
    assert.throws(() => perturber(prog, 0, type), /aucun substitut/)
  }
  assert.throws(() => perturber(prog, 99, 'renversement'), /hors de la progression/)
})

// ── Difficulté ───────────────────────────────────────────────────────────────

test('difficulte : toujours dans [0, 1] sur 1000 tirages', () => {
  let compte = 0
  for (const { perturbation } of toutesLesPerturbations(echantillon(300))) {
    const d = perturbation.difficulte
    assert.ok(d >= 0 && d <= 1, `${perturbation.type} → ${d}`)
    compte++
  }
  assert.ok(compte >= 1000, `seulement ${compte} tirages`)
})

test('difficulte : base par type, modulateurs multiplicatifs, plafond à 1', () => {
  const prog = genererProgression('majeur', 6, 6, 3)
  // Index 0 : temps fort, non intérieur, durée médiane → aucun modulateur.
  assert.equal(prog.accords[0].positionMetrique, 'fort')
  assert.equal(difficulte(prog, 0, 'fonction_lointaine'), DIFFICULTE_BASE.fonction_lointaine)

  // Index 1 : temps faible ET intérieur → × 1.2 × 1.1.
  assert.equal(prog.accords[1].positionMetrique, 'faible')
  const attendu = DIFFICULTE_BASE.renversement * 1.2 * 1.1
  assert.ok(Math.abs(difficulte(prog, 1, 'renversement') - attendu) < 1e-9)

  // `degre_associe` en position faible et intérieure dépasse 1 : plafonné.
  assert.equal(difficulte(prog, 1, 'degre_associe'), 1)
})

// Ordre RÉVISÉ AU BANC D'ÉCOUTE (2026-07-31) : la spec plaçait `mode` en 4ᵉ
// position (.60) ; à l'oreille c'est la plus saillante de toutes, parce qu'elle
// est la seule à sortir de la tonalité. Le reste de l'ordre est inchangé.
test('difficulte : l’ordre des bases suit la saillance perceptive validée à l’écoute', () => {
  const ordre: TypePerturbation[] = [
    'mode',
    'fonction_lointaine',
    'renversement',
    'cardinalite',
    'fonction_proche',
    'degre_associe',
  ]
  for (let i = 1; i < ordre.length; i++) {
    assert.ok(
      DIFFICULTE_BASE[ordre[i - 1]] < DIFFICULTE_BASE[ordre[i]],
      `${ordre[i - 1]} ≥ ${ordre[i]}`,
    )
  }
  // `mode` est bien la plus saillante, et non plus une perturbation médiane.
  assert.equal(Math.min(...Object.values(DIFFICULTE_BASE)), DIFFICULTE_BASE.mode)
  // `renversement` et `cardinalite` restent quasi équivalents : écart conventionnel.
  assert.ok(DIFFICULTE_BASE.cardinalite - DIFFICULTE_BASE.renversement <= 0.15)
})

// ── Filtrage par niveau (annexe §4) ──────────────────────────────────────────

test('perturbationsPossibles : vide aux niveaux 0 et 1, sans « renversement » au niveau 3', () => {
  const prog = genererProgression('majeur', 6, 6, 8)
  for (let index = 0; index < prog.accords.length; index++) {
    assert.deepEqual(perturbationsPossibles(prog, index, 0), [])
    assert.deepEqual(perturbationsPossibles(prog, index, 1), [])
    assert.ok(!perturbationsPossibles(prog, index, 3).includes('renversement'))
    assert.ok(!perturbationsPossibles(prog, index, 5).includes('degre_associe'))
  }
})

// CORRECTION au test de la spec §7 (« non vide pour tout index valide ») :
// l'annexe impose déjà [] aux niveaux 0-1, et aux BORNES toute perturbation de
// degré violerait la contrainte n°1 (début imposé, finale imposée) — elle serait
// donc détectable par grammaire. Le contrat tenable porte sur l'intérieur.
test('perturbationsPossibles : non vide pour tout index intérieur, du niveau 2 au niveau 7', () => {
  for (const prog of echantillon(200)) {
    for (let index = 1; index < prog.accords.length - 1; index++) {
      const possibles = perturbationsPossibles(prog, index, prog.niveau)
      assert.ok(possibles.length > 0, `${prog.id} · index ${index} : aucune perturbation`)
    }
  }
})

test('aux bornes, seules les perturbations qui préservent le degré subsistent', () => {
  for (const prog of echantillon(120)) {
    if (prog.niveau < 4) continue
    for (const index of [0, prog.accords.length - 1]) {
      const finales = niveauSpec(prog.niveau).finales
      // Le niveau 3 admet plusieurs finales ; ailleurs la finale est forcée à I.
      if (index > 0 && finales.length !== 1) continue
      for (const type of perturbationsPossibles(prog, index, prog.niveau)) {
        assert.ok(
          ['renversement', 'cardinalite', 'mode'].includes(type),
          `${prog.id} · index ${index} · ${type} déplace le degré à une borne`,
        )
      }
    }
  }
})
