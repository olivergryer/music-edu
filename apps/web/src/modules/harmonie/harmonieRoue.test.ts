import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEGRES_SECTEUR,
  RAYON_MORT_PX,
  SECTEURS,
  SEUIL_QUALITE_PX,
  angleCentreSecteur,
  qualiteAuDrag,
  resoudreRoue,
  secteurAuPoint,
  secteurDepuisAngle,
  type SecteurRoue,
} from './roue.ts'

// Les deux dissymétries que la roue doit porter, en miniature.
const AVEC_REPOS: SecteurRoue = {
  cle: 'quinte',
  label: '5te',
  qualites: ['diminuée', 'juste', 'augmentée'],
  defaut: 1,
}

const SANS_REPOS: SecteurRoue = {
  cle: 'tierce',
  label: '3ce',
  qualites: ['mineure', 'Majeure'],
  defaut: null,
}

const SIMPLE: SecteurRoue = { cle: 'x', label: 'X', qualites: ['—'], defaut: 0 }

/** Un point à `distance` du centre, sur le centre du secteur `i`. */
function pointSurSecteur(i: number, distance = 80): { dx: number; dy: number } {
  const a = angleCentreSecteur(i)
  return { dx: distance * Math.cos(a), dy: distance * Math.sin(a) }
}

// ─── Géométrie ───────────────────────────────────────────────────────────────

test('le secteur 0 est en haut, et les sept secteurs se suivent dans le sens horaire', () => {
  // Haut de l'écran = y négatif.
  assert.equal(secteurAuPoint(0, -80), 0)
  // Un cran dans le sens horaire.
  assert.equal(secteurAuPoint(...Object.values(pointSurSecteur(1)) as [number, number]), 1)

  for (let i = 0; i < SECTEURS; i++) {
    const { dx, dy } = pointSurSecteur(i)
    assert.equal(secteurAuPoint(dx, dy), i, `secteur ${i}`)
  }
})

test('chaque secteur couvre bien sa tranche, bords compris', () => {
  for (let i = 0; i < SECTEURS; i++) {
    const centre = angleCentreSecteur(i)
    // Juste à l'intérieur de chaque bord de la tranche.
    const marge = ((DEGRES_SECTEUR / 2 - 1) * Math.PI) / 180
    assert.equal(secteurDepuisAngle(centre - marge), i, `bord bas du secteur ${i}`)
    assert.equal(secteurDepuisAngle(centre + marge), i, `bord haut du secteur ${i}`)
  }
})

test('la zone morte n’engage rien', () => {
  assert.equal(secteurAuPoint(0, 0), null)
  assert.equal(secteurAuPoint(0, -(RAYON_MORT_PX - 1)), null)
  assert.equal(secteurAuPoint(0, -(RAYON_MORT_PX + 1)), 0)
})

// ─── Le glissement vertical ──────────────────────────────────────────────────

test('avec repos : le clic sec vaut la qualité par défaut', () => {
  assert.equal(qualiteAuDrag(AVEC_REPOS, 0), 'juste')
  // Négatif = vers le haut.
  assert.equal(qualiteAuDrag(AVEC_REPOS, -SEUIL_QUALITE_PX), 'augmentée')
  assert.equal(qualiteAuDrag(AVEC_REPOS, SEUIL_QUALITE_PX), 'diminuée')
})

// LE cas qui distingue les deux vocabulaires : il n'existe pas de tierce neutre.
test('sans repos : le clic sec ne valide rien, le glissement est obligatoire', () => {
  assert.equal(qualiteAuDrag(SANS_REPOS, 0), null)
  assert.equal(qualiteAuDrag(SANS_REPOS, -SEUIL_QUALITE_PX), 'Majeure')
  assert.equal(qualiteAuDrag(SANS_REPOS, SEUIL_QUALITE_PX), 'mineure')
})

test('le glissement sature aux bornes au lieu de déborder', () => {
  assert.equal(qualiteAuDrag(AVEC_REPOS, -10 * SEUIL_QUALITE_PX), 'augmentée')
  assert.equal(qualiteAuDrag(AVEC_REPOS, 10 * SEUIL_QUALITE_PX), 'diminuée')
  assert.equal(qualiteAuDrag(SANS_REPOS, -10 * SEUIL_QUALITE_PX), 'Majeure')
})

test('un secteur sans modificateur ignore le glissement', () => {
  for (const dy of [-100, -SEUIL_QUALITE_PX, 0, SEUIL_QUALITE_PX, 100]) {
    assert.equal(qualiteAuDrag(SIMPLE, dy), '—')
  }
})

test('un demi-cran ne bascule pas, un cran plein oui', () => {
  assert.equal(qualiteAuDrag(AVEC_REPOS, -SEUIL_QUALITE_PX * 0.4), 'juste')
  assert.equal(qualiteAuDrag(AVEC_REPOS, -SEUIL_QUALITE_PX * 0.6), 'augmentée')
})

// ─── Le geste complet ────────────────────────────────────────────────────────

test('resoudreRoue combine secteur et qualité', () => {
  const secteurs: SecteurRoue[] = Array.from({ length: SECTEURS }, (_, i) =>
    i === 3 ? { ...SANS_REPOS, cle: `s${i}` } : { ...AVEC_REPOS, cle: `s${i}` },
  )

  const { dx, dy } = pointSurSecteur(0)
  assert.deepEqual(resoudreRoue(dx, dy, 0, secteurs), { cle: 's0', qualite: 'juste' })
  assert.deepEqual(resoudreRoue(dx, dy, -SEUIL_QUALITE_PX, secteurs), {
    cle: 's0',
    qualite: 'augmentée',
  })

  // Secteur sans repos, clic sec : rien à valider.
  const p3 = pointSurSecteur(3)
  assert.equal(resoudreRoue(p3.dx, p3.dy, 0, secteurs), null)
  assert.deepEqual(resoudreRoue(p3.dx, p3.dy, -SEUIL_QUALITE_PX, secteurs), {
    cle: 's3',
    qualite: 'Majeure',
  })

  // Zone morte : même un glissement franc ne valide rien.
  assert.equal(resoudreRoue(0, 0, -SEUIL_QUALITE_PX, secteurs), null)
})
