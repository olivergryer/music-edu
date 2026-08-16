// ─── Les accords chromatiques d'approche — une TABLE (pur) ───────────────────
//
// ⚠ CES ACCORDS NE SONT PAS DES ACCORDS À DEGRÉ. `Degre = 1|…|7` indexe la
// géométrie, la matrice, les qualités et les dispositions ; la sixte allemande —
// ♭6 · 1 · ♭3 · ♯4 — ne s'empile pas en tierces depuis une fondamentale. C'est un
// contenu d'intervalles au-dessus d'une basse, et aucune extension de `Degre` ne
// le produirait. Ils vivent donc À CÔTÉ du modèle, jamais dedans.
//
// Conséquence assumée : ils n'entrent ni dans `vecteurErreur`, ni dans la matrice
// de transition, ni sur le cercle des tierces. L'activité qui les emploie
// (`cadences.ts`) est un choix multiple — elle n'a besoin d'aucun des trois.
//
// ─── POURQUOI (DEMI-TONS, LETTRE) ET NON (ALTÉRATIONS) ───────────────────────
//
// La HAUTEUR d'un de ces sons ne dépend pas du mode ; son ÉCRITURE si. Le ♭3 de
// l'allemande vaut trois demi-tons en majeur comme en mineur, mais il s'écrit mi♭
// altéré en do majeur et mi♭ diatonique en do mineur. Une table en altérations
// serait donc fausse dans un mode sur deux. On donne la lettre — le degré de
// gamme — et `noteSurDegre` en tire l'altération juste.

import { type Chiffrage } from './chiffrage.ts'
import { nomNote, type NoteNommee } from './tonalites.ts'
import { noteSurDegre } from './notation.ts'
import { type Degre, type Mode } from './types.ts'

export type NomChromatique = 'napolitaine' | 'italienne' | 'francaise' | 'allemande'

export const NOMS_CHROMATIQUES: readonly NomChromatique[] = [
  'napolitaine',
  'italienne',
  'francaise',
  'allemande',
]

export interface SonChromatique {
  /** Demi-tons au-dessus de la tonique, basse comprise — strictement croissants. */
  demiTons: number
  /** Index 0-6 dans la gamme : la LETTRE que le son doit porter. */
  degreGamme: number
}

export interface AccordChromatique {
  nom: NomChromatique
  /** Basse en premier, puis en montant. */
  sons: readonly SonChromatique[]
  /** Index de `sons` à doubler pour tenir quatre voix ; `null` si l'accord en a déjà quatre. */
  double: number | null
  /** Chiffrage d'affichage — étages du HAUT vers le bas, comme `chiffrage.ts`. */
  chiffrage: Chiffrage
  /** Ce qui s'imprime à gauche du chiffrage, à la place du chiffre romain. */
  romain: string
  libelle: string
  /** Le degré sur lequel l'accord résout. Les quatre mènent à la dominante. */
  resout: Degre
}

// ─── La table ────────────────────────────────────────────────────────────────
//
// Les hauteurs sont données en do pour la lecture ; elles valent dans toute
// tonalité, la tonique étant l'origine.
//
// ⚠ Le chiffrage seul est AMBIGU et c'est assumé : « +6 » désigne déjà le V⁷ au
// 2ᵉ renversement dans la table française (`chiffrage.ts`). C'est pourquoi ces
// accords s'affichent toujours AVEC leur nom (décidé avec Matthieu) — le nom lève
// l'ambiguïté que le chiffre ne peut pas lever.
//
// ⚠ Le chiffrage de la napolitaine est donné sans ses altérations. En do majeur,
// la basse fa porte un la♭ et un ré♭, qu'une basse chiffrée noterait « ♭6 / ♭3 » ;
// en mineur le la♭ est diatonique et seul le ré♭ s'altère. Le chiffre dépendrait
// donc du mode. On imprime « 6 », le nom disant le reste.

