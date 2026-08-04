// ─── De la hauteur sonnée à la note écrite (pur) ─────────────────────────────
//
// POURQUOI CE FICHIER EXISTE. `tonalites.ts` sait nommer les sept degrés d'une
// gamme ; `dispositions.ts` sait produire des hauteurs MIDI. Entre les deux il
// manque le passage — écrire sur une portée ce qui a sonné.
//
// ⚠ ON NE DEVINE JAMAIS L'ORTHOGRAPHE À PARTIR DU SEUL MIDI. Une classe de
// hauteur ne tranche pas : 6 s'écrit fa♯ ou sol♭, 3 s'écrit mi♭ ou ré♯. Le cas
// tombe dès la première perturbation `mode` — la tierce baissée d'un I en do
// s'écrit mi♭, jamais ré♯, et aucune règle sur le seul entier ne le dit.
//
// On part donc de L'ACCORD, pas de la hauteur : chaque son d'un accord est un
// degré de la gamme, donc une LETTRE connue d'avance. `orthographeAccord` bâtit
// la table classe-de-hauteur → note écrite ; `ecrireAccord` s'en sert pour les
// quatre voix. Aucune ambiguïté ne subsiste, et rien n'est deviné.
//
// Les trois règles de construction sont les MÊMES que celles de `dispositions.ts`
// (empilement de tierces, III mineur pris naturel, bascule `modeInverse` sur la
// seule tierce), exprimées ici sur des lettres au lieu de demi-tons. Les deux
// implémentations sont épinglées l'une à l'autre par `harmonieNotation.test.ts` :
// toute hauteur réalisée doit se retrouver dans la table.

import { realiserProgression } from './dispositions.ts'
import {
  classeDeHauteur,
  gammeNommee,
  toniqueNommee,
  type Alteration,
  type Lettre,
  type NoteNommee,
} from './tonalites.ts'
import { qualite, type Accord, type Mode, type Progression } from './types.ts'

/** Une note nommée ET placée : c'est ce qu'il faut pour écrire sur une portée. */
export interface NoteEcrite extends NoteNommee {
  /** Octave scientifique — do3 du module = MIDI 60 = `c/4` de VexFlow. */
  octave: number
}

/**
 * Tonique de la vue « remis en Ut », par mode.
 *
 * Décidé avec Matthieu : **la mineur**, pas do mineur. Les deux vues ont alors
 * l'armure vide, et la sensible du mineur apparaît en altération accidentelle —
 * ce qui est précisément ce qu'on veut faire lire.
 */
export const TONIQUE_UT: Readonly<Record<Mode, number>> = { majeur: 0, mineur: 9 }

function naturel(lettre: Lettre): number {
  return classeDeHauteur({ lettre, alteration: 0 })
}

function alterer(note: NoteNommee, delta: number, contexte: string): NoteNommee {
  const alteration = note.alteration + delta
  if (alteration < -2 || alteration > 2) {
    throw new Error(`${contexte} : altération hors bornes (${alteration}) sur ${note.lettre}`)
  }
  return { lettre: note.lettre, alteration: alteration as Alteration }
}

/**
 * Table classe de hauteur → note écrite, pour UN accord dans UNE tonalité.
 *
 * Trois ou quatre entrées, une par son de l'accord — la doublure retombe sur la
 * même entrée, ce qui est exactement le comportement voulu.
 */
export function orthographeAccord(
  accord: Accord,
  tonique: number,
  mode: Mode,
): Map<number, NoteNommee> {
  const gamme = gammeNommee(tonique, mode)
  const carte = new Map<number, NoteNommee>()

  for (let k = 0; k < (accord.septieme ? 4 : 3); k++) {
    const degreGamme = (accord.degre - 1 + 2 * k) % 7
    let note = gamme[degreGamme]

    // L'accord de III en mineur est bâti sur la gamme NATURELLE (sinon sa qualité
    // serait augmentée et non majeure) : son VII redescend d'un demi-ton.
    // Même règle qu'à `dispositions.ts` — ne pas la changer d'un seul côté.
    if (mode === 'mineur' && accord.degre === 3 && degreGamme === 6) {
      note = alterer(note, -1, 'orthographeAccord (III mineur)')
    }

    // Perturbation `mode` : seule la TIERCE bouge, d'un demi-ton, et elle garde
    // sa lettre — c'est ce qui distingue mi♭ de ré♯.
    if (accord.modeInverse && k === 1) {
      const delta = qualite(mode, accord.degre) === 'M' ? -1 : 1
      note = alterer(note, delta, 'orthographeAccord (mode inversé)')
    }

    carte.set(classeDeHauteur(note), note)
  }

  return carte
}

/**
 * La note qui porte la LETTRE du degré de gamme demandé, à `demiTons` au-dessus
 * de la tonique. C'est la brique de l'orthographe chromatique : on impose la
 * lettre, l'altération se déduit de l'écart avec la gamme.
 *
 * Pourquoi ça marche dans les deux modes sans table par mode : le ♭3 d'une sixte
 * allemande vaut trois demi-tons partout, mais il s'écrit mi♭ (altéré) en majeur
 * et mi♭ (diatonique) en mineur. En partant de la gamme, l'altération sort juste
 * des deux côtés.
 */
export function noteSurDegre(
  degreGamme: number,
  demiTons: number,
  tonique: number,
  mode: Mode,
): NoteNommee {
  const gamme = gammeNommee(tonique, mode)
  const note = gamme[degreGamme]
  if (!note) throw new Error(`noteSurDegre : degré de gamme hors bornes (${degreGamme})`)

  const dansLaGamme = (((classeDeHauteur(note) - tonique) % 12) + 12) % 12
  let ecart = (((demiTons - dansLaGamme) % 12) + 12) % 12
  if (ecart > 6) ecart -= 12

  return alterer(note, ecart, `noteSurDegre (degré ${degreGamme}, ${demiTons} demi-tons)`)
}

