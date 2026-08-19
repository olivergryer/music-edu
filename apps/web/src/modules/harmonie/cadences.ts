// ─── Reconnaissance de cadences — logique pure ───────────────────────────────
//
// L'activité que le barème déclarait sans jamais l'implémenter : `niveaux.ts`
// donne au niveau 3 `tache: 'choix_multiple'` — « type de cadence : parfaite,
// demi-cadence, rompue, plagale » — et ses `finales: [1, 5, 6]` sont exactement
// les finales de ces quatre cadences. Elle est ici, plus un palier « tout » hors
// barème qui ajoute l'imparfaite et les quatre approches chromatiques.
//
// ─── DEUX AXES INDÉPENDANTS, DEUX QUESTIONS ──────────────────────────────────
//
// Une sixte allemande n'est pas un type de cadence : c'est un accord d'approche,
// et les quatre résolvent sur la dominante. La même napolitaine peut donc précéder
// une parfaite, une demi ou une rompue. Mélanger les deux axes dans une liste
// unique ferait qu'un élève entendant parfaitement la demi-cadence, mais ne
// reconnaissant pas l'accord, aurait tout faux. D'où deux réponses par item, et
// deux exactitudes qui ne s'additionnent jamais (décidé avec Matthieu).
//
// ⚠ LES COMBINAISONS SONT UNE TABLE, PAS UNE RÈGLE. La plagale n'admet aucune
// approche chromatique — elle n'a pas de dominante. Aucune formule ne le déduira
// à notre place : `COMBINAISONS` l'écrit.
//
// ⚠ LA TIERCE PICARDE EST HORS LISTE (décidé avec Matthieu) : c'est la qualité de
// l'accord final, pas un type de cadence. Une parfaite peut être picarde.

import { violations, type Violation } from './contraintes.ts'
import {
  accordChromatique,
  orthographeChromatique,
  type NomChromatique,
} from './chromatiques.ts'
import { dispositionAuSoprano, dispositionLibre, disposition, placer } from './dispositions.ts'
import { modesDeSession, type ModeSession } from './modeSession.ts'
import { parseGabarit } from './gabarits.ts'
import {
  armureVex,
  nommerHauteur,
  orthographeAccord,
  toniqueEcrite,
  transposerVersUt,
  type Partition,
  type VueTonalite,
} from './notation.ts'
import { mulberry32, pick, type Rng } from './rng.ts'
import { creerAccord, type Accord, type Degre, type Mode } from './types.ts'

export type TypeCadence = 'parfaite' | 'imparfaite' | 'demi' | 'plagale' | 'rompue'
export type Approche = 'aucune' | NomChromatique
export type Palier = 'niveau3' | 'tout'
export type Contexte = 'nue' | 'phrase'

export const TYPES_CADENCE: readonly TypeCadence[] = [
  'parfaite',
  'imparfaite',
  'demi',
  'plagale',
  'rompue',
]

export const APPROCHES: readonly Approche[] = [
  'aucune',
  'napolitaine',
  'italienne',
  'francaise',
  'allemande',
]

export const ITEMS_PAR_SESSION_CADENCES = 8
const PAS_GRAINE = 1013

/** Le niveau du barème que remplit le palier bas. */
export const NIVEAU_CADENCES = 3

export const LIBELLES_CADENCE: Readonly<Record<TypeCadence, string>> = {
  parfaite: 'Parfaite',
  imparfaite: 'Imparfaite',
  demi: 'Demi-cadence',
  plagale: 'Plagale',
  rompue: 'Rompue',
}

export const LIBELLES_APPROCHE: Readonly<Record<Approche, string>> = {
  aucune: 'Aucun',
  napolitaine: 'Napolitaine',
  italienne: 'Sixte italienne',
  francaise: 'Sixte française',
  allemande: 'Sixte allemande',
}

// ─── Ce qu'un item contient ──────────────────────────────────────────────────
//
// Un membre est soit un accord du modèle à sept degrés, soit un accord
// chromatique — qui n'en est pas un (cf. `chromatiques.ts`). Les deux sortes
// cohabitent ici et nulle part ailleurs : le reste du module continue de ne
// connaître que des `Accord`.

export type MembreCadence =
  | {
      sorte: 'diatonique'
      accord: Accord
      /** Son imposé au soprano, en demi-tons relatifs à la tonique. */
      soprano?: number
    }
  | { sorte: 'chromatique'; nom: NomChromatique }

