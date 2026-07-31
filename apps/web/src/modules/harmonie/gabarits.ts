// ─── Gabarits : formules écrites en chiffres romains (annexe §2) ─────────────
//
// Les niveaux 2 à 5 sont générés par formules, sans matrice de transition. Un
// gabarit est une chaîne « I-IV-V7-I » : degré en chiffres romains + chiffrage
// français facultatif.
//
//   (rien) · 5   état fondamental          6      premier renversement
//   64 · 6/4     deuxième renversement     7      septième, état fondamental
//   65 · 6/5     septième, 1er renv.       43·4/3 septième, 2e renv.
//   2 · +4       septième, 3e renv.

import { creerAccord, type Accord, type Degre, type Renversement } from './types.ts'

const ROMAINS: Readonly<Record<string, Degre>> = {
  I: 1,
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
  VII: 7,
}

const ROMAIN_DE_DEGRE: Readonly<Record<Degre, string>> = {
  1: 'I',
  2: 'II',
  3: 'III',
  4: 'IV',
  5: 'V',
  6: 'VI',
  7: 'VII',
}

interface Chiffrage {
  renversement: Renversement
  septieme: boolean
}

const CHIFFRAGES: Readonly<Record<string, Chiffrage>> = {
  '': { renversement: 0, septieme: false },
  '5': { renversement: 0, septieme: false },
  '6': { renversement: 1, septieme: false },
  '64': { renversement: 2, septieme: false },
  '6/4': { renversement: 2, septieme: false },
  '7': { renversement: 0, septieme: true },
  '65': { renversement: 1, septieme: true },
  '6/5': { renversement: 1, septieme: true },
  '43': { renversement: 2, septieme: true },
  '4/3': { renversement: 2, septieme: true },
  '2': { renversement: 3, septieme: true },
  '+4': { renversement: 3, septieme: true },
}

// Chiffrage canonique pour la ré-écriture (`formatGabarit`).
const CHIFFRAGE_CANONIQUE: Readonly<Record<string, string>> = {
  '0-false': '',
  '1-false': '6',
  '2-false': '64',
  '0-true': '7',
  '1-true': '65',
  '2-true': '43',
  '3-true': '2',
}

const JETON = /^(VII|VI|V|IV|III|II|I)(.*)$/

export function parseAccordGabarit(jeton: string, index: number): Accord {
  const trouve = JETON.exec(jeton.trim())
  if (!trouve) throw new Error(`parseGabarit : jeton illisible « ${jeton} »`)

  const [, romain, suffixe] = trouve
  const degre = ROMAINS[romain]
  const chiffrage = CHIFFRAGES[suffixe]
  if (!chiffrage) throw new Error(`parseGabarit : chiffrage inconnu « ${suffixe} » dans « ${jeton} »`)

  return creerAccord(index, {
    degre,
    renversement: chiffrage.renversement,
    septieme: chiffrage.septieme,
  })
}

export function parseGabarit(gabarit: string): Accord[] {
  const jetons = gabarit.split('-').filter((j) => j.length > 0)
  if (jetons.length === 0) throw new Error(`parseGabarit : gabarit vide « ${gabarit} »`)
  return jetons.map(parseAccordGabarit)
}

export function formatAccordGabarit(accord: Accord): string {
  const chiffre = CHIFFRAGE_CANONIQUE[`${accord.renversement}-${accord.septieme}`]
  if (chiffre === undefined) {
    throw new Error(`formatGabarit : combinaison non chiffrable (${JSON.stringify(accord)})`)
  }
  return ROMAIN_DE_DEGRE[accord.degre] + chiffre
}

export function formatGabarit(accords: readonly Accord[]): string {
  return accords.map(formatAccordGabarit).join('-')
}

export function longueurGabarit(gabarit: string): number {
  return gabarit.split('-').filter((j) => j.length > 0).length
}

// Degrés employés par un gabarit — sert aux contrôles d'intégrité de `NIVEAUX`.
export function degresGabarit(gabarit: string): Degre[] {
  return parseGabarit(gabarit).map((accord) => accord.degre)
}
