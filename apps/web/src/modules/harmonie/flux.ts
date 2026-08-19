// ─── Activité « chiffrage en flux » — niveaux 6 à 8, logique pure ────────────
//
// La tâche `identification` déclarée par `niveaux.ts` : l'élève nomme le degré ET
// l'état de CHAQUE accord de la suite. C'est l'aboutissement du module.
//
// ⚠ C'EST LA SEULE ACTIVITÉ QUI REMPLIT LES QUATRE CANAUX. Partout ailleurs la
// réponse est un choix (quel accord est faux, dominante ou sous-dominante), donc
// `vecteurErreur` n'a rien à mesurer. Ici l'élève produit un chiffrage complet
// face à un chiffrage attendu : les quatre canaux et les sept diagnostics de
// `metrique.ts` prennent enfin leur sens plein.
//
// « En flux » désigne le flux de la MUSIQUE, pas un chronomètre (décidé avec
// Matthieu) : la suite s'écoute d'un bloc, autant de fois qu'on veut, et l'élève
// remplit les cases à son rythme. Ajouter une contrainte de vitesse ferait mesurer
// la dextérité de saisie plutôt que l'oreille.
//
// ⚠ NIVEAU 8 NON GÉNÉRABLE — degrés secondaires hors périmètre V1
// (`assertNiveauGenerable` lève). L'activité s'arrête donc à 7, et la borne suivra
// d'elle-même le jour où le 8 atterrira.
//
// ⚠ NIVEAU 7 SANS CONTEXTE TONAL (`contexteTonal: false`) : la tonique ne sonne
// pas, l'élève doit l'établir lui-même. Ne pas « corriger » en la jouant quand
// même — c'est la difficulté propre du niveau.

import { genererProgression } from './generateur.ts'
import { MATRICE_MAJEUR, MATRICE_MINEUR } from './matrice.ts'
import { diagnostiquer, indiceDeDeduction, vecteurErreur } from './metrique.ts'
import { NIVEAU_MAX_IMPLEMENTE, niveauSpec } from './niveaux.ts'
import {
  creerAccord,
  type Accord,
  type Degre,
  type Diagnostic,
  type Mode,
  type Progression,
  type Renversement,
  type VecteurErreur,
} from './types.ts'

export const NIVEAU_MIN_FLUX = 6
export const NIVEAU_MAX_FLUX = Math.min(8, NIVEAU_MAX_IMPLEMENTE) // = 7 aujourd'hui

// Cinq suites de 4 à 6 accords, soit ~25 chiffrages complets par session. Le
// niveau autorise jusqu'à 8 accords, mais chaque accord coûte deux gestes : à
// pleine longueur la session devient un marathon plutôt qu'une mesure.
export const ITEMS_PAR_SESSION_FLUX = 5
export const LONGUEUR_MIN_FLUX = 4
export const LONGUEUR_MAX_FLUX = 6

const PAS_GRAINE = 1009

export interface EtatAccord {
  renversement: Renversement
  septieme: boolean
}

export interface ItemFlux {
  index: number
  progression: Progression
}

export interface ResultatAccord {
  index: number
  attendu: Accord
  /** `null` si l'élève a laissé la case vide. */
  repondu: Accord | null
  exact: boolean
  vecteur: VecteurErreur | null
  diagnostic: Diagnostic | null
}

export interface ReponseFlux {
  index: number
  resultats: ResultatAccord[]
  justes: number
  total: number
  rtMs: number
}

// ─── Ce que l'élève peut saisir ──────────────────────────────────────────────

/**
 * Les états proposés pour un degré donné, bornés par le niveau.
 *
 * La septième dépend du DEGRÉ (`septiemeSur`), pas seulement du niveau : au
 * niveau 6 elle n'est offerte que sur V et II. La bande de saisie rétrécit donc
 * d'elle-même, et l'élève ne peut pas produire un chiffrage que le niveau
 * n'enseigne pas.
 *
 * Les trois sons d'abord, les septièmes ensuite — même ordre que la fiche PDF.
 */
