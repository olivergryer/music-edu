// ─── Modèle de données du module Harmonie ────────────────────────────────────
//
// Fonctions pures uniquement dans ce répertoire : zéro React / Firestore / audio /
// VexFlow / DOM (spec « Périmètre »). Imports relatifs AVEC extension `.ts` et
// marqueur `type` sur les imports de types — requis par le runner `node --test`,
// qui se contente d'effacer les types sans les résoudre.
//
// Invariant central (spec §1) : la `Qualite` n'est JAMAIS stockée. Elle se dérive
// de `(mode, degre)`. La stocker permettrait de fabriquer des accords incohérents
// avec leur mode.

export type Mode = 'majeur' | 'mineur'
export type Degre = 1 | 2 | 3 | 4 | 5 | 6 | 7
export type Renversement = 0 | 1 | 2 | 3
export type Qualite = 'M' | 'm' | 'dim' | 'aug'
export type Fonction = 'T' | 'S' | 'D'
export type PositionMetrique = 'fort' | 'faible'

export const DEGRES: readonly Degre[] = [1, 2, 3, 4, 5, 6, 7]
export const MODES: readonly Mode[] = ['majeur', 'mineur']

export interface Accord {
  id: string // stable, référencé par le log d'erreurs — dérivé du contenu (`accordId`)
  degre: Degre
  renversement: Renversement
  septieme: boolean
  duree: number // en pulsations
  positionMetrique: PositionMetrique

  // ── Extension additive au modèle de la spec §1 ──
  // La perturbation `'mode'` (§4) inverse la QUALITÉ sur la même fondamentale :
  // elle ne touche ni au degré, ni au renversement, ni à la cardinalité. Or la
  // qualité n'est pas stockable (invariant ci-dessus). Sans ce drapeau, le
  // substitut serait identique à l'original sur tous les champs — l'invariant
  // « jamais identique » de la §4 deviendrait invérifiable, et `disposition()`
  // ne saurait pas le sonoriser. Absent = accord diatonique normal.
  modeInverse?: boolean
}

export interface Progression {
  id: string
  tonique: number // classe de hauteur 0–11
  mode: Mode
  accords: Accord[]
  niveau: number // 0–8, cf. `niveaux.ts`
}

// Matrice de transition (§3). Ligne = degré de départ, colonne = degré d'arrivée.
// Poids bruts non normalisés ; `matrice.ts` normalise par ligne à l'exécution.
// Une transition interdite vaut 0 (le « — » des tableaux de la spec).
export type MatriceTransition = Readonly<Record<Degre, Readonly<Record<Degre, number>>>>

// ── Métrique d'erreur (§5) ───────────────────────────────────────────────────
// Les quatre canaux sont indépendants et correspondent aux quatre canaux visuels
// du glyphe (position angulaire, renflement, hauteur de colonne, teinte).
export interface VecteurErreur {
  angulaire: number // -3..3, distanceAngulaireSignee(attendu, repondu)
  radial: number // -3..3, repondu.renversement - attendu.renversement
  cardinalite: -1 | 0 | 1
  arcFranchi: boolean
}

export type Diagnostic =
  | 'exact'
  | 'basse_non_entendue' // angulaire 0, radial ≠ 0
  | 'cardinalite' // angulaire 0, radial 0, cardinalité ≠ 0
  | 'degre_voisin' // |angulaire| ∈ {1, 2}, arc partagé
  | 'couture' // |angulaire| === 1, arc franchi — l'unique paire VII/II
  | 'sonorite_sur_fonction' // |angulaire| === 2, arc franchi
  | 'erreur_franche' // |angulaire| === 3

// ── Dictée de basse, niveau 1 (annexe §3) ────────────────────────────────────
// Type de réponse distinct : l'élève saisit des hauteurs, pas des accords. Le
// `VecteurErreur` à quatre canaux ne s'y applique pas (annexe §5, correction 6).
export interface ReponseBasse {
  hauteurs: number[] // degrés de la gamme, 1–7
}

export interface ErreurBasse {
  index: number
  attendu: number
  repondu: number
  ecart: number // en degrés de gamme, signé
}

// ── Perturbation (§4) ────────────────────────────────────────────────────────
export type TypePerturbation =
  | 'renversement' // même degré, basse différente
  | 'cardinalite' // ajout ou retrait de la septième
  | 'mode' // qualité inversée sur la même fondamentale
  | 'degre_associe' // ±1 pas, arc partagé
  | 'fonction_proche' // ±1 ou ±2 pas, arc franchi
  | 'fonction_lointaine' // ±3 pas