export interface ItemCadence {
  index: number
  tonique: number
  mode: Mode
  type: TypeCadence
  approche: Approche
  membres: MembreCadence[]
  /** Index du premier membre de la cadence proprement dite — le reste est préparation. */
  debutCadence: number
}

// ─── Les combinaisons admises ────────────────────────────────────────────────

export const COMBINAISONS: Readonly<Record<Approche, readonly TypeCadence[]>> = {
  aucune: ['parfaite', 'imparfaite', 'demi', 'plagale', 'rompue'],
  // Les quatre chromatiques mènent à la dominante : toute cadence qui passe par V
  // les accepte, la plagale non.
  napolitaine: ['parfaite', 'imparfaite', 'demi', 'rompue'],
  italienne: ['parfaite', 'imparfaite', 'demi', 'rompue'],
  francaise: ['parfaite', 'imparfaite', 'demi', 'rompue'],
  allemande: ['parfaite', 'imparfaite', 'demi', 'rompue'],
}

/** Les types proposés par un palier. Le niveau 3 n'a pas l'imparfaite — cf. plus bas. */
export function typesDuPalier(palier: Palier): TypeCadence[] {
  if (palier === 'niveau3') return ['parfaite', 'demi', 'plagale', 'rompue']
  return [...TYPES_CADENCE]
}

/**
 * Les approches proposées par un palier.
 *
 * ⚠ Au niveau 3 il n'y a aucun chromatisme : la question de l'approche n'aurait
 * qu'une réponse possible, donc l'écran ne la pose pas.
 */
export function approchesDuPalier(palier: Palier): Approche[] {
  return palier === 'niveau3' ? ['aucune'] : [...APPROCHES]
}

export function questionApproche(palier: Palier): boolean {
  return approchesDuPalier(palier).length > 1
}

/** Les couples (type, approche) qu'un palier peut tirer. */
export function couplesDuPalier(palier: Palier): { type: TypeCadence; approche: Approche }[] {
  const types = typesDuPalier(palier)
  const couples: { type: TypeCadence; approche: Approche }[] = []
  for (const approche of approchesDuPalier(palier)) {
    for (const type of COMBINAISONS[approche]) {
      if (types.includes(type)) couples.push({ type, approche })
    }
  }
  return couples
}

// ─── Les formules ────────────────────────────────────────────────────────────
//
// La queue de cadence, en gabarit. Le dernier accord porte la signature du type ;
// celui d'avant fait la cadence. En mineur le II est diminué, donc interdit à
// l'état fondamental (contrainte dure n°2) : la demi-cadence y passe par le IV.

const TONIQUE = 0
const TIERCE_MAJEURE = 4
const TIERCE_MINEURE = 3

function tierceDeLaTonique(mode: Mode): number {
  return mode === 'majeur' ? TIERCE_MAJEURE : TIERCE_MINEURE
}

interface Queue {
  /**
   * Accord qui prépare la cadence, `null` si la cadence se suffit. Il est REMPLACÉ
   * par l'accord chromatique quand il y en a un : c'est la fonction du chromatique
   * de préparer la dominante, et l'empiler sur un IV le noierait.
   */
  preparateur: string | null
  /** La cadence elle-même, en gabarit. */
  essentiel: string
  /** Soprano imposé sur le DERNIER accord, `null` si libre. */
  soprano: number | null
}

function queuesDe(type: TypeCadence, mode: Mode): Queue[] {
  switch (type) {
    // Les deux à l'état fondamental ET la tonique au soprano : c'est la
    // définition académique, et le seul cas où les trois conditions tiennent
    // ensemble.
    case 'parfaite':
      return [{ preparateur: null, essentiel: 'V-I', soprano: TONIQUE }]

    // Imparfaite = la même formule, à laquelle il manque une des conditions. Les
    // trois manières sont offertes : basse renversée d'un côté ou de l'autre, ou
    // sommet qui n'est pas la tonique.
    case 'imparfaite':
      return [
        { preparateur: null, essentiel: 'V6-I', soprano: null },
        { preparateur: null, essentiel: 'V-I6', soprano: null },
        { preparateur: null, essentiel: 'V-I', soprano: tierceDeLaTonique(mode) },
      ]

    // La demi-cadence est le seul type dont la cadence tient en UN accord : c'est
    // l'arrivée sur V qui la fait. D'où un préparateur, sans quoi il n'y aurait
    // rien à entendre. En mineur le II est diminué, donc interdit à l'état
    // fondamental (contrainte dure n°2) : on y passe par le IV.
    case 'demi':
      return mode === 'majeur'
        ? [
            { preparateur: 'II', essentiel: 'V', soprano: null },
            { preparateur: 'IV', essentiel: 'V', soprano: null },
          ]
        : [{ preparateur: 'IV', essentiel: 'V', soprano: null }]

    case 'plagale':
      return [{ preparateur: null, essentiel: 'IV-I', soprano: TONIQUE }]

    case 'rompue':
      return [{ preparateur: null, essentiel: 'V-VI', soprano: null }]
  }
}

