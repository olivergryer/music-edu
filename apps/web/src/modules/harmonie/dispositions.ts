// ─── Dispositions — table, pas générateur (spec §6) ──────────────────────────
//
// AUCUNE CONDUITE DE VOIX GÉNÉRÉE. Une table indexée par
// (mode, degre, renversement, septieme) donne les hauteurs relatives à la tonique
// en demi-tons ; `hauteursReelles` place la basse dans l'octave la plus proche de
// la précédente et empile les trois voix supérieures en position serrée. Rien de
// plus — pas de minimisation de mouvement sur les voix supérieures.
//
// La table est CALCULÉE UNE FOIS au chargement à partir des degrés de gamme,
// plutôt que saisie à la main : une centaine d'entrées écrites à la main serait
// une source d'erreurs silencieuses. Elle reste une table — consultation pure,
// zéro décision à l'exécution — et chacune de ses entrées est vérifiée contre une
// construction indépendante dans `harmonieDispositions.test.ts`.

import {
  DEGRES,
  MODES,
  qualite,
  type Accord,
  type Degre,
  type Disposition,
  type Mode,
  type Progression,
  type Renversement,
} from './types.ts'

// Quatuor à cordes, do3 = do central = MIDI 60 (spec §6).
export const TESSITURES = {
  basse: [36, 60],
  tenor: [48, 67],
  alto: [55, 74],
  soprano: [60, 84],
} as const

const ORDRE_VOIX = ['basse', 'tenor', 'alto', 'soprano'] as const

// Gammes en demi-tons. Le mineur est harmonique — le VII est toujours la sensible
// haussée — SAUF pour bâtir l'accord de III, pris naturel (d'où sa qualité M et
// non aug). Même règle que `harmonieRef.ts`, qui la revérifie côté test.
const GAMME_MAJEUR = [0, 2, 4, 5, 7, 9, 11]
const GAMME_MINEUR_HARMONIQUE = [0, 2, 3, 5, 7, 8, 11]
const GAMME_MINEUR_NATURELLE = [0, 2, 3, 5, 7, 8, 10]

function gamme(mode: Mode, degre: Degre): number[] {
  if (mode === 'majeur') return GAMME_MAJEUR
  return degre === 3 ? GAMME_MINEUR_NATURELLE : GAMME_MINEUR_HARMONIQUE
}

// Empilement de tierces STRICTEMENT ascendant à partir de la fondamentale, en
// demi-tons relatifs à la tonique (valeurs 0–21).
function empilement(mode: Mode, degre: Degre, septieme: boolean, modeInverse = false): number[] {
  const echelle = gamme(mode, degre)
  const base = degre - 1
  const sons: number[] = []
  for (let k = 0; k < (septieme ? 4 : 3); k++) {
    let son = echelle[(base + 2 * k) % 7]
    while (sons.length > 0 && son <= sons[sons.length - 1]) son += 12
    sons.push(son)
  }
  // Qualité inversée sur la même fondamentale (perturbation `'mode'`, §4) : seule
  // la tierce bouge, d'un demi-ton, dans le sens qui bascule M ↔ m.
  if (modeInverse) sons[1] += qualite(mode, degre) === 'M' ? -1 : 1
  return sons
}

// Doublure académique — validée avec l'utilisateur :
//   · accord de septième       aucune doublure, les quatre sons y sont
//   · triade diminuée          doubler la TIERCE
//   · 6/4 (renversement 2)     doubler la BASSE, c'est-à-dire la quinte
//   · sinon                    doubler la FONDAMENTALE
function indiceDouble(
  mode: Mode,
  degre: Degre,
  renversement: Renversement,
  septieme: boolean,
): number | null {
  if (septieme) return null
  if (qualite(mode, degre) === 'dim') return 1
  if (renversement === 2) return 2
  return 0
}

