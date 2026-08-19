import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ITEMS_PAR_SESSION_FLUX,
  LONGUEUR_MAX_FLUX,
  LONGUEUR_MIN_FLUX,
  NIVEAU_MAX_FLUX,
  NIVEAU_MIN_FLUX,
  accordSaisi,
  construireSessionFlux,
  degresPossibles,
  echelleEtats,
  etatsPossibles,
  evaluerFlux,
  longueurPourRangFlux,
  scorerFlux,
  type ReponseFlux,
} from './flux.ts'
import { chiffrageplat } from './chiffrage.ts'
import { NIVEAU_MAX_IMPLEMENTE, niveauSpec } from './niveaux.ts'
import { respecteContraintes } from './contraintes.ts'
import { creerAccord, type Accord, type Degre, type Mode } from './types.ts'

const MODES: Mode[] = ['majeur', 'mineur']
const NIVEAUX_FLUX = [6, 7]

// ─── Les bornes ──────────────────────────────────────────────────────────────

test('l’activité s’arrête au dernier niveau réellement générable', () => {
  assert.equal(NIVEAU_MIN_FLUX, 6)
  assert.equal(NIVEAU_MAX_FLUX, NIVEAU_MAX_IMPLEMENTE)
  // Le niveau 8 est déclaré mais son générateur lève : il doit rester hors jeu.
  assert.ok(NIVEAU_MAX_FLUX < 8, 'le niveau 8 ne doit pas être proposé')
})

test('les niveaux jouables portent bien la tâche identification', () => {
  for (const niveau of NIVEAUX_FLUX) {
    assert.equal(niveauSpec(niveau).tache, 'identification', `niveau ${niveau}`)
  }
})

test('un niveau hors bornes est refusé', () => {
  assert.throws(() => construireSessionFlux('majeur', 5, 1), /hors des niveaux jouables/)
  assert.throws(() => construireSessionFlux('majeur', 8, 1), /hors des niveaux jouables/)
})

// ─── Ce que l'élève peut saisir ──────────────────────────────────────────────

// La bande de saisie ne doit jamais offrir un chiffrage que le niveau n'enseigne
// pas : c'est le même principe que le chiffrage affiché en détection.
test('les états proposés restent dans les renversements du niveau', () => {
  for (const niveau of NIVEAUX_FLUX) {
    const spec = niveauSpec(niveau)
    for (const degre of degresPossibles(niveau)) {
      for (const etat of etatsPossibles(niveau, degre)) {
        assert.ok(
          spec.renversements.includes(etat.renversement),
          `niveau ${niveau} degré ${degre} : renversement ${etat.renversement}`,
        )
        if (etat.septieme) {
          assert.ok(
            spec.septiemeSur.includes(degre),
            `niveau ${niveau} : septième offerte sur le degré ${degre}`,
          )
        }
      }
    }
  }
})

test('la septième n’est offerte que sur les degrés qui la portent', () => {
  // Niveau 6 : septiemeSur = [5, 2].
  assert.ok(etatsPossibles(6, 5).some((e) => e.septieme))
  assert.ok(etatsPossibles(6, 2).some((e) => e.septieme))
  assert.ok(!etatsPossibles(6, 1).some((e) => e.septieme))
  assert.ok(!etatsPossibles(6, 4).some((e) => e.septieme))
  // Niveau 7 : le IV s'y ajoute.
  assert.ok(etatsPossibles(7, 4).some((e) => e.septieme))
})

test('les trois sons viennent avant les septièmes', () => {
  const etats = etatsPossibles(7, 5)
  const premierAvecSeptieme = etats.findIndex((e) => e.septieme)
  assert.ok(premierAvecSeptieme > 0)
  assert.ok(etats.slice(0, premierAvecSeptieme).every((e) => !e.septieme))
  assert.ok(etats.slice(premierAvecSeptieme).every((e) => e.septieme))
})

// ─── L'échelle de saisie au geste ────────────────────────────────────────────