// Préparations : ce qui mène à la cadence quand on demande une phrase. Elles
// commencent sur I — contrainte dure n°1 — et restent dans le vocabulaire du
// niveau 3, donc valables aux deux paliers.
const PREPARATIONS: readonly string[] = ['I', 'I-VI', 'I-IV-I', 'I-VI-IV', 'I-V-I']

// ─── Construction ────────────────────────────────────────────────────────────

function membresDiatoniques(gabarit: string, depart: number): MembreCadence[] {
  return parseGabarit(gabarit).map((accord, i) => ({
    sorte: 'diatonique' as const,
    // `parseGabarit` numérote depuis 0 ; on renumérote pour que les identifiants
    // restent uniques dans la suite complète.
    accord: creerAccord(depart + i, {
      degre: accord.degre,
      renversement: accord.renversement,
      septieme: accord.septieme,
    }),
  }))
}

export function construireItemCadence(
  mode: Mode,
  palier: Palier,
  contexte: Contexte,
  type: TypeCadence,
  approche: Approche,
  graine: number,
  rang: number,
): ItemCadence {
  if (!COMBINAISONS[approche].includes(type)) {
    throw new Error(`construireItemCadence : ${approche} n’approche pas une cadence ${type}`)
  }
  if (!typesDuPalier(palier).includes(type)) {
    throw new Error(`construireItemCadence : cadence ${type} hors du palier ${palier}`)
  }

  const rng: Rng = mulberry32(graine + rang * PAS_GRAINE)
  const queue = pick(queuesDe(type, mode), rng)!

  // Ce qui ouvre la cadence : l'accord chromatique s'il y en a un, sinon le
  // préparateur diatonique, sinon la cadence elle-même.
  const ouverture = approche !== 'aucune' ? null : (queue.preparateur ?? premier(queue.essentiel))

  // La préparation s'arrête avant la cadence. En « nue » on pose seulement la
  // tonique : sans elle aucune cadence n'est identifiable — il faut savoir où l'on
  // est pour entendre où l'on va. On écarte les préparations qui finiraient sur
  // l'accord d'ouverture, pour ne pas le répéter.
  const candidates =
    contexte === 'nue'
      ? ['I']
      : PREPARATIONS.filter((p) => ouverture === null || dernier(p) !== ouverture)
  const preparation = pick(candidates.length > 0 ? candidates : ['I'], rng)!

  const membres: MembreCadence[] = membresDiatoniques(preparation, 0)
  const debutCadence = membres.length

  if (approche !== 'aucune') {
    // Le chromatique REMPLACE le préparateur : c'est lui qui prépare la dominante.
    membres.push({ sorte: 'chromatique', nom: approche })
  } else if (queue.preparateur) {
    membres.push(...membresDiatoniques(queue.preparateur, membres.length))
  }

  const essentiel = membresDiatoniques(queue.essentiel, membres.length)
  if (queue.soprano !== null) {
    const final = essentiel[essentiel.length - 1]
    if (final.sorte === 'diatonique') final.soprano = queue.soprano
  }
  membres.push(...essentiel)

  return {
    index: rang,
    // La tonalité change à chaque item, comme en détection : sinon tout sonnerait
    // en do et la mémoire des hauteurs absolues remplacerait l'oreille.
    tonique: (graine + rang * 7) % 12,
    mode,
    type,
    approche,
    membres,
    debutCadence,
  }
}

function dernier(gabarit: string): string {
  const jetons = gabarit.split('-').filter((j) => j.length > 0)
  return jetons[jetons.length - 1] ?? ''
}

function premier(gabarit: string): string {
  return gabarit.split('-').filter((j) => j.length > 0)[0] ?? ''
}

/**
 * Couples équilibrés puis mélangés — même principe que `reponsesEquilibrees` du
 * choix binaire. Sans cela, le tirage suivrait la fréquence des formules et la
 * réponse la plus probable deviendrait devinable sans écouter.
 */
export function couplesEquilibres(
  palier: Palier,
  nombreItems: number,
  graine: number,
): { type: TypeCadence; approche: Approche }[] {
  const disponibles = couplesDuPalier(palier)
  const suite = Array.from({ length: nombreItems }, (_, i) => disponibles[i % disponibles.length])

  const rng = mulberry32(graine)
  for (let i = suite.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[suite[i], suite[j]] = [suite[j], suite[i]]
  }
  return suite
}