// Position serrée : parmi tous les arrangements ascendants des trois voix
// supérieures au-dessus de la basse, celui dont l'écart ténor–soprano est le plus
// petit. Départage : ténor le plus grave, puis ordre d'énumération — le résultat
// est donc parfaitement déterministe.
function serrer(basse: number, superieures: number[]): [number, number, number] {
  let meilleure: [number, number, number] | null = null
  let meilleurEcart = Infinity
  let meilleurTenor = Infinity

  for (const permutation of permutations(superieures)) {
    const voix: number[] = []
    let plancher = basse
    for (const classe of permutation) {
      let son = ((classe % 12) + 12) % 12
      while (son <= plancher) son += 12
      voix.push(son)
      plancher = son
    }
    const ecart = voix[2] - voix[0]
    if (ecart < meilleurEcart || (ecart === meilleurEcart && voix[0] < meilleurTenor)) {
      meilleure = [voix[0], voix[1], voix[2]]
      meilleurEcart = ecart
      meilleurTenor = voix[0]
    }
  }
  if (!meilleure) throw new Error('serrer : aucune disposition trouvée')
  return meilleure
}

function permutations(items: number[]): number[][] {
  if (items.length <= 1) return [items]
  const sortie: number[][] = []
  items.forEach((item, i) => {
    for (const reste of permutations([...items.slice(0, i), ...items.slice(i + 1)])) {
      sortie.push([item, ...reste])
    }
  })
  return sortie
}

function calculer(
  mode: Mode,
  degre: Degre,
  renversement: Renversement,
  septieme: boolean,
  modeInverse = false,
): Disposition {
  const sons = empilement(mode, degre, septieme, modeInverse)
  if (renversement >= sons.length) {
    throw new Error(
      `disposition : renversement ${renversement} impossible sur un accord de ${sons.length} sons`,
    )
  }

  const basse = (((sons[renversement] % 12) + 12) % 12) as number
  const double = indiceDouble(mode, degre, renversement, septieme)
  const superieures = sons.filter((_, i) => i !== renversement).map((s) => ((s % 12) + 12) % 12)
  if (double !== null) superieures.push(((sons[double] % 12) + 12) % 12)

  return { basse, voix: serrer(basse, superieures) }
}

// ─── La table ────────────────────────────────────────────────────────────────

export type CleDisposition = string

export function cleDisposition(
  mode: Mode,
  degre: Degre,
  renversement: Renversement,
  septieme: boolean,
): CleDisposition {
  return `${mode}:${degre}:${renversement}:${septieme ? '7' : '5'}`
}

export const TABLE_DISPOSITIONS: ReadonlyMap<CleDisposition, Disposition> = (() => {
  const table = new Map<CleDisposition, Disposition>()
  for (const mode of MODES) {
    for (const degre of DEGRES) {
      for (const septieme of [false, true]) {
        for (const renversement of [0, 1, 2, 3] as Renversement[]) {
          // Contrainte §1 : le renversement 3 exige la septième.
          if (renversement === 3 && !septieme) continue
          table.set(
            cleDisposition(mode, degre, renversement, septieme),
            calculer(mode, degre, renversement, septieme),
          )
        }
      }
    }
  }
  return table
})()

export function disposition(accord: Accord, mode: Mode): Disposition {
  if (accord.renversement === 3 && !accord.septieme) {
    throw new Error(`disposition : renversement 3 exige une septième (${accord.id})`)
  }
  // Un accord à qualité inversée sort de la table : il n'est pas diatonique.
  if (accord.modeInverse) {
    return calculer(mode, accord.degre, accord.renversement, accord.septieme, true)
  }
  const trouvee = TABLE_DISPOSITIONS.get(
    cleDisposition(mode, accord.degre, accord.renversement, accord.septieme),
  )
  if (!trouvee) throw new Error(`disposition : entrée absente pour ${accord.id} en ${mode}`)
  return trouvee
}

// ─── Réalisation en hauteurs MIDI ────────────────────────────────────────────

const MILIEU_BASSE = Math.round((TESSITURES.basse[0] + TESSITURES.basse[1]) / 2)
const BORNES_VOIX = [TESSITURES.basse, TESSITURES.tenor, TESSITURES.alto, TESSITURES.soprano]

function tientDansLesTessitures(hauteurs: readonly number[]): boolean {
  return hauteurs.every((h, j) => h >= BORNES_VOIX[j][0] && h <= BORNES_VOIX[j][1])
}

