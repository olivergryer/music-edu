// ─── Activité « choix binaire » — niveaux 2, 4 et 5, logique pure ────────────
//
// Les trois niveaux portent la même TÂCHE (`tache: 'choix_binaire'` dans
// `niveaux.ts`) mais pas la même QUESTION. Un seul écran, paramétré par le niveau :
//
//   niveau 2 — dominante ou sous-dominante ?   (la discrimination fonctionnelle)
//   niveau 4 — état fondamental ou renversé ?  (la basse)
//   niveau 5 — avec ou sans septième ?         (la cardinalité)
//
// L'élève entend la suite et répond sur UN accord désigné par sa position. Le
// chiffrage n'est jamais affiché : il donnerait la réponse.
//
// ⚠ L'ÉQUILIBRAGE DES RÉPONSES EST LA PIÈCE MAÎTRESSE. Laissé au générateur, le
// tirage est biaisé — `POIDS_RENVERSEMENT_V1` met l'état fondamental à .60, donc
// « fondamental » serait la bonne réponse trois fois sur cinq et répondre toujours
// la même chose paierait. La session impose donc autant de 0 que de 1, puis
// MÉLANGE cet ordre : une alternance stricte serait tout aussi devinable.

import { genererProgression, longueursDisponibles } from './generateur.ts'
import { niveauSpec } from './niveaux.ts'
import { mulberry32 } from './rng.ts'
import { type Accord, type Mode, type Progression } from './types.ts'

export const NIVEAUX_BINAIRE: readonly number[] = [2, 4, 5]
export const ITEMS_PAR_SESSION_BINAIRE = 10

const TENTATIVES_TIRAGE = 40
const PAS_GRAINE = 1009

export type TypeQuestion = 'fonction' | 'renversement' | 'septieme'

/** Réponse : index dans `options`. */
export type Reponse = 0 | 1

export interface SpecBinaire {
  niveau: number
  type: TypeQuestion
  question: string
  /** `options[0]` correspond à la réponse 0, `options[1]` à la réponse 1. */
  options: readonly [string, string]
  /** Ce que l'élève doit écouter, dit en clair sous la question. */
  aide: string
}

export const SPECS_BINAIRE: Readonly<Record<number, SpecBinaire>> = {
  2: {
    niveau: 2,
    type: 'fonction',
    question: 'Dominante ou sous-dominante ?',
    options: ['Dominante', 'Sous-dominante'],
    aide: 'La dominante appelle la conclusion, la sous-dominante l’éloigne.',
  },
  4: {
    niveau: 4,
    type: 'renversement',
    question: 'État fondamental ou renversé ?',
    options: ['Fondamental', 'Renversé'],
    aide: 'Écoute la basse : est-ce la note qui donne son nom à l’accord ?',
  },
  5: {
    niveau: 5,
    type: 'septieme',
    question: 'Avec ou sans septième ?',
    options: ['Sans septième', 'Avec septième'],
    aide: 'La septième ajoute un quatrième son, et une tension à résoudre.',
  },
}

export function specBinaire(niveau: number): SpecBinaire {
  const spec = SPECS_BINAIRE[niveau]
  if (!spec) {
    throw new Error(
      `specBinaire : le niveau ${niveau} n'est pas un choix binaire ` +
        `(${NIVEAUX_BINAIRE.join(', ')})`,
    )
  }
  return spec
}

/**
 * La réponse attendue pour un accord, ou `null` si l'accord n'est pas
 * interrogeable à ce niveau.
 *
 * `null` n'est pas un cas dégénéré, c'est le cœur de l'honnêteté de l'exercice :
 * demander « avec ou sans septième ? » sur un degré qui ne peut PAS en porter
 * (hors de `septiemeSur`) donnerait un item dont une seule réponse est possible.
 * Idem pour la fonction sur une tonique, qui n'est ni dominante ni sous-dominante.
 */
export function reponseAttendue(niveau: number, accord: Accord): Reponse | null {
  const { type } = specBinaire(niveau)
  const spec = niveauSpec(niveau)

  switch (type) {
    case 'fonction':
      if (accord.degre === 5) return 0
      if (accord.degre === 4) return 1
      return null

    case 'renversement':
      // Les deux réponses ne sont possibles que si le niveau autorise vraiment
      // un renversement — sinon l'item ne mesure rien.
      if (spec.renversements.length < 2) return null
      return accord.renversement === 0 ? 0 : 1

    case 'septieme':
      if (!spec.septiemeSur.includes(accord.degre)) return null
      return accord.septieme ? 1 : 0
  }
}