export const ACCORDS_CHROMATIQUES: Readonly<Record<NomChromatique, AccordChromatique>> = {
  // ♭II à l'état de premier renversement — la basse est le 4ᵉ degré, jamais le ♭2.
  // C'est ce que « sixte napolitaine » nomme : la sixte au-dessus de la basse.
  napolitaine: {
    nom: 'napolitaine',
    sons: [
      { demiTons: 5, degreGamme: 3 }, // fa
      { demiTons: 8, degreGamme: 5 }, // la♭
      { demiTons: 13, degreGamme: 1 }, // ré♭
    ],
    double: 0, // la basse, comme tout accord de sixte dont on double la fondamentale réelle
    chiffrage: { etages: ['6'] },
    romain: '♭II',
    libelle: 'sixte napolitaine',
    resout: 5,
  },

  // Les trois sixtes augmentées : même basse (♭6), même sommet (♯4). C'est ce qui
  // se trouve ENTRE les deux qui les distingue — rien, une seconde, ou une tierce.
  italienne: {
    nom: 'italienne',
    sons: [
      { demiTons: 8, degreGamme: 5 }, // la♭
      { demiTons: 12, degreGamme: 0 }, // do
      { demiTons: 18, degreGamme: 3 }, // fa♯
    ],
    double: 1, // la tonique — la doublure d'usage de l'italienne
    chiffrage: { etages: ['+6'] },
    romain: 'It',
    libelle: 'sixte italienne',
    resout: 5,
  },

  francaise: {
    nom: 'francaise',
    sons: [
      { demiTons: 8, degreGamme: 5 }, // la♭
      { demiTons: 12, degreGamme: 0 }, // do
      { demiTons: 14, degreGamme: 1 }, // ré
      { demiTons: 18, degreGamme: 3 }, // fa♯
    ],
    double: null,
    chiffrage: { etages: ['+6', '4', '3'] },
    romain: 'Fr',
    libelle: 'sixte française',
    resout: 5,
  },

  allemande: {
    nom: 'allemande',
    sons: [
      { demiTons: 8, degreGamme: 5 }, // la♭
      { demiTons: 12, degreGamme: 0 }, // do
      { demiTons: 15, degreGamme: 2 }, // mi♭
      { demiTons: 18, degreGamme: 3 }, // fa♯
    ],
    double: null,
    chiffrage: { etages: ['+6', '5'] },
    romain: 'All',
    libelle: 'sixte allemande',
    resout: 5,
  },
}

export function accordChromatique(nom: NomChromatique): AccordChromatique {
  const trouve = ACCORDS_CHROMATIQUES[nom]
  if (!trouve) throw new Error(`accordChromatique : nom inconnu « ${nom} »`)
  return trouve
}

/** Les hauteurs de l'accord, en demi-tons ABSOLUS (classe de hauteur + octaves). */
export function sonsAbsolus(nom: NomChromatique, tonique: number): number[] {
  return accordChromatique(nom).sons.map((s) => tonique + s.demiTons)
}

/** L'orthographe de l'accord dans la tonalité, dans l'ordre des `sons`. */
export function ecrireChromatique(
  nom: NomChromatique,
  tonique: number,
  mode: Mode,
): NoteNommee[] {
  return accordChromatique(nom).sons.map((s) =>
    noteSurDegre(s.degreGamme, s.demiTons, tonique, mode),
  )
}

/** Table classe de hauteur → note écrite, même forme que `orthographeAccord`. */
export function orthographeChromatique(
  nom: NomChromatique,
  tonique: number,
  mode: Mode,
): Map<number, NoteNommee> {
  const carte = new Map<number, NoteNommee>()
  const sons = accordChromatique(nom).sons
  ecrireChromatique(nom, tonique, mode).forEach((note, i) => {
    carte.set((((tonique + sons[i].demiTons) % 12) + 12) % 12, note)
  })
  return carte
}

/** Lecture en clair — sert aux `aria-label` et au débogage. */
export function lireChromatique(nom: NomChromatique, tonique: number, mode: Mode): string {
  return `${accordChromatique(nom).libelle} : ${ecrireChromatique(nom, tonique, mode)
    .map(nomNote)
    .join(' ')}`
}