// Réalisation d'un accord : basse + bloc supérieur transposé de `octaveBloc`
// octaves. Le bloc reste en position serrée, seul son placement change.
function realiser(disp: Disposition, basse: number, octaveBloc: number): number[] {
  return [basse, ...disp.voix.map((v) => basse + (v - disp.basse) + 12 * octaveBloc)]
}

// Octave de basse retenue : LA PLUS PROCHE DE LA PRÉCÉDENTE, parmi les couples
// (octave de basse, octave du bloc supérieur) qui laissent l'accord entier dans
// les tessitures du quatuor. Le bloc supérieur monte d'une octave quand il le
// faut : un V 4/3 tient dans neuf demi-tons, trop peu pour que le soprano
// atteigne son do3 plancher si on le colle à la basse.
//
// Les tessitures sont une contrainte déclarée du module, pas de la conduite de
// voix : le « rien de plus » de la spec vise la minimisation de mouvement sur les
// voix supérieures, qui n'a toujours pas lieu ici. Repli sur l'octave de basse la
// plus proche si aucun couple ne convient — `plageTransposition` chiffrera alors
// le décalage à opérer.
function placer(disp: Disposition, classe: number, cible: number): number[] {
  const octaves: number[] = []
  let candidat = ((classe % 12) + 12) % 12
  while (candidat < TESSITURES.basse[0]) candidat += 12
  for (let son = candidat; son <= TESSITURES.basse[1]; son += 12) octaves.push(son)

  let meilleur: number[] | null = null
  let meilleurEcart = Infinity
  for (const basse of octaves) {
    for (const octaveBloc of [0, 1, 2]) {
      const hauteurs = realiser(disp, basse, octaveBloc)
      if (!tientDansLesTessitures(hauteurs)) continue
      const ecart = Math.abs(basse - cible)
      if (ecart < meilleurEcart) {
        meilleur = hauteurs
        meilleurEcart = ecart
      }
    }
  }
  if (meilleur) return meilleur

  const repli = octaves.reduce((a, b) => (Math.abs(b - cible) < Math.abs(a - cible) ? b : a))
  return realiser(disp, repli, 0)
}

// Réalise toute la progression : la basse de chaque accord se place dans l'octave
// la plus proche de la basse précédente, les trois voix supérieures s'empilent en
// position serrée au-dessus. Rien de plus.
export function realiserProgression(prog: Progression): number[][] {
  let precedente = MILIEU_BASSE
  return prog.accords.map((accord) => {
    const disp = disposition(accord, prog.mode)
    const hauteurs = placer(disp, prog.tonique + disp.basse, precedente)
    precedente = hauteurs[0]
    return hauteurs
  })
}

export function hauteursReelles(accord: Accord, prog: Progression): number[] {
  const index = prog.accords.findIndex((a) => a.id === accord.id)
  if (index < 0) throw new Error(`hauteursReelles : accord ${accord.id} absent de ${prog.id}`)
  return realiserProgression(prog)[index]
}

// ─── Transposition ───────────────────────────────────────────────────────────
//
// Intervalle de transposition admissible, en demi-tons, préservant les tessitures
// du quatuor pour TOUS les accords. La contrainte vocale est conservée même en
// timbre piano (spec §6). `[a, b]` avec a > b signale qu'aucune transposition ne
// convient — la réalisation elle-même déborde déjà les tessitures.
export function plageTransposition(prog: Progression): [number, number] {
  const realisation = realiserProgression(prog)

  let minimum = -Infinity
  let maximum = Infinity
  ORDRE_VOIX.forEach((voix, j) => {
    const [bas, haut] = TESSITURES[voix]
    const hauteurs = realisation.map((accord) => accord[j])
    minimum = Math.max(minimum, bas - Math.min(...hauteurs))
    maximum = Math.min(maximum, haut - Math.max(...hauteurs))
  })

  return [minimum, maximum]
}

// Vrai si la réalisation transposée de `demiTons` tient dans les tessitures.
export function tessituresRespectees(prog: Progression, demiTons = 0): boolean {
  const [minimum, maximum] = plageTransposition(prog)
  return demiTons >= minimum && demiTons <= maximum
}
