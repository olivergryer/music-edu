// ─── Roue figée — géométrie et résolution du geste (pur) ─────────────────────
//
// Adaptée de `modules/notes/wheelGeometry.ts`, PAS importée : `CLAUDE-harmonie.md`
// acte que les deux modules restent indépendants (même précédent que `rng.ts`).
// Deux différences de fond avec l'original :
//
//   1. aucun nom de note — les secteurs sont fournis par l'appelant, ce qui rend
//      la même roue utilisable pour les notes ET pour les intervalles ;
//   2. la roue est FIGÉE. Celle de Notes est un menu radial *relatif* : on pose le
//      doigt n'importe où, elle apparaît sous le contact. Ici elle est affichée en
//      permanence, on appuie SUR un secteur, et le glissement vertical choisit la
//      qualité. Deux origines différentes, donc deux fonctions :
//
//        secteurAuPoint  — dx, dy depuis le CENTRE DE LA ROUE
//        qualiteAuDrag   — déplacement vertical depuis le POINT D'APPUI

export const SECTEURS = 7
export const DEGRES_SECTEUR = 360 / SECTEURS // 51,428…
const DEMI_SECTEUR = DEGRES_SECTEUR / 2

/** Zone morte centrale : appuyer au centre n'engage rien (annulation sans pénalité). */
export const RAYON_MORT_PX = 26

/** Hauteur d'un cran de qualité, en pixels de glissement vertical. */
export const SEUIL_QUALITE_PX = 30

export interface SecteurRoue {
  /** Identifiant stable renvoyé à l'appelant. */
  cle: string
  /** Texte affiché dans le secteur. */
  label: string
  /**
   * Qualités disponibles, ordonnées du BAS vers le HAUT. Une seule entrée = le
   * secteur n'a pas de modificateur.
   */
  qualites: readonly string[]
  /**
   * Index de la qualité au repos, avant tout glissement.
   *
   * ⚠ `null` = AUCUNE position de repos : le glissement est obligatoire, un clic
   * sec ne valide rien. C'est le cas des intervalles à qualité — il n'existe pas
   * de tierce « neutre », elle est majeure ou mineure. Les intervalles justes, eux,
   * ont bien un repos (« juste »), d'où la dissymétrie, qui est musicale et non
   * accidentelle.
   */
  defaut: number | null
}

export interface ChoixRoue {
  cle: string
  qualite: string
}

function mod360(d: number): number {
  return ((d % 360) + 360) % 360
}

/** Index de secteur depuis un angle écran (radians). 0 en haut, sens horaire. */
export function secteurDepuisAngle(angleRad: number): number {
  const depuisHaut = mod360(angleRad * (180 / Math.PI) + 90)
  return Math.floor(mod360(depuisHaut + DEMI_SECTEUR) / DEGRES_SECTEUR) % SECTEURS
}

/** Angle du CENTRE d'un secteur (radians écran) — pour dessiner et étiqueter. */
export function angleCentreSecteur(index: number): number {
  return (index * DEGRES_SECTEUR - 90) * (Math.PI / 180)
}

/**
 * Secteur touché. `dx`, `dy` sont mesurés depuis le CENTRE DE LA ROUE.
 * `null` en zone morte.
 */
export function secteurAuPoint(
  dx: number,
  dy: number,
  rayonMortPx: number = RAYON_MORT_PX,
): number | null {
  if (Math.hypot(dx, dy) < rayonMortPx) return null
  return secteurDepuisAngle(Math.atan2(dy, dx))
}

/**
 * Qualité retenue pour un glissement vertical de `dyDrag` pixels depuis le point
 * d'appui — **négatif vers le haut**, comme le repère écran.
 *
 * `null` quand le secteur n'a pas de repos et qu'on n'a pas glissé : il n'y a
 * alors rien à valider.
 */
export function qualiteAuDrag(
  secteur: SecteurRoue,
  dyDrag: number,
  seuilPx: number = SEUIL_QUALITE_PX,
): string | null {
  if (secteur.qualites.length === 0) return null
  if (secteur.qualites.length === 1) return secteur.qualites[0]

  const crans = Math.round(-dyDrag / seuilPx)

  if (secteur.defaut === null) {
    if (crans === 0) return null
    return crans > 0 ? secteur.qualites[secteur.qualites.length - 1] : secteur.qualites[0]
  }

  const index = Math.min(Math.max(secteur.defaut + crans, 0), secteur.qualites.length - 1)
  return secteur.qualites[index]
}

/**
 * Le geste complet, du centre de la roue au relâchement. `null` si rien n'est
 * validable — zone morte, ou secteur sans repos non glissé.
 */
export function resoudreRoue(
  dxCentre: number,
  dyCentre: number,
  dyDrag: number,
  secteurs: readonly SecteurRoue[],
  options: { rayonMortPx?: number; seuilPx?: number } = {},
): ChoixRoue | null {
  const index = secteurAuPoint(dxCentre, dyCentre, options.rayonMortPx)
  if (index === null) return null

  const secteur = secteurs[index]
  if (!secteur) return null

  const qualite = qualiteAuDrag(secteur, dyDrag, options.seuilPx)
  return qualite === null ? null : { cle: secteur.cle, qualite }
}
