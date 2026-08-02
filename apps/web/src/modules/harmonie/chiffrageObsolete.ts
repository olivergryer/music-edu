// ─── OBSOLÈTE — chiffrage anglo-saxon, remplacé le 2026-08-02 ────────────────
//
// ⚠ CE FICHIER N'EST BRANCHÉ NULLE PART. Il conserve l'implémentation qui a servi
// jusqu'à la migration vers la notation française académique (`chiffrage.ts`),
// à la demande de Matthieu, pour pouvoir y revenir.
//
// CE QU'IL FAISAIT : chiffre romain + figures anglo-saxonnes, à plat.
//
//   3 sons  : I · I6 · I64
//   4 sons  : V7 · V65 · V43 · V2          (mêmes figures sur TOUS les degrés)
//
// POURQUOI IL A ÉTÉ REMPLACÉ : ce n'est pas la notation enseignée en France. La
// notation académique distingue la septième de dominante (`7/+`, `6/5̸`, `+6`,
// `+4` — le « + » marque la sensible) des septièmes ordinaires (`7`, `6/5`,
// `4/3`, `2`), et empile les chiffres au lieu de les juxtaposer.
//
// POUR REBRANCHER : dans `DetectionPage.tsx`, `ChoixBinairePage.tsx` et
// `BancPage.tsx`, remplacer l'import de `chiffrer` depuis `./chiffrage.ts` par
// `./chiffrageObsolete.ts` et retirer les `<ChiffrageEmpile>` au profit du texte.
// `romainChiffre` est identique dans les deux modules, rien à faire de ce côté.
//
// `harmonieChiffrageObsolete.test.ts` épingle ses sorties : un fichier gardé « au
// cas où » sans test pourrit en silence et ne marcherait plus le jour venu.

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
