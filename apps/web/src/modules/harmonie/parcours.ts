// ─── Harmonie — le parcours guidé en 4 étapes ───────────────────────────────
//
// COUCHE PURE au-dessus des activités existantes. Elle ne touche aucune page,
// aucune route, aucune clé Firestore : elle LIT la carte `levels` que les
// activités écrivent déjà, et dit où en est l'élève.
//
// Le barème 0-7 de `niveaux.ts` reste la source de vérité du contenu. Ici on ne
// fait que le REGROUPER en quatre étapes nommées, et dire quel exercice proposer.
//
// Vocabulaire : « étape » (le regroupement), pas « niveau » — ce mot est déjà pris
// par le cycle scolaire C1…C3 (cf. CLAUDE.md).

import { NIVEAUX_BINAIRE } from './binaire.ts'
import { NIVEAU_CADENCES } from './cadences.ts'
import { NIVEAU_MAX_DETECTION } from './detection.ts'
import { NIVEAU_DICTEE } from './dictee.ts'
import { NIVEAU_MAX_FLUX, NIVEAU_MIN_FLUX } from './flux.ts'

export type ActiviteParcours = 'basse' | 'binaire' | 'cadences' | 'detection' | 'flux'

export type NumeroEtape = 1 | 2 | 3 | 4

/** Un exercice précis : une activité à un point du barème. */
export interface Jalon {
  activite: ActiviteParcours
  /** Niveau du barème (0-7). */
  niveau: number
  /** Proposé par « Continuer » ; les autres sont des alternatives de l'étape. */
  conseille: boolean
}

export interface Etape {
  numero: NumeroEtape
  titre: string
  /** La question posée à l'élève à cette étape. */
  question: string
  /** Niveaux du barème couverts. L'étape 1 annonce le 0 : aucune activité ne le sert encore. */
  niveaux: number[]
  /** Dans l'ordre de progression. */
  jalons: Jalon[]
}

// Seuil de validation d'un jalon. SANS VERROUILLAGE : il ne sert qu'à décider
// quelle étape est « courante » et quoi proposer, jamais à interdire une page.
export const SEUIL_REUSSITE = 0.8
export const SESSIONS_REQUISES = 2

/**
 * Les routes. Dupliquées ici plutôt que lues dans `HarmoniePage` : ce module est
 * pur et ne doit rien importer d'un composant.
 */
export const ROUTES_ACTIVITES: Record<ActiviteParcours, string> = {
  basse: '/harmonie/basse',
  binaire: '/harmonie/binaire',
  cadences: '/harmonie/cadences',
  detection: '/harmonie/detection',
  flux: '/harmonie/flux',
}

const [BIN_FONCTION, BIN_RENVERSEMENT, BIN_SEPTIEME] = NIVEAUX_BINAIRE

export const ETAPES: Etape[] = [
  {
    numero: 1,
    titre: 'La basse',
    question: 'Majeur ou mineur ? Quelle note à la basse ?',
    niveaux: [0, NIVEAU_DICTEE],
    // Le niveau 0 (majeur / mineur) n'a pas encore d'activité : à ajouter ici.
    jalons: [{ activite: 'basse', niveau: NIVEAU_DICTEE, conseille: true }],
  },
  {
    numero: 2,
    titre: 'Les fonctions',
    question: 'Tension ou repos ? Quelle cadence ?',
    niveaux: [BIN_FONCTION, NIVEAU_CADENCES],
    jalons: [
      { activite: 'binaire', niveau: BIN_FONCTION, conseille: true },
      { activite: 'cadences', niveau: NIVEAU_CADENCES, conseille: true },
    ],
  },
  {
    numero: 3,
    titre: 'L’état de l’accord',
    question: 'Renversé ? Avec septième ?',
    niveaux: [BIN_RENVERSEMENT, BIN_SEPTIEME],
    jalons: [
      { activite: 'binaire', niveau: BIN_RENVERSEMENT, conseille: true },
      { activite: 'binaire', niveau: BIN_SEPTIEME, conseille: true },
      { activite: 'detection', niveau: BIN_RENVERSEMENT, conseille: false },
      { activite: 'detection', niveau: BIN_SEPTIEME, conseille: false },
    ],
  },
  {
    numero: 4,
    titre: 'Chiffrer',
    question: 'Quel est le chiffrage complet ?',
    niveaux: [NIVEAU_MIN_FLUX, NIVEAU_MAX_FLUX],
    jalons: [
      { activite: 'flux', niveau: NIVEAU_MIN_FLUX, conseille: true },
      { activite: 'flux', niveau: NIVEAU_MAX_FLUX, conseille: true },
      { activite: 'detection', niveau: NIVEAU_MIN_FLUX, conseille: false },
      { activite: 'detection', niveau: NIVEAU_MAX_FLUX, conseille: false },
    ],
  },
]

