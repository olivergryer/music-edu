// ─── Glyphe de correction A/B — géométrie pure ───────────────────────────────
//
// Traduit les drapeaux d'un item en paramètres géométriques et en français. Zéro
// React, zéro SVG : le rendu est dans `Glyphes.tsx`, les décisions sont ici.
//
// Les quatre canaux visuels annoncés par l'en-tête de `metrique.ts` correspondent
// terme à terme aux quatre champs de `VecteurErreur`, dans leur ordre de
// déclaration (`types.ts`) :
//
//   angulaire    → position angulaire (inclinaison de la colonne)
//   radial       → renflement
//   cardinalite  → hauteur de colonne
//   arcFranchi   → teinte
//
// ⚠ ET UN CINQUIÈME ÉTAT, HORS VECTEUR. La perturbation `mode` laisse les quatre
// canaux à zéro : même degré, même renversement, même cardinalité, même arc. Un
// glyphe naïf serait donc une colonne droite et banale, INDISTINGUABLE d'un
// « exact ». D'où `pointille` + la teinte `hors-tonalite` : sans elles, la seule
// perturbation qui sorte de la tonalité serait aussi la seule à ne rien montrer.

import { ORDRE_TIERCES, distanceAngulaireSignee } from './geometrie.ts'
import { type Degre, type VecteurErreur } from './types.ts'

/**
 * Ce dont le glyphe a RÉELLEMENT besoin : un écart entre deux accords, rien de
 * plus. Ni le type de perturbation, ni l'item d'où il vient.
 *
 * `DrapeauxDetection` le satisfait structurellement, donc la détection continue
 * de passer ses drapeaux tels quels ; mais le chiffrage en flux, qui n'a aucune
 * perturbation à nommer, peut désormais alimenter le même glyphe avec le
 * `VecteurErreur` que produit `evaluerFlux`. `null` = accord hors tonalité, seul
 * cas où les quatre canaux ne s'appliquent pas.
 */
export interface EcartGlyphe {
  vecteur: VecteurErreur | null
}

// ─── Conventions de tracé ────────────────────────────────────────────────────

// TODO Matthieu — convention de LISIBILITÉ, pas une dérivation géométrique.
// L'écart angulaire réel sur le cercle des tierces vaut 360/7 ≈ 51,4° par pas :
// à trois pas la colonne serait couchée à 154°, illisible. 18° garde l'inclinaison
// perceptible (±54° au maximum) tout en laissant la colonne debout.
export const PAS_ANGULAIRE_DEG = 18

// `Renversement = 0 | 1 | 2 | 3` (types.ts) ⟹ `radial` ∈ [−3, 3].
export const RENVERSEMENT_MAX = 3

// Hauteur en fraction de la boîte. La septième ajoutée allonge la colonne, la
// septième retirée la raccourcit — une note de plus, une hauteur de plus.
export const HAUTEUR_BASE = 0.62
export const PAS_HAUTEUR = 0.18

export type TeinteGlyphe = 'interne' | 'arc' | 'hors-tonalite'

export interface GeometrieGlyphe {
  /** Signée. Positive = vers les tierces montantes, comme `distanceAngulaireSignee`. */
  rotationDeg: number
  /** −1…1. Positif = renflé (renversement plus haut), négatif = pincé. */
  renflement: number
  /** 0…1, fraction de la hauteur de boîte. */
  hauteur: number
  teinte: TeinteGlyphe
  /** Hors tonalité : les quatre canaux ne s'appliquent pas. */
  pointille: boolean
}

export function geometrieGlyphe(d: EcartGlyphe): GeometrieGlyphe {
  if (d.vecteur === null) {
    return {
      rotationDeg: 0,
      renflement: 0,
      hauteur: HAUTEUR_BASE,
      teinte: 'hors-tonalite',
      pointille: true,
    }
  }

  const v = d.vecteur
  return {
    rotationDeg: v.angulaire * PAS_ANGULAIRE_DEG,
    renflement: v.radial / RENVERSEMENT_MAX,
    hauteur: HAUTEUR_BASE + v.cardinalite * PAS_HAUTEUR,
    teinte: v.arcFranchi ? 'arc' : 'interne',
    pointille: false,
  }
}

// ─── Position sur le cercle des tierces ──────────────────────────────────────
//
// I au sommet, puis dans l'ordre d'`ORDRE_TIERCES` en tournant vers la droite.
// Repère SVG : y vers le bas, angle 0 à 3 heures — d'où le −90°.