test('l’échelle contient exactement les états saisissables', () => {
  for (const niveau of NIVEAUX_FLUX) {
    for (const degre of degresPossibles(niveau)) {
      const { etats } = echelleEtats(niveau, degre)
      const attendus = etatsPossibles(niveau, degre)
      assert.equal(etats.length, attendus.length, `niveau ${niveau} degré ${degre}`)
      for (const e of attendus) {
        assert.ok(
          etats.some((x) => x.renversement === e.renversement && x.septieme === e.septieme),
          `état absent de l’échelle : niveau ${niveau} degré ${degre}`,
        )
      }
    }
  }
})

test('le repos est le trois sons fondamental — un simple appui le valide', () => {
  for (const niveau of NIVEAUX_FLUX) {
    for (const degre of degresPossibles(niveau)) {
      const { etats, repos } = echelleEtats(niveau, degre)
      assert.deepEqual(etats[repos], { renversement: 0, septieme: false }, `degré ${degre}`)
    }
  }
})

// Le sens du geste EST la spec : vers le haut on renverse le trois sons, vers le
// bas on passe à la septième et on la renverse.
test('au-dessus du repos : les trois sons, de plus en plus renversés', () => {
  for (const niveau of NIVEAUX_FLUX) {
    for (const degre of degresPossibles(niveau)) {
      const { etats, repos } = echelleEtats(niveau, degre)
      const haut = etats.slice(repos)
      assert.ok(haut.every((e) => !e.septieme), `degré ${degre} : une septième vers le haut`)
      for (let i = 1; i < haut.length; i++) {
        assert.ok(haut[i].renversement > haut[i - 1].renversement, `degré ${degre}`)
      }
    }
  }
})

test('en dessous du repos : la septième, de plus en plus renversée', () => {
  for (const niveau of NIVEAUX_FLUX) {
    for (const degre of degresPossibles(niveau)) {
      const { etats, repos } = echelleEtats(niveau, degre)
      const bas = etats.slice(0, repos)
      assert.ok(bas.every((e) => e.septieme), `degré ${degre} : un trois sons vers le bas`)
      // Lu du repos vers le bas, donc l'ordre du tableau est décroissant en index.
      for (let i = 1; i < bas.length; i++) {
        assert.ok(bas[i].renversement < bas[i - 1].renversement, `degré ${degre}`)
      }
    }
  }
})

test('un degré sans septième n’a pas de cran vers le bas', () => {
  const { etats, repos } = echelleEtats(6, 1) // niveau 6 : septiemeSur = [5, 2]
  assert.equal(repos, 0)
  assert.deepEqual(etats, [
    { renversement: 0, septieme: false },
    { renversement: 1, septieme: false },
  ])
})

// ⚠ Le chiffrage plat sert de CLÉ à la roue (`RoueFigee` renvoie le libellé
// affiché). Deux états au même chiffrage rendraient la saisie silencieusement
// fausse : l'un serait inatteignable.
test('les chiffrages d’un même degré sont deux à deux distincts', () => {
  for (const niveau of NIVEAUX_FLUX) {
    for (const mode of MODES) {
      for (const degre of degresPossibles(niveau)) {
        const libelles = echelleEtats(niveau, degre).etats.map((e) =>
          chiffrageplat(accordSaisi(degre, e, 0)),
        )
        assert.equal(
          new Set(libelles).size,
          libelles.length,
          `collision de chiffrage : ${mode} niveau ${niveau} degré ${degre} — ${libelles.join(' ')}`,
        )
      }
    }
  }
})

test('le vocabulaire saisissable est celui du niveau, trié', () => {
  for (const niveau of NIVEAUX_FLUX) {
    const degres = degresPossibles(niveau)
    assert.deepEqual(degres, [...niveauSpec(niveau).vocabulaire].sort((a, b) => a - b))
    assert.deepEqual(degres, [...degres].sort((a, b) => a - b))
  }
})

// ─── La session ──────────────────────────────────────────────────────────────