// ─── Lecture de `levels` ─────────────────────────────────────────────────────

export interface StatNiveau {
  best?: number
  attempts?: number
}

/** La carte `levels` de `progress/harmonie`, telle que stockée. */
export type CarteLevels = Record<string, StatNiveau | undefined>

/**
 * Clés où une activité peut avoir écrit son résultat. Toujours au pluriel : la
 * détection garde la clé historique NUE (`"4"`), et un futur `detection:4` doit
 * être lu sans migration. Les deux sont fusionnées par `statsDuJalon`.
 */
export function clesLevels(j: Pick<Jalon, 'activite' | 'niveau'>): string[] {
  switch (j.activite) {
    case 'basse':
      return [`basse:${j.niveau}`]
    case 'binaire':
      return [`binaire:${j.niveau}`]
    case 'flux':
      return [`flux:${j.niveau}`]
    case 'cadences':
      // Seul le palier « niveau 3 » est dans le barème ; `cadences:tout` est hors parcours.
      return [`cadences:${j.niveau}`]
    case 'detection':
      return [String(j.niveau), `detection:${j.niveau}`]
  }
}

/** Fusionne les clés possibles : meilleur score le plus haut, tentatives additionnées. */
export function statsDuJalon(levels: CarteLevels, j: Jalon): { best: number; attempts: number } {
  let best = 0
  let attempts = 0
  for (const cle of clesLevels(j)) {
    const s = levels[cle]
    if (!s) continue
    best = Math.max(best, s.best ?? 0)
    attempts += s.attempts ?? 0
  }
  return { best, attempts }
}

/**
 * Validé = au moins `SESSIONS_REQUISES` tentatives ET un meilleur score au-dessus
 * du seuil.
 *
 * ⚠ `levels` ne garde que `best` et `attempts`, pas l'historique : on ne peut pas
 * vérifier « 80 % sur 2 sessions » au sens strict. C'est une approximation
 * indulgente (un seul bon score suffit, à condition d'avoir joué deux fois).
 */
export function jalonValide(levels: CarteLevels, j: Jalon): boolean {
  const { best, attempts } = statsDuJalon(levels, j)
  return attempts >= SESSIONS_REQUISES && best >= SEUIL_REUSSITE
}

// ─── Où en est l'élève ───────────────────────────────────────────────────────

export type StatutEtape = 'terminee' | 'courante' | 'a_venir'

export function conseilles(etape: Etape): Jalon[] {
  return etape.jalons.filter((j) => j.conseille)
}

export function etapeTerminee(levels: CarteLevels, etape: Etape): boolean {
  return conseilles(etape).every((j) => jalonValide(levels, j))
}

/** La première étape dont un jalon conseillé n'est pas validé ; `null` = parcours fini. */
export function etapeCourante(levels: CarteLevels): Etape | null {
  return ETAPES.find((e) => !etapeTerminee(levels, e)) ?? null
}

