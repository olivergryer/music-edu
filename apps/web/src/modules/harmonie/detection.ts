// ─── Activité « détection d'erreur » — logique pure ──────────────────────────
//
// PRINCIPE : A se LIT, B s'ENTEND. L'élève lit le chiffrage de la progression,
// entend UNE seule version — celle où un accord a été substitué — et désigne
// l'accord qui s'écarte de ce qui est écrit. Il doit donc anticiper intérieurement
// les accords lus avant de les confronter au son.
//
// Une référence est indispensable : le moteur de perturbation garantit que le
// substitut ne viole aucune contrainte dure (§4), donc la version entendue est
// toujours grammaticalement plausible. Sans référence, « quel accord est faux ? »
// n'aurait pas de réponse. Cette référence est écrite plutôt que jouée — c'est ce
// qui fait de l'exercice une tâche d'audiation et non de comparaison de deux
// mémoires auditives.
//
// COROLLAIRE, à ne pas défaire : l'original ne s'entend JAMAIS avant la réponse.
// L'UI ne doit exposer ▶ A qu'au feedback.
//
// Zéro React, zéro audio ici.

import { perturbationsPossibles, perturber } from './perturbation.ts'
import { genererProgression, longueursDisponibles } from './generateur.ts'
import { modesDeSession, type ModeSession } from './modeSession.ts'
import { niveauSpec } from './niveaux.ts'
import { vecteurErreur } from './metrique.ts'
import {
  type Accord,
  type Mode,
  type Perturbation,
  type Progression,
  type TypePerturbation,
  type VecteurErreur,
} from './types.ts'

export const ITEMS_PAR_SESSION = 10

// Un item n'a de sens que s'il offre un CHOIX. La perturbation étant toujours
// intérieure (les bornes sont interdites par la contrainte dure n°1), il faut au
// moins deux positions intérieures, donc quatre accords : à trois accords la
// réponse est forcée et l'item ne mesure rien.
export const POSITIONS_INTERIEURES_MIN = 2
export const LONGUEUR_MIN_DETECTION = POSITIONS_INTERIEURES_MIN + 2

// Niveaux jouables. 0 et 1 n'admettent aucune perturbation (annexe §4) ; le
// niveau 2 est écarté pour la raison ci-dessus — ses deux gabarits (« I-V-I » et
// « I-IV-I ») font trois accords, donc une seule position intérieure. La
// discrimination dominante/sous-dominante qu'il enseigne relève d'une autre
// activité que la détection d'erreur.
export const NIVEAU_MIN_DETECTION = 3
export const NIVEAU_MAX_DETECTION = 7

// Rampe de difficulté sur la session. TODO Matthieu — bornes à valider en classe.
//
// La borne basse DOIT suivre le plancher de `DIFFICULTE_BASE`, sinon les types les
// plus saillants deviennent injouables : la rampe retient la perturbation la plus
// proche de la cible, donc tout ce qui vit sous la borne basse est systématiquement
// battu par le type juste au-dessus. Concrètement, quand `mode` est passé de .60 à
// .10 après l'écoute, une rampe partant de .20 le rendait introuvable — il perdait
// toujours contre `fonction_lointaine` (.15). Les deux constantes sont liées.
export const DIFFICULTE_CIBLE_DEBUT = 0.1
export const DIFFICULTE_CIBLE_FIN = 0.9

const TENTATIVES_TIRAGE = 20
const PAS_GRAINE = 1009 // premier : décorrèle les progressions d'items voisins

export interface ItemDetection {
  index: number // rang dans la session
  progression: Progression // A — ce qui est ÉCRIT
  indexPerturbe: number // position de l'accord altéré
  perturbation: Perturbation
  accordsEntendus: Accord[] // B — A avec le substitut en place
  difficulteCible: number
}

export interface ReponseDetection {
  index: number // rang de l'item
  attendu: number // position réellement altérée
  repondu: number // position désignée par l'élève
  correct: boolean
  rtMs: number
  type: TypePerturbation
  difficulte: number
  // Exactement les bits persistés dans `EncodedItem.flags` (cf. plus bas). Le
  // bilan dessine ses glyphes en les DÉCODANT, sans jamais retoucher aux objets
  // `ItemDetection` : si le rendu est juste, c'est la preuve que ces 13 bits
  // suffisent à le reconstruire, donc qu'un futur écran d'historique lisant
  // Firestore affichera les mêmes glyphes. Sans cela, l'encodage resterait une
  // promesse non vérifiée.
  flags: number
}

// ─── Construction de la session ──────────────────────────────────────────────

export function difficulteCible(rang: number, total: number): number {
  if (total <= 1) return DIFFICULTE_CIBLE_DEBUT
  const ratio = rang / (total - 1)
  return DIFFICULTE_CIBLE_DEBUT + (DIFFICULTE_CIBLE_FIN - DIFFICULTE_CIBLE_DEBUT) * ratio
}