test('la longueur monte du plus court au plus long', () => {
  assert.equal(longueurPourRangFlux(0, 5), LONGUEUR_MIN_FLUX)
  assert.equal(longueurPourRangFlux(4, 5), LONGUEUR_MAX_FLUX)
  for (let i = 1; i < 5; i++) {
    assert.ok(longueurPourRangFlux(i, 5) >= longueurPourRangFlux(i - 1, 5), `rang ${i}`)
  }
})

test('la session est déterministe et respecte les contraintes dures', () => {
  for (const mode of MODES) {
    for (const niveau of NIVEAUX_FLUX) {
      const session = construireSessionFlux(mode, niveau, 4242)
      assert.equal(session.length, ITEMS_PAR_SESSION_FLUX)
      assert.deepEqual(construireSessionFlux(mode, niveau, 4242), session)

      for (const item of session) {
        const n = item.progression.accords.length
        assert.ok(n >= LONGUEUR_MIN_FLUX && n <= LONGUEUR_MAX_FLUX, `longueur ${n}`)
        assert.ok(
          respecteContraintes(item.progression.accords, mode, niveau),
          `contraintes violées (${mode}, niveau ${niveau}, item ${item.index})`,
        )
      }
    }
  }
})

// Sans ça, l'élève verrait un accord qu'il ne peut pas saisir.
test('tout accord attendu est saisissable avec la bande du niveau', () => {
  for (const mode of MODES) {
    for (const niveau of NIVEAUX_FLUX) {
      for (const item of construireSessionFlux(mode, niveau, 77)) {
        for (const accord of item.progression.accords) {
          assert.ok(
            degresPossibles(niveau).includes(accord.degre),
            `degré ${accord.degre} non saisissable`,
          )
          assert.ok(
            etatsPossibles(niveau, accord.degre).some(
              (e) => e.renversement === accord.renversement && e.septieme === accord.septieme,
            ),
            `état non saisissable : degré ${accord.degre}, renv. ${accord.renversement}, ` +
              `septième ${accord.septieme}`,
          )
        }
      }
    }
  }
})

// ─── L'évaluation — les quatre canaux prennent enfin leur sens ───────────────

test('une saisie identique est exacte, et son vecteur est nul', () => {
  const attendu = [creerAccord(0, { degre: 1 }), creerAccord(1, { degre: 5, septieme: true })]
  const resultats = evaluerFlux(attendu, attendu, 'majeur')

  assert.ok(resultats.every((r) => r.exact))
  assert.ok(resultats.every((r) => r.diagnostic === 'exact'))
  assert.deepEqual(resultats[0].vecteur, {
    angulaire: 0,
    radial: 0,
    cardinalite: 0,
    arcFranchi: false,
  })
})

test('les canaux se remplissent selon la faute', () => {
  const attendu = [creerAccord(0, { degre: 5 })]

  // Même degré, autre basse → canal radial.
  const [basse] = evaluerFlux(attendu, [creerAccord(0, { degre: 5, renversement: 1 })], 'majeur')
  assert.equal(basse.diagnostic, 'basse_non_entendue')
  assert.equal(basse.vecteur?.radial, 1)
  assert.equal(basse.vecteur?.angulaire, 0)

  // Même degré, septième ajoutée → canal cardinalité.
  const [card] = evaluerFlux(attendu, [creerAccord(0, { degre: 5, septieme: true })], 'majeur')
  assert.equal(card.diagnostic, 'cardinalite')
  assert.equal(card.vecteur?.cardinalite, 1)

  // VII pour V : deux pas sur le cercle, arc partagé (D) → degré voisin.
  const [voisin] = evaluerFlux(attendu, [creerAccord(0, { degre: 7 })], 'majeur')
  assert.equal(voisin.diagnostic, 'degre_voisin')
})

test('une case vide n’est ni exacte ni diagnostiquée', () => {
  const attendu = [creerAccord(0, { degre: 1 })]
  const [vide] = evaluerFlux(attendu, [null], 'majeur')

  assert.equal(vide.repondu, null)
  assert.equal(vide.exact, false)
  // Pas de vecteur inventé : il n'y a rien à mesurer.
  assert.equal(vide.vecteur, null)
  assert.equal(vide.diagnostic, null)
})

