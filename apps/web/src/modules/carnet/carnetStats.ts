// Statistiques d'un exercice (fonction pure, testable sans Firebase).

import type { Seance } from './carnetStorage.ts'

export interface StatsExercice { max?: number; precedent?: number }

/**
 * Max atteint = meilleur tempo saisi toutes séances confondues (même niveau,
 * tonalité, exercice), hors séance éditée. Précédent = séance la plus récente
 * antérieure à `avant` (ISO) qui contient une saisie pour l'exercice.
 */
export function statsExercice(
  seances: Seance[], niveau: string, tonalite: string, exercice: string,
  courante?: { id: string | null; date: string },
): StatsExercice {
  const pertinentes = seances
    .filter(s => s.niveau === niveau && s.tonalite === tonalite && s.id !== courante?.id)
    .filter(s => typeof s.saisis[exercice] === 'number')
  if (!pertinentes.length) return {}
  const max = Math.max(...pertinentes.map(s => s.saisis[exercice]))
  const avant = courante?.date
  const anterieures = (avant ? pertinentes.filter(s => s.date < avant) : pertinentes)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
  return { max, precedent: anterieures[0]?.saisis[exercice] }
}
