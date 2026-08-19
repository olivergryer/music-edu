import test from 'node:test'
import assert from 'node:assert/strict'

import {
  APPROCHES,
  COMBINAISONS,
  ITEMS_PAR_SESSION_CADENCES,
  NIVEAU_CADENCES,
  TYPES_CADENCE,
  accordsDiatoniques,
  approchesDuPalier,
  construireItemCadence,
  construireSessionCadences,
  couplesDuPalier,
  couplesEquilibres,
  degreFinal,
  questionApproche,
  partitionDeCadence,
  realiserCadence,
  scorerCadences,
  signatureRespectee,
  typesDuPalier,
  violationsCadence,
  type Approche,
  type Contexte,
  type ItemCadence,
  type Palier,
  type ReponseCadence,
  type TypeCadence,
  itemDeLaReponse,
} from './cadences.ts'
import { TESSITURES } from './dispositions.ts'
import { cleVex } from './notation.ts'
import { classeDeHauteur } from './tonalites.ts'
import { niveauSpec } from './niveaux.ts'
import { MODES, type Mode } from './types.ts'

const PALIERS: Palier[] = ['niveau3', 'tout']
const CONTEXTES: Contexte[] = ['nue', 'phrase']
const GRAINES = [1, 4242, 90210]

// ─── Les paliers ─────────────────────────────────────────────────────────────

test('le niveau 3 propose exactement les quatre cadences du barème', () => {
  // `niveaux.ts` les énumère en commentaire ; ses `finales` les confirment.
  assert.deepEqual(typesDuPalier('niveau3'), ['parfaite', 'demi', 'plagale', 'rompue'])
  assert.deepEqual(niveauSpec(NIVEAU_CADENCES).finales, [1, 5, 6])
  assert.equal(niveauSpec(NIVEAU_CADENCES).tache, 'choix_multiple')
})

test('l’imparfaite et les chromatiques n’arrivent qu’au palier « tout »', () => {
  assert.ok(!typesDuPalier('niveau3').includes('imparfaite'))
  assert.deepEqual(typesDuPalier('tout'), [...TYPES_CADENCE])
  assert.deepEqual(approchesDuPalier('niveau3'), ['aucune'])
  assert.deepEqual(approchesDuPalier('tout'), [...APPROCHES])
})

// Une question à une seule réponse possible n'est pas une question.
test('la question de l’approche ne se pose qu’au palier « tout »', () => {
  assert.equal(questionApproche('niveau3'), false)
  assert.equal(questionApproche('tout'), true)
})

test('la plagale n’admet aucune approche chromatique', () => {
  for (const approche of APPROCHES) {
    if (approche === 'aucune') continue
    assert.ok(
      !COMBINAISONS[approche].includes('plagale'),
      `${approche} ne devrait pas approcher une plagale`,
    )
  }
  assert.ok(COMBINAISONS.aucune.includes('plagale'))
})

test('une combinaison hors table est refusée à la construction', () => {
  assert.throws(
    () => construireItemCadence('majeur', 'tout', 'nue', 'plagale', 'allemande', 1, 0),
    /n’approche pas/,
  )
  assert.throws(
    () => construireItemCadence('majeur', 'niveau3', 'nue', 'imparfaite', 'aucune', 1, 0),
    /hors du palier/,
  )
})

// ─── Les items ───────────────────────────────────────────────────────────────

function tousLesItems(): { item: ItemCadence; contexte: string }[] {
  const sortie: { item: ItemCadence; contexte: string }[] = []
  for (const mode of MODES) {
    for (const palier of PALIERS) {
      for (const contexte of CONTEXTES) {
        for (const graine of GRAINES) {
          for (const item of construireSessionCadences(mode, palier, contexte, graine)) {
            sortie.push({ item, contexte: `${mode}/${palier}/${contexte}/${graine}` })
          }
        }
      }
    }
  }
  return sortie
}

test('toute cadence générée satisfait la signature de son type', () => {
  for (const { item, contexte } of tousLesItems()) {
    assert.ok(
      signatureRespectee(item),
      `${contexte} : ${item.type}/${item.approche} — signature non respectée`,
    )
  }
})

test('aucune cadence ne viole les contraintes d’écriture', () => {
  for (const { item, contexte } of tousLesItems()) {
    assert.deepEqual(
      violationsCadence(item),
      [],
      `${contexte} : ${item.type}/${item.approche}`,
    )
  }
})