export interface Perturbation {
  index: number
  type: TypePerturbation
  original: Accord
  substitut: Accord
  difficulte: number // 0–1, dérivée, 1 = le plus difficile à détecter
}

// ── Dispositions (§6) ────────────────────────────────────────────────────────
export interface Disposition {
  basse: number // demi-tons relatifs à la tonique
  voix: [number, number, number] // ténor, alto, soprano, position serrée
}

// ─── Qualité — dérivée, jamais stockée ───────────────────────────────────────
//
// Mineur = mineur harmonique, SAUF le degré III pris naturel (M et non aug).
// Le degré VII est toujours la sensible haussée (dim), jamais le VII naturel.
const QUALITES: Readonly<Record<Mode, Readonly<Record<Degre, Qualite>>>> = {
  majeur: { 1: 'M', 2: 'm', 3: 'm', 4: 'M', 5: 'M', 6: 'm', 7: 'dim' },
  mineur: { 1: 'm', 2: 'dim', 3: 'M', 4: 'm', 5: 'M', 6: 'M', 7: 'dim' },
}

export function qualite(mode: Mode, degre: Degre): Qualite {
  const q = QUALITES[mode]?.[degre]
  if (!q) throw new Error(`qualite : couple invalide (${mode}, ${degre})`)
  return q
}

// Qualité effectivement sonnée, drapeau `modeInverse` appliqué. M ↔ m ; la bascule
// n'est pas définie sur un accord diminué (test §7 : perturbation `'mode'`
// impossible sur un degré dim), d'où le rejet explicite.
export function qualiteEffective(accord: Accord, mode: Mode): Qualite {
  const base = qualite(mode, accord.degre)
  if (!accord.modeInverse) return base
  if (base === 'M') return 'm'
  if (base === 'm') return 'M'
  throw new Error(`qualiteEffective : bascule M/m non définie sur une qualité « ${base} »`)
}

// Vrai si le degré accepte la perturbation `'mode'`.
export function accepteBasculeMode(mode: Mode, degre: Degre): boolean {
  const q = qualite(mode, degre)
  return q === 'M' || q === 'm'
}

// ─── Identité d'accord ───────────────────────────────────────────────────────
//
// Dérivée de (index, contenu). Deux conséquences voulues :
//  · deux accords identiques à deux positions de la progression restent deux
//    événements distincts pour le log d'erreurs ;
//  · toute perturbation modifiant au moins un champ produit mécaniquement un id
//    différent — l'invariant `substitut.id !== original.id` (§4) est structurel,
//    pas défensif.
export function accordId(
  index: number,
  degre: Degre,
  renversement: Renversement,
  septieme: boolean,
  modeInverse = false,
): string {
  return `${index}:${degre}${renversement}${septieme ? '7' : ''}${modeInverse ? '~' : ''}`
}

export interface AccordPartiel {
  degre: Degre
  renversement?: Renversement
  septieme?: boolean
  duree?: number
  positionMetrique?: PositionMetrique
  modeInverse?: boolean
}

// Fabrique l'accord complet et son id. Valide avant de retourner.
export function creerAccord(index: number, partiel: AccordPartiel): Accord {
  const {
    degre,
    renversement = 0,
    septieme = false,
    duree = 1,
    positionMetrique = index % 2 === 0 ? 'fort' : 'faible',
    modeInverse,
  } = partiel
  const accord: Accord = {
    id: accordId(index, degre, renversement, septieme, modeInverse),
    degre,
    renversement,
    septieme,
    duree,
    positionMetrique,
    ...(modeInverse ? { modeInverse: true } : {}),
  }
  assertAccord(accord)
  return accord
}

// ─── Validation ──────────────────────────────────────────────────────────────
//
// Contrainte de renversement (§1) : `renversement === 3` exige `septieme === true`.
// Toute fonction acceptant un `Accord` doit rejeter cette combinaison.
export function estAccordValide(accord: Accord): boolean {
  if (!DEGRES.includes(accord.degre)) return false
  if (![0, 1, 2, 3].includes(accord.renversement)) return false
  if (accord.renversement === 3 && !accord.septieme) return false
  if (!(accord.duree > 0)) return false
  if (accord.positionMetrique !== 'fort' && accord.positionMetrique !== 'faible') return false
  return true
}

export function assertAccord(accord: Accord): void {
  if (accord.renversement === 3 && !accord.septieme) {
    throw new Error(
      `assertAccord : renversement 3 exige une septième (accord ${accord.id ?? '?'})`,
    )
  }
  if (!estAccordValide(accord)) {
    throw new Error(`assertAccord : accord invalide (${JSON.stringify(accord)})`)
  }
}
