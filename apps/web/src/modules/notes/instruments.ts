// ─── Table des instruments (donnée partagée) ──────────────────────────────────
//
// Deux niveaux : un `Instrument` pointe vers un `ReadingProfile` (clef primaire +
// progression d'ambitus) et ajoute ses clefs secondaires (ordre pédagogique
// instrumental), sa transposition et son statut débutant.
//
// Ajouter un instrument = UNE ligne ici, zéro ligne de code (spec profils §5.1).
// Le sélecteur v1 n'affiche que `beginnerFriendly` (§5.2).
//
// ⚠️ `transposition` (demi-tons, écrit → sonnant) n'a AUCUN consommateur dans le
// module Notes : la réponse est un nom écrit. La colonne existe car la table est
// partagée (l'Accordeur en a besoin). NE PAS écrire de code Notes qui la lit (§5.4).

import type { Clef } from './types.ts'

export interface Instrument {
  id: string
  label: string
  primaryProfile: string     // → ReadingProfile.id (fournit la clef primaire)
  secondaryClefs: Clef[]     // clefs additionnelles, ordre pédagogique
  transposition: number      // demi-tons — NON lue par le module Notes
  beginnerFriendly: boolean  // proposé dans le sélecteur v1
}

// Clefs : Sol=treble, Fa=bass, Ut3=alto, Ut4=tenor.
export const INSTRUMENTS: Instrument[] = [
  { id: 'flute',          label: 'Flûte',                primaryProfile: 'treble-high', secondaryClefs: [],                 transposition: 0,   beginnerFriendly: true  },
  { id: 'hautbois',       label: 'Hautbois',             primaryProfile: 'treble-mid',  secondaryClefs: [],                 transposition: 0,   beginnerFriendly: true  },
  { id: 'clarinette-sib', label: 'Clarinette si♭',       primaryProfile: 'treble-mid',  secondaryClefs: [],                 transposition: -2,  beginnerFriendly: true  },
  { id: 'sax-alto-mib',   label: 'Saxophone alto mi♭',   primaryProfile: 'treble-mid',  secondaryClefs: [],                 transposition: -9,  beginnerFriendly: true  },
  { id: 'basson',         label: 'Basson',               primaryProfile: 'bass',        secondaryClefs: ['tenor'],          transposition: 0,   beginnerFriendly: true  },
  { id: 'cor-fa',         label: 'Cor fa',               primaryProfile: 'treble-mid',  secondaryClefs: ['bass'],           transposition: -7,  beginnerFriendly: true  },
  { id: 'trompette-sib',  label: 'Trompette si♭',        primaryProfile: 'treble-mid',  secondaryClefs: [],                 transposition: -2,  beginnerFriendly: true  },
  { id: 'trombone',       label: 'Trombone',             primaryProfile: 'bass',        secondaryClefs: ['tenor'],          transposition: 0,   beginnerFriendly: true  },
  { id: 'tuba',           label: 'Tuba',                 primaryProfile: 'bass',        secondaryClefs: [],                 transposition: 0,   beginnerFriendly: true  },
  { id: 'violon',         label: 'Violon',               primaryProfile: 'treble-mid',  secondaryClefs: [],                 transposition: 0,   beginnerFriendly: true  },
  { id: 'alto',           label: 'Alto',                 primaryProfile: 'alto',        secondaryClefs: ['treble'],         transposition: 0,   beginnerFriendly: true  },
  { id: 'violoncelle',    label: 'Violoncelle',          primaryProfile: 'bass',        secondaryClefs: ['tenor', 'treble'],transposition: 0,   beginnerFriendly: true  },
  { id: 'contrebasse',    label: 'Contrebasse',          primaryProfile: 'bass',        secondaryClefs: [],                 transposition: -12, beginnerFriendly: true  },
  { id: 'piccolo',        label: 'Piccolo',              primaryProfile: 'treble-high', secondaryClefs: [],                 transposition: 12,  beginnerFriendly: false },
  { id: 'cor-anglais',    label: 'Cor anglais',          primaryProfile: 'treble-mid',  secondaryClefs: [],                 transposition: -7,  beginnerFriendly: false },
  { id: 'clarinette-basse',label: 'Clarinette basse si♭',primaryProfile: 'treble-mid',  secondaryClefs: [],                 transposition: -14, beginnerFriendly: false },
  { id: 'contrebasson',   label: 'Contrebasson',         primaryProfile: 'bass',        secondaryClefs: [],                 transposition: -12, beginnerFriendly: false },
  { id: 'clarinette-la',  label: 'Clarinette la',        primaryProfile: 'treble-mid',  secondaryClefs: [],                 transposition: -3,  beginnerFriendly: false },
  { id: 'trompette-ut',   label: 'Trompette ut',         primaryProfile: 'treble-mid',  secondaryClefs: [],                 transposition: 0,   beginnerFriendly: false },
  { id: 'sax-tenor-sib',  label: 'Saxophone ténor si♭',  primaryProfile: 'treble-mid',  secondaryClefs: [],                 transposition: -14, beginnerFriendly: false },
]

export function beginnerInstruments(): Instrument[] {
  return INSTRUMENTS.filter(i => i.beginnerFriendly)
}

export function getInstrument(id: string): Instrument | undefined {
  return INSTRUMENTS.find(i => i.id === id)
}
