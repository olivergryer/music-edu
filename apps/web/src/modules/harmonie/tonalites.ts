// ─── Orthographe des notes et des tonalités (pur) ────────────────────────────
//
// POURQUOI CE FICHIER EXISTE. Le reste du module ne connaît que des DEMI-TONS :
// `Disposition.basse` est un intervalle chromatique, `Progression.tonique` une
// classe de hauteur 0-11. Ça suffit pour sonner, pas pour NOMMER — 3 demi-tons
// au-dessus de do s'écrit « mi♭ » et non « ré♯ », et une classe de hauteur ne
// tranche pas (6 = fa♯ ou sol♭).
//
// La dictée de basse fait saisir des noms de notes avec altérations : il faut donc
// la gamme ORTHOGRAPHIÉE de la tonalité. C'est ce que produit `gammeNommee`.
//
// Comme les tables de `geometrie.ts`, les tonalités sont une TABLE et non une
// formule : le choix entre fa♯ majeur et sol♭ majeur est un usage, pas un calcul.

import { type Mode } from './types.ts'

export const LETTRES = ['do', 're', 'mi', 'fa', 'sol', 'la', 'si'] as const
export type Lettre = (typeof LETTRES)[number]

/**
 * −2 = double bémol … +2 = double dièse.
 *
 * Les doubles ne sont pas décoratives : en mineur harmonique, hausser la sensible
 * d'une tonalité dont le 7ᵉ degré est déjà dièse produit un double dièse. Sur les
 * douze toniques retenues, le cas se présente une fois et une seule — **sol♯
 * mineur, dont la sensible est fa♯♯** (test dédié). Sans effet sur la dictée de
 * basse, qui n'emploie que I, IV et V : le 7ᵉ degré n'y descend jamais à la basse.
 */
export type Alteration = -2 | -1 | 0 | 1 | 2

export interface NoteNommee {
  lettre: Lettre
  alteration: Alteration
}

/** Demi-tons de la lettre naturelle au-dessus de do. */
const NATUREL: Readonly<Record<Lettre, number>> = {
  do: 0,
  re: 2,
  mi: 4,
  fa: 5,
  sol: 7,
  la: 9,
  si: 11,
}

const LABELS: Readonly<Record<Lettre, string>> = {
  do: 'Do',
  re: 'Ré',
  mi: 'Mi',
  fa: 'Fa',
  sol: 'Sol',
  la: 'La',
  si: 'Si',
}

const SYMBOLES: Readonly<Record<Alteration, string>> = {
  [-2]: '♭♭',
  [-1]: '♭',
  0: '',
  1: '♯',
  2: '♯♯',
}

// Patrons de gamme, en demi-tons depuis la tonique. Le mineur est HARMONIQUE —
// même convention que `qualite()` dans `types.ts` : la sensible est haussée.
const PATRONS: Readonly<Record<Mode, readonly number[]>> = {
  majeur: [0, 2, 4, 5, 7, 9, 11],
  mineur: [0, 2, 3, 5, 7, 8, 11],
}

// ─── Les douze tonalités usuelles, par mode ──────────────────────────────────
//
// Indexées par classe de hauteur de la tonique. Choix d'usage, pas de règle :
// à égalité d'altérations on retient la tonalité réellement écrite par les
// éditeurs (mi♭ mineur plutôt que ré♯ mineur, tous deux à 6 altérations).

