import test from 'node:test'
import assert from 'node:assert/strict'

import {
  HAUTEUR_BASE,
  PAS_ANGULAIRE_DEG,
  PAS_HAUTEUR,
  PERSISTANCE_ACCORDS,
  angleCercleDeg,
  arcEntreDegres,
  geometrieGlyphe,
  intensiteTrace,
  lireDrapeaux,
  pointCercle,
} from './glyphe.ts'
import {
  NIVEAU_MAX_DETECTION,
  NIVEAU_MIN_DETECTION,
  TYPES_ORDRE,
  construireSession,
  decoderDrapeaux,
  encoderDrapeaux,
  vecteurDeLItem,
  type DrapeauxDetection,
} from './detection.ts'
import { ORDRE_TIERCES } from './geometrie.ts'
import { type Mode, type TypePerturbation } from './types.ts'

const MODES: Mode[] = ['majeur', 'mineur']

function drapeaux(
  angulaire: number,
  radial: number,
  cardinalite: -1 | 0 | 1,
  arcFranchi: boolean,
  type: TypePerturbation = 'degre_associe',
): DrapeauxDetection {
  return {
    type,
    modeInverse: false,
    vecteur: { angulaire, radial, cardinalite, arcFranchi },
  }
}

const HORS_TONALITE: DrapeauxDetection = {
  type: 'mode',
  modeInverse: true,
  vecteur: null,
}

// ─── Les quatre canaux ───────────────────────────────────────────────────────

test('le signe de la rotation suit celui de l’écart angulaire', () => {
  assert.equal(geometrieGlyphe(drapeaux(0, 0, 0, false)).rotationDeg, 0)
  assert.ok(geometrieGlyphe(drapeaux(2, 0, 0, false)).rotationDeg > 0)
  assert.ok(geometrieGlyphe(drapeaux(-2, 0, 0, false)).rotationDeg < 0)
  assert.equal(
    geometrieGlyphe(drapeaux(3, 0, 0, false)).rotationDeg,
    -geometrieGlyphe(drapeaux(-3, 0, 0, false)).rotationDeg,
  )
})

test('la septième ajoutée allonge la colonne, la septième retirée la raccourcit', () => {
  const sans = geometrieGlyphe(drapeaux(0, 0, 0, false)).hauteur
  assert.equal(sans, HAUTEUR_BASE)
  assert.equal(geometrieGlyphe(drapeaux(0, 0, 1, false)).hauteur, HAUTEUR_BASE + PAS_HAUTEUR)
  assert.equal(geometrieGlyphe(drapeaux(0, 0, -1, false)).hauteur, HAUTEUR_BASE - PAS_HAUTEUR)
})

test('l’arc franchi change la teinte, et lui seul', () => {
  assert.equal(geometrieGlyphe(drapeaux(2, 0, 0, false)).teinte, 'interne')
  assert.equal(geometrieGlyphe(drapeaux(2, 0, 0, true)).teinte, 'arc')
})

// LE cas à ne pas rater : les quatre canaux sont nuls sur une perturbation
// `mode`. Sans traitement propre, la seule perturbation qui sorte de la tonalité
// serait aussi la seule à ne rien montrer — colonne droite, indistinguable d'un
// « exact ».
test('hors tonalité n’est jamais confondable avec un vecteur nul', () => {
  const nul = geometrieGlyphe(drapeaux(0, 0, 0, false))
  const hors = geometrieGlyphe(HORS_TONALITE)

  assert.equal(nul.rotationDeg, hors.rotationDeg)
  assert.equal(nul.renflement, hors.renflement)
  assert.equal(nul.hauteur, hors.hauteur)

  // Tout ce qui les sépare tient dans ces deux champs — ils sont donc obligatoires.
  assert.equal(hors.teinte, 'hors-tonalite')
  assert.equal(hors.pointille, true)
  assert.notEqual(nul.teinte, hors.teinte)
  assert.equal(nul.pointille, false)
})