// La longueur suit la rampe elle aussi : plus il y a de positions, plus la faute
// est difficile à localiser. Laisser la longueur au hasard mêlerait deux facteurs
// de difficulté et rendrait la rampe illisible.
export function longueurPourRang(niveau: number, rang: number, total: number): number {
  const disponibles = longueursDisponibles(niveauSpec(niveau)).filter(
    (l) => l >= LONGUEUR_MIN_DETECTION,
  )
  if (disponibles.length === 0) {
    throw new Error(
      `longueurPourRang : niveau ${niveau} ne produit aucune progression d'au moins ` +
        `${LONGUEUR_MIN_DETECTION} accords — pas de choix possible pour l'élève`,
    )
  }
  if (total <= 1) return disponibles[0]
  const ratio = rang / (total - 1)
  const i = Math.min(disponibles.length - 1, Math.floor(ratio * disponibles.length))
  return disponibles[i]
}

// Toutes les perturbations praticables sur les positions INTÉRIEURES. Les bornes
// sont exclues : une perturbation de degré y violerait la contrainte dure n°1 et
// serait détectable par la grammaire, pas par l'oreille.
function candidats(progression: Progression, niveau: number): Perturbation[] {
  const sortie: Perturbation[] = []
  for (let i = 1; i < progression.accords.length - 1; i++) {
    for (const type of perturbationsPossibles(progression, i, niveau)) {
      sortie.push(perturber(progression, i, type))
    }
  }
  return sortie
}

// Choix déterministe : la perturbation dont la difficulté est la plus proche de la
// cible. Départage par position puis par ordre de `perturbationsPossibles`.
function plusProche(liste: Perturbation[], cible: number): Perturbation | null {
  let meilleure: Perturbation | null = null
  let meilleurEcart = Infinity
  for (const p of liste) {
    const ecart = Math.abs(p.difficulte - cible)
    if (ecart < meilleurEcart) {
      meilleure = p
      meilleurEcart = ecart
    }
  }
  return meilleure
}

export function construireItem(
  mode: Mode,
  niveau: number,
  graine: number,
  rang: number,
  total: number = ITEMS_PAR_SESSION,
): ItemDetection {
  const cible = difficulteCible(rang, total)
  const longueur = longueurPourRang(niveau, rang, total)

  for (let essai = 0; essai < TENTATIVES_TIRAGE; essai++) {
    const progression = genererProgression(mode, niveau, longueur, graine + rang * PAS_GRAINE + essai)
    const perturbation = plusProche(candidats(progression, niveau), cible)
    if (!perturbation) continue

    const accordsEntendus = progression.accords.slice()
    accordsEntendus[perturbation.index] = perturbation.substitut

    return {
      index: rang,
      progression,
      indexPerturbe: perturbation.index,
      perturbation,
      accordsEntendus,
      difficulteCible: cible,
    }
  }

  throw new Error(
    `construireItem : aucune perturbation praticable en ${TENTATIVES_TIRAGE} tirages ` +
      `(${mode}, niveau ${niveau}, rang ${rang}, graine ${graine})`,
  )
}

export function construireSession(
  mode: ModeSession,
  niveau: number,
  graine: number,
  nombreItems: number = ITEMS_PAR_SESSION,
): ItemDetection[] {
  if (niveau < NIVEAU_MIN_DETECTION || niveau > NIVEAU_MAX_DETECTION) {
    throw new Error(
      `construireSession : niveau ${niveau} hors des niveaux jouables ` +
        `(${NIVEAU_MIN_DETECTION} à ${NIVEAU_MAX_DETECTION})`,
    )
  }
  // Le mode est une propriété de l'ITEM : en « les deux », il change d'un item à
  // l'autre. Un `Mode` simple redonne exactement le comportement d'avant.
  const modes = modesDeSession(mode, nombreItems, graine)
  return Array.from({ length: nombreItems }, (_, rang) =>
    construireItem(modes[rang], niveau, graine, rang, nombreItems),
  )
}

// ─── Vecteur d'erreur de l'écart A→B ─────────────────────────────────────────
//
// L'écart entre l'accord écrit et l'accord entendu EST un `VecteurErreur` : c'est
// ce que le glyphe à 4 canaux consommera quand il atterrira ici.
//
// Sauf pour la perturbation `mode`, que le vecteur ne sait pas porter : elle ne
// change ni degré, ni renversement, ni cardinalité, ni arc — les quatre canaux
// seraient nuls et `diagnostiquer` répondrait « exact » sur un accord pourtant
// faux. `vecteurErreur` refuse d'ailleurs les accords à qualité inversée, à juste
// titre. On renvoie donc `null`, et l'information passe par son propre drapeau.
export function vecteurDeLItem(item: ItemDetection, mode: Mode): VecteurErreur | null {
  const { original, substitut } = item.perturbation
  if (original.modeInverse || substitut.modeInverse) return null
  return vecteurErreur(original, substitut, mode)
}

