// Activité « détection d'erreur » : construction de session, rampe, encodage, score.
// Et le test qui protège le principe pédagogique : ce qui est ÉCRIT reste lisible
// au niveau de l'élève.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  ITEMS_PAR_SESSION,
  NIVEAU_MAX_DETECTION,
  NIVEAU_MIN_DETECTION,
  POSITIONS_INTERIEURES_MIN,
  TYPES_ORDRE,
  construireItem,
  construireSession,
  decoderDrapeaux,
  difficulteCible,
  encoderDrapeaux,
  fautesParType,
  longueurPourRang,
  scorerSession,
  vecteurDeLItem,
  type ItemDetection,
  type ReponseDetection,
} from './detection.ts'
import { chiffrer, romainChiffre } from './chiffrage.ts'
import { violations } from './contraintes.ts'
import { niveauSpec } from './niveaux.ts'
import { MODES, type Mode, type TypePerturbation } from './types.ts'

const NIVEAUX_JOUABLES = [3, 4, 5, 6, 7]

function sessions(nombre: number): { mode: Mode; niveau: number; items: ItemDetection[] }[] {
  const sortie: { mode: Mode; niveau: number; items: ItemDetection[] }[] = []
  for (let i = 0; i < nombre; i++) {
    const mode = MODES[i % 2]
    const niveau = NIVEAUX_JOUABLES[i % NIVEAUX_JOUABLES.length]
    sortie.push({ mode, niveau, items: construireSession(mode, niveau, 700 + i * 37) })
  }
  return sortie
}

// ── Construction ─────────────────────────────────────────────────────────────

test('construireSession : déterministe à graine fixée', () => {
  for (const niveau of NIVEAUX_JOUABLES) {
    for (const mode of MODES) {
      const a = construireSession(mode, niveau, 42)
      const b = construireSession(mode, niveau, 42)
      assert.deepEqual(a, b, `${mode} niveau ${niveau}`)
    }
  }
})

test('construireSession : des graines différentes donnent des items différents', () => {
  const vus = new Set(
    Array.from({ length: 30 }, (_, g) =>
      construireSession('majeur', 6, g, 3)
        .map((i) => `${i.progression.accords.map((a) => a.degre).join('')}@${i.indexPerturbe}`)
        .join('|'),
    ),
  )
  assert.ok(vus.size > 20, `seulement ${vus.size} sessions distinctes sur 30 graines`)
})

test('construireSession : refuse les niveaux injouables', () => {
  // 0 et 1 : aucune perturbation (annexe §4).
  assert.throws(() => construireSession('majeur', 0, 1), /hors des niveaux jouables/)
  assert.throws(() => construireSession('majeur', 1, 1), /hors des niveaux jouables/)
  // 2 : ses deux gabarits font 3 accords, donc UNE seule position intérieure —
  // la réponse serait forcée et l'item ne mesurerait rien.
  assert.throws(() => construireSession('majeur', 2, 1), /hors des niveaux jouables/)
  assert.throws(() => construireSession('majeur', 8, 1), /hors des niveaux jouables/)
  assert.equal(NIVEAU_MIN_DETECTION, 3)
  assert.equal(NIVEAU_MAX_DETECTION, 7)
})

// Sans choix, pas de mesure : c'est le défaut qu'a révélé le premier pilotage de
// l'écran, où un item de 3 accords n'offrait qu'une réponse possible.
test('tout item offre au moins deux positions intérieures', () => {
  for (const { items } of sessions(30)) {
    for (const item of items) {
      const interieures = item.progression.accords.length - 2
      assert.ok(
        interieures >= POSITIONS_INTERIEURES_MIN,
        `${interieures} position(s) intérieure(s) : réponse forcée`,
      )
    }
  }
})

test('construireSession : 10 items par défaut, rangs consécutifs', () => {
  const items = construireSession('majeur', 6, 5)
  assert.equal(items.length, ITEMS_PAR_SESSION)
  items.forEach((item, i) => assert.equal(item.index, i))
})

test('l’accord altéré est toujours INTÉRIEUR — jamais une borne', () => {
  for (const { items } of sessions(30)) {
    for (const item of items) {
      assert.ok(item.indexPerturbe >= 1, `index ${item.indexPerturbe} : première position`)
      assert.ok(
        item.indexPerturbe <= item.progression.accords.length - 2,
        `index ${item.indexPerturbe} : dernière position`,
      )
    }
  }
})