test('le glyphe ne sort jamais de sa boîte, sur tous les vecteurs atteignables', () => {
  const maxRotation = 3 * PAS_ANGULAIRE_DEG
  for (let a = -3; a <= 3; a++) {
    for (let r = -3; r <= 3; r++) {
      for (const c of [-1, 0, 1] as const) {
        for (const arc of [false, true]) {
          const g = geometrieGlyphe(drapeaux(a, r, c, arc))
          assert.ok(Math.abs(g.rotationDeg) <= maxRotation, `rotation ${g.rotationDeg}`)
          assert.ok(g.renflement >= -1 && g.renflement <= 1, `renflement ${g.renflement}`)
          assert.ok(g.hauteur > 0 && g.hauteur <= 1, `hauteur ${g.hauteur}`)
        }
      }
    }
  }
})

// ─── Le cercle des tierces ───────────────────────────────────────────────────

test('le cercle place I au sommet et respecte l’ordre des tierces', () => {
  assert.equal(angleCercleDeg(1), -90)

  const angles = ORDRE_TIERCES.map(angleCercleDeg)
  assert.equal(new Set(angles).size, ORDRE_TIERCES.length)
  for (let i = 1; i < angles.length; i++) {
    assert.ok(angles[i] > angles[i - 1], 'les positions tournent dans un seul sens')
  }
})

test('les sept positions sont sur le cercle et distinctes', () => {
  const vus = new Set<string>()
  for (const degre of ORDRE_TIERCES) {
    const p = pointCercle(degre, 100, 100, 66)
    const rayon = Math.hypot(p.x - 100, p.y - 100)
    assert.ok(Math.abs(rayon - 66) < 1e-9, `rayon ${rayon}`)
    vus.add(`${p.x.toFixed(4)},${p.y.toFixed(4)}`)
  }
  assert.equal(vus.size, ORDRE_TIERCES.length)
})

// ─── Trajectoire animée ──────────────────────────────────────────────────────

test('l’intensité décroît avec l’ancienneté puis s’annule hors persistance', () => {
  assert.equal(intensiteTrace(0), 1)

  for (let age = 1; age < PERSISTANCE_ACCORDS; age++) {
    assert.ok(
      intensiteTrace(age) < intensiteTrace(age - 1),
      `l’âge ${age} doit être plus pâle que ${age - 1}`,
    )
    assert.ok(intensiteTrace(age) > 0, `l’âge ${age} est dans la persistance`)
  }

  // Au-delà, plus rien : c'est ce qui fait la traîne plutôt qu'un tracé complet.
  assert.equal(intensiteTrace(PERSISTANCE_ACCORDS), 0)
  assert.equal(intensiteTrace(PERSISTANCE_ACCORDS + 5), 0)
  assert.equal(intensiteTrace(-1), 0)
})

test('la traîne suit le cercle dans le sens du déplacement le plus court', () => {
  // I → III : un pas en avant dans ORDRE_TIERCES ⟹ sens horaire (sweep 1).
  assert.match(arcEntreDegres(1, 3, 100, 100, 44) ?? '', / 0 1 /)
  // III → I : le retour, sens inverse.
  assert.match(arcEntreDegres(3, 1, 100, 100, 44) ?? '', / 0 0 /)

  // Aucun déplacement possible sur un degré répété — et le cas se présente.
  assert.equal(arcEntreDegres(5, 5, 100, 100, 44), null)
})

test('la traîne n’emprunte jamais le grand arc', () => {
  for (const a of ORDRE_TIERCES) {
    for (const b of ORDRE_TIERCES) {
      const chemin = arcEntreDegres(a, b, 100, 100, 44)
      if (chemin === null) {
        assert.equal(a, b)
        continue
      }
      // L'écart maximal vaut 3 pas ≈ 154°, toujours sous 180° : le drapeau
      // « grand arc » doit rester à 0, sinon le trait ferait le tour du cercle.
      const drapeaux = chemin.match(/A [\d.]+ [\d.]+ 0 (\d) (\d)/)
      assert.ok(drapeaux, `chemin illisible : ${chemin}`)
      assert.equal(drapeaux[1], '0', `grand arc entre ${a} et ${b}`)
    }
  }
})