export function construireSessionCadences(
  mode: ModeSession,
  palier: Palier,
  contexte: Contexte,
  graine: number,
  nombreItems: number = ITEMS_PAR_SESSION_CADENCES,
): ItemCadence[] {
  const modes = modesDeSession(mode, nombreItems, graine)
  return couplesEquilibres(palier, nombreItems, graine).map((couple, rang) =>
    construireItemCadence(
      modes[rang],
      palier,
      contexte,
      couple.type,
      couple.approche,
      graine,
      rang,
    ),
  )
}

// ─── Entendre la réponse choisie ─────────────────────────────────────────────
//
// À la correction, l'élève entend un exemple de ce qu'il a RÉPONDU, à côté de ce
// qui a sonné. C'est la seule façon de comprendre une confusion entre deux types
// de cadence : les nommer ne suffit pas.
//
// ⚠ CE SERA UN AUTRE EXEMPLE, pas la cadence entendue transformée. Une parfaite
// ne se change pas en rompue : ce sont deux fins différentes, pas deux habillages
// de la même. On garde donc la tonique, le mode, le palier, le contexte, la graine
// et le rang — tout ce qui peut l'être — et le type change.

/**
 * Un item de comparaison : la même situation, mais avec le type (et l'approche)
 * que l'élève a répondus.
 *
 * ⚠ `COMBINAISONS` est un garde-fou, pas une suggestion : la plagale n'admet
 * aucune approche chromatique. Un couple impossible retombe sur `'aucune'` plutôt
 * que de laisser `construireItemCadence` lever au milieu d'une correction.
 */
export function itemDeLaReponse(
  item: ItemCadence,
  palier: Palier,
  contexte: Contexte,
  type: TypeCadence,
  approche: Approche,
  graine: number,
): ItemCadence {
  const approcheTenable = COMBINAISONS[approche].includes(type) ? approche : 'aucune'
  const fabrique = construireItemCadence(
    item.mode,
    palier,
    contexte,
    type,
    approcheTenable,
    graine,
    item.index,
  )
  // La tonalité de l'item entendu, sinon la comparaison porterait aussi sur la
  // hauteur — deux variables au lieu d'une.
  return { ...fabrique, tonique: item.tonique }
}

// ─── Réalisation sonore ──────────────────────────────────────────────────────
//
// Une suite de cadence n'est pas une `Progression` : elle contient des accords
// hors modèle. Elle a donc sa propre réalisation, qui réutilise les mêmes briques
// — dispositions et placement dans les tessitures.

export function realiserCadence(item: ItemCadence): number[][] {
  let precedente = 48 // milieu de la tessiture de basse, comme `realiserProgression`

  return item.membres.map((membre) => {
    const disp =
      membre.sorte === 'diatonique'
        ? membre.soprano === undefined
          ? disposition(membre.accord, item.mode)
          : dispositionAuSoprano(membre.accord, item.mode, membre.soprano)
        : dispositionLibre(
            accordChromatique(membre.nom).sons.map((s) => s.demiTons),
            0,
            accordChromatique(membre.nom).double,
          )

    const hauteurs = placer(disp, item.tonique + disp.basse, precedente)
    precedente = hauteurs[0]
    return hauteurs
  })
}

/**
 * La partition d'une cadence. Elle ne peut pas passer par
 * `partitionDeProgression` : une suite de cadence n'est pas une `Progression`,
 * puisqu'elle peut contenir des accords hors modèle. Chaque membre apporte donc
 * sa propre table d'orthographe.
 */
export function partitionDeCadence(item: ItemCadence, vue: VueTonalite): Partition {
  const realisation = realiserCadence(item)
  const hauteurs =
    vue === 'tonalite' ? realisation : transposerVersUt(realisation, item.tonique, item.mode)
  const ecrite = toniqueEcrite(item.tonique, item.mode, vue)

  return {
    notes: item.membres.map((membre, i) => {
      const carte =
        membre.sorte === 'diatonique'
          ? orthographeAccord(membre.accord, ecrite, item.mode)
          : orthographeChromatique(membre.nom, ecrite, item.mode)
      return hauteurs[i].map((midi) => nommerHauteur(midi, carte))
    }),
    armure: armureVex(ecrite, item.mode),
  }
}

