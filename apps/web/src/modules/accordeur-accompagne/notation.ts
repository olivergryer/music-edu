// ─── Notation : notes écrites, armure, altérations (brief UI v1, § 5.0 et 5.3) ─────
// Tout est stocké en SONS RÉELS ; ce module ne sert qu'à l'affichage. Les noms suivent
// `acc_transpo` (instrument transpositeur) via `TRANSPOSITIONS`, et l'orthographe de la
// tonalité écrite est celle qui met le moins d'altérations à l'armure, sauf choix explicite.

import { TRANSPOSITIONS, buildEnharmonicScale } from '../../accordeurUtils.js'
import type { Degre, Mode } from '../harmonie/types.ts'
import type { Tonalite } from './phrase.ts'
import { QUALITES, fondamentaleRelative } from './qualites.ts'

export const LETTRES = ['Do', 'Ré', 'Mi', 'Fa', 'Sol', 'La', 'Si'] as const
const PC_LETTRE = [0, 2, 4, 5, 7, 9, 11]
const ORDRE_DIESES = [3, 0, 4, 1, 5, 2, 6]       // Fa Do Sol Ré La Mi Si (indices de LETTRES)
const ORDRE_BEMOLS = [6, 2, 5, 1, 4, 0, 3]       // Si Mi La Ré Sol Do Fa

/** Décalage (demi-tons) de l'affichage pour un instrument transpositeur (`acc_transpo`). */
export function decalageTranspo(cle: string | null | undefined): number {
  return (TRANSPOSITIONS as Record<string, { offset: number }>)[cle ?? 'C']?.offset ?? 0
}

// Armures : nombre signé d'altérations (+ dièses, − bémols), par tonique écrite.
const ARMURE_MAJEUR: Record<string, number> = {
  Do: 0, Sol: 1, Ré: 2, La: 3, Mi: 4, Si: 5, 'Fa#': 6, 'Do#': 7, Fa: -1, Sib: -2, Mib: -3, Lab: -4, Réb: -5, Solb: -6, Dob: -7,
}
const ARMURE_MINEUR: Record<string, number> = {
  La: 0, Mi: 1, Si: 2, 'Fa#': 3, 'Do#': 4, 'Sol#': 5, 'Ré#': 6, 'La#': 7, Ré: -1, Sol: -2, Do: -3, Fa: -4, Sib: -5, Mib: -6, Lab: -7,
}

/** Orthographe préférée (la moins chargée) par classe de hauteur. */
const PREFEREE_MAJEUR = ['Do', 'Réb', 'Ré', 'Mib', 'Mi', 'Fa', 'Fa#', 'Sol', 'Lab', 'La', 'Sib', 'Si']
const PREFEREE_MINEUR = ['Do', 'Do#', 'Ré', 'Mib', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'Sib', 'Si']

export interface TonaliteEcrite { nomTonique: string; tonique: number; mode: Mode; decalage: number }

/** Tonalité vue par l'élève : sons réels + décalage de transposition, orthographe minimale. */
export function tonaliteEcrite(t: Tonalite, transpoKey: string | null | undefined): TonaliteEcrite {
  const decalage = decalageTranspo(transpoKey)
  if (decalage === 0) return { nomTonique: t.nomTonique, tonique: t.tonique, mode: t.mode, decalage }
  const pc = (((t.tonique + decalage) % 12) + 12) % 12
  const nomTonique = (t.mode === 'majeur' ? PREFEREE_MAJEUR : PREFEREE_MINEUR)[pc]
  return { nomTonique, tonique: pc, mode: t.mode, decalage }
}

export type Alteration = -1 | 0 | 1

/** Nombre signé d'altérations de l'armure ; 0 si la tonique n'est pas répertoriée. */
export function nbAlterations(nomTonique: string, mode: Mode): number {
  return (mode === 'majeur' ? ARMURE_MAJEUR : ARMURE_MINEUR)[nomTonique] ?? 0
}

/** Altération portée par chaque lettre (indice de LETTRES) dans l'armure. */
export function armureParLettre(nomTonique: string, mode: Mode): Alteration[] {
  const n = nbAlterations(nomTonique, mode)
  const out: Alteration[] = [0, 0, 0, 0, 0, 0, 0]
  if (n > 0) ORDRE_DIESES.slice(0, n).forEach(l => { out[l] = 1 })
  if (n < 0) ORDRE_BEMOLS.slice(0, -n).forEach(l => { out[l] = -1 })
  return out
}

export interface NoteEcrite {
  lettre: number        // 0 = Do … 6 = Si
  alt: Alteration
  octave: number        // convention de l'Accordeur : MIDI 60 = Do4
  diatonique: number    // octave × 7 + lettre
  nom: string           // « Sol♯ »
}