export function etatsPossibles(niveau: number, degre: Degre): EtatAccord[] {
  const spec = niveauSpec(niveau)
  const avecSeptieme = spec.septiemeSur.includes(degre)

  const sansSeptieme = spec.renversements.map((renversement) => ({
    renversement,
    septieme: false,
  }))
  if (!avecSeptieme) return sansSeptieme

  return [
    ...sansSeptieme,
    // Le 3e renversement n'existe qu'avec la septième ; il n'est de toute façon
    // pas dans `renversements` aux niveaux 6 et 7.
    ...spec.renversements.map((renversement) => ({ renversement, septieme: true })),
  ]
}

/**
 * Les mêmes états, rangés pour la SAISIE AU GESTE : appui sur le degré,
 * glissement vertical pour l'état (décidé avec Matthieu).
 *
 *   ↑ vers le haut   les renversements de l'accord de TROIS SONS
 *   · repos          le trois sons fondamental — un simple appui suffit
 *   ↓ vers le bas    l'accord de SEPTIÈME, de plus en plus renversé
 *
 * D'où l'ordre de `etats` : septièmes en renversement DÉCROISSANT, puis les trois
 * sons en renversement croissant. Cette convention bas → haut est celle de
 * `SecteurRoue.qualites` (`roue.ts`) — ne pas l'inverser d'un seul côté.
 *
 * Le repos tombe sur l'état le plus fréquent, ce qui rend le geste courant
 * gratuit. `etatsPossibles` reste la source de vérité de ce qui est saisissable.
 */
export interface EchelleEtats {
  /** Du BAS vers le HAUT. */
  etats: EtatAccord[]
  /** Index du trois sons fondamental dans `etats`. */
  repos: number
}

export function echelleEtats(niveau: number, degre: Degre): EchelleEtats {
  const tous = etatsPossibles(niveau, degre)
  const septiemes = tous.filter((e) => e.septieme)
  const troisSons = tous.filter((e) => !e.septieme)

  const etats = [...septiemes].reverse().concat(troisSons)
  const repos = etats.findIndex((e) => !e.septieme && e.renversement === 0)
  if (repos < 0) {
    throw new Error(
      `echelleEtats : aucun trois sons fondamental au niveau ${niveau} sur le degré ${degre} — ` +
        `l'échelle n'aurait pas de repos`,
    )
  }
  return { etats, repos }
}

/** Le vocabulaire saisissable, dans l'ordre des degrés. */
export function degresPossibles(niveau: number): Degre[] {
  return [...niveauSpec(niveau).vocabulaire].sort((a, b) => a - b)
}

// ─── Construction de la session ──────────────────────────────────────────────

export function longueurPourRangFlux(rang: number, total: number): number {
  if (total <= 1) return LONGUEUR_MIN_FLUX
  const ratio = rang / (total - 1)
  return (
    LONGUEUR_MIN_FLUX + Math.round(ratio * (LONGUEUR_MAX_FLUX - LONGUEUR_MIN_FLUX))
  )
}

export function construireSessionFlux(
  mode: Mode,
  niveau: number,
  graine: number,
  nombreItems: number = ITEMS_PAR_SESSION_FLUX,
): ItemFlux[] {
  if (niveau < NIVEAU_MIN_FLUX || niveau > NIVEAU_MAX_FLUX) {
    throw new Error(
      `construireSessionFlux : niveau ${niveau} hors des niveaux jouables ` +
        `(${NIVEAU_MIN_FLUX} à ${NIVEAU_MAX_FLUX})`,
    )
  }

  return Array.from({ length: nombreItems }, (_, rang) => ({
    index: rang,
    // La tonalité change à chaque item, comme partout ailleurs dans le module :
    // en do d'un bout à l'autre, une mémoire de hauteurs absolues remplacerait
    // l'audition des fonctions. ⚠ Au niveau 7 la tonique ne sonne pas : la
    // transposition y ajoute une vraie marche, assumée.
    progression: {
      ...genererProgression(
        mode,
        niveau,
        longueurPourRangFlux(rang, nombreItems),
        graine + rang * PAS_GRAINE,
      ),
      tonique: (graine + rang * 7) % 12,
    },
  }))
}

// ─── Évaluation ──────────────────────────────────────────────────────────────

export function accordSaisi(degre: Degre, etat: EtatAccord, index: number): Accord {
  return creerAccord(index, {
    degre,
    renversement: etat.renversement,
    septieme: etat.septieme,
  })
}