// ─── Construction de la session ──────────────────────────────────────────────

export interface ItemBinaire {
  index: number
  niveau: number
  progression: Progression
  /** Position de l'accord interrogé. */
  cible: number
  reponse: Reponse
}

export interface ReponseBinaire {
  index: number
  attendu: Reponse
  repondu: Reponse
  correct: boolean
  rtMs: number
}

/**
 * Positions interrogeables. Les bornes sont exclues, comme en détection : le
 * premier accord est imposé sur I par la contrainte dure n°1 et le dernier par
 * `finales`, donc tous deux sont partiellement prévisibles sans écouter.
 */
export function ciblesPossibles(progression: Progression, niveau: number): number[] {
  const sorties: number[] = []
  for (let i = 1; i < progression.accords.length - 1; i++) {
    if (reponseAttendue(niveau, progression.accords[i]) !== null) sorties.push(i)
  }
  return sorties
}

export function construireItemBinaire(
  mode: Mode,
  niveau: number,
  graine: number,
  rang: number,
  attendue: Reponse,
): ItemBinaire {
  const spec = niveauSpec(niveau)
  const longueurs = longueursDisponibles(spec)

  for (let essai = 0; essai < TENTATIVES_TIRAGE; essai++) {
    const longueur = longueurs[essai % longueurs.length]
    const progression = genererProgression(
      mode,
      niveau,
      longueur,
      graine + rang * PAS_GRAINE + essai,
    )

    const cible = ciblesPossibles(progression, niveau).find(
      (i) => reponseAttendue(niveau, progression.accords[i]) === attendue,
    )
    if (cible === undefined) continue

    return { index: rang, niveau, progression, cible, reponse: attendue }
  }

  throw new Error(
    `construireItemBinaire : aucune progression ne donne la réponse ${attendue} ` +
      `en ${TENTATIVES_TIRAGE} tirages (${mode}, niveau ${niveau}, rang ${rang})`,
  )
}

/**
 * Autant de 0 que de 1 — à un près sur un nombre impair — puis mélange
 * déterministe. Répondre toujours la même chose plafonne alors à ~50 %, et
 * l'ordre n'est pas devinable non plus.
 */
export function reponsesEquilibrees(nombreItems: number, graine: number): Reponse[] {
  const suite: Reponse[] = Array.from({ length: nombreItems }, (_, i) =>
    i < Math.ceil(nombreItems / 2) ? 0 : 1,
  )

  const rng = mulberry32(graine)
  for (let i = suite.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[suite[i], suite[j]] = [suite[j], suite[i]]
  }
  return suite
}

export function construireSessionBinaire(
  mode: Mode,
  niveau: number,
  graine: number,
  nombreItems: number = ITEMS_PAR_SESSION_BINAIRE,
): ItemBinaire[] {
  specBinaire(niveau) // rejette tout de suite un niveau qui n'est pas binaire
  const attendues = reponsesEquilibrees(nombreItems, graine)
  return attendues.map((attendue, rang) =>
    construireItemBinaire(mode, niveau, graine, rang, attendue),
  )
}

// ─── Score ───────────────────────────────────────────────────────────────────

export interface ResumeBinaire {
  score: number
  itemCount: number
  accuracy: number
  medianRtMs: number
}

function mediane(valeurs: number[]): number {
  if (valeurs.length === 0) return 0
  const tri = [...valeurs].sort((a, b) => a - b)
  const milieu = Math.floor(tri.length / 2)
  return tri.length % 2 === 0 ? (tri[milieu - 1] + tri[milieu]) / 2 : tri[milieu]
}

export function scorerBinaire(reponses: readonly ReponseBinaire[]): ResumeBinaire {
  const itemCount = reponses.length
  const accuracy = itemCount === 0 ? 0 : reponses.filter((r) => r.correct).length / itemCount

  return {
    score: Math.round(accuracy * 100),
    itemCount,
    accuracy,
    medianRtMs: Math.round(mediane(reponses.map((r) => r.rtMs))),
  }
}
