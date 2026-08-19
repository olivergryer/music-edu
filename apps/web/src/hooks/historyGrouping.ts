// ─── Regroupement de l'historique du tableau de bord ──────────────────────────
//
// Quinze exercices de Rythme enchaînés produisaient quinze lignes identiques :
// l'historique devenait illisible, et une session de Théorie s'y noyait. On
// fusionne donc les sessions CONSÉCUTIVES d'un même module dans une même
// journée.
//
// « Consécutives » et non « du même jour » : l'ordre chronologique reste lisible.
// Faire du Rythme, puis de la Théorie, puis du Rythme donne trois lignes — ce qui
// s'est réellement passé, dans l'ordre où ça s'est passé.
//
// Fonction PURE, testée : elle ne lit ni Firestore ni l'horloge.

import type { HistoryEntry } from './progressLogic'

/**
 * Historique tel qu'il REVIENT de Firestore : `module` y est une chaîne libre.
 * La base contient des identifiants antérieurs au registre `lib/modules.ts`, que
 * l'union stricte de `HistoryEntry` rejetterait — or ces sessions doivent rester
 * affichables.
 */
export type HistoriqueLu = Omit<HistoryEntry, 'module'> & { module: string }

export interface GroupedEntry {
  date: string
  module: string
  /** XP cumulés du groupe. */
  xp: number
  /** Nombre de sessions fusionnées. */
  count: number
  /**
   * Nombre d'items joués, cumulé — exercices, questions. `null` quand AUCUNE
   * session du groupe ne le renseigne : c'est le cas de tout l'historique
   * antérieur à l'ajout de ce champ, qui doit rester affichable.
   */
  items: number | null
  /** Niveaux distincts travaillés, dans l'ordre d'apparition. */
  levels: string[]
  /** Meilleure médaille du groupe. */
  medal: string
  /** Au moins une session du groupe a validé la journée pour le streak. */
  streakValidated: boolean
  /** L'entrée elle-même quand le groupe n'en compte qu'une — pour son détail. */
  single: HistoriqueLu | null
}

// Du meilleur au moins bon. Les modules récents (Notes, Harmonie) écrivent des
// mots, les anciens des emojis : les deux formes coexistent en base et doivent
// donc être comprises ici.
const ORDRE_MEDAILLES = ['🥇', 'or', '🥈', 'argent', '🥉', 'bronze', '🎯']

function rangMedaille(medal: string): number {
  const i = ORDRE_MEDAILLES.indexOf(medal)
  return i === -1 ? ORDRE_MEDAILLES.length : i
}

/** Emoji d'une médaille, quelle que soit la forme écrite en base. */
export function iconeMedaille(medal: string): string {
  if (medal === 'or') return '🥇'
  if (medal === 'argent') return '🥈'
  if (medal === 'bronze') return '🥉'
  return medal
}

/**
 * Fusionne les sessions consécutives de même module et même date.
 * L'ordre d'entrée est préservé — l'appelant fournit l'historique déjà trié.
 */
export function groupHistory(history: readonly HistoriqueLu[]): GroupedEntry[] {
  const groupes: GroupedEntry[] = []

  for (const h of history) {
    const dernier = groupes[groupes.length - 1]
    const memeGroupe = dernier && dernier.date === h.date && dernier.module === h.module

    if (!memeGroupe) {
      groupes.push({
        date: h.date,
        module: h.module,
        xp: h.xp ?? 0,
        count: 1,
        items: h.items ?? null,
        levels: h.level ? [h.level] : [],
        medal: h.medal,
        streakValidated: h.streakValidated === true,
        single: h,
      })
      continue
    }

    dernier.xp += h.xp ?? 0
    dernier.count += 1
    // `null + 3` doit donner 3 : une session sans compteur ne doit pas annuler
    // celles qui en ont un, sinon un seul vieil enregistrement effacerait le
    // total de tout le groupe.
    if (h.items !== undefined) dernier.items = (dernier.items ?? 0) + h.items
    if (h.level && !dernier.levels.includes(h.level)) dernier.levels.push(h.level)
    if (rangMedaille(h.medal) < rangMedaille(dernier.medal)) dernier.medal = h.medal
    if (h.streakValidated === true) dernier.streakValidated = true
    dernier.single = null
  }

  return groupes
}

/** Dates ayant validé le streak — liseré doré du calendrier. */
export function joursValidantStreak(history: readonly HistoriqueLu[]): Set<string> {
  const dates = new Set<string>()
  for (const h of history) if (h.streakValidated === true) dates.add(h.date)
  return dates
}