const TONIQUES_MAJEUR: readonly NoteNommee[] = [
  { lettre: 'do', alteration: 0 }, //  0 — Do        0
  { lettre: 're', alteration: -1 }, //  1 — Ré♭      5♭
  { lettre: 're', alteration: 0 }, //  2 — Ré        2♯
  { lettre: 'mi', alteration: -1 }, //  3 — Mi♭      3♭
  { lettre: 'mi', alteration: 0 }, //  4 — Mi        4♯
  { lettre: 'fa', alteration: 0 }, //  5 — Fa        1♭
  { lettre: 'fa', alteration: 1 }, //  6 — Fa♯       6♯ (contre Sol♭, 6♭)
  { lettre: 'sol', alteration: 0 }, //  7 — Sol      1♯
  { lettre: 'la', alteration: -1 }, //  8 — La♭      4♭
  { lettre: 'la', alteration: 0 }, //  9 — La        3♯
  { lettre: 'si', alteration: -1 }, // 10 — Si♭      2♭
  { lettre: 'si', alteration: 0 }, // 11 — Si        5♯
]

const TONIQUES_MINEUR: readonly NoteNommee[] = [
  { lettre: 'do', alteration: 0 }, //  0 — do        3♭
  { lettre: 'do', alteration: 1 }, //  1 — do♯       4♯
  { lettre: 're', alteration: 0 }, //  2 — ré        1♭
  { lettre: 'mi', alteration: -1 }, //  3 — mi♭      6♭ (contre ré♯, 6♯)
  { lettre: 'mi', alteration: 0 }, //  4 — mi        1♯
  { lettre: 'fa', alteration: 0 }, //  5 — fa        4♭
  { lettre: 'fa', alteration: 1 }, //  6 — fa♯       3♯
  { lettre: 'sol', alteration: 0 }, //  7 — sol      2♭
  { lettre: 'sol', alteration: 1 }, //  8 — sol♯     5♯ (contre la♭, 7♭)
  { lettre: 'la', alteration: 0 }, //  9 — la        0
  { lettre: 'si', alteration: -1 }, // 10 — si♭      5♭ (contre la♯, 7♯)
  { lettre: 'si', alteration: 0 }, // 11 — si        2♯
]

export function toniqueNommee(tonique: number, mode: Mode): NoteNommee {
  const pc = ((tonique % 12) + 12) % 12
  return (mode === 'majeur' ? TONIQUES_MAJEUR : TONIQUES_MINEUR)[pc]
}

// ─── Notes ───────────────────────────────────────────────────────────────────

export function classeDeHauteur(note: NoteNommee): number {
  return ((NATUREL[note.lettre] + note.alteration) % 12 + 12) % 12
}

export function nomNote(note: NoteNommee): string {
  return LABELS[note.lettre] + SYMBOLES[note.alteration]
}

export function memeNote(a: NoteNommee, b: NoteNommee): boolean {
  return a.lettre === b.lettre && a.alteration === b.alteration
}

export function nomTonalite(tonique: number, mode: Mode): string {
  return `${nomNote(toniqueNommee(tonique, mode))} ${mode}`
}

/**
 * La gamme orthographiée, sept notes, index 0 = degré I.
 *
 * Chaque degré prend la LETTRE suivante — c'est la règle d'écriture qui garantit
 * qu'une gamme n'emploie jamais deux fois la même lettre — puis l'altération qui
 * la met au bon nombre de demi-tons.
 */
export function gammeNommee(tonique: number, mode: Mode): NoteNommee[] {
  const base = toniqueNommee(tonique, mode)
  const iBase = LETTRES.indexOf(base.lettre)
  const patron = PATRONS[mode]

  return patron.map((demiTons, degre) => {
    const lettre = LETTRES[(iBase + degre) % LETTRES.length]

    // Écart naturel entre les deux lettres, puis correction pour tomber juste.
    const naturel = ((NATUREL[lettre] - NATUREL[base.lettre]) % 12 + 12) % 12
    let ecart = demiTons - naturel
    ecart = ((ecart % 12) + 12) % 12
    if (ecart > 6) ecart -= 12

    const alteration = base.alteration + ecart
    if (alteration < -2 || alteration > 2) {
      throw new Error(
        `gammeNommee : altération hors bornes (${alteration}) sur ${lettre} ` +
          `en ${nomTonalite(tonique, mode)}`,
      )
    }
    return { lettre, alteration: alteration as Alteration }
  })
}
