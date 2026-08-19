// ─── L'intro tonale — le plan de lecture qui pose la tonalité ────────────────
//
// Quand un niveau demande `contexteTonal`, la tonalité doit être INSTALLÉE avant
// l'exercice. Un accord plaqué collé devant la progression ne suffit pas : sans
// respiration, l'oreille le prend pour le premier accord de l'exercice.
//
// L'intro est donc : arpège montant dont chaque note CONTINUE de sonner, accord
// plaqué où l'arpège se referme, puis un temps de silence — cette coupure est ce
// qui sépare le contexte de l'exercice.
//
//   temps  0    .5   1    1.5   2                    4          5
//          do   mi   sol  do'   [DO MI SOL DO']      (silence)  → progression
//          └──── chaque note continue de sonner ─┘    1 temps
//
// ⚠ FICHIER PUR — il ne produit que des tableaux de nombres et n'importe RIEN de
// `audio.ts`, qui charge `soundfont-player` : `node --test` ne survivrait pas à
// cet import. La lecture est le métier d'`audio.ts`, la forme musicale est ici.
//
// ⚠ `decalage` ne vaut plus 0 ou 1 mais 0 ou 5. Toute page qui recopierait
// l'ancien `decalageContexte = 1` décalerait silencieusement la trajectoire
// animée du cercle des tierces.

/** Deux positions, décidé avec Matthieu : pas d'intro, ou une vraie. */
export type Intro = 'aucune' | 'arpegee'

export const INTRO_DEFAUT: Intro = 'arpegee'

export function estIntro(v: unknown): v is Intro {
  return v === 'aucune' || v === 'arpegee'
}

// En pulsations. Réglées à l'oreille au banc — cf. `/harmonie/banc`.
export const PAS_ARPEGE = 0.5
export const TENUE_PLAQUE = 2
export const SILENCE = 1

/**
 * Un plan de lecture : ce qui sonne, à quel rythme, et combien de temps.
 *
 * `durees` est le PAS rythmique (quand l'événement suivant démarre), `tenues` la
 * durée SONORE. Les deux ne coïncident que par défaut : c'est leur divorce qui
 * fait résonner l'arpège par-dessus lui-même.
 */
export interface PlanLecture {
  accords: number[][]
  durees: number[]
  tenues: number[]
  /** Nombre d'événements ajoutés EN TÊTE — le décalage des index d'`onAccord`. */
  decalage: number
}

/**
 * Les événements de l'intro, pour un accord de tonique DÉJÀ RÉALISÉ.
 *
 * L'arpège n'est pas recalculé : ce sont les quatre voix de cet accord, prises
 * une à une du grave à l'aigu (`realiserProgression` les rend déjà dans cet
 * ordre). L'arpège et le plaqué sont ainsi le même accord, littéralement.
 */
export function evenementsIntro(
  tonique: readonly number[],
  style: Intro,
): { accords: number[][]; durees: number[]; tenues: number[] } {
  if (style === 'aucune' || tonique.length === 0) {
    return { accords: [], durees: [], tenues: [] }
  }

  const voix = [...tonique]
  const accords: number[][] = voix.map((h) => [h])
  // Chaque note tient jusqu'à la fin du plaqué : le reste de l'arpège, puis le
  // plaqué lui-même. La première note sonne donc le plus longtemps.
  const tenues: number[] = voix.map((_, i) => (voix.length - i) * PAS_ARPEGE + TENUE_PLAQUE)
  const durees: number[] = voix.map(() => PAS_ARPEGE)

  accords.push(voix)
  durees.push(TENUE_PLAQUE)
  tenues.push(TENUE_PLAQUE)

  // Le silence : un accord sans hauteur. `jouerSuite` n'a aucun cas particulier
  // à traiter — la boucle sur les hauteurs ne fait rien, la durée est consommée.
  accords.push([])
  durees.push(SILENCE)
  tenues.push(0)

  return { accords, durees, tenues }
}

/** Comment sonne un accord qu'on demande à entendre seul. */
export type FormeAccord = 'plaque' | 'arpege'

/**
 * Un accord isolé, plaqué ou arpégé — l'écoute accord par accord des cases de
 * saisie (flux et dictée).
 *
 * Même vocabulaire que l'intro, et pour cause : c'est le même geste musical, il
 * n'a pas à être décrit deux fois. L'arpège garde donc ses notes tenues.
 */
export function evenementsAccord(hauteurs: readonly number[], forme: FormeAccord): PlanLecture {
  const voix = [...hauteurs]
  if (voix.length === 0) return { accords: [], durees: [], tenues: [], decalage: 0 }

  if (forme === 'plaque') {
    return { accords: [voix], durees: [TENUE_PLAQUE], tenues: [TENUE_PLAQUE], decalage: 0 }
  }

  // Arpège seul : pas de plaqué final ni de silence — c'est une écoute, pas une
  // mise en place. La dernière note tient ce que tiendrait un plaqué.
  return {
    accords: voix.map((h) => [h]),
    durees: voix.map(() => PAS_ARPEGE),
    tenues: voix.map((_, i) => (voix.length - 1 - i) * PAS_ARPEGE + TENUE_PLAQUE),
    decalage: 0,
  }
}

/**
 * Intro + progression en un seul plan de lecture.
 *
 * `tonique` vaut `null` quand le niveau n'a pas de contexte tonal — au niveau 7
 * la tonique NE SONNE PAS, c'est la difficulté du niveau et non un réglage :
 * l'appelant passe alors `null` et le style est sans effet.
 */
export function avecIntro(
  suite: readonly number[][],
  tonique: readonly number[] | null,
  style: Intro,
): PlanLecture {
  // La règle de durée par défaut de `jouerSuite`, reconduite ici : dès qu'on
  // passe un `durees` explicite, le dernier accord tenu deux fois plus longtemps
  // — le seul geste musical du chemin audio — serait perdu sans cela.
  const durees = suite.map((_, i) => (i === suite.length - 1 ? 2 : 1))
  const nu: PlanLecture = {
    accords: suite.map((a) => [...a]),
    durees,
    tenues: [...durees],
    decalage: 0,
  }

  if (suite.length === 0 || tonique === null) return nu

  const intro = evenementsIntro(tonique, style)
  if (intro.accords.length === 0) return nu

  return {
    accords: [...intro.accords, ...nu.accords],
    durees: [...intro.durees, ...durees],
    tenues: [...intro.tenues, ...durees],
    decalage: intro.accords.length,
  }
}
