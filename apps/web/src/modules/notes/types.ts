// ─── Modèle de données du module Notes (lecture de notes) ─────────────────────
//
// Fonctions pures uniquement dans ce répertoire : zéro React / Firestore / VexFlow
// / DOM (spec §12). Le nom de note est TOUJOURS dérivé de `diatonicIndex % 7`,
// jamais stocké (spec §3). Conventions de nommage : types métier préfixés `Notes*`,
// jamais de variable nue `notes` (spec §8).

// Clefs, dans l'ordre instrumental (pas celui du cursus FM).
export type Clef = 'treble' | 'bass' | 'alto' | 'tenor'

// Noms de notes non altérés (v1). L'ORDRE définit le degré diatonique : do=0 … si=6.
export type NoteName = 'do' | 're' | 'mi' | 'fa' | 'sol' | 'la' | 'si'
export const NOTE_NAMES: readonly NoteName[] = ['do', 're', 'mi', 'fa', 'sol', 'la', 'si']

// Index diatonique ABSOLU : octave * 7 + degré (do=0 … si=6). Do3 = 21.
// Numérotation d'octave française (do3 = do central = C4 scientifique).
// Conçu pour accueillir une altération future SANS changer de type (spec §1) :
// une altération vivra dans l'`Attempt`/rendu, pas dans l'index.
export type DiatonicIndex = number

// Un item = une hauteur écrite dans une clef donnée. La MÊME hauteur en deux clefs
// est un item visuel distinct (id inclut la clef) — spec §3.
export interface NoteItem {
  id: string            // `${clef}:${diatonicIndex}`
  clef: Clef
  diatonicIndex: DiatonicIndex
}

export type AttemptFlag = 'guess' | 'slow' | 'firstOfLine'

export interface Attempt {
  itemId: string
  clef: Clef
  diatonicIndex: DiatonicIndex   // hauteur attendue (dérive le nom correct)
  answered: NoteName
  correct: boolean
  rtMs: number                   // peinture de l'item → pointerup (spec §4)
  flags: AttemptFlag[]
  atMs?: number                  // horodatage absolu du pointerup (cvIntervalles)
}

// Trois phases pédagogiques (spec §7).
export type Phase = 'P0' | 'P1' | 'P2'

// Étayage de la roue : noms visibles (P0) → estompés (P1) → masqués (P2).
export type Etayage = 'visible' | 'estompe' | 'masque'

// Suivi de maîtrise par item (couple clef+hauteur). Fenêtres bornées pour rester
// compactes et donner un « récent » exploitable par la pondération de tirage.
export interface NoteMastery {
  attempts: number       // essais comptés (hors `guess`)
  correct: number        // succès comptés (hors `guess`)
  recent: boolean[]       // exactitude récente (hors `guess`), plus récent en dernier
  rtSamples: number[]     // RT récents (hors `guess`) pour la médiane
  lastPlayedTurn: number  // tour de tirage où l'item a été montré (récence)
}

export type Mastery = Record<string, NoteMastery>

// Config d'une session (persistée dans `config`, spec §11).
export interface NotesSessionConfig {
  clef: Clef
  phase: Phase
  ambitus: { low: DiatonicIndex; high: DiatonicIndex }
  coloriser: boolean         // colorisation des hauteurs (toggle, OFF par défaut §6)
  etayage: Etayage           // état de l'étayage roue (journalisé §5)
  guessFloorMs: number       // plancher de devinette (défaut 500, §8)
  sonConfirmation: boolean   // son APRÈS réponse, désactivable (§2)
  rtTargetMs: number         // RT cible (pondération de tirage §9)
  slowCeilingMs: number      // plafond au-delà duquel un essai est `slow`
}

// Résumé de session (persisté dans `summary`, spec §11).
export interface NotesSummary {
  itemCount: number
  accuracy: number          // sur essais hors `guess`
  medianRtMs: number
  debitNotesMin: number     // notes par minute
  cvIntervalles: number     // coef. de variation des intervalles entre réponses (§11)
}

export const DEFAULT_CONFIG: Omit<NotesSessionConfig, 'clef' | 'phase' | 'ambitus'> = {
  coloriser: false,
  etayage: 'visible',
  guessFloorMs: 500,
  sonConfirmation: true,
  rtTargetMs: 1500,
  slowCeilingMs: 4000,
}
