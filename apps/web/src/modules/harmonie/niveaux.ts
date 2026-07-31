// ─── Progression pédagogique, niveaux 0 à 8 (annexe) ─────────────────────────
//
// Trois régimes de génération, et non un seul. La matrice de transition n'est
// requise qu'à partir du niveau 6 : les niveaux 0 à 5 sont livrables sans elle.
//
//   atome   (0, 1)  pas de progression au sens du modèle — contexte tonal + objet isolé
//   gabarit (2–5)   formules à emplacements variables, aucune matrice
//   matrice (6–8)   génération libre pondérée par la matrice de la §3
//
// TODO Matthieu — deux décisions signalées « à valider » dans l'annexe :
//   · VII6 placé au niveau 5 (famille dominante) plutôt qu'au niveau 6
//   · III introduit au niveau 7 seulement

import type { Degre, Renversement, TypePerturbation } from './types.ts'

export type Regime = 'atome' | 'gabarit' | 'matrice'

export type TypeTache =
  | 'qualite_binaire' // majeur ou mineur
  | 'dictee_basse' // saisie de hauteurs
  | 'choix_binaire' // deux options
  | 'choix_multiple' // n options
  | 'identification' // identification complète degré + renversement

export interface NiveauSpec {
  niveau: number
  regime: Regime
  tache: TypeTache
  vocabulaire: Degre[]
  renversements: Renversement[]
  septiemeSur: Degre[] // degrés pouvant porter la septième — remplace un `septieme: boolean`
  longueur: [number, number] // min, max, en accords
  finales: Degre[] // degrés autorisés en position finale ; [] = aucune contrainte
  contexteTonal: boolean // faire sonner la tonique avant l'item
  gabarits?: string[] // requis si regime === 'gabarit'
}

export const NIVEAUX: readonly NiveauSpec[] = [
  {
    // Un accord isolé, précédé de la tonique. Majeur ou mineur. Le contexte tonal
    // est obligatoire : hors contexte, un accord mineur est indécidable entre i en
    // mineur et VI en majeur. N'utilise ni le cercle, ni la métrique à 4 canaux.
    niveau: 0,
    regime: 'atome',
    tache: 'qualite_binaire',
    vocabulaire: [1, 4, 5, 2, 6],
    renversements: [0],
    septiemeSur: [],
    longueur: [1, 1],
    finales: [],
    contexteTonal: true,
  },
  {
    // Type de réponse distinct (`ReponseBasse`) : l'élève saisit des hauteurs.
    // Prérequis de tout le module — le chiffrage français chiffre les intervalles
    // au-dessus de la basse ; qui n'entend pas la basse ne peut rien chiffrer.
    niveau: 1,
    regime: 'atome',
    tache: 'dictee_basse',
    vocabulaire: [1, 4, 5],
    renversements: [0],
    septiemeSur: [],
    longueur: [2, 4],
    finales: [1],
    contexteTonal: true,
  },
  {
    // Fonction dominante contre sous-dominante.
    niveau: 2,
    regime: 'gabarit',
    tache: 'choix_binaire',
    vocabulaire: [1, 4, 5],
    renversements: [0],
    septiemeSur: [],
    longueur: [3, 3],
    finales: [1],
    contexteTonal: true,
    gabarits: ['I-V-I', 'I-IV-I'],
  },
  {
    // Type de cadence : parfaite, demi-cadence, rompue, plagale. PREMIER NIVEAU
    // où la finale n'est pas I — la demi-cadence finit sur V, la rompue sur VI.
    niveau: 3,
    regime: 'gabarit',
    tache: 'choix_multiple',
    vocabulaire: [1, 2, 4, 5, 6],
    renversements: [0],
    septiemeSur: [],
    longueur: [3, 4],
    finales: [1, 5, 6],
    contexteTonal: true,
    gabarits: ['I-IV-V-I', 'I-VI-II-V', 'I-V-VI', 'I-IV-I'],
  },
  {
    // Renversements. Premier niveau où le canal radial du glyphe s'active.
    // Le vocabulaire RESSERRE volontairement (I-IV-V) par rapport au niveau 3 :
    // la discrimination porte sur la basse, pas sur le degré. C'est la seule
    // rupture de la croissance par inclusion, et elle est intentionnelle.
    niveau: 4,
    regime: 'gabarit',
    tache: 'choix_binaire',
    vocabulaire: [1, 4, 5],
    renversements: [0, 1],
    septiemeSur: [],
    longueur: [3, 4],
    finales: [1],
    contexteTonal: true,
    gabarits: ['I-IV-V-I', 'I-V-I', 'I-IV-I'],
  },
  {
    // Cardinalité et famille dominante : trois ou quatre sons sur la dominante.
    // VII reste contraint au premier renversement (contrainte dure n°2).
    niveau: 5,
    regime: 'gabarit',
    tache: 'choix_binaire',
    vocabulaire: [1, 4, 5, 7],
    renversements: [0, 1],
    septiemeSur: [5],
    longueur: [3, 5],
    finales: [1],
    contexteTonal: true,
    gabarits: ['I-IV-V-I', 'I-V-I', 'I-IV-V7-I', 'I-VII6-I'],
  },
  {
    // Vocabulaire diatonique élargi. Premier niveau à génération libre : la
    // matrice de transition s'applique. III reste exclu.
    niveau: 6,
    regime: 'matrice',
    tache: 'identification',
    vocabulaire: [1, 2, 4, 5, 6, 7],
    renversements: [0, 1],
    septiemeSur: [5, 2],
    longueur: [4, 8],
    finales: [1],
    contexteTonal: true,
  },
  {
    // 6/4 et degré III. Le 6/4 cesse d'être restreint à la position cadentielle :
    // cadentiel contre passage EST la discrimination du niveau.
    // `contexteTonal` faux : l'élève doit établir la tonique lui-même.
    niveau: 7,
    regime: 'matrice',
    tache: 'identification',
    vocabulaire: [1, 2, 3, 4, 5, 6, 7],
    renversements: [0, 1, 2],
    septiemeSur: [5, 2, 4],
    longueur: [4, 8],
    finales: [1],
    contexteTonal: false,
  },
  {
    // Degrés secondaires — HORS PÉRIMÈTRE V1. Emplacement réservé pour que le type
    // reste exhaustif ; `genererProgression` lève à ce niveau. Nécessite au
    // préalable : extension d'`Accord` avec une altération secondaire, une
    // géométrie de la modulation, une matrice de transition étendue.
    niveau: 8,
    regime: 'matrice',
    tache: 'identification',
    vocabulaire: [1, 2, 3, 4, 5, 6, 7],
    renversements: [0, 1, 2, 3],
    septiemeSur: [1, 2, 3, 4, 5, 6, 7],
    longueur: [4, 8],
    finales: [1],
    contexteTonal: false,
  },
]

