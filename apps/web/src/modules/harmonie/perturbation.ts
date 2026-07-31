// ─── Moteur de perturbation (spec §4, signature revue par l'annexe §4) ───────
//
// Cœur du module. Alimente les trois activités : détection d'erreur (perturbation
// dans l'audio), exercice à trous (perturbation dans les distracteurs), chiffrage
// en flux.
//
// PIÈGE PRINCIPAL, testé frontalement : une perturbation ne doit JAMAIS produire
// un accord violant les contraintes dures de la §3 — sinon elle serait détectable
// par grammaire et non par oreille, et l'exercice ne mesure plus rien. Tout
// candidat passe donc par `substitutionValide` avant d'être retenu.
//
// `perturber` ne reçoit pas de graine : le choix du substitut est DÉTERMINISTE,
// premier candidat valide dans un ordre canonique documenté ci-dessous.

import { substitutionValide } from './contraintes.ts'
import { ORDRE_TIERCES, franchitArc, positionAngulaire } from './geometrie.ts'
import { perturbationsAutorisees } from './niveaux.ts'
import {
  accepteBasculeMode,
  creerAccord,
  type Accord,
  type Degre,
  type Mode,
  type Perturbation,
  type Progression,
  type Renversement,
  type TypePerturbation,
} from './types.ts'

// Base par type (§4). La difficulté est l'INVERSE de la saillance perceptive :
// 1 = le plus difficile à détecter.
//
// RÉVISÉ AU BANC D'ÉCOUTE avec Matthieu (2026-07-31). La spec donnait .60 à
// `mode`, la traitant comme une nuance subtile — même fondamentale, même basse,
// même cardinalité, la tierce seule bouge d'un demi-ton. Mais ce demi-ton est
// CHROMATIQUE : `mode` est la seule perturbation du module qui sorte de la
// tonalité, quand toutes les autres restent des substitutions diatoniques. À
// l'oreille elle saute immédiatement. Différence de nature, pas de degré.
//
// L'ordre validé à l'écoute, du plus saillant au plus discret :
//   mode › fonction_lointaine › renversement › cardinalite › fonction_proche › degre_associe
//
// `renversement` et `cardinalite` se sont révélés difficiles à départager. Leur
// écart de .10 est une convention qui garde le tri déterministe, pas une
// affirmation : les traiter comme quasi équivalents dans toute lecture.
export const DIFFICULTE_BASE: Readonly<Record<TypePerturbation, number>> = {
  mode: 0.1, // ← sort de la tonalité, cf. ci-dessus (spec : .60)
  fonction_lointaine: 0.15,
  renversement: 0.35,
  cardinalite: 0.45,
  fonction_proche: 0.7,
  degre_associe: 0.9,
}

export const MODULATEURS = {
  positionFaible: 1.2,
  interieur: 1.1, // ni initial ni final : moins exposé
  dureeCourte: 1.15, // sous la médiane de la progression
}

// Ordre canonique des renversements essayés pour un substitut : on privilégie le
// premier renversement (le plus courant), puis le fondamental, puis le 6/4.
const ORDRE_RENVERSEMENTS: readonly Renversement[] = [1, 0, 2, 3]

// ─── Candidats de degré ──────────────────────────────────────────────────────
//
// Ordre canonique : pas croissant, sens montant avant sens descendant.
function degresADistance(depuis: Degre, distances: readonly number[]): Degre[] {
  const n = ORDRE_TIERCES.length
  const position = positionAngulaire(depuis)
  const sortie: Degre[] = []
  for (const pas of distances) {
    for (const signe of [1, -1]) {
      const degre = ORDRE_TIERCES[(position + signe * pas + n) % n]
      if (!sortie.includes(degre)) sortie.push(degre)
    }
  }
  return sortie
}

function degresCandidats(type: TypePerturbation, degre: Degre): Degre[] {
  switch (type) {
    case 'degre_associe': // ±1 pas, arc partagé
      return degresADistance(degre, [1]).filter((d) => !franchitArc(degre, d))
    case 'fonction_proche': // ±1 ou ±2 pas, arc franchi
      return degresADistance(degre, [1, 2]).filter((d) => franchitArc(degre, d))
    case 'fonction_lointaine': // ±3 pas
      return degresADistance(degre, [3])
    default:
      return []
  }
}

// ─── Construction des substituts ─────────────────────────────────────────────