// Les finales déclarées par le niveau 3 sont exactement celles de ses cadences :
// I pour parfaite et plagale, V pour la demi, VI pour la rompue.
test('la finale de chaque cadence est une finale du niveau 3', () => {
  const finales = niveauSpec(NIVEAU_CADENCES).finales
  for (const { item, contexte } of tousLesItems()) {
    assert.ok(finales.includes(degreFinal(item)), `${contexte} : finale ${degreFinal(item)}`)
  }
})

test('l’accord chromatique remplace le préparateur, il ne s’y ajoute pas', () => {
  // Demi-cadence : la seule à porter un préparateur diatonique.
  const sans = construireItemCadence('mineur', 'tout', 'nue', 'demi', 'aucune', 7, 0)
  const avec = construireItemCadence('mineur', 'tout', 'nue', 'demi', 'allemande', 7, 0)

  assert.equal(sans.membres.length, avec.membres.length)
  // Sans approche : IV puis V. Avec : la sixte allemande puis V.
  const avantDernier = avec.membres[avec.membres.length - 2]
  assert.equal(avantDernier.sorte, 'chromatique')
  assert.equal(accordsDiatoniques(avec).length, accordsDiatoniques(sans).length - 1)
})

test('l’accord chromatique précède toujours la dominante', () => {
  for (const { item, contexte } of tousLesItems()) {
    const i = item.membres.findIndex((m) => m.sorte === 'chromatique')
    if (i === -1) continue
    const suivant = item.membres[i + 1]
    assert.equal(suivant?.sorte, 'diatonique', `${contexte} : rien après le chromatique`)
    if (suivant.sorte === 'diatonique') {
      assert.equal(suivant.accord.degre, 5, `${contexte} : le chromatique ne mène pas à V`)
    }
  }
})

test('une cadence commence toujours par la tonique', () => {
  for (const { item, contexte } of tousLesItems()) {
    const premier = item.membres[0]
    assert.equal(premier.sorte, 'diatonique', contexte)
    if (premier.sorte === 'diatonique') assert.equal(premier.accord.degre, 1, contexte)
  }
})

test('le contexte « nue » pose la tonique et rien de plus', () => {
  for (const mode of MODES) {
    for (const item of construireSessionCadences(mode, 'tout', 'nue', 3)) {
      assert.equal(item.debutCadence, 1, `${mode} : préparation de ${item.debutCadence} accords`)
    }
  }
})

test('le contexte « phrase » ajoute une préparation', () => {
  const items = construireSessionCadences('majeur', 'tout', 'phrase', 3)
  assert.ok(
    items.some((i) => i.debutCadence > 1),
    'aucune phrase n’a de préparation',
  )
})

// ─── Déterminisme et équilibre ───────────────────────────────────────────────

test('une session est déterministe à graine égale', () => {
  const a = construireSessionCadences('mineur', 'tout', 'phrase', 4242)
  const b = construireSessionCadences('mineur', 'tout', 'phrase', 4242)
  assert.deepEqual(a, b)
  assert.equal(a.length, ITEMS_PAR_SESSION_CADENCES)
})

test('les couples sont équilibrés puis mélangés', () => {
  const disponibles = couplesDuPalier('tout')
  const suite = couplesEquilibres('tout', disponibles.length * 2, 99)

  const compte = new Map<string, number>()
  for (const c of suite) {
    const cle = `${c.type}/${c.approche}`
    compte.set(cle, (compte.get(cle) ?? 0) + 1)
  }
  // Chaque couple exactement deux fois : répondre toujours pareil plafonne bas.
  assert.equal(compte.size, disponibles.length)
  for (const [cle, n] of compte) assert.equal(n, 2, `${cle} tiré ${n} fois`)

  // Et l'ordre n'est pas celui de l'énumération.
  const brut = Array.from({ length: disponibles.length * 2 }, (_, i) => disponibles[i % disponibles.length])
  assert.notDeepEqual(suite, brut)
})

test('tout couple tiré appartient à la table des combinaisons', () => {
  for (const palier of PALIERS) {
    for (const couple of couplesEquilibres(palier, 40, 5)) {
      assert.ok(
        COMBINAISONS[couple.approche].includes(couple.type),
        `${couple.approche} / ${couple.type}`,
      )
      assert.ok(typesDuPalier(palier).includes(couple.type))
    }
  }
})

// ─── Réalisation sonore ──────────────────────────────────────────────────────