export function statutsEtapes(levels: CarteLevels): Record<NumeroEtape, StatutEtape> {
  const courante = etapeCourante(levels)
  const out = {} as Record<NumeroEtape, StatutEtape>
  for (const e of ETAPES) {
    out[e.numero] =
      courante === null || e.numero < courante.numero
        ? 'terminee'
        : e.numero === courante.numero
          ? 'courante'
          : 'a_venir'
  }
  return out
}

/**
 * L'exercice que propose « Continuer » : le premier jalon conseillé non validé de
 * l'étape. Étape finie (revisite) : le dernier, pour rejouer le plus avancé.
 */
export function exerciceConseille(levels: CarteLevels, etape: Etape): Jalon {
  const liste = conseilles(etape)
  return liste.find((j) => !jalonValide(levels, j)) ?? liste[liste.length - 1]
}

/** Les jalons de l'étape autres que celui proposé. */
export function alternatives(levels: CarteLevels, etape: Etape): Jalon[] {
  const propose = exerciceConseille(levels, etape)
  return etape.jalons.filter((j) => !(j.activite === propose.activite && j.niveau === propose.niveau))
}

/** Part des jalons conseillés validés, 0-1 — pour une jauge. */
export function avancementEtape(levels: CarteLevels, etape: Etape): number {
  const liste = conseilles(etape)
  return liste.filter((j) => jalonValide(levels, j)).length / liste.length
}

// ─── Les liens : route + paramètres ──────────────────────────────────────────
//
// COHABITATION. Sans paramètre, une page d'activité se comporte comme avant. Avec
// `?niveau=` elle démarre à ce niveau ; avec `&etape=` elle sait qu'elle est dans
// le parcours (sélecteur masqué, retour vers la frise).

export function lienJalon(j: Jalon, etape: NumeroEtape): string {
  return `${ROUTES_ACTIVITES[j.activite]}?niveau=${j.niveau}&etape=${etape}`
}

export interface ParametresParcours {
  niveau: number | null
  etape: NumeroEtape | null
}

/**
 * Lit `?niveau=&etape=`. Tolérant : tout ce qui est absent, non entier ou hors
 * bornes donne `null`, jamais une exception — un lien périmé ne doit pas casser
 * une page.
 */
export function lireParametresParcours(search: string | URLSearchParams): ParametresParcours {
  const p = typeof search === 'string' ? new URLSearchParams(search) : search
  const entier = (v: string | null): number | null =>
    v !== null && /^\d+$/.test(v) ? Number(v) : null

  const niveau = entier(p.get('niveau'))
  const etape = entier(p.get('etape'))
  const etapeOk = ETAPES.find((e) => e.numero === etape)?.numero ?? null
  return {
    niveau: niveau !== null && niveau <= NIVEAU_MAX_DETECTION ? niveau : null,
    etape: etapeOk,
  }
}

/**
 * Le niveau imposé par l'URL s'il est jouable par l'activité, sinon `null`.
 * Chaque page passe SES niveaux valides : ce module ne les connaît pas tous.
 *
 * ⚠ Un niveau imposé GAGNE sur les réglages relus de la dernière session : sans ça,
 * l'effet de relecture du `payload` écraserait le niveau choisi par le parcours.
 */
export function niveauImpose(
  parametres: ParametresParcours,
  valides: readonly number[],
): number | null {
  return parametres.niveau !== null && valides.includes(parametres.niveau)
    ? parametres.niveau
    : null
}

/** Le niveau imposé, ou `repli`. */
export function niveauDemande(
  parametres: ParametresParcours,
  valides: readonly number[],
  repli: number,
): number {
  return niveauImpose(parametres, valides) ?? repli
}

/** `true` si la page est ouverte depuis le parcours (donc sélecteur masqué). */
export function dansLeParcours(parametres: ParametresParcours): boolean {
  return parametres.etape !== null
}