// ─── Encodage compact (champ `flags` d'`EncodedItem`) ────────────────────────
//
// L'ordre des 5 slots d'`EncodedItem` est FIGÉ (`lib/moduleProgress.ts`) : tout ce
// qui décrit la perturbation tient dans `flags`.
//
//   bits 0-2   type de perturbation (index dans TYPES_ORDRE)
//   bits 3-5   angulaire    -3..3  décalé de +3
//   bits 6-8   radial       -3..3  décalé de +3
//   bits 9-10  cardinalite  -1..1  décalé de +1
//   bit  11    arcFranchi
//   bit  12    modeInverse — le canal que les quatre autres ne portent pas
//
// POURQUOI PERSISTER PLUTÔT QUE REJOUER DEPUIS LA GRAINE : les poids des matrices
// vont être révisés à l'oreille. `genererProgression` rendra alors d'autres
// progressions pour les mêmes graines, et tout log antérieur deviendrait
// ininterprétable. La spec §5 tranche : « le log persiste le VecteurErreur
// complet ; la classification peut évoluer, les données brutes ne se rejouent
// pas. » Chaque item est donc auto-descriptif.

// ⚠ ORDRE FIGÉ — il indexe des données déjà persistées. Ne jamais réordonner ;
// ajouter en fin de liste seulement.
export const TYPES_ORDRE: readonly TypePerturbation[] = [
  'renversement',
  'cardinalite',
  'mode',
  'degre_associe',
  'fonction_proche',
  'fonction_lointaine',
]

export interface DrapeauxDetection {
  type: TypePerturbation
  vecteur: VecteurErreur | null
  modeInverse: boolean
}

export function encoderDrapeaux(item: ItemDetection, mode: Mode): number {
  const type = TYPES_ORDRE.indexOf(item.perturbation.type)
  if (type < 0) throw new Error(`encoderDrapeaux : type inconnu « ${item.perturbation.type} »`)

  const v = vecteurDeLItem(item, mode)
  const modeInverse = v === null

  return (
    (type & 0b111) |
    (((v ? v.angulaire : 0) + 3) << 3) |
    (((v ? v.radial : 0) + 3) << 6) |
    (((v ? v.cardinalite : 0) + 1) << 9) |
    ((v && v.arcFranchi ? 1 : 0) << 11) |
    ((modeInverse ? 1 : 0) << 12)
  )
}

export function decoderDrapeaux(flags: number): DrapeauxDetection {
  const type = TYPES_ORDRE[flags & 0b111]
  if (!type) throw new Error(`decoderDrapeaux : type inconnu (${flags & 0b111})`)
  const modeInverse = ((flags >> 12) & 0b1) === 1

  return {
    type,
    modeInverse,
    vecteur: modeInverse
      ? null
      : {
          angulaire: ((flags >> 3) & 0b111) - 3,
          radial: ((flags >> 6) & 0b111) - 3,
          cardinalite: (((flags >> 9) & 0b11) - 1) as -1 | 0 | 1,
          arcFranchi: ((flags >> 11) & 0b1) === 1,
        },
  }
}

// ─── Score ───────────────────────────────────────────────────────────────────

export interface ResumeDetection {
  score: number // 0-100, forme attendue par SessionSummary
  itemCount: number
  accuracy: number
  medianRtMs: number
}

function mediane(valeurs: number[]): number {
  if (valeurs.length === 0) return 0
  const tri = [...valeurs].sort((a, b) => a - b)
  const milieu = Math.floor(tri.length / 2)
  return tri.length % 2 === 0 ? (tri[milieu - 1] + tri[milieu]) / 2 : tri[milieu]
}

export function scorerSession(reponses: readonly ReponseDetection[]): ResumeDetection {
  const itemCount = reponses.length
  const justes = reponses.filter((r) => r.correct).length
  const accuracy = itemCount === 0 ? 0 : justes / itemCount
  return {
    score: Math.round(accuracy * 100),
    itemCount,
    accuracy,
    medianRtMs: Math.round(mediane(reponses.map((r) => r.rtMs))),
  }
}

// Répartition des fautes par type de perturbation — c'est cette donnée qui dira si
// l'échelle de `DIFFICULTE_BASE` tient sur de vrais élèves.
export function fautesParType(
  reponses: readonly ReponseDetection[],
): { type: TypePerturbation; vus: number; rates: number }[] {
  return TYPES_ORDRE.map((type) => {
    const concernees = reponses.filter((r) => r.type === type)
    return {
      type,
      vus: concernees.length,
      rates: concernees.filter((r) => !r.correct).length,
    }
  }).filter((l) => l.vus > 0)
}
