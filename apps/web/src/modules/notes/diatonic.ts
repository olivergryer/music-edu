// ─── Index diatonique ↔ nom / octave / clé VexFlow ────────────────────────────
//
// Rappels : diatonicIndex = octave * 7 + degré (do=0 … si=6), numérotation FR
// (do3 = do central = C4 scientifique). Do3 = 21.
//
// La HAUTEUR (nom + octave) est absolue : un do reste « do » quelle que soit la
// clef. La clef ne change QUE la position dessinée sur la portée — VexFlow s'en
// charge à partir de la clé (`c/4`) et de la clef posée sur la portée. `toVexKey`
// est donc indépendant de la clef ; `vexClef` fournit le nom VexFlow de la clef.

import { NOTE_NAMES, type Clef, type DiatonicIndex, type NoteName } from './types.ts'

// Degré 0..6 → lettre anglaise VexFlow.
const DEGREE_TO_LETTER = ['c', 'd', 'e', 'f', 'g', 'a', 'b'] as const

export function degreeOf(idx: DiatonicIndex): number {
  return ((idx % 7) + 7) % 7
}

export function octaveOf(idx: DiatonicIndex): number {
  return Math.floor(idx / 7)
}

export function noteNameOf(idx: DiatonicIndex): NoteName {
  return NOTE_NAMES[degreeOf(idx)]
}

// Degré d'un nom de note (do=0 … si=6).
export function degreeOfName(name: NoteName): number {
  return NOTE_NAMES.indexOf(name)
}

// Clé VexFlow « lettre/octaveScientifique » — ex. do3 (idx 21) → 'c/4'.
// Octave scientifique = octave FR + 1 (do3 = C4).
export function toVexKey(idx: DiatonicIndex): string {
  return `${DEGREE_TO_LETTER[degreeOf(idx)]}/${octaveOf(idx) + 1}`
}

// Nom VexFlow de la clef (identique ici, mais isolé pour découpler le rendu).
export function vexClef(clef: Clef): Clef {
  return clef
}

// Construit un index depuis (octaveFR, degré) — utilitaire de données/tests.
export function diatonic(octaveFr: number, degree: number): DiatonicIndex {
  return octaveFr * 7 + degree
}
