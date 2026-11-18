// ─── Règles de référence : quoi est comparé à quoi (brief UI v1, § 7) ──────────
// Fonctions pures, testées. Les écarts sont signés : négatif = trop bas.

import { centsCinqLimite, centsTempere, centsUtilisateur } from '../../accordeurUtils.js'
import { centsAccordage, type SonJoue } from './realisation.ts'
import type { QualiteAccord } from './phrase.ts'

export type Referentiel = 'tempere' | '5-limite' | 'utilisateur'

/** Seuil de rattachement d'une note jouée à un son de l'accord, en cents. */
export const RAYON_RATTACHEMENT_CENTS = 50

/** 1. Cible du référentiel `acc_ref` pour un intervalle depuis la fondamentale. */
export function cibleReferentiel(
  ref: Referentiel, qualite: QualiteAccord, intervalle: number, tempUser: readonly number[] = [],
): number {
  if (ref === 'tempere') return 0
  return centsAccordage(ref === '5-limite' ? 'juste' : 'utilisateur', qualite, intervalle, tempUser)
}

/** 1. Bordure d'un son : cents réglés − cible du référentiel. */
export function ecartBordure(
  centsRegles: number, ref: Referentiel, qualite: QualiteAccord, intervalle: number, tempUser: readonly number[] = [],
): number {
  return centsRegles - cibleReferentiel(ref, qualite, intervalle, tempUser)
}

/**
 * 2. Note de l'élève sur un son de l'accord : 1200·log2(f_élève / (f_son · 2^k)),
 * k entier ramenant le son à l'octave la plus proche de l'élève. Ce que l'oreille
 * compare : le son tel qu'il est réglé, pas une cible théorique.
 */
export function ecartSurSon(hzEleve: number, hzSon: number): number {
  const k = Math.round(Math.log2(hzEleve / hzSon))
  return 1200 * Math.log2(hzEleve / (hzSon * Math.pow(2, k)))
}

/**
 * 3. Note étrangère : référentiel de l'Accordeur depuis la tonique de la tonalité du slot.
 * `tonique` = classe de hauteur (ou MIDI) de la tonique ; seul son modulo 12 compte.
 */
export function ecartEtranger(
  hz: number, tonique: number, ref: Referentiel, diapason = 442, tempUser: readonly number[] = [],
): number {
  if (ref === 'tempere') return centsTempere(hz, diapason)
  if (ref === '5-limite') return centsCinqLimite(hz, tonique, diapason)
  return centsUtilisateur(hz, tonique, diapason, tempUser)
}

export type Classement =
  | { type: 'son'; son: SonJoue; index: number; ecart: number }
  | { type: 'etrangere'; ecart: number }

/**
 * Classe une note jouée : rattachée au son de l'accord le plus proche (classe de
 * hauteur à moins de 50 ¢, le son sonnant ou muet), sinon étrangère.
 */
export function classerNote(
  hzEleve: number, sons: readonly SonJoue[], tonique: number, ref: Referentiel, diapason = 442, tempUser: readonly number[] = [],
): Classement {
  let meilleur: { index: number; ecart: number } | null = null
  sons.forEach((s, index) => {
    const ecart = ecartSurSon(hzEleve, s.hz)
    if (Math.abs(ecart) < RAYON_RATTACHEMENT_CENTS && (!meilleur || Math.abs(ecart) < Math.abs(meilleur.ecart))) {
      meilleur = { index, ecart }
    }
  })
  if (meilleur) {
    const m = meilleur as { index: number; ecart: number }
    return { type: 'son', son: sons[m.index], index: m.index, ecart: m.ecart }
  }
  return { type: 'etrangere', ecart: ecartEtranger(hzEleve, tonique, ref, diapason, tempUser) }
}

/** 5. Le seuil « juste » vaut `acc_seuil`. */
export function estJuste(ecart: number, seuil: number): boolean {
  return Math.abs(ecart) <= seuil
}
