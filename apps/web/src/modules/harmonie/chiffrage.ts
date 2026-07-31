// ─── Chiffrage lisible ───────────────────────────────────────────────────────
//
// Rendu textuel d'un accord dans la convention française : chiffre romain en
// CAPITALES pour les accords majeurs, en minuscules pour les mineurs et diminués,
// « ° » sur les diminués, puis le chiffrage d'intervalles au-dessus de la basse.
//
//   majeur  : I · ii · iii · IV · V7 · vi · vii°6
//   mineur  : i · ii°6 · III · iv · V · VI · vii°6
//
// La casse et le « ° » se DÉRIVENT de `qualite(mode, degre)` — jamais saisis à la
// main, sinon on pourrait afficher un chiffrage incohérent avec son mode.
//
// Ce module porte la référence ÉCRITE de l'activité de détection : c'est ce que
// l'élève lit et anticipe intérieurement avant d'entendre. Il est donc pur et
// testé, pas un détail de présentation enfoui dans un composant.

import { formatAccordGabarit } from './gabarits.ts'
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

// Chiffre romain seul, casse et « ° » compris, sans les chiffres d'intervalles.
export function romainChiffre(degre: Degre, mode: Mode): string {
  const q = qualite(mode, degre)
  const romain = q === 'M' || q === 'aug' ? ROMAINS[degre] : ROMAINS[degre].toLowerCase()
  return q === 'dim' ? `${romain}°` : romain
}

// Suffixe d'intervalles : '' · '6' · '64' · '7' · '65' · '43' · '2'.
export function suffixeChiffrage(accord: Accord): string {
  return formatAccordGabarit(accord).replace(/^[IVX]+/i, '')
}

// Chiffrage complet. Le suffixe « ~ » marque un accord à qualité inversée : il ne
// relève d'aucune convention d'écriture, cet accord n'étant pas diatonique — il
// n'apparaît QUE comme substitut du moteur de perturbation, au feedback.
export function chiffrer(accord: Accord, mode: Mode): string {
  return `${romainChiffre(accord.degre, mode)}${suffixeChiffrage(accord)}${
    accord.modeInverse ? '~' : ''
  }`
}

export function chiffrerProgression(accords: readonly Accord[], mode: Mode): string[] {
  return accords.map((accord) => chiffrer(accord, mode))
}