function substitutsCandidats(
  original: Accord,
  index: number,
  type: TypePerturbation,
  mode: Mode,
): Accord[] {
  const candidats: Accord[] = []
  const ajouter = (partiel: Parameters<typeof creerAccord>[1]) => {
    try {
      candidats.push(creerAccord(index, partiel))
    } catch {
      // Combinaison intrinsèquement invalide (renversement 3 sans septième) :
      // écartée en silence, `perturbationsPossibles` en tirera les conséquences.
    }
  }
  const commun = {
    duree: original.duree,
    positionMetrique: original.positionMetrique,
  }

  if (type === 'renversement') {
    // Invariant §4 : même degré, basse différente.
    for (const renversement of ORDRE_RENVERSEMENTS) {
      if (renversement === original.renversement) continue
      ajouter({ ...commun, degre: original.degre, renversement, septieme: original.septieme })
    }
    return candidats
  }

  if (type === 'cardinalite') {
    // Invariant §4 : même degré, septième inversée. Le renversement 3 n'existe
    // pas sans septième : on retombe alors sur l'état fondamental.
    const septieme = !original.septieme
    const renversement = !septieme && original.renversement === 3 ? 0 : original.renversement
    ajouter({ ...commun, degre: original.degre, renversement, septieme })
    return candidats
  }

  if (type === 'mode') {
    // Qualité inversée sur la même fondamentale. Indéfini sur un accord diminué.
    if (!accepteBasculeMode(mode, original.degre)) return candidats
    ajouter({
      ...commun,
      degre: original.degre,
      renversement: original.renversement,
      septieme: original.septieme,
      modeInverse: !original.modeInverse,
    })
    return candidats
  }

  // Types de degré : on tente d'abord de conserver le chiffrage de l'original,
  // puis on relâche renversement et septième — un substitut ne doit se trahir ni
  // par la grammaire, ni par un chiffrage impossible sur son nouveau degré.
  for (const degre of degresCandidats(type, original.degre)) {
    ajouter({ ...commun, degre, renversement: original.renversement, septieme: original.septieme })
    for (const renversement of ORDRE_RENVERSEMENTS) {
      for (const septieme of [original.septieme, !original.septieme]) {
        ajouter({ ...commun, degre, renversement, septieme })
      }
    }
  }
  return candidats
}

function memeAccord(a: Accord, b: Accord): boolean {
  return (
    a.degre === b.degre &&
    a.renversement === b.renversement &&
    a.septieme === b.septieme &&
    Boolean(a.modeInverse) === Boolean(b.modeInverse)
  )
}

// Premier substitut valide, ou `null`. Un candidat n'est retenu que s'il diffère
// de l'original ET laisse la progression conforme aux contraintes dures.
export function substitutPour(
  progression: Progression,
  index: number,
  type: TypePerturbation,
): Accord | null {
  const original = progression.accords[index]
  if (!original) throw new Error(`substitutPour : index ${index} hors de la progression`)

  for (const candidat of substitutsCandidats(original, index, type, progression.mode)) {
    if (memeAccord(candidat, original)) continue
    if (substitutionValide(progression.accords, index, candidat, progression.mode, progression.niveau)) {
      return candidat
    }
  }
  return null
}

// ─── Difficulté ──────────────────────────────────────────────────────────────

export function difficulte(
  progression: Progression,
  index: number,
  type: TypePerturbation,
): number {
  const accords = progression.accords
  const accord = accords[index]
  if (!accord) throw new Error(`difficulte : index ${index} hors de la progression`)

  const durees = [...accords.map((a) => a.duree)].sort((a, b) => a - b)
  const milieu = Math.floor(durees.length / 2)
  const mediane =
    durees.length % 2 === 0 ? (durees[milieu - 1] + durees[milieu]) / 2 : durees[milieu]

  let valeur = DIFFICULTE_BASE[type]
  if (accord.positionMetrique === 'faible') valeur *= MODULATEURS.positionFaible
  if (index > 0 && index < accords.length - 1) valeur *= MODULATEURS.interieur
  if (accord.duree < mediane) valeur *= MODULATEURS.dureeCourte

  return Math.min(1, valeur)
}

// ─── API ─────────────────────────────────────────────────────────────────────

// `niveau` filtre les TYPES que l'élève peut comprendre (annexe §4). Les
// contraintes dures, elles, s'évaluent toujours sur `progression.niveau` — c'est
// la progression réelle qui doit rester grammaticale.
export function perturbationsPossibles(
  progression: Progression,
  index: number,
  niveau: number,
): TypePerturbation[] {
  if (index < 0 || index >= progression.accords.length) {
    throw new Error(`perturbationsPossibles : index ${index} hors de la progression`)
  }
  return perturbationsAutorisees(niveau).filter(
    (type) => substitutPour(progression, index, type) !== null,
  )
}

export function perturber(
  progression: Progression,
  index: number,
  type: TypePerturbation,
): Perturbation {
  const original = progression.accords[index]
  if (!original) throw new Error(`perturber : index ${index} hors de la progression`)

  const substitut = substitutPour(progression, index, type)
  if (!substitut) {
    throw new Error(
      `perturber : aucun substitut « ${type} » possible à l'index ${index} ` +
        `(${progression.id}) — interroger d'abord perturbationsPossibles`,
    )
  }

  return {
    index,
    type,
    original,
    substitut,
    difficulte: difficulte(progression, index, type),
  }
}