// ─── Vérification d'une cadence ──────────────────────────────────────────────
//
// ⚠ ON NE PASSE PAS PAR `respecteContraintes` TEL QUEL. Ses `finales` sont celles
// d'un niveau, pensées pour une autre activité : le niveau 7 n'admet que I en
// finale et rejetterait toute demi-cadence. On ne retient donc que les violations
// qui ont un sens ici — celles qui portent sur l'écriture, pas sur le parcours.
const VIOLATIONS_RETENUES: readonly Violation[] = [
  'accord_invalide',
  'dim_fondamental',
  'six_quatre_non_cadentiel',
  'repetitions',
]

export function accordsDiatoniques(item: ItemCadence): Accord[] {
  return item.membres.flatMap((m) => (m.sorte === 'diatonique' ? [m.accord] : []))
}

export function violationsCadence(item: ItemCadence): Violation[] {
  return violations(accordsDiatoniques(item), item.mode, NIVEAU_CADENCES).filter((v) =>
    VIOLATIONS_RETENUES.includes(v),
  )
}

/**
 * La signature du type, vérifiée sur la suite réellement produite. C'est le
 * contrat de l'activité : si elle tombe, l'élève entend autre chose que ce qu'on
 * lui demande de nommer.
 */
export function signatureRespectee(item: ItemCadence): boolean {
  const accords = accordsDiatoniques(item)
  const fin = accords[accords.length - 1]
  const avant = accords[accords.length - 2]
  if (!fin) return false

  const membreFinal = item.membres[item.membres.length - 1]
  const soprano = membreFinal.sorte === 'diatonique' ? membreFinal.soprano : undefined

  switch (item.type) {
    case 'parfaite':
      return (
        avant?.degre === 5 &&
        avant.renversement === 0 &&
        fin.degre === 1 &&
        fin.renversement === 0 &&
        soprano === TONIQUE
      )
    case 'imparfaite':
      return (
        avant?.degre === 5 &&
        fin.degre === 1 &&
        (avant.renversement !== 0 || fin.renversement !== 0 || soprano !== TONIQUE)
      )
    case 'demi':
      return fin.degre === 5 && fin.renversement === 0
    case 'plagale':
      return avant?.degre === 4 && fin.degre === 1
    case 'rompue':
      return avant?.degre === 5 && fin.degre === 6
  }
}

/** Le degré final, pour les tests de cohérence avec `finales` du niveau 3. */
export function degreFinal(item: ItemCadence): Degre {
  const accords = accordsDiatoniques(item)
  return accords[accords.length - 1].degre
}

// ─── Réponses et score ───────────────────────────────────────────────────────

export interface ReponseCadence {
  index: number
  attenduType: TypeCadence
  attendueApproche: Approche
  reponduType: TypeCadence | null
  reponduApproche: Approche | null
  rtMs: number
}

export interface ResumeCadences {
  /** 0-100, forme attendue par `SessionSummary` — porté par le TYPE de cadence. */
  score: number
  itemCount: number
  /** Part de types justes. C'est la compétence visée par le barème. */
  precisionType: number
  /**
   * Part d'approches justes, sur les seuls items où la question était posée.
   * ⚠ Ne jamais fusionner avec `precisionType` : rater l'accord d'approche n'est
   * pas rater la cadence, et les deux se remédient autrement.
   */
  precisionApproche: number
  approchesPosees: number
  medianRtMs: number
}

function mediane(valeurs: number[]): number {
  if (valeurs.length === 0) return 0
  const tri = [...valeurs].sort((a, b) => a - b)
  const milieu = Math.floor(tri.length / 2)
  return tri.length % 2 === 0 ? (tri[milieu - 1] + tri[milieu]) / 2 : tri[milieu]
}

export function scorerCadences(reponses: readonly ReponseCadence[]): ResumeCadences {
  if (reponses.length === 0) {
    return {
      score: 0,
      itemCount: 0,
      precisionType: 0,
      precisionApproche: 0,
      approchesPosees: 0,
      medianRtMs: 0,
    }
  }

  const typesJustes = reponses.filter((r) => r.reponduType === r.attenduType).length
  const posees = reponses.filter((r) => r.reponduApproche !== null)
  const approchesJustes = posees.filter((r) => r.reponduApproche === r.attendueApproche).length

  const precisionType = typesJustes / reponses.length

  return {
    score: Math.round(precisionType * 100),
    itemCount: reponses.length,
    precisionType,
    precisionApproche: posees.length === 0 ? 0 : approchesJustes / posees.length,
    approchesPosees: posees.length,
    medianRtMs: mediane(reponses.map((r) => r.rtMs)),
  }
}
