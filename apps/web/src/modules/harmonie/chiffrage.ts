// ─── Chiffrage français académique ───────────────────────────────────────────
//
// Chiffre romain (le DEGRÉ) + chiffrage français (l'ÉTAT de l'accord). La casse et
// le « ° » se DÉRIVENT de `qualite(mode, degre)` — jamais saisis à la main, sinon
// on pourrait afficher un chiffrage incohérent avec son mode.
//
//   majeur  : I · ii · iii · IV · V · vi · vii°
//   mineur  : i · ii° · III · iv · V · VI · vii°
//
// Ce module porte la référence ÉCRITE de l'activité de détection : c'est ce que
// l'élève lit et anticipe intérieurement avant d'entendre. Il est donc pur et
// testé, pas un détail de présentation enfoui dans un composant.
//
// ─── LA TABLE ────────────────────────────────────────────────────────────────
//
// 3 sons          5 · 6 · 6/4
//
// 4 sons, SEPTIÈME DE DOMINANTE. Le « + » marque la sensible, et le chiffre dit à
// quel intervalle elle se trouve AU-DESSUS DE LA BASSE. C'est ce qui rend la table
// cohérente plutôt qu'arbitraire — sur V7 en do (sol si ré fa, sensible = si) :
//
//   fondamental   basse sol   sensible à la tierce      7 sur +
//                                                       (le « + » seul = tierce sensible)
//   1er renv.     basse SI    la sensible EST la basse  6 sur 5̸
//                             → on note la quinte diminuée si→fa
//   2e renv.      basse ré    sensible à la sixte       +6
//   3e renv.      basse fa    sensible à la quarte      +4
//                             augmentée fa→si
//
// 4 sons, septièmes ORDINAIRES : 7 · 6/5 · 4/3 · 2, sans « + » ni barre.
//
// ⚠ NE PAS ÉTENDRE LES FORMES DE DOMINANTE « à tout accord contenant la sensible ».
// La tentation est réelle — III en majeur et I7 au niveau 8 en contiennent une —
// mais la septième de dominante est un objet nommé et précis de la pédagogie
// française, pas une famille déduite. La règle est donc `degre === 5 && septieme`.
//
// L'ancienne notation anglo-saxonne (`I64`, `V65`, `V43`) est conservée telle
// quelle dans `chiffrageObsolete.ts`, avec sa procédure de rebranchement.

import { qualite, type Accord, type Degre, type Mode } from './types.ts'

export const ROMAINS: Readonly<Record<Degre, string>> = {
  1: 'I',
  2: 'II',
  3: 'III',
  4: 'IV',
  5: 'V',
  6: 'VI',
  7: 'VII',
}

/** Quinte diminuée : le 5 barré de la notation française. */
export const QUINTE_BARREE = '5̸'

/**
 * Les étages du chiffrage, **du haut vers le bas**. Une seule entrée = pas
 * d'empilement (`5`, `6`, `+6`, `+4`, `7`, `2`).
 */
export interface Chiffrage {
  etages: string[]
}

// Chiffre romain seul, casse et « ° » compris, sans les chiffres d'intervalles.
export function romainChiffre(degre: Degre, mode: Mode): string {
  const q = qualite(mode, degre)
  const romain = q === 'M' || q === 'aug' ? ROMAINS[degre] : ROMAINS[degre].toLowerCase()
  return q === 'dim' ? `${romain}°` : romain
}

const TROIS_SONS: Readonly<Record<number, string[]>> = {
  0: ['5'],
  1: ['6'],
  2: ['6', '4'],
}

const SEPTIEME_DOMINANTE: Readonly<Record<number, string[]>> = {
  0: ['7', '+'],
  1: ['6', QUINTE_BARREE],
  2: ['+6'],
  3: ['+4'],
}

const SEPTIEME_ORDINAIRE: Readonly<Record<number, string[]>> = {
  0: ['7'],
  1: ['6', '5'],
  2: ['4', '3'],
  3: ['2'],
}

/**
 * Vrai si l'accord se chiffre en septième de dominante.
 *
 * `modeInverse` retombe volontairement sur les figures ordinaires : la bascule
 * majeur→mineur du moteur de perturbation détruit la sensible, donc le « + » n'a
 * plus rien à marquer.
 */
export function estSeptiemeDeDominante(accord: Accord): boolean {
  return accord.degre === 5 && accord.septieme && !accord.modeInverse
}

export function chiffrageDe(accord: Accord): Chiffrage {
  const table = accord.septieme
    ? estSeptiemeDeDominante(accord)
      ? SEPTIEME_DOMINANTE
      : SEPTIEME_ORDINAIRE
    : TROIS_SONS

  const etages = table[accord.renversement]
  if (!etages) {
    throw new Error(
      `chiffrageDe : combinaison non chiffrable (degré ${accord.degre}, ` +
        `renversement ${accord.renversement}, septième ${accord.septieme})`,
    )
  }
  return { etages: [...etages] }
}

/** Le chiffrage seul, à plat — les étages joints par « / ». */
export function chiffrageplat(accord: Accord): string {
  return chiffrageDe(accord).etages.join('/')
}

/**
 * Chiffrage complet à plat : romain + figures. Sert aux `aria-label`, aux
 * journaux et aux tests ; l'affichage passe par `<ChiffrageEmpile>`.
 *
 * Le suffixe « ~ » marque un accord à qualité inversée. Il ne relève d'aucune
 * convention d'écriture, cet accord n'étant pas diatonique — il n'apparaît QUE
 * comme substitut du moteur de perturbation, au feedback.
 */
export function chiffrer(accord: Accord, mode: Mode): string {
  return `${romainChiffre(accord.degre, mode)} ${chiffrageplat(accord)}${
    accord.modeInverse ? ' ~' : ''
  }`
}

export function chiffrerProgression(accords: readonly Accord[], mode: Mode): string[] {
  return accords.map((accord) => chiffrer(accord, mode))
}