/**
 * Compare le chiffrage saisi au chiffrage attendu, accord par accord.
 *
 * Une case vide n'est pas une erreur de degré : elle n'a pas de vecteur, et
 * `diagnostiquer` n'a rien à classer. On la distingue donc explicitement plutôt
 * que de lui inventer une réponse.
 */
export function evaluerFlux(
  attendu: readonly Accord[],
  repondu: readonly (Accord | null)[],
  mode: Mode,
): ResultatAccord[] {
  return attendu.map((a, index) => {
    const r = repondu[index] ?? null
    if (r === null) {
      return { index, attendu: a, repondu: null, exact: false, vecteur: null, diagnostic: null }
    }

    const vecteur = vecteurErreur(a, r, mode)
    const diagnostic = diagnostiquer(vecteur, a, r, mode)
    return { index, attendu: a, repondu: r, exact: diagnostic === 'exact', vecteur, diagnostic }
  })
}

// ─── Score ───────────────────────────────────────────────────────────────────

export interface ResumeFlux {
  score: number
  itemCount: number
  accuracy: number
  medianRtMs: number
  /** Part des accords exacts — plus fine que le taux de suites parfaites. */
  precisionAccords: number
  parDiagnostic: { diagnostic: Diagnostic; nombre: number }[]
  /**
   * 1 = l'élève a systématiquement répondu la suite la plus attendue par la
   * grammaire au lieu d'écouter ; 0 = ses fautes ne doivent rien à la syntaxe.
   */
  indiceDeduction: number
}

function mediane(valeurs: number[]): number {
  if (valeurs.length === 0) return 0
  const tri = [...valeurs].sort((a, b) => a - b)
  const milieu = Math.floor(tri.length / 2)
  return tri.length % 2 === 0 ? (tri[milieu - 1] + tri[milieu]) / 2 : tri[milieu]
}

/**
 * L'indice de déduction, moyenné sur les items.
 *
 * ⚠ Calculé PAR ITEM et non sur la session mise bout à bout : `indiceDeDeduction`
 * conditionne chaque réponse sur l'accord qui la précède, et l'accord précédent
 * du premier chiffrage d'une suite appartiendrait à la suite d'avant.
 */
export function indiceDeductionSession(
  reponses: readonly ReponseFlux[],
  mode: Mode,
): number {
  const matrice = mode === 'majeur' ? MATRICE_MAJEUR : MATRICE_MINEUR
  const indices: number[] = []

  for (const reponse of reponses) {
    const paires = reponse.resultats
      .filter((r): r is ResultatAccord & { repondu: Accord } => r.repondu !== null)
      .map((r) => ({ attendu: r.attendu, repondu: r.repondu }))

    if (paires.length < 2) continue
    const indice = indiceDeDeduction(paires, matrice)
    if (indice > 0) indices.push(indice)
  }

  if (indices.length === 0) return 0
  return indices.reduce((s, x) => s + x, 0) / indices.length
}

export function scorerFlux(reponses: readonly ReponseFlux[], mode: Mode): ResumeFlux {
  const itemCount = reponses.length
  const accuracy =
    itemCount === 0 ? 0 : reponses.filter((r) => r.justes === r.total).length / itemCount

  const accords = reponses.reduce((s, r) => s + r.total, 0)
  const justes = reponses.reduce((s, r) => s + r.justes, 0)

  // Les sept diagnostics ne s'agrègent PAS en un score unique : `couture` et
  // `sonorite_sur_fonction` valent une remédiation, `degre_voisin` presque rien.
  const compte = new Map<Diagnostic, number>()
  for (const reponse of reponses) {
    for (const resultat of reponse.resultats) {
      if (!resultat.diagnostic || resultat.diagnostic === 'exact') continue
      compte.set(resultat.diagnostic, (compte.get(resultat.diagnostic) ?? 0) + 1)
    }
  }

  return {
    score: accords === 0 ? 0 : Math.round((justes / accords) * 100),
    itemCount,
    accuracy,
    medianRtMs: Math.round(mediane(reponses.map((r) => r.rtMs))),
    precisionAccords: accords === 0 ? 0 : justes / accords,
    parDiagnostic: [...compte.entries()]
      .map(([diagnostic, nombre]) => ({ diagnostic, nombre }))
      .sort((a, b) => b.nombre - a.nombre),
    indiceDeduction: indiceDeductionSession(reponses, mode),
  }
}
