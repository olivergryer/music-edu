// ─── Construction de référence — USAGE TESTS UNIQUEMENT ──────────────────────
//
// Dérivation INDÉPENDANTE des hauteurs d'accord, volontairement écrite à part du
// code de production (`dispositions.ts`). Elle sert à vérifier les tables dures
// (`qualite`, `notesCommunes`, `TABLE_DISPOSITIONS`) contre les notes réellement
// construites — sinon on testerait une table contre elle-même.
//
// Ne jamais importer depuis le code applicatif.

import type { Degre, Mode } from './types.ts'

export const GAMME_MAJEUR: readonly number[] = [0, 2, 4, 5, 7, 9, 11]
export const GAMME_MINEUR_HARMONIQUE: readonly number[] = [0, 2, 3, 5, 7, 8, 11]
export const GAMME_MINEUR_NATURELLE: readonly number[] = [0, 2, 3, 5, 7, 8, 10]

// Gamme employée pour bâtir l'accord d'un degré donné. En mineur : harmonique
// partout (le VII est toujours la sensible haussée), SAUF le degré III qui est
// pris naturel — c'est ce qui le rend majeur et non augmenté (spec §1).
export function gammeDuDegre(mode: Mode, degre: Degre): readonly number[] {
  if (mode === 'majeur') return GAMME_MAJEUR
  return degre === 3 ? GAMME_MINEUR_NATURELLE : GAMME_MINEUR_HARMONIQUE
}

// Empilement de tierces, en classes de hauteur (0–11) relatives à la tonique.
function empiler(mode: Mode, degre: Degre, nombreDeSons: number): number[] {
  const gamme = gammeDuDegre(mode, degre)
  const base = degre - 1
  return Array.from({ length: nombreDeSons }, (_, k) => gamme[(base + 2 * k) % 7] % 12)
}

export function triade(mode: Mode, degre: Degre): number[] {
  return empiler(mode, degre, 3)
}

export function accordDeSeptieme(mode: Mode, degre: Degre): number[] {
  return empiler(mode, degre, 4)
}

// Nombre de classes de hauteur partagées par deux triades.
export function notesCommunesReelles(mode: Mode, a: Degre, b: Degre): number {
  const ta = new Set(triade(mode, a))
  return triade(mode, b).filter((n) => ta.has(n)).length
}
