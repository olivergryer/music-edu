// ─── Activité « dictée de basse » — niveau 1, logique pure ───────────────────
//
// L'élève entend une suite courte et nomme les basses, une par une, à la roue
// figée. C'est le PRÉREQUIS de tout le module : le chiffrage français chiffre les
// intervalles au-dessus de la basse, donc qui n'entend pas la basse ne peut rien
// chiffrer (cf. l'en-tête de `metrique.ts`).
//
// ⚠ POURQUOI PAS `evaluerBasse`. Le noyau porte déjà `evaluerBasse`, qui compare
// des DEGRÉS de gamme (1-7). Elle reste juste et n'est pas touchée. Mais la roue
// fait saisir des notes NOMMÉES, avec altération : mi et mi♭ tombent tous deux sur
// le degré 3, et la faute d'altération passerait inaperçue. D'où la comparaison
// nommée ci-dessous, qui sépare faute de lettre et faute d'altération — deux
// erreurs de nature différente, la première d'oreille, la seconde de tonalité.
//
// La tonique sonne AVANT l'item et la tonalité est écrite à l'écran (décidé avec
// Matthieu) : l'exercice mesure l'audition de la basse, pas l'oreille absolue.

import { genererProgression } from './generateur.ts'
import { gammeNommee, memeNote, nomNote, type NoteNommee } from './tonalites.ts'
import { type Accord, type Mode, type Progression } from './types.ts'

export const NIVEAU_DICTEE = 1
export const ITEMS_PAR_SESSION_DICTEE = 8

const PAS_GRAINE = 1009 // premier — décorrèle les items voisins, comme en détection

export interface ItemDictee {
  index: number
  progression: Progression
  /** Réponse attendue : la basse de chaque accord, orthographiée. */
  basses: NoteNommee[]
}

export interface ReponseDictee {
  index: number
  correct: boolean
  rtMs: number
  /** Nombre de basses justes sur le total de l'item. */
  justes: number
  total: number
}

/**
 * La basse d'un accord, nommée.
 *
 * Le renversement désigne quel son de l'accord descend à la basse : fondamentale,
 * tierce, quinte, septième — soit un saut de 0, 2, 4 ou 6 degrés de gamme au-dessus
 * de la fondamentale. Le niveau 1 est à l'état fondamental, mais la fonction reste
 * générale : elle servira telle quelle aux niveaux à renversements.
 */
export function basseNommee(accord: Accord, gamme: readonly NoteNommee[]): NoteNommee {
  const saut = [0, 2, 4, 6][accord.renversement]
  return gamme[(accord.degre - 1 + saut) % gamme.length]
}

export function bassesDeProgression(progression: Progression, mode: Mode): NoteNommee[] {
  const gamme = gammeNommee(progression.tonique, mode)
  return progression.accords.map((accord) => basseNommee(accord, gamme))
}

// ─── Construction de la session ──────────────────────────────────────────────
//
// La tonalité change à chaque item : sinon tout se jouerait en do, la basse ne
// porterait jamais d'altération et le geste dièse/bémol de la roue ne servirait
// jamais. C'est l'ARMURE qui amène les altérations au niveau 1, pas les accords —
// le vocabulaire [1, 4, 5] à l'état fondamental n'en produit aucune.

export function construireItemDictee(mode: Mode, graine: number, rang: number): ItemDictee {
  const spec = { min: 2, max: 4 } // `NIVEAUX[1].longueur`
  const longueur = spec.min + ((graine + rang) % (spec.max - spec.min + 1))
  const base = genererProgression(mode, NIVEAU_DICTEE, longueur, graine + rang * PAS_GRAINE)
  const progression: Progression = { ...base, tonique: (graine + rang * 7) % 12 }

  return {
    index: rang,
    progression,
    basses: bassesDeProgression(progression, mode),
  }
}

export function construireSessionDictee(
  mode: Mode,
  graine: number,
  nombreItems: number = ITEMS_PAR_SESSION_DICTEE,
): ItemDictee[] {
  return Array.from({ length: nombreItems }, (_, rang) =>
    construireItemDictee(mode, graine, rang),
  )
}

// ─── Évaluation ──────────────────────────────────────────────────────────────

export interface ErreurBasseNommee {
  index: number
  attendu: NoteNommee | null
  repondu: NoteNommee | null
  /** Vrai si la lettre est juste — l'élève a entendu le bon degré. */
  lettreJuste: boolean
  /** Vrai si l'altération est juste — l'élève a la bonne tonalité en tête. */
  alterationJuste: boolean
}

/**
 * Les seules entrées FAUSSES, dans l'ordre. Une réponse trop courte produit
 * `repondu: null`, une réponse trop longue `attendu: null` — même convention de
 * sentinelle que `evaluerBasse`, transposée aux notes nommées.
 */
export function evaluerBasseNommee(
  attendu: readonly NoteNommee[],
  repondu: readonly (NoteNommee | null)[],
): ErreurBasseNommee[] {
  const erreurs: ErreurBasseNommee[] = []
  const longueur = Math.max(attendu.length, repondu.length)

  for (let i = 0; i < longueur; i++) {
    const a = attendu[i] ?? null
    const r = repondu[i] ?? null
    if (a && r && memeNote(a, r)) continue

    erreurs.push({
      index: i,
      attendu: a,
      repondu: r,
      lettreJuste: Boolean(a && r && a.lettre === r.lettre),
      alterationJuste: Boolean(a && r && a.alteration === r.alteration),
    })
  }
  return erreurs
}

/** Nombre de basses justes — un item n'est « correct » que s'il l'est en entier. */
export function compterJustes(
  attendu: readonly NoteNommee[],
  repondu: readonly (NoteNommee | null)[],
): number {
  return attendu.reduce((n, a, i) => {
    const r = repondu[i]
    return n + (r && memeNote(a, r) ? 1 : 0)
  }, 0)
}

export function lireErreurBasse(e: ErreurBasseNommee): string {
  if (!e.repondu) return 'basse non saisie'
  if (!e.attendu) return 'basse en trop'
  if (e.lettreJuste) return `${nomNote(e.repondu)} au lieu de ${nomNote(e.attendu)} — altération`
  return `${nomNote(e.repondu)} au lieu de ${nomNote(e.attendu)}`
}

// ─── Score ───────────────────────────────────────────────────────────────────

export interface ResumeDictee {
  score: number
  itemCount: number
  accuracy: number
  medianRtMs: number
  /** Part des basses justes, plus fine que le taux d'items entièrement justes. */
  precisionNotes: number
}

function mediane(valeurs: number[]): number {
  if (valeurs.length === 0) return 0
  const tri = [...valeurs].sort((a, b) => a - b)
  const milieu = Math.floor(tri.length / 2)
  return tri.length % 2 === 0 ? (tri[milieu - 1] + tri[milieu]) / 2 : tri[milieu]
}

export function scorerDictee(reponses: readonly ReponseDictee[]): ResumeDictee {
  const itemCount = reponses.length
  const accuracy = itemCount === 0 ? 0 : reponses.filter((r) => r.correct).length / itemCount

  const notes = reponses.reduce((s, r) => s + r.total, 0)
  const justes = reponses.reduce((s, r) => s + r.justes, 0)

  return {
    score: Math.round(accuracy * 100),
    itemCount,
    accuracy,
    medianRtMs: Math.round(mediane(reponses.map((r) => r.rtMs))),
    precisionNotes: notes === 0 ? 0 : justes / notes,
  }
}
