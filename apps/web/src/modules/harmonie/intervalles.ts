// ─── Activité « reconnaissance d'intervalles » — logique pure ────────────────
//
// HORS BARÈME, délibérément (décidé avec Matthieu). Reconnaître une tierce majeure
// n'est pas une compétence de fonction harmonique : ça n'entre pas dans `NIVEAUX`,
// et rien n'est renuméroté. L'activité a sa propre échelle de difficulté.
//
// ⚠ LA DISSYMÉTRIE DES QUALITÉS EST MUSICALE, pas un raccourci d'implémentation.
// Unisson, quarte et quinte sont JUSTES : elles n'ont ni majeur ni mineur, mais
// admettent augmenté et diminué. Seconde, tierce, sixte et septième sont majeures
// ou mineures. La roue suit cette différence — sur un secteur juste le clic sec
// vaut « juste », sur un secteur à qualité il n'existe pas de repos neutre et le
// glissement est obligatoire (`SecteurRoue.defaut === null`).

import { mulberry32 } from './rng.ts'
import { type SecteurRoue } from './roue.ts'

export type QualiteIntervalle = 'diminuée' | 'mineure' | 'juste' | 'Majeure' | 'augmentée'

/** `nombre` : 1 = unisson … 7 = septième. Pas d'octave — la roue n'a que 7 secteurs. */
export interface IntervalleNomme {
  nombre: number
  qualite: QualiteIntervalle
}

/** Les intervalles sans majeur ni mineur. */
export const NOMBRES_JUSTES: readonly number[] = [1, 4, 5]

/** Demi-tons de l'intervalle « naturel » — juste pour 1/4/5, majeur sinon. */
const BASE: readonly number[] = [0, 0, 2, 4, 5, 7, 9, 11]

export const LABELS_NOMBRE: readonly string[] = ['', '1re', '2de', '3ce', '4te', '5te', '6te', '7e']

export function estJuste(nombre: number): boolean {
  return NOMBRES_JUSTES.includes(nombre)
}

/** Qualités praticables sur un nombre, ordonnées du plus PETIT au plus GRAND. */
export function qualitesDe(nombre: number): QualiteIntervalle[] {
  return estJuste(nombre)
    ? ['diminuée', 'juste', 'augmentée']
    : ['mineure', 'Majeure']
}

export function demiTons(intervalle: IntervalleNomme): number {
  const { nombre, qualite } = intervalle
  if (nombre < 1 || nombre > 7) throw new Error(`demiTons : nombre invalide (${nombre})`)

  const juste = estJuste(nombre)
  const base = BASE[nombre]

  switch (qualite) {
    case 'juste':
      if (!juste) throw new Error(`demiTons : une ${LABELS_NOMBRE[nombre]} n'est jamais juste`)
      return base
    case 'Majeure':
    case 'mineure':
      if (juste) {
        throw new Error(
          `demiTons : une ${LABELS_NOMBRE[nombre]} n'est ni majeure ni mineure`,
        )
      }
      return qualite === 'Majeure' ? base : base - 1
    case 'augmentée':
      return base + 1
    case 'diminuée':
      // Depuis le juste pour 1/4/5, depuis le MINEUR sinon — un intervalle
      // diminué est toujours un demi-ton sous le plus petit intervalle usuel.
      return juste ? base - 1 : base - 2
  }
}

export function nomIntervalle(i: IntervalleNomme): string {
  return `${LABELS_NOMBRE[i.nombre]} ${i.qualite}`
}

export function memeIntervalle(a: IntervalleNomme, b: IntervalleNomme): boolean {
  return a.nombre === b.nombre && a.qualite === b.qualite
}

// ─── Les secteurs de la roue ─────────────────────────────────────────────────
//
// Unisson en haut, puis dans l'ordre en tournant à droite. C'est la même
// disposition que la roue des notes : le geste est déjà connu.

export const SECTEURS_INTERVALLES: SecteurRoue[] = Array.from({ length: 7 }, (_, i) => {
  const nombre = i + 1
  const qualites = qualitesDe(nombre)
  return {
    cle: String(nombre),
    label: LABELS_NOMBRE[nombre],
    qualites,
    // Les justes ont un repos (« juste ») ; les autres n'en ont pas — il n'existe
    // pas de tierce neutre, donc le glissement y est obligatoire.
    defaut: estJuste(nombre) ? qualites.indexOf('juste') : null,
  }
})