export const NIVEAU_MIN = 0
export const NIVEAU_MAX = 8
// Dernier niveau réellement générable : le 8 est un emplacement réservé.
export const NIVEAU_MAX_IMPLEMENTE = 7

export function niveauSpec(niveau: number): NiveauSpec {
  const spec = NIVEAUX[niveau]
  if (!spec || spec.niveau !== niveau) throw new Error(`niveauSpec : niveau inconnu (${niveau})`)
  return spec
}

export function assertNiveauGenerable(niveau: number): NiveauSpec {
  const spec = niveauSpec(niveau)
  if (niveau > NIVEAU_MAX_IMPLEMENTE) {
    throw new Error(
      `niveau ${niveau} hors périmètre V1 (degrés secondaires) — aucun générateur disponible`,
    )
  }
  return spec
}

// ─── Progression de la difficulté de perturbation (annexe §4) ────────────────
//
// Le moteur doit filtrer les types disponibles selon le niveau, sinon il produit
// des perturbations que l'élève ne peut pas COMPRENDRE. Table CUMULATIVE.
//
// ⚠ Cet ordre n'est PAS celui de `DIFFICULTE_BASE`, et c'est voulu — les deux
// axes sont décorrélés. Ici on gradue ce que l'élève sait analyser ; là-bas ce
// qu'il perçoit. `mode` arrive en dernier tout en étant la perturbation la plus
// saillante à l'oreille : entendre qu'un accord sort de la tonalité est immédiat,
// savoir le nommer suppose tout le vocabulaire chromatique. Symétriquement,
// `fonction_proche` ouvre le niveau 2 alors qu'elle est parmi les plus discrètes.
// Ne pas « réaligner » les deux tables : elles ne mesurent pas la même chose.
export const PERTURBATIONS_PAR_NIVEAU: readonly (readonly TypePerturbation[])[] = [
  [], // 0 — pas de détection d'erreur
  [], // 1 — pas de détection d'erreur
  ['fonction_lointaine', 'fonction_proche'], // 2
  ['fonction_lointaine', 'fonction_proche'], // 3
  ['fonction_lointaine', 'fonction_proche', 'renversement'], // 4
  ['fonction_lointaine', 'fonction_proche', 'renversement', 'cardinalite'], // 5
  ['fonction_lointaine', 'fonction_proche', 'renversement', 'cardinalite', 'degre_associe'], // 6
  ['fonction_lointaine', 'fonction_proche', 'renversement', 'cardinalite', 'degre_associe', 'mode'], // 7
  ['fonction_lointaine', 'fonction_proche', 'renversement', 'cardinalite', 'degre_associe', 'mode'], // 8
]

export function perturbationsAutorisees(niveau: number): readonly TypePerturbation[] {
  const liste = PERTURBATIONS_PAR_NIVEAU[niveau]
  if (!liste) throw new Error(`perturbationsAutorisees : niveau inconnu (${niveau})`)
  return liste
}

// Le 6/4 n'est restreint à la position cadentielle QUE jusqu'au niveau 6 inclus
// (contrainte dure n°3). Au niveau 7, le 6/4 de passage devient l'objet même de
// la discrimination (annexe §5, correction 3).
export function sixQuatreRestreintAuCadentiel(niveau: number): boolean {
  return niveau <= 6
}