function analyserNom(nom: string): { lettre: number; alt: Alteration } {
  const m = /^(Do|Ré|Mi|Fa|Sol|La|Si)(#|b)?$/.exec(nom)
  if (!m) return { lettre: 0, alt: 0 }
  return { lettre: LETTRES.indexOf(m[1] as typeof LETTRES[number]), alt: m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0 }
}

export const symboleAlteration = (a: Alteration): string => (a === 1 ? '♯' : a === -1 ? '♭' : '')

/**
 * Note écrite d'un MIDI en sons réels : décalée de la transposition, orthographiée selon la
 * tonalité écrite (l'échelle de la tonique donne le nom de chaque classe de hauteur).
 */
export function noteEcrite(midiReel: number, ecrite: TonaliteEcrite): NoteEcrite {
  const midi = Math.round(midiReel) + ecrite.decalage
  const pc = ((midi % 12) + 12) % 12
  const nom = (buildEnharmonicScale(ecrite.nomTonique) as string[])[pc]
  const { lettre, alt } = analyserNom(nom)
  // l'octave suit la LETTRE : Do♭ et Si♯ passent de l'autre côté de la frontière d'octave
  let octave = Math.floor(midi / 12) - 1
  if (lettre === 0 && alt === -1) octave = Math.floor((midi + 1) / 12) - 1
  if (lettre === 6 && alt === 1) octave = Math.floor((midi - 1) / 12) - 1
  return { lettre, alt, octave, diatonique: octave * 7 + lettre, nom: `${LETTRES[lettre]}${symboleAlteration(alt)}` }
}

export type Cle = 'sol' | 'fa'
/** Indice diatonique de la ligne du bas : mi4 en clef de sol, sol2 en clef de fa. */
export const LIGNE_BASSE: Record<Cle, number> = { sol: 4 * 7 + 2, fa: 2 * 7 + 4 }

/** Position sur la portée : 0 = ligne du bas, +1 par degré diatonique (demi-interligne). */
export function positionPortee(diatonique: number, cle: Cle): number {
  return diatonique - LIGNE_BASSE[cle]
}

/** Positions (paires) des lignes supplémentaires pour une tête à la position `pos` (portée = 0..8). */
export function lignesSupplementaires(pos: number): number[] {
  const out: number[] = []
  if (pos <= -2) for (let p = -2; p >= pos; p -= 2) out.push(p)
  if (pos >= 10) for (let p = 10; p <= pos; p += 2) out.push(p)
  return out
}

export type SigneAffiche = 'diese' | 'bemol' | 'becarre' | null

/**
 * Altérations à afficher, mesure par mesure : une altération est écrite quand elle diffère
 * de celle en vigueur pour cette lettre à cette octave (armure, puis altérations déjà écrites
 * dans la mesure, bécarres compris). La seconde tête d'une note liée n'en répète pas.
 */
export function alterationsAffichees(
  notes: { lettre: number; alt: Alteration; octave: number; mesure: number; liee?: boolean }[],
  armure: Alteration[],
): SigneAffiche[] {
  const etat = new Map<string, Alteration>()
  let mesure = -1
  return notes.map(n => {
    if (n.mesure !== mesure) { etat.clear(); mesure = n.mesure }
    const cle = `${n.lettre}:${n.octave}`
    const courante = etat.get(cle) ?? armure[n.lettre]
    if (n.liee) return null
    if (n.alt === courante) return null
    etat.set(cle, n.alt)
    return n.alt === 1 ? 'diese' : n.alt === -1 ? 'bemol' : 'becarre'
  })
}

/** Nom d'une classe de hauteur en sons réels dans une tonalité (« Fa♯ »), pour les libellés d'échelle. */
export function nomClasse(pc: number, ecrite: TonaliteEcrite): string {
  const nom = (buildEnharmonicScale(ecrite.nomTonique) as string[])[((pc % 12) + 12) % 12]
  const { lettre, alt } = analyserNom(nom)
  return `${LETTRES[lettre]}${symboleAlteration(alt)}`
}

/** Demi-tons des sept degrés de l'échelle affichée (mineur harmonique, comme Harmonie). */
export function echelleDuMode(mode: Mode): number[] {
  return mode === 'majeur' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 11]
}

/**
 * Position d'une classe de hauteur dans l'échelle : indice de degré, ou « entre deux degrés »
 * (chromatique) avec l'indice du degré inférieur.
 */
export function placerDansEchelle(pcRelatif: number, mode: Mode): { degre: number } | { entre: number } {
  const e = echelleDuMode(mode)
  const pc = ((pcRelatif % 12) + 12) % 12
  const i = e.indexOf(pc)
  if (i >= 0) return { degre: i }
  let bas = 0
  for (let k = 0; k < e.length; k++) if (e[k] < pc) bas = k
  return { entre: bas }
}

/** Nom court d'un accord en notes ÉCRITES (transposition appliquée) : « Ré m7 », « Sol7 ». */
export function nomCourtEcrit(
  e: { tonalite: Tonalite; degre: number; qualite: keyof typeof QUALITES },
  transpoKey: string | null | undefined,
): string {
  const ecrite = tonaliteEcrite(e.tonalite, transpoKey)
  const fondReelle = (e.tonalite.tonique + fondamentaleRelative(e.tonalite.mode, e.degre as Degre)) % 12
  return `${nomClasse(fondReelle + ecrite.decalage, ecrite)}${QUALITES[e.qualite].suffixe}`
}