// ─── Lecture en français ─────────────────────────────────────────────────────

test('lireDrapeaux rend une phrase non vide pour les six types de perturbation', () => {
  for (const mode of MODES) {
    for (let niveau = NIVEAU_MIN_DETECTION; niveau <= NIVEAU_MAX_DETECTION; niveau++) {
      for (const item of construireSession(mode, niveau, 4242)) {
        const texte = lireDrapeaux(decoderDrapeaux(encoderDrapeaux(item, mode)))
        assert.ok(texte.length > 0, `phrase vide (${mode}, niveau ${niveau})`)
      }
    }
  }
  // Et sur les six types pris isolément, indépendamment de ce que la rampe tire.
  for (const type of TYPES_ORDRE) {
    const d = type === 'mode' ? HORS_TONALITE : drapeaux(1, 0, 0, false, type)
    assert.ok(lireDrapeaux(d).length > 0, type)
  }
})

test('le sens de l’écart est dit, et dans le bon sens', () => {
  assert.match(lireDrapeaux(drapeaux(2, 0, 0, false)), /deux tierces plus haut/)
  assert.match(lireDrapeaux(drapeaux(-2, 0, 0, false)), /deux tierces plus bas/)
  assert.match(lireDrapeaux(drapeaux(1, 0, 0, true)), /fonction changée/)
  assert.match(lireDrapeaux(drapeaux(1, 0, 0, false)), /même fonction/)
  assert.match(lireDrapeaux(drapeaux(0, 1, 0, false)), /basse plus haute/)
  assert.match(lireDrapeaux(drapeaux(0, 0, 1, false)), /septième ajoutée/)
  assert.equal(lireDrapeaux(HORS_TONALITE), 'accord hors tonalité')
})

// ─── L'invariant qui compte ──────────────────────────────────────────────────
//
// Le bilan dessine ses colonnes depuis les seuls bits persistés. Si ce test
// tombe, un futur écran d'historique lisant Firestore afficherait des glyphes
// différents de ceux vus en fin de session.

test('le glyphe est reconstructible depuis les seuls bits persistés', () => {
  let items = 0

  for (const mode of MODES) {
    for (let niveau = NIVEAU_MIN_DETECTION; niveau <= NIVEAU_MAX_DETECTION; niveau++) {
      for (const graine of [1, 77, 2026]) {
        for (const item of construireSession(mode, niveau, graine)) {
          const depuisLesBits = decoderDrapeaux(encoderDrapeaux(item, mode))

          // La référence : la géométrie calculée DIRECTEMENT depuis l'item, sans
          // passer par l'encodage. Les deux doivent coïncider.
          const vecteur = vecteurDeLItem(item, mode)
          const depuisLItem: DrapeauxDetection = {
            type: item.perturbation.type,
            vecteur,
            modeInverse: vecteur === null,
          }

          const ou = `(${mode}, niveau ${niveau}, graine ${graine}, item ${item.index})`
          assert.equal(depuisLesBits.type, depuisLItem.type, `type ${ou}`)
          assert.deepEqual(
            geometrieGlyphe(depuisLesBits),
            geometrieGlyphe(depuisLItem),
            `géométrie ${ou}`,
          )
          assert.equal(lireDrapeaux(depuisLesBits), lireDrapeaux(depuisLItem), `lecture ${ou}`)

          // Et le drapeau hors-tonalité correspond bien à la perturbation `mode`.
          assert.equal(
            depuisLesBits.modeInverse,
            item.perturbation.type === 'mode',
            `modeInverse incohérent ${ou}`,
          )
          items++
        }
      }
    }
  }

  assert.ok(items > 100, `échantillon trop maigre (${items})`)
})