test('la version entendue ne diffère de l’écrite qu’à une seule position', () => {
  for (const { items } of sessions(30)) {
    for (const item of items) {
      const ecrits = item.progression.accords
      const entendus = item.accordsEntendus
      assert.equal(entendus.length, ecrits.length)
      const differents = ecrits.filter((a, i) => a.id !== entendus[i].id).map((_, i) => i)
      assert.equal(differents.length, 1, `${differents.length} positions altérées`)
      assert.notEqual(entendus[item.indexPerturbe].id, ecrits[item.indexPerturbe].id)
    }
  }
})

// LE PIÈGE PRINCIPAL, hérité de la §4 : une perturbation détectable par la
// grammaire ne mesure plus l'oreille. La version ENTENDUE doit rester une
// progression grammaticalement valide.
test('la version entendue reste grammaticalement valide', () => {
  for (const { mode, niveau, items } of sessions(30)) {
    for (const item of items) {
      assert.deepEqual(
        violations(item.accordsEntendus, mode, niveau),
        [],
        `${mode} niveau ${niveau} item ${item.index}`,
      )
    }
  }
})

// ── Rampe de difficulté ──────────────────────────────────────────────────────

test('difficulteCible : croissante, bornée, stable sur un item isolé', () => {
  const cibles = Array.from({ length: ITEMS_PAR_SESSION }, (_, k) =>
    difficulteCible(k, ITEMS_PAR_SESSION),
  )
  for (let i = 1; i < cibles.length; i++) assert.ok(cibles[i] > cibles[i - 1])
  assert.ok(cibles[0] >= 0 && cibles[cibles.length - 1] <= 1)
  assert.equal(difficulteCible(0, 1), cibles[0])
})

test('longueurPourRang : croissante et toujours produisible par le niveau', () => {
  for (const niveau of NIVEAUX_JOUABLES) {
    const longueurs = Array.from({ length: ITEMS_PAR_SESSION }, (_, k) =>
      longueurPourRang(niveau, k, ITEMS_PAR_SESSION),
    )
    for (let i = 1; i < longueurs.length; i++) {
      assert.ok(longueurs[i] >= longueurs[i - 1], `niveau ${niveau} : longueur décroissante`)
    }
    // Produisible : `construireItem` lèverait sinon.
    assert.doesNotThrow(() => construireItem('majeur', niveau, 3, 0))
    assert.doesNotThrow(() => construireItem('majeur', niveau, 3, ITEMS_PAR_SESSION - 1))
  }
})

test('la difficulté effective progresse sur l’ensemble d’une session', () => {
  // Item par item la rampe peut plafonner (toutes les perturbations praticables
  // ne couvrent pas [0,1]) : on compare donc les moyennes des deux moitiés.
  const moyennes = { debut: 0, fin: 0, n: 0 }
  for (const { items } of sessions(20)) {
    const moitie = Math.floor(items.length / 2)
    const moy = (xs: ItemDetection[]) =>
      xs.reduce((s, i) => s + i.perturbation.difficulte, 0) / xs.length
    moyennes.debut += moy(items.slice(0, moitie))
    moyennes.fin += moy(items.slice(moitie))
    moyennes.n++
  }
  assert.ok(
    moyennes.fin / moyennes.n > moyennes.debut / moyennes.n,
    'la seconde moitié n’est pas plus difficile que la première',
  )
})

// ── Ce qui est ÉCRIT reste lisible au niveau de l'élève ──────────────────────
//
// C'est ce qui rend l'exercice praticable dès le niveau 3 : la référence est lue,
// donc elle ne doit jamais employer une notation que le niveau n'a pas introduite.
test('le chiffrage affiché n’emploie jamais rien hors de NIVEAUX[n]', () => {
  for (const { mode, niveau, items } of sessions(40)) {
    const spec = niveauSpec(niveau)
    for (const item of items) {
      for (const accord of item.progression.accords) {
        assert.ok(spec.vocabulaire.includes(accord.degre), `degré ${accord.degre} niveau ${niveau}`)
        if (accord.septieme) {
          assert.ok(spec.septiemeSur.includes(accord.degre), `septième niveau ${niveau}`)
        }
        // Le chiffrage rendu est non vide et commence par un chiffre romain.
        assert.match(chiffrer(accord, mode), /^[IViv]+°?/)
      }
    }
  }
})

test('chiffrage : casse et « ° » dérivés de la qualité', () => {
  assert.equal(romainChiffre(1, 'majeur'), 'I')
  assert.equal(romainChiffre(2, 'majeur'), 'ii')
  assert.equal(romainChiffre(7, 'majeur'), 'vii°')
  assert.equal(romainChiffre(1, 'mineur'), 'i')
  assert.equal(romainChiffre(3, 'mineur'), 'III') // III naturel : majeur
  assert.equal(romainChiffre(2, 'mineur'), 'ii°')
})