/**
 * Hauteur MIDI → note écrite, via la table d'un accord.
 *
 * L'octave se déduit de la LETTRE et non du MIDI brut : sans ça si♯ et do♭
 * tomberaient dans l'octave voisine (si♯3 vaut 60, comme do4).
 */
export function nommerHauteur(midi: number, carte: ReadonlyMap<number, NoteNommee>): NoteEcrite {
  const pc = ((midi % 12) + 12) % 12
  const note = carte.get(pc)
  if (!note) {
    throw new Error(`nommerHauteur : classe de hauteur ${pc} absente de l’accord (MIDI ${midi})`)
  }

  const brut = midi - note.alteration - naturel(note.lettre)
  if (brut % 12 !== 0) {
    throw new Error(`nommerHauteur : octave non entière pour ${note.lettre} (MIDI ${midi})`)
  }
  return { ...note, octave: brut / 12 - 1 }
}

/** Les quatre voix d'un accord réalisé, écrites. Ordre conservé (basse → soprano). */
export function ecrireAccord(
  hauteurs: readonly number[],
  accord: Accord,
  tonique: number,
  mode: Mode,
): NoteEcrite[] {
  const carte = orthographeAccord(accord, tonique, mode)
  return hauteurs.map((midi) => nommerHauteur(midi, carte))
}

// ─── Vers VexFlow ────────────────────────────────────────────────────────────

const LETTRES_VEX: Readonly<Record<Lettre, string>> = {
  do: 'c',
  re: 'd',
  mi: 'e',
  fa: 'f',
  sol: 'g',
  la: 'a',
  si: 'b',
}

const ALTERATIONS_VEX: Readonly<Record<Alteration, string>> = {
  [-2]: 'bb',
  [-1]: 'b',
  0: '',
  1: '#',
  2: '##',
}

/** Clé VexFlow d'une note écrite : `do♯` à l'octave 4 → `c#/4`. */
export function cleVex(note: NoteEcrite): string {
  return `${LETTRES_VEX[note.lettre]}${ALTERATIONS_VEX[note.alteration]}/${note.octave}`
}

/**
 * Nom d'armure VexFlow : `C` · `Am` · `Eb` · `F#m` …
 *
 * Les vingt-quatre tonalités usuelles de `tonalites.ts` s'y expriment toutes
 * sans double altération à l'armure.
 */
export function armureVex(tonique: number, mode: Mode): string {
  const t = toniqueNommee(tonique, mode)
  if (t.alteration < -1 || t.alteration > 1) {
    throw new Error(`armureVex : armure à double altération (${t.lettre}) — hors des 24 usuelles`)
  }
  const lettre = LETTRES_VEX[t.lettre].toUpperCase()
  return `${lettre}${ALTERATIONS_VEX[t.alteration]}${mode === 'mineur' ? 'm' : ''}`
}

// ─── Remise en Ut ────────────────────────────────────────────────────────────

/**
 * Décalage en demi-tons pour ramener la tonalité sur Do majeur / la mineur, dans
 * l'octave la plus proche — donc borné à [−6, +5]. Transposer plus loin sortirait
 * les voix des tessitures du quatuor sans rien apporter à la lecture.
 */
export function decalageVersUt(tonique: number, mode: Mode): number {
  const brut = TONIQUE_UT[mode] - (((tonique % 12) + 12) % 12)
  return (((brut + 6) % 12) + 12) % 12 - 6
}

/** Les hauteurs d'une suite, remises en Ut. La structure ne change pas, seul le registre. */
export function transposerVersUt(
  hauteurs: readonly (readonly number[])[],
  tonique: number,
  mode: Mode,
): number[][] {
  const decalage = decalageVersUt(tonique, mode)
  return hauteurs.map((accord) => accord.map((midi) => midi + decalage))
}

// ─── La partition ────────────────────────────────────────────────────────────
//
// Ce qu'il faut, et rien de plus, pour graver : des notes écrites et une armure.
//
// ⚠ SÉPARATION VOULUE. `PorteeSATB` réalisait et orthographiait lui-même à partir
// d'une `Progression` — impossible pour une suite qui contient des accords hors
// modèle (les cadences chromatiques). La musique se calcule ici, le dessin là-bas,
// et chaque activité fabrique sa partition comme elle peut.

export interface Partition {
  /** Un tableau par accord : quatre voix, dans l'ordre basse → soprano. */
  notes: NoteEcrite[][]
  /** Nom d'armure VexFlow de la tonalité D'ÉCRITURE — vide en vue « Ut ». */
  armure: string
}

export type VueTonalite = 'tonalite' | 'ut'

/** La tonalité dans laquelle on écrit, selon la vue. */
export function toniqueEcrite(tonique: number, mode: Mode, vue: VueTonalite): number {
  return vue === 'tonalite' ? tonique : TONIQUE_UT[mode]
}

export function partitionDeProgression(progression: Progression, vue: VueTonalite): Partition {
  const realisation = realiserProgression(progression)
  const hauteurs =
    vue === 'tonalite'
      ? realisation
      : transposerVersUt(realisation, progression.tonique, progression.mode)
  const ecrite = toniqueEcrite(progression.tonique, progression.mode, vue)

  return {
    notes: progression.accords.map((accord, i) =>
      ecrireAccord(hauteurs[i], accord, ecrite, progression.mode),
    ),
    armure: armureVex(ecrite, progression.mode),
  }
}
