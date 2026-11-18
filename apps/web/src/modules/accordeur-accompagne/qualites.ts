// ─── Qualités d'accord, choix imbriqués, chiffrage (brief UI v1, § 4.1) ────────
// Logique pure. La qualité est STOCKÉE (contrairement à Harmonie) ; la qualité
// diatonique d'un degré sert à pré-remplir et à repérer « hors tonalité ».

import { CHORD_TYPES, buildEnharmonicScale } from '../../accordeurUtils.js'
import { accordDeSeptieme, triade } from '../harmonie/harmonieRef.ts'
import { chiffrer, QUINTE_BARREE, ROMAINS } from '../harmonie/chiffrage.ts'
import { creerAccord, type Degre, type Mode, type Renversement } from '../harmonie/types.ts'
import type { EntreeSlot, QualiteAccord, Role, Tonalite } from './phrase.ts'

export const ROLES: readonly Role[] = ['F', '3', '5', '7']

export interface InfoQualite {
  label: string
  intervalles: readonly number[]       // demi-tons depuis la fondamentale
  suffixe: string                      // nom court, après le nom de la fondamentale
  famille: 'maj' | 'min' | 'dim'       // triade sous-jacente (casse et « ° » du chiffre romain)
}

const L = (cle: string): string => (CHORD_TYPES as Record<string, { label: string }>)[cle].label

/**
 * Les 8 clés de `CHORD_TYPES` (libellés repris tels quels) plus `minmaj7`, la
 * septième majeure sur accord mineur (i7 du mineur harmonique), définie ICI sans
 * toucher à `CHORD_TYPES` que le générateur utilise.
 */
export const QUALITES: Readonly<Record<QualiteAccord, InfoQualite>> = {
  maj:     { label: L('maj'),   intervalles: [0, 4, 7],     suffixe: '',     famille: 'maj' },
  min:     { label: L('min'),   intervalles: [0, 3, 7],     suffixe: ' m',   famille: 'min' },
  dim:     { label: L('dim'),   intervalles: [0, 3, 6],     suffixe: ' °',   famille: 'dim' },
  dom7:    { label: L('dom7'),  intervalles: [0, 4, 7, 10],  suffixe: '7',    famille: 'maj' },
  maj7:    { label: L('maj7'),  intervalles: [0, 4, 7, 11],  suffixe: ' 7M',  famille: 'maj' },
  min7:    { label: L('min7'),  intervalles: [0, 3, 7, 10],  suffixe: ' m7',  famille: 'min' },
  hdim7:   { label: L('hdim7'), intervalles: [0, 3, 6, 10],  suffixe: ' ø',   famille: 'dim' },
  dim7:    { label: L('dim7'),  intervalles: [0, 3, 6, 9],   suffixe: ' °7',  famille: 'dim' },
  minmaj7: { label: 'Septième majeure sur accord mineur', intervalles: [0, 3, 7, 11], suffixe: ' m7M', famille: 'min' },
}

export const QUALITES_3_SONS: readonly QualiteAccord[] = ['maj', 'min', 'dim']
export const QUALITES_4_SONS: readonly QualiteAccord[] = ['dom7', 'maj7', 'min7', 'hdim7', 'dim7', 'minmaj7']

export function nbSons(q: QualiteAccord): 3 | 4 {
  return QUALITES[q].intervalles.length as 3 | 4
}

export function qualitesProposees(n: 3 | 4): readonly QualiteAccord[] {
  return n === 3 ? QUALITES_3_SONS : QUALITES_4_SONS
}

export function renversementValide(q: QualiteAccord, r: number): boolean {
  return Number.isInteger(r) && r >= 0 && r < nbSons(q)
}

// ─── Qualité diatonique d'un degré ────────────────────────────────────────────

/** Fondamentale du degré, en demi-tons au-dessus de la tonique. */
export function fondamentaleRelative(mode: Mode, degre: Degre): number {
  return triade(mode, degre)[0]
}

/**
 * Qualité diatonique : on empile les sons de `triade` ou `accordDeSeptieme`
 * (échelle harmonique en mineur, III naturel, comme dans Harmonie) et on compare
 * leurs intervalles à ceux des qualités.
 */
export function qualiteDiatonique(mode: Mode, degre: Degre, n: 3 | 4): QualiteAccord | null {
  const sons = n === 4 ? accordDeSeptieme(mode, degre) : triade(mode, degre)
  const rel = sons.map((s) => (((s - sons[0]) % 12) + 12) % 12)
  for (const q of qualitesProposees(n)) {
    const iv = QUALITES[q].intervalles
    if (iv.length === rel.length && iv.every((v, i) => v === rel[i])) return q
  }
  return null
}

export function estHorsTonalite(e: EntreeSlot): boolean {
  return qualiteDiatonique(e.tonalite.mode, e.degre, nbSons(e.qualite)) !== e.qualite
}

// ─── Règles de saisie (choix imbriqués, § 4.1 et § 6.6) ───────────────────────
// Ordre : tonalité → degré → 3 ou 4 sons → qualité et renversement.