test('accordSaisi reconstruit un accord conforme', () => {
  const a: Accord = accordSaisi(5 as Degre, { renversement: 1, septieme: true }, 2)
  assert.equal(a.degre, 5)
  assert.equal(a.renversement, 1)
  assert.equal(a.septieme, true)
})

// ─── La transposition ────────────────────────────────────────────────────────
//
// Comme partout ailleurs dans le module : `genererProgression` rend `tonique: 0`,
// et sans transposition explicite tout le flux sonnerait en do.
test('la tonalité change d’un item à l’autre', () => {
  for (const niveau of [NIVEAU_MIN_FLUX, NIVEAU_MAX_FLUX]) {
    const toniques = new Set(
      construireSessionFlux('majeur', niveau, 512).map((i) => i.progression.tonique),
    )
    assert.ok(toniques.size > 4, `niveau ${niveau} : trop peu de tonalités (${toniques.size})`)
  }
})

// ─── Le score ────────────────────────────────────────────────────────────────

function reponse(attendus: Accord[], repondus: (Accord | null)[], rtMs = 5000): ReponseFlux {
  const resultats = evaluerFlux(attendus, repondus, 'majeur')
  return {
    index: 0,
    resultats,
    justes: resultats.filter((r) => r.exact).length,
    total: attendus.length,
    rtMs,
  }
}

test('scorerFlux compte les accords, pas seulement les suites parfaites', () => {
  const attendus = [
    creerAccord(0, { degre: 1 }),
    creerAccord(1, { degre: 4 }),
    creerAccord(2, { degre: 5 }),
    creerAccord(3, { degre: 1 }),
  ]
  const repondus = [attendus[0], attendus[1], creerAccord(2, { degre: 7 }), attendus[3]]

  const r = scorerFlux([reponse(attendus, repondus)], 'majeur')
  assert.equal(r.itemCount, 1)
  // Aucune suite parfaite…
  assert.equal(r.accuracy, 0)
  // …mais trois accords sur quatre justes : le score suit les accords.
  assert.equal(r.precisionAccords, 0.75)
  assert.equal(r.score, 75)
})

// Les sept diagnostics ne s'agrègent pas : les remédiations sont opposées.
test('scorerFlux ventile les fautes par diagnostic, sans compter les exacts', () => {
  const attendus = [creerAccord(0, { degre: 5 }), creerAccord(1, { degre: 1 })]
  const repondus = [creerAccord(0, { degre: 5, renversement: 1 }), attendus[1]]

  const r = scorerFlux([reponse(attendus, repondus)], 'majeur')
  assert.deepEqual(r.parDiagnostic, [{ diagnostic: 'basse_non_entendue', nombre: 1 }])
})

test('scorerFlux : session vide', () => {
  const r = scorerFlux([], 'majeur')
  assert.equal(r.score, 0)
  assert.equal(r.itemCount, 0)
  assert.equal(r.precisionAccords, 0)
  assert.deepEqual(r.parDiagnostic, [])
  assert.equal(r.indiceDeduction, 0)
})

// Convention de `indiceDeDeduction` : 0 en l'absence de faute exploitable.
test('l’indice de déduction est nul quand tout est juste', () => {
  const attendus = [
    creerAccord(0, { degre: 1 }),
    creerAccord(1, { degre: 4 }),
    creerAccord(2, { degre: 5 }),
  ]
  assert.equal(scorerFlux([reponse(attendus, attendus)], 'majeur').indiceDeduction, 0)
})

test('l’indice de déduction reste dans [0, 1] sur des fautes réelles', () => {
  const attendus = [
    creerAccord(0, { degre: 1 }),
    creerAccord(1, { degre: 4 }),
    creerAccord(2, { degre: 2 }),
  ]
  const repondus = [attendus[0], creerAccord(1, { degre: 5 }), creerAccord(2, { degre: 5 })]

  const indice = scorerFlux([reponse(attendus, repondus)], 'majeur').indiceDeduction
  assert.ok(indice >= 0 && indice <= 1, `indice ${indice}`)
})