const BORNES = [TESSITURES.basse, TESSITURES.tenor, TESSITURES.alto, TESSITURES.soprano]

test('toute cadence se réalise à quatre voix dans les tessitures', () => {
  for (const { item, contexte } of tousLesItems()) {
    const hauteurs = realiserCadence(item)
    assert.equal(hauteurs.length, item.membres.length, contexte)

    hauteurs.forEach((accord, i) => {
      assert.equal(accord.length, 4, `${contexte} accord ${i} : ${accord.length} voix`)
      accord.forEach((h, j) => {
        assert.ok(
          h >= BORNES[j][0] && h <= BORNES[j][1],
          `${contexte} accord ${i} voix ${j} : ${h} hors tessiture`,
        )
      })
      // Les voix montent : basse < ténor < alto < soprano.
      for (let j = 1; j < 4; j++) {
        assert.ok(accord[j] > accord[j - 1], `${contexte} accord ${i} : voix croisées`)
      }
    })
  }
})

test('la cadence parfaite pose bien la tonique au soprano', () => {
  for (const mode of MODES) {
    const item = construireItemCadence(mode, 'niveau3', 'nue', 'parfaite', 'aucune', 11, 0)
    const hauteurs = realiserCadence(item)
    const soprano = hauteurs[hauteurs.length - 1][3]
    assert.equal(
      (((soprano - item.tonique) % 12) + 12) % 12,
      0,
      `${mode} : soprano à ${soprano}, tonique ${item.tonique}`,
    )
  }
})

test('la cadence imparfaite manque au moins une des trois conditions', () => {
  for (const mode of MODES) {
    for (let rang = 0; rang < 6; rang++) {
      const item = construireItemCadence(mode, 'tout', 'nue', 'imparfaite', 'aucune', 21, rang)
      const accords = accordsDiatoniques(item)
      const fin = accords[accords.length - 1]
      const avant = accords[accords.length - 2]
      const soprano = realiserCadence(item).slice(-1)[0][3]
      const sommetTonique = (((soprano - item.tonique) % 12) + 12) % 12 === 0

      assert.ok(
        avant.renversement !== 0 || fin.renversement !== 0 || !sommetTonique,
        `${mode} rang ${rang} : cette « imparfaite » remplit les trois conditions`,
      )
    }
  }
})

// Toute cadence s'ouvre sur le I : la tonalité est posée sans qu'il faille
// préfixer un accord de contexte, contrairement aux autres activités.
test('la première hauteur est bien la tonique', () => {
  for (const mode of MODES) {
    const item = construireItemCadence(mode, 'niveau3', 'nue', 'parfaite', 'aucune', 5, 0)
    const basse = realiserCadence(item)[0][0]
    assert.equal((((basse - item.tonique) % 12) + 12) % 12, 0)
  }
})

// ─── Score ───────────────────────────────────────────────────────────────────

function reponse(
  attenduType: TypeCadence,
  reponduType: TypeCadence | null,
  attendueApproche: Approche = 'aucune',
  reponduApproche: Approche | null = null,
): ReponseCadence {
  return { index: 0, attenduType, reponduType, attendueApproche, reponduApproche, rtMs: 4000 }
}

test('le score porte le TYPE, jamais l’approche', () => {
  const r = scorerCadences([
    reponse('parfaite', 'parfaite', 'allemande', 'italienne'),
    reponse('demi', 'demi', 'napolitaine', 'napolitaine'),
  ])
  // Deux types justes sur deux : le score est plein malgré une approche ratée.
  assert.equal(r.score, 100)
  assert.equal(r.precisionType, 1)
  assert.equal(r.precisionApproche, 0.5)
  assert.equal(r.approchesPosees, 2)
})

test('l’approche n’est comptée que là où la question a été posée', () => {
  const r = scorerCadences([
    reponse('parfaite', 'demi'), // niveau 3 : pas d'approche demandée
    reponse('rompue', 'rompue', 'italienne', 'italienne'),
  ])
  assert.equal(r.precisionType, 0.5)
  assert.equal(r.approchesPosees, 1)
  assert.equal(r.precisionApproche, 1)
})

test('scorerCadences : session vide', () => {
  const r = scorerCadences([])
  assert.equal(r.score, 0)
  assert.equal(r.itemCount, 0)
  assert.equal(r.precisionType, 0)
  assert.equal(r.precisionApproche, 0)
  assert.equal(r.medianRtMs, 0)
})