export const PAS_CERCLE_DEG = 360 / ORDRE_TIERCES.length

export function angleCercleDeg(degre: Degre): number {
  const i = ORDRE_TIERCES.indexOf(degre)
  if (i < 0) throw new Error(`angleCercleDeg : degré invalide (${degre})`)
  return -90 + i * PAS_CERCLE_DEG
}

/** Coordonnées du degré sur un cercle de centre `cx, cy` et de rayon `r`. */
export function pointCercle(
  degre: Degre,
  cx: number,
  cy: number,
  r: number,
): { x: number; y: number } {
  const rad = (angleCercleDeg(degre) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

// ─── Trajectoire animée (correction seulement) ───────────────────────────────
//
// Pendant la réécoute, chaque accord marque sa position sur le cercle, les trois
// derniers restent visibles en s'estompant, et une traîne relie chaque degré au
// suivant. On lit alors le PARCOURS de la progression, pas seulement l'écart d'un
// accord.
//
// ⚠ APRÈS LA RÉPONSE UNIQUEMENT. Animer la trajectoire de B pendant que l'élève
// cherche encore lui donnerait les degrés entendus un par un, donc la réponse —
// c'est la même règle que le « ▶ A n'existe qu'après la réponse » de l'activité.

export const PERSISTANCE_ACCORDS = 3

// La traîne court sur une piste INTÉRIEURE, dégagée des étiquettes de degrés.
// Lecture qui en découle : l'anneau extérieur est la carte des sept degrés, la
// piste intérieure est le chemin réellement parcouru.
export const RETRAIT_TRAINE = 22

/**
 * Intensité d'un marquage selon son ancienneté — 0 = l'accord qui sonne.
 * Décroît linéairement puis s'annule au-delà de la persistance.
 */
export function intensiteTrace(age: number, persistance: number = PERSISTANCE_ACCORDS): number {
  if (age < 0 || age >= persistance) return 0
  return 1 - age / persistance
}

/**
 * Chemin SVG de la traîne entre deux degrés. Elle suit le cercle **dans le sens
 * du déplacement le plus court** (`distanceAngulaireSignee`) : le trait parcourt
 * donc réellement le cercle des tierces, au lieu de le traverser en corde.
 *
 * `null` si les deux degrés sont confondus — il n'y a alors aucun déplacement.
 */
export function arcEntreDegres(
  a: Degre,
  b: Degre,
  cx: number,
  cy: number,
  r: number,
): string | null {
  if (a === b) return null

  const p1 = pointCercle(a, cx, cy, r)
  const p2 = pointCercle(b, cx, cy, r)

  // L'écart maximal vaut 3 pas, soit ≈154° : toujours sous 180°, donc jamais de
  // grand arc. Le sens du balayage suit le signe du déplacement — les angles
  // croissent dans le sens horaire à l'écran (y vers le bas).
  const sweep = distanceAngulaireSignee(a, b) > 0 ? 1 : 0
  return `M ${p1.x} ${p1.y} A ${r} ${r} 0 0 ${sweep} ${p2.x} ${p2.y}`
}

// ─── Lecture en français ─────────────────────────────────────────────────────
//
// Sert DEUX fois : sous le cercle au feedback, et comme `aria-label` des SVG. Un
// glyphe abstrait sans équivalent textuel est inaccessible — ce n'est pas un
// supplément décoratif.

const NOMS_ECART: readonly string[] = ['', 'une tierce', 'deux tierces', 'trois tierces']

export function lireDrapeaux(d: EcartGlyphe): string {
  if (d.vecteur === null) return 'accord hors tonalité'

  const v = d.vecteur
  const morceaux: string[] = []

  if (v.angulaire === 0) {
    morceaux.push('même degré')
  } else {
    const ecart = NOMS_ECART[Math.abs(v.angulaire)] ?? `${Math.abs(v.angulaire)} tierces`
    morceaux.push(`${ecart} plus ${v.angulaire > 0 ? 'haut' : 'bas'}`)
    morceaux.push(v.arcFranchi ? 'fonction changée' : 'même fonction')
  }

  if (v.radial !== 0) {
    morceaux.push(v.radial > 0 ? 'basse plus haute' : 'basse plus basse')
  }
  if (v.cardinalite !== 0) {
    morceaux.push(v.cardinalite > 0 ? 'septième ajoutée' : 'septième retirée')
  }

  return morceaux.join(' · ')
}