function renversementConserve(q: QualiteAccord, r: Renversement): Renversement {
  return renversementValide(q, r) ? r : 0
}

function remettreDiatonique(e: EntreeSlot, n: 3 | 4): EntreeSlot {
  const q = qualiteDiatonique(e.tonalite.mode, e.degre, n) ?? (n === 3 ? 'maj' : 'dom7')
  return { ...e, qualite: q, renversement: renversementConserve(q, e.renversement) }
}

/** Changer la tonalité remet la qualité diatonique du degré (même nombre de sons). */
export function avecTonalite(e: EntreeSlot, t: Tonalite): EntreeSlot {
  return remettreDiatonique({ ...e, tonalite: t }, nbSons(e.qualite))
}

export function avecDegre(e: EntreeSlot, degre: Degre): EntreeSlot {
  return remettreDiatonique({ ...e, degre }, nbSons(e.qualite))
}

export function avecNombreDeSons(e: EntreeSlot, n: 3 | 4): EntreeSlot {
  return remettreDiatonique(e, n)
}

/** Changer de qualité garde le renversement s'il reste valide, sinon le remet à 0. */
export function avecQualite(e: EntreeSlot, q: QualiteAccord): EntreeSlot {
  return { ...e, qualite: q, renversement: renversementConserve(q, e.renversement) }
}

export function avecRenversement(e: EntreeSlot, r: Renversement): EntreeSlot {
  if (!renversementValide(e.qualite, r)) throw new Error(`avecRenversement : ${r} invalide pour ${e.qualite}`)
  return { ...e, renversement: r }
}

// ─── Chiffrage ────────────────────────────────────────────────────────────────

const FIGURES_3: Readonly<Record<number, string[]>> = { 0: ['5'], 1: ['6'], 2: ['6', '4'] }
const FIGURES_DOMINANTE: Readonly<Record<number, string[]>> = { 0: ['7', '+'], 1: ['6', QUINTE_BARREE], 2: ['+6'], 3: ['+4'] }
const FIGURES_ORDINAIRES: Readonly<Record<number, string[]>> = { 0: ['7'], 1: ['6', '5'], 2: ['4', '3'], 3: ['2'] }

function romainDeQualite(degre: Degre, q: QualiteAccord): string {
  const f = QUALITES[q].famille
  const r = f === 'maj' ? ROMAINS[degre] : ROMAINS[degre].toLowerCase()
  return f === 'dim' ? `${r}°` : r
}

/**
 * Chiffrage d'une entrée. Diatonique : EXACTEMENT la sortie de `chiffrer`
 * d'Harmonie. Hors tonalité : même logique appliquée à la qualité choisie ; la
 * table de dominante (7/+ · 6/5̸ · +6 · +4) reste réservée au V7 (degré V, septième
 * de dominante), toute autre septième prenant les figures ordinaires.
 */
export function chiffrerEntree(e: EntreeSlot): string {
  const n = nbSons(e.qualite)
  if (!estHorsTonalite(e)) {
    return chiffrer(creerAccord(0, { degre: e.degre, renversement: e.renversement, septieme: n === 4 }), e.tonalite.mode)
  }
  const table = n === 3 ? FIGURES_3 : e.degre === 5 && e.qualite === 'dom7' ? FIGURES_DOMINANTE : FIGURES_ORDINAIRES
  return `${romainDeQualite(e.degre, e.qualite)} ${table[e.renversement].join('/')}`
}

/** Chiffre romain seul (casse et « ° » de la qualité choisie). */
export function romainEntree(e: EntreeSlot): string {
  return romainDeQualite(e.degre, e.qualite)
}

// ─── Noms ─────────────────────────────────────────────────────────────────────

/** « Fa# » → « Fa♯ », « Réb » → « Ré♭ ». */
export function embellir(nom: string): string {
  return nom.replace(/#/g, '♯').replace(/b$/, '♭')
}

/** Nom de la fondamentale en SONS RÉELS, orthographe de la tonalité. */
export function nomFondamentale(e: EntreeSlot): string {
  const echelle = buildEnharmonicScale(e.tonalite.nomTonique) as string[]
  const pc = (e.tonalite.tonique + fondamentaleRelative(e.tonalite.mode, e.degre)) % 12
  return embellir(echelle[pc])
}

/** Nom court : Sol7, Do 7M, Ré m7, Si ø, Sol♯ °7, La m7M, Do, Do m, Si °. */
export function nomCourt(e: EntreeSlot): string {
  return `${nomFondamentale(e)}${QUALITES[e.qualite].suffixe}`
}

/** Libellé du renversement pour les pastilles : le chiffrage de l'accord choisi. */
export function libelleRenversement(e: EntreeSlot, r: Renversement): string {
  const n = nbSons(e.qualite)
  const table = n === 3 ? FIGURES_3 : e.degre === 5 && e.qualite === 'dom7' ? FIGURES_DOMINANTE : FIGURES_ORDINAIRES
  return table[r].join('/')
}
