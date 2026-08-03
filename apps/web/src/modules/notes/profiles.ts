// ─── Profils de lecture (spec « profils et table instruments ») ───────────────
//
// L'unité pédagogique n'est pas l'instrument mais le couple (clef, progression
// d'ambitus écrit). 4 profils couvrent l'orchestre symphonique hors percussions.
// Le cor rejoint `treble-mid` (décision v1) → pas de `treble-low`.
//
// `ambitusSequence` est une SUITE ORDONNÉE d'étapes {low, high} (DiatonicIndex),
// asymétrique autour des repères — pas un simple min/max (spec §10, cas clarinette).
//
// ⚠️ VALEURS PLACEHOLDER — landmarks et ambitusSequence sont des points de départ
// plausibles à AFFINER par Matthieu (données pures, aucune modif de code requise).
// Rappel index : octave FR * 7 + degré (do=0…si=6), do3 = 21 = do central.

import { diatonic } from './diatonic.ts'
import type { Clef, DiatonicIndex } from './types.ts'

export interface AmbitusStep {
  low: DiatonicIndex
  high: DiatonicIndex
}

export interface ReadingProfile {
  id: string
  clef: Clef
  landmarks: DiatonicIndex[]        // 3-4 notes repères de la phase 0
  ambitusSequence: AmbitusStep[]    // étapes d'extension ordonnées
}

// Raccourci lisibilité : n(octaveFR, degré). do=0,re=1,mi=2,fa=3,sol=4,la=5,si=6.
const n = diatonic

export const READING_PROFILES: Record<string, ReadingProfile> = {
  // Sol — démarre milieu de portée, extension vers l'aigu (flûte, piccolo).
  'treble-high': {
    id: 'treble-high',
    clef: 'treble',
    landmarks: [n(3, 4), n(3, 6), n(4, 1)],           // sol3, si3, re4  // TODO Matthieu
    ambitusSequence: [                                 // TODO Matthieu
      { low: n(3, 4), high: n(4, 1) },   // sol3..re4
      { low: n(3, 4), high: n(4, 4) },   // + sol4
      { low: n(3, 4), high: n(4, 6) },   // + si4
      { low: n(3, 2), high: n(4, 6) },   // + mi3 (léger grave)
    ],
  },

  // Sol — démarre bas de portée, extension vers l'aigu PUIS vers le grave
  // (violon, hautbois, clarinette, saxophone, trompette, cor). Grave tardif :
  // cas clarinette (main droite non engagée avant fin de 1re année).
  'treble-mid': {
    id: 'treble-mid',
    clef: 'treble',
    landmarks: [n(3, 2), n(3, 4), n(3, 6)],           // mi3, sol3, si3  // TODO Matthieu
    ambitusSequence: [                                 // TODO Matthieu
      { low: n(3, 2), high: n(3, 6) },   // mi3..si3 (dans la portée)
      { low: n(3, 2), high: n(4, 1) },   // + re4 (aigu)
      { low: n(3, 2), high: n(4, 3) },   // + fa4 (haut de portée)
      { low: n(3, 0), high: n(4, 3) },   // + do3 (grave TARDIF)
      { low: n(2, 5), high: n(4, 4) },   // + la2..sol4 (lignes suppl.)
    ],
  },

  // Ut3 — clef d'alto, repères autour de la ligne médiane (do3).
  alto: {
    id: 'alto',
    clef: 'alto',
    landmarks: [n(2, 5), n(3, 0), n(3, 2)],           // la2, do3, mi3  // TODO Matthieu
    ambitusSequence: [                                 // TODO Matthieu
      { low: n(2, 5), high: n(3, 2) },   // la2..mi3
      { low: n(2, 3), high: n(3, 4) },   // + fa2..sol3
      { low: n(2, 1), high: n(3, 6) },   // extension des deux côtés
    ],
  },

  // Fa — démarre milieu/bas, extension vers le grave et l'aigu
  // (violoncelle, contrebasse, basson, trombone, tuba).
  bass: {
    id: 'bass',
    clef: 'bass',
    landmarks: [n(2, 0), n(2, 3), n(2, 5)],           // do2, fa2, la2  // TODO Matthieu
    ambitusSequence: [                                 // TODO Matthieu
      { low: n(2, 0), high: n(2, 5) },   // do2..la2
      { low: n(1, 4), high: n(3, 0) },   // + sol1..do3 (do3 = 1 ligne suppl. au-dessus)
      { low: n(1, 2), high: n(3, 0) },   // extension grave
    ],
  },

  // Ut4 — clef de ténor : do3 sur la 4e ligne (basson/trombone/violoncelle aigus).
  tenor: {
    id: 'tenor',
    clef: 'tenor',
    landmarks: [n(2, 5), n(3, 0), n(3, 2)],           // la2, do3, mi3  // TODO Matthieu
    ambitusSequence: [                                 // TODO Matthieu
      { low: n(2, 3), high: n(3, 2) },   // fa2..mi3
      { low: n(2, 1), high: n(3, 4) },   // + re2..sol3
      { low: n(1, 6), high: n(3, 4) },   // extension
    ],
  },
}

export const PROFILE_IDS = Object.keys(READING_PROFILES)

export function getProfile(id: string): ReadingProfile | undefined {
  return READING_PROFILES[id]
}

// Libellé FR d'une clef.
export const CLEF_LABELS: Record<Clef, string> = { treble: 'Sol', bass: 'Fa', alto: 'Ut3', tenor: 'Ut4' }

// Profil de lecture par défaut pour une clef donnée (clefs secondaires).
export const CLEF_DEFAULT_PROFILE: Record<Clef, string> = {
  treble: 'treble-mid', bass: 'bass', alto: 'alto', tenor: 'tenor',
}

// Profil à utiliser pour une clef : le profil primaire de l'instrument s'il est
// dans cette clef, sinon le profil par défaut de la clef.
export function profileForClef(primaryProfileId: string, clef: Clef): ReadingProfile {
  const primary = READING_PROFILES[primaryProfileId]
  if (primary && primary.clef === clef) return primary
  return READING_PROFILES[CLEF_DEFAULT_PROFILE[clef]]
}