test('une absence de réponse compte comme une faute', () => {
  const r = scorerCadences([reponse('plagale', null)])
  assert.equal(r.precisionType, 0)
})

// ─── La partition ────────────────────────────────────────────────────────────

test('toute cadence s’écrit, dans les deux vues', () => {
  for (const { item, contexte } of tousLesItems()) {
    for (const vue of ['tonalite', 'ut'] as const) {
      const partition = partitionDeCadence(item, vue)
      assert.equal(partition.notes.length, item.membres.length, `${contexte} (${vue})`)
      assert.ok(partition.armure.length > 0, `${contexte} (${vue}) : armure vide`)

      for (const accord of partition.notes) {
        assert.equal(accord.length, 4, `${contexte} (${vue}) : ${accord.length} voix`)
        for (const note of accord) {
          assert.match(cleVex(note), /^[a-g](#|##|b|bb)?\/-?\d+$/, `${contexte} (${vue})`)
        }
      }
    }
  }
})

test('la partition écrit exactement les hauteurs qui sonnent', () => {
  for (const { item, contexte } of tousLesItems()) {
    const hauteurs = realiserCadence(item)
    partitionDeCadence(item, 'tonalite').notes.forEach((accord, i) => {
      accord.forEach((note, j) => {
        assert.equal(
          classeDeHauteur(note),
          ((hauteurs[i][j] % 12) + 12) % 12,
          `${contexte} accord ${i} voix ${j}`,
        )
      })
    })
  }
})

// En vue « Ut », les deux modes ont l'armure vide — c'est ce qui fait apparaître
// la sensible du mineur en altération accidentelle.
test('la vue « en Ut » n’a pas d’armure', () => {
  for (const mode of MODES) {
    const item = construireItemCadence(mode, 'tout', 'nue', 'demi', 'allemande', 13, 0)
    const attendue = mode === 'majeur' ? 'C' : 'Am'
    assert.equal(partitionDeCadence(item, 'ut').armure, attendue)
  }
})

// ─── Entendre la réponse choisie ─────────────────────────────────────────────
//
// ⚠ C'est un AUTRE exemple, pas la cadence entendue transformée : une parfaite ne
// se change pas en rompue. Ce qui doit être conservé, c'est le CONTEXTE — mode et
// tonalité — sans quoi la comparaison porterait sur deux variables à la fois.

test('itemDeLaReponse garde le mode et la tonalité, change le type', () => {
  const item = construireSessionCadences('majeur', 'niveau3', 'nue', 404)[0]
  for (const type of typesDuPalier('niveau3')) {
    const fabrique = itemDeLaReponse(item, 'niveau3', 'nue', type, 'aucune', 404)
    assert.equal(fabrique.type, type)
    assert.equal(fabrique.mode, item.mode)
    assert.equal(fabrique.tonique, item.tonique)
  }
})

test('itemDeLaReponse est déterministe', () => {
  const item = construireSessionCadences('mineur', 'tout', 'phrase', 7)[0]
  const a = itemDeLaReponse(item, 'tout', 'phrase', 'rompue', 'aucune', 7)
  const b = itemDeLaReponse(item, 'tout', 'phrase', 'rompue', 'aucune', 7)
  assert.deepEqual(a.membres, b.membres)
})

// ⚠ `COMBINAISONS` est un garde-fou : la plagale n'admet aucune approche
// chromatique. Un couple impossible doit RETOMBER sur « aucune », pas lever au
// milieu d'une correction.
test('itemDeLaReponse retombe sur « aucune » quand le couple est impossible', () => {
  const item = construireSessionCadences('mineur', 'tout', 'nue', 21)[0]
  const fabrique = itemDeLaReponse(item, 'tout', 'nue', 'plagale', 'napolitaine', 21)
  assert.equal(fabrique.type, 'plagale')
  assert.equal(fabrique.approche, 'aucune')
})

test('l’exemple fabriqué est sonorisable', () => {
  const item = construireSessionCadences('majeur', 'niveau3', 'phrase', 33)[0]
  for (const type of typesDuPalier('niveau3')) {
    const hauteurs = realiserCadence(itemDeLaReponse(item, 'niveau3', 'phrase', type, 'aucune', 33))
    assert.ok(hauteurs.length > 0, type)
    assert.ok(hauteurs.every((a) => a.length === 4), `${type} : accord incomplet`)
  }
})