// ─── Pools de difficulté ─────────────────────────────────────────────────────

const j = (nombre: number, qualite: QualiteIntervalle): IntervalleNomme => ({ nombre, qualite })

const FACILE: IntervalleNomme[] = [
  j(5, 'juste'),
  j(3, 'Majeure'),
  j(3, 'mineure'),
  j(2, 'Majeure'),
]

const MOYEN: IntervalleNomme[] = [
  ...FACILE,
  j(4, 'juste'),
  j(6, 'Majeure'),
  j(6, 'mineure'),
  j(2, 'mineure'),
]

const COMPLET: IntervalleNomme[] = [
  ...MOYEN,
  j(7, 'Majeure'),
  j(7, 'mineure'),
  j(1, 'juste'),
  j(4, 'augmentée'),
  j(5, 'diminuée'),
]

export const POOLS = { facile: FACILE, moyen: MOYEN, complet: COMPLET }
export type NiveauIntervalles = keyof typeof POOLS

export const LABELS_POOL: Record<NiveauIntervalles, string> = {
  facile: 'Facile',
  moyen: 'Moyen',
  complet: 'Complet',
}

// ─── Session ─────────────────────────────────────────────────────────────────

export const ITEMS_PAR_SESSION_INTERVALLES = 10

/** Fenêtre de tessiture de la note grave — l'aigu reste sous 78 (fa♯4). */
const BASSE_MIN = 55
const BASSE_MAX = 67

export type Presentation = 'arpege' | 'plaque'

export interface ItemIntervalle {
  index: number
  intervalle: IntervalleNomme
  /** MIDI : grave puis aigu. Identiques sur un unisson. */
  hauteurs: [number, number]
  presentation: Presentation
}

export interface ReponseIntervalle {
  index: number
  attendu: IntervalleNomme
  repondu: IntervalleNomme
  correct: boolean
  /** Vrai si le NOMBRE est juste — l'élève a mesuré l'écart, pas la couleur. */
  nombreJuste: boolean
  rtMs: number
  presentation: Presentation
}

export function construireItemIntervalle(
  niveau: NiveauIntervalles,
  graine: number,
  rang: number,
): ItemIntervalle {
  const pool = POOLS[niveau]
  const rng = mulberry32(graine + rang * 1009)

  const intervalle = pool[Math.floor(rng() * pool.length) % pool.length]
  const grave = BASSE_MIN + Math.floor(rng() * (BASSE_MAX - BASSE_MIN + 1))

  return {
    index: rang,
    intervalle,
    hauteurs: [grave, grave + demiTons(intervalle)],
    // Alternance stricte : un item sur deux. Mélanger arpégé et plaqué au hasard
    // rendrait la difficulté illisible d'une session à l'autre.
    presentation: rang % 2 === 0 ? 'arpege' : 'plaque',
  }
}

export function construireSessionIntervalles(
  niveau: NiveauIntervalles,
  graine: number,
  nombreItems: number = ITEMS_PAR_SESSION_INTERVALLES,
): ItemIntervalle[] {
  return Array.from({ length: nombreItems }, (_, rang) =>
    construireItemIntervalle(niveau, graine, rang),
  )
}

// ─── Score ───────────────────────────────────────────────────────────────────

export interface ResumeIntervalles {
  score: number
  itemCount: number
  accuracy: number
  medianRtMs: number
  /** Part des items où le NOMBRE était juste, même avec la mauvaise qualité. */
  precisionNombre: number
}

function mediane(valeurs: number[]): number {
  if (valeurs.length === 0) return 0
  const tri = [...valeurs].sort((a, b) => a - b)
  const milieu = Math.floor(tri.length / 2)
  return tri.length % 2 === 0 ? (tri[milieu - 1] + tri[milieu]) / 2 : tri[milieu]
}

export function scorerIntervalles(reponses: readonly ReponseIntervalle[]): ResumeIntervalles {
  const itemCount = reponses.length
  const accuracy = itemCount === 0 ? 0 : reponses.filter((r) => r.correct).length / itemCount

  return {
    score: Math.round(accuracy * 100),
    itemCount,
    accuracy,
    medianRtMs: Math.round(mediane(reponses.map((r) => r.rtMs))),
    precisionNombre:
      itemCount === 0 ? 0 : reponses.filter((r) => r.nombreJuste).length / itemCount,
  }
}
