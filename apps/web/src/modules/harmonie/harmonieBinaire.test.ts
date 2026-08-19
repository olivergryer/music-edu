import test from 'node:test'
import assert from 'node:assert/strict'

import {
  accordDeLaReponse,
  ITEMS_PAR_SESSION_BINAIRE,
  NIVEAUX_BINAIRE,
  ciblesPossibles,
  construireSessionBinaire,
  reponseAttendue,
  type Reponse,
  reponsesEquilibrees,
  scorerBinaire,
  specBinaire,
  type ReponseBinaire,
} from './binaire.ts'
import { niveauSpec } from './niveaux.ts'
import { creerAccord, type Mode } from './types.ts'

const MODES: Mode[] = ['majeur', 'mineur']

// ─── La question dépend du niveau ────────────────────────────────────────────

test('les trois niveaux du barème portent bien la tâche choix_binaire', () => {
  for (const niveau of NIVEAUX_BINAIRE) {
    assert.equal(niveauSpec(niveau).tache, 'choix_binaire', `niveau ${niveau}`)
    const spec = specBinaire(niveau)
    assert.equal(spec.options.length, 2)
    assert.notEqual(spec.options[0], spec.options[1])
  }
})

test('un niveau qui n’est pas binaire est refusé', () => {
  assert.throws(() => specBinaire(3), /n'est pas un choix binaire/)
  assert.throws(() => specBinaire(6), /n'est pas un choix binaire/)
})

test('niveau 2 : seules la dominante et la sous-dominante sont interrogeables', () => {
  assert.equal(reponseAttendue(2, creerAccord(0, { degre: 5 })), 0)
  assert.equal(reponseAttendue(2, creerAccord(0, { degre: 4 })), 1)
  // La tonique n'est ni l'une ni l'autre : l'item n'aurait pas de réponse.
  assert.equal(reponseAttendue(2, creerAccord(0, { degre: 1 })), null)
})

test('niveau 4 : la réponse porte sur la basse', () => {
  assert.equal(reponseAttendue(4, creerAccord(0, { degre: 4, renversement: 0 })), 0)
  assert.equal(reponseAttendue(4, creerAccord(0, { degre: 4, renversement: 1 })), 1)
})

// L'honnêteté de l'item : demander « avec ou sans septième ? » sur un degré qui
// ne peut pas en porter donnerait une question à réponse unique.
test('niveau 5 : seuls les degrés de septiemeSur sont interrogeables', () => {
  const spec = niveauSpec(5)
  assert.deepEqual(spec.septiemeSur, [5])

  assert.equal(reponseAttendue(5, creerAccord(0, { degre: 5, septieme: true })), 1)
  assert.equal(reponseAttendue(5, creerAccord(0, { degre: 5, septieme: false })), 0)
  assert.equal(reponseAttendue(5, creerAccord(0, { degre: 4 })), null)
  assert.equal(reponseAttendue(5, creerAccord(0, { degre: 1 })), null)
})

// ─── L'équilibrage — la pièce maîtresse ──────────────────────────────────────

test('reponsesEquilibrees rend autant de 0 que de 1', () => {
  for (const n of [2, 4, 10, 20]) {
    const suite = reponsesEquilibrees(n, 42)
    assert.equal(suite.length, n)
    assert.equal(suite.filter((r) => r === 0).length, n / 2, `n = ${n}`)
  }
  // Nombre impair : à un près.
  const impair = reponsesEquilibrees(7, 42)
  assert.equal(impair.filter((r) => r === 0).length, 4)
})

// Une alternance stricte serait équilibrée ET devinable : le mélange compte.
test('l’ordre des réponses n’est pas une alternance', () => {
  const suite = reponsesEquilibrees(10, 2026)
  const alterne = suite.every((r, i) => r === ((i % 2) as 0 | 1))
  assert.equal(alterne, false)
  // Déterministe malgré le mélange.
  assert.deepEqual(reponsesEquilibrees(10, 2026), suite)
})

test('répondre toujours la même chose plafonne à la moitié', () => {
  for (const mode of MODES) {
    for (const niveau of NIVEAUX_BINAIRE) {
      const session = construireSessionBinaire(mode, niveau, 4242)
      const zeros = session.filter((i) => i.reponse === 0).length
      assert.equal(
        zeros,
        session.length / 2,
        `${mode} niveau ${niveau} : ${zeros}/${session.length} de réponse 0`,
      )
    }
  }
})

// ─── Les items ───────────────────────────────────────────────────────────────

test('la session est déterministe et l’accord visé porte bien la réponse annoncée', () => {
  for (const mode of MODES) {
    for (const niveau of NIVEAUX_BINAIRE) {
      const session = construireSessionBinaire(mode, niveau, 77)
      assert.equal(session.length, ITEMS_PAR_SESSION_BINAIRE)
      assert.deepEqual(construireSessionBinaire(mode, niveau, 77), session)

      for (const item of session) {
        const accord = item.progression.accords[item.cible]
        assert.equal(
          reponseAttendue(niveau, accord),
          item.reponse,
          `${mode} niveau ${niveau} item ${item.index}`,
        )
      }
    }
  }
})

// Même raison qu'en détection : le premier accord est imposé sur I, le dernier
// borné par `finales` — tous deux partiellement prévisibles sans écouter.
test('la cible est toujours intérieure', () => {
  for (const mode of MODES) {
    for (const niveau of NIVEAUX_BINAIRE) {
      for (const item of construireSessionBinaire(mode, niveau, 9)) {
        assert.ok(item.cible >= 1, `cible ${item.cible} sur une borne`)
        assert.ok(item.cible <= item.progression.accords.length - 2, `cible ${item.cible} finale`)
      }
    }
  }
})

test('ciblesPossibles écarte les accords non interrogeables', () => {
  for (const mode of MODES) {
    for (const niveau of NIVEAUX_BINAIRE) {
      for (const item of construireSessionBinaire(mode, niveau, 3)) {
        for (const i of ciblesPossibles(item.progression, niveau)) {
          assert.notEqual(reponseAttendue(niveau, item.progression.accords[i]), null)
        }
      }
    }
  }
})

test('les progressions respectent le vocabulaire de leur niveau', () => {
  for (const mode of MODES) {
    for (const niveau of NIVEAUX_BINAIRE) {
      const spec = niveauSpec(niveau)
      for (const item of construireSessionBinaire(mode, niveau, 555)) {
        for (const accord of item.progression.accords) {
          assert.ok(spec.vocabulaire.includes(accord.degre), `degré ${accord.degre}`)
          assert.ok(spec.renversements.includes(accord.renversement), `renv. ${accord.renversement}`)
          if (accord.septieme) assert.ok(spec.septiemeSur.includes(accord.degre), 'septième')
        }
      }
    }
  }
})

// ─── La transposition ────────────────────────────────────────────────────────
//
// `genererProgression` rend toujours `tonique: 0` : sans transposition explicite,
// toute l'activité sonnerait en do et l'élève s'appuierait sur une mémoire de
// hauteurs absolues au lieu d'entendre des fonctions. Le badge de tonalité de
// l'écran n'aurait rien à annoncer non plus.
test('la tonalité change d’un item à l’autre', () => {
  for (const niveau of NIVEAUX_BINAIRE) {
    const toniques = new Set(
      construireSessionBinaire('majeur', niveau, 404).map((i) => i.progression.tonique),
    )
    assert.ok(toniques.size > 4, `niveau ${niveau} : trop peu de tonalités (${toniques.size})`)
  }
})

test('la transposition ne change ni la cible ni la réponse attendue', () => {
  // Le degré, le renversement et la septième — donc les trois questions du
  // binaire — sont indépendants de la tonique. Un test le grave.
  for (const niveau of NIVEAUX_BINAIRE) {
    for (const item of construireSessionBinaire('mineur', niveau, 91)) {
      assert.equal(reponseAttendue(niveau, item.progression.accords[item.cible]), item.reponse)
    }
  }
})

// ─── Le score ────────────────────────────────────────────────────────────────

test('scorerBinaire : cas limites', () => {
  assert.deepEqual(scorerBinaire([]), { score: 0, itemCount: 0, accuracy: 0, medianRtMs: 0 })

  const reponses: ReponseBinaire[] = [
    { index: 0, attendu: 0, repondu: 0, correct: true, rtMs: 1000 },
    { index: 1, attendu: 1, repondu: 0, correct: false, rtMs: 3000 },
  ]
  const r = scorerBinaire(reponses)
  assert.equal(r.score, 50)
  assert.equal(r.accuracy, 0.5)
  assert.equal(r.medianRtMs, 2000)
})

// ─── Entendre la réponse choisie ─────────────────────────────────────────────
//
// À la correction, l'élève entend ce qu'il a RÉPONDU à la place de l'accord visé.
// L'accord fabriqué n'a pas à être grammatical — c'est une erreur rendue audible —
// mais il doit être un accord VALIDE, sans quoi `disposition` ne saurait pas le
// sonoriser.

test('accordDeLaReponse : la réponse juste redonne l’accord visé', () => {
  for (const niveau of NIVEAUX_BINAIRE) {
    for (const item of construireSessionBinaire('majeur', niveau, 55)) {
      const vise = item.progression.accords[item.cible]
      const juste = accordDeLaReponse(item, item.reponse)
      assert.equal(juste.degre, vise.degre, `niveau ${niveau} : degré`)
      assert.equal(juste.renversement, vise.renversement, `niveau ${niveau} : renversement`)
      assert.equal(juste.septieme, vise.septieme, `niveau ${niveau} : septième`)
    }
  }
})

test('accordDeLaReponse : la réponse fausse produit un AUTRE accord', () => {
  for (const niveau of NIVEAUX_BINAIRE) {
    for (const item of construireSessionBinaire('mineur', niveau, 61)) {
      const fausse: Reponse = item.reponse === 0 ? 1 : 0
      const accord = accordDeLaReponse(item, fausse)
      const vise = item.progression.accords[item.cible]
      assert.notDeepEqual(
        [accord.degre, accord.renversement, accord.septieme],
        [vise.degre, vise.renversement, vise.septieme],
        `niveau ${niveau} : la réponse fausse sonnerait comme la juste`,
      )
    }
  }
})

// ⚠ Le 3ᵉ renversement EXIGE la septième : « sans septième » doit retomber au
// fondamental, sinon `assertAccord` lèverait en pleine correction.
test('accordDeLaReponse : « sans septième » ne laisse jamais un 3ᵉ renversement', () => {
  const item = construireSessionBinaire('majeur', 5, 77).find(
    (i) => i.progression.accords[i.cible].septieme,
  )
  assert.ok(item, 'aucun item avec septième au niveau 5')
  const accord = accordDeLaReponse(item, 0)
  assert.equal(accord.septieme, false)
  assert.notEqual(accord.renversement, 3)
})

test('accordDeLaReponse : l’id décrit bien l’accord rendu', () => {
  // L'`id` encode degré, renversement et septième : une copie étalée le laisserait
  // mentir, et le mensonge survivrait jusqu'à la prochaine clé React.
  for (const item of construireSessionBinaire('majeur', 2, 88)) {
    const accord = accordDeLaReponse(item, 1)
    assert.match(accord.id, new RegExp(`${accord.degre}`))
  }
})
