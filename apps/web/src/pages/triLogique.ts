// ─── Tri des listes de comptes — logique pure ────────────────────────────────
//
// Séparé de `TriComptes.tsx` pour être testable : le runner du projet
// (`node --test`) retire les annotations de types mais ne sait pas compiler le
// JSX, donc rien de testable ne doit vivre dans un fichier `.tsx`.

// Extension `.ts` explicite : ce module est exécuté tel quel par `node --test`,
// qui ne devine pas les extensions. `allowImportingTsExtensions` l'autorise côté
// TypeScript, et Vite la résout sans broncher.
import { displayStreak, todayStr } from '../hooks/progressLogic.ts'
import type { EleveData } from './CarteEleve'

export type CritereTri =
  | 'inscription' | 'activite' | 'serieActuelle' | 'serieMax' | 'xpActuel' | 'xpEver'

interface Critere {
  id: CritereTri
  label: string
  /** Libellé du sens par défaut, affiché dans le menu. */
  sensLabel: [descendant: string, ascendant: string]
}

export const CRITERES: Critere[] = [
  { id: 'activite',      label: 'Dernière activité',  sensLabel: ['récente', 'ancienne'] },
  { id: 'inscription',   label: 'Date d’inscription', sensLabel: ['récente', 'ancienne'] },
  { id: 'xpActuel',      label: 'XP actuels',         sensLabel: ['élevés', 'faibles'] },
  { id: 'xpEver',        label: 'XP record',          sensLabel: ['élevés', 'faibles'] },
  { id: 'serieActuelle', label: 'Série en cours',     sensLabel: ['longue', 'courte'] },
  { id: 'serieMax',      label: 'Série record',       sensLabel: ['longue', 'courte'] },
]

/**
 * Valeur numérique comparable d'un compte pour un critère.
 * `null` = donnée absente ; ces comptes sont toujours renvoyés en fin de liste,
 * quel que soit le sens, pour ne pas prendre la tête d'un classement par défaut.
 */
function valeur(e: EleveData, critere: CritereTri): number | null {
  const prog = e.progress
  switch (critere) {
    case 'inscription':
      return e.creeLe ? e.creeLe.getTime() : null
    case 'activite':
      // La date est au format AAAA-MM-JJ : l'ordre lexicographique suffit, mais
      // on passe par un nombre pour rester homogène avec les autres critères.
      return prog?.streak.lastDate ? Number(prog.streak.lastDate.replace(/-/g, '')) : null
    case 'serieActuelle':
      // Série « vivante » : la même que celle affichée sur la carte, donc 0 dès
      // qu'un jour a été sauté — et non le `current` périmé resté en base.
      return prog ? displayStreak(prog.streak, todayStr()) : null
    case 'serieMax':
      return prog?.streak.longest ?? null
    case 'xpActuel':
      return e.xpAffiche ?? null
    case 'xpEver':
      return prog?.xpPeak ?? null
  }
}

export function trier(liste: EleveData[], critere: CritereTri, descendant: boolean): EleveData[] {
  return [...liste].sort((a, b) => {
    const va = valeur(a, critere)
    const vb = valeur(b, critere)
    if (va === null && vb === null) return a.displayName.localeCompare(b.displayName)
    if (va === null) return 1
    if (vb === null) return -1
    if (va === vb) return a.displayName.localeCompare(b.displayName)
    return descendant ? vb - va : va - vb
  })
}