// ── Encodage ─────────────────────────────────────────────────────────────────

test('TYPES_ORDRE couvre les 6 types, sans doublon — ordre FIGÉ', () => {
  assert.equal(TYPES_ORDRE.length, 6)
  assert.equal(new Set(TYPES_ORDRE).size, 6)
  // Toute réécriture de cet ordre casserait les logs déjà persistés.
  assert.deepEqual(
    [...TYPES_ORDRE],
    ['renversement', 'cardinalite', 'mode', 'degre_associe', 'fonction_proche', 'fonction_lointaine'],
  )
})

test('encoderDrapeaux → decoderDrapeaux : aller-retour fidèle sur toute une session', () => {
  let vusMode = 0
  for (const { mode, items } of sessions(40)) {
    for (const item of items) {
      const decode = decoderDrapeaux(encoderDrapeaux(item, mode))
      assert.equal(decode.type, item.perturbation.type)
      const attendu = vecteurDeLItem(item, mode)
      assert.deepEqual(decode.vecteur, attendu, `item ${item.index} (${item.perturbation.type})`)
      if (decode.modeInverse) vusMode++
    }
  }
  assert.ok(vusMode > 0, 'aucune perturbation « mode » dans l’échantillon')
})

test('encoderDrapeaux : la perturbation « mode » est portée par son bit dédié', () => {
  // Elle est invisible aux quatre canaux : même degré, même renversement, même
  // cardinalité, même arc. Sans le bit 12 l'information serait perdue.
  const session = sessions(40).flatMap((s) => s.items.map((i) => ({ ...s, item: i })))
  const cas = session.find((s) => s.item.perturbation.type === 'mode')
  assert.ok(cas, 'aucun cas « mode » trouvé')
  assert.equal(vecteurDeLItem(cas.item, cas.mode), null)
  const decode = decoderDrapeaux(encoderDrapeaux(cas.item, cas.mode))
  assert.equal(decode.modeInverse, true)
  assert.equal(decode.vecteur, null)
  assert.equal(decode.type, 'mode')
})

test('encoderDrapeaux : les autres types portent un vecteur non nul', () => {
  for (const { mode, items } of sessions(30)) {
    for (const item of items) {
      if (item.perturbation.type === 'mode') continue
      const v = decoderDrapeaux(encoderDrapeaux(item, mode)).vecteur
      assert.ok(v, `vecteur absent (${item.perturbation.type})`)
      const nul = v.angulaire === 0 && v.radial === 0 && v.cardinalite === 0
      assert.ok(!nul, `vecteur nul pour ${item.perturbation.type}`)
    }
  }
})

// ── Score ────────────────────────────────────────────────────────────────────

const reponse = (correct: boolean, rtMs: number, type: TypePerturbation): ReponseDetection => ({
  index: 0,
  attendu: 1,
  repondu: correct ? 1 : 2,
  correct,
  rtMs,
  type,
  difficulte: 0.5,
  flags: 0, // `scorerSession` ne lit pas les drapeaux — seul le bilan les dessine.
})

test('scorerSession : cas limites 0 %, 100 %, session vide', () => {
  assert.deepEqual(scorerSession([]), { score: 0, itemCount: 0, accuracy: 0, medianRtMs: 0 })

  const toutes = [true, true, true, true].map((c) => reponse(c, 1000, 'renversement'))
  assert.deepEqual(scorerSession(toutes), {
    score: 100,
    itemCount: 4,
    accuracy: 1,
    medianRtMs: 1000,
  })

  const aucune = [false, false].map((c) => reponse(c, 500, 'mode'))
  assert.equal(scorerSession(aucune).score, 0)
  assert.equal(scorerSession(aucune).accuracy, 0)
})

test('scorerSession : médiane des temps de réponse', () => {
  const rs = [1000, 2000, 9000].map((rt) => reponse(true, rt, 'mode'))
  assert.equal(scorerSession(rs).medianRtMs, 2000)
  assert.equal(scorerSession([...rs, reponse(true, 3000, 'mode')]).medianRtMs, 2500)
})

test('fautesParType : ne liste que les types réellement rencontrés', () => {
  const rs = [
    reponse(false, 100, 'mode'),
    reponse(true, 100, 'mode'),
    reponse(false, 100, 'degre_associe'),
  ]
  assert.deepEqual(fautesParType(rs), [
    { type: 'mode', vus: 2, rates: 1 },
    { type: 'degre_associe', vus: 1, rates: 1 },
  ])
  assert.deepEqual(fautesParType([]), [])
})
