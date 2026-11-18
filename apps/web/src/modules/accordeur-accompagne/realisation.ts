// ─── Du modèle au son : réalisation à 4 voix, accordages, attaques (brief § 4) ─
// Logique pure. La construction du planning du moteur (partiels, enveloppes) est
// faite à l'étape moteur ; ce module fournit les hauteurs, les rôles, les cents
// et les instants d'attaque en temps musicaux (noires depuis le temps 0).

import { JUST_RATIOS_CENTS } from '../../accordeurUtils.js'
import { disposition, dispositionLibre, placer } from '../harmonie/dispositions.ts'
import { creerAccord } from '../harmonie/types.ts'
import {
  estHorsTonalite, fondamentaleRelative, nbSons, QUALITES, ROLES,
} from './qualites.ts'
import {
  VOLUME_PAR_DEFAUT_SON, indicesEntrees, nbSlots, tempsParMesure,
  type AccordageSon, type EntreeSlot, type Formule, type Phrase, type QualiteAccord, type ReglageSon, type Role,
} from './phrase.ts'

/** Valeur de départ de la basse, celle de `realiserProgression`. */
export const BASSE_INITIALE = 48

export interface VoixReelle {
  midi: number          // registre appliqué
  role: Role
  intervalle: number    // demi-tons au-dessus de la fondamentale (0–11)
  doublee: boolean      // second son du même rôle
}

export interface Realisation {
  voix: VoixReelle[]    // [basse, ténor, alto, soprano]
  basse: number         // MIDI de la basse AVANT registre (pour enchaîner `basseCible`)
  fondamentalePc: number
}

// ─── Réalisation à 4 voix ─────────────────────────────────────────────────────

/**
 * Doublure à 3 sons (règle d'Harmonie) : fondamentale à l'état fondamental et au
 * 1er renversement, basse au 2e ; un accord diminué double toujours sa tierce.
 * À 4 sons : aucune.
 */
export function doublureLibre(q: QualiteAccord, renversement: number): number | null {
  if (nbSons(q) === 4) return null
  if (QUALITES[q].famille === 'dim') return 1
  return renversement === 2 ? 2 : 0
}

export function realiserEntree(e: EntreeSlot, basseCible: number = BASSE_INITIALE, registre = 0): Realisation {
  const { mode, tonique } = e.tonalite
  const iv = QUALITES[e.qualite].intervalles
  const fondRel = fondamentaleRelative(mode, e.degre)
  const fondamentalePc = (tonique + fondRel) % 12

  let disp
  if (!estHorsTonalite(e)) {
    disp = disposition(creerAccord(0, { degre: e.degre, renversement: e.renversement, septieme: nbSons(e.qualite) === 4 }), mode)
  } else {
    const sons = iv.map((i) => fondRel + i)
    disp = dispositionLibre(sons, e.renversement, doublureLibre(e.qualite, e.renversement))
  }
  const hauteurs = placer(disp, tonique + disp.basse, basseCible)

  const vus = new Set<number>()
  const voix: VoixReelle[] = hauteurs.map((midi) => {
    const intervalle = (((midi - fondamentalePc) % 12) + 12) % 12
    const idx = iv.findIndex((v) => v % 12 === intervalle)
    if (idx < 0) throw new Error(`realiserEntree : son ${midi} hors de la qualité ${e.qualite}`)
    const doublee = vus.has(idx)
    vus.add(idx)
    return { midi: midi + registre, role: ROLES[idx], intervalle, doublee }
  })
  return { voix, basse: hauteurs[0], fondamentalePc }
}

/** Réalise toute la phrase : la basse de chaque entrée se place près de la précédente. */
export function realiserPhrase(p: Phrase): Map<number, Realisation> {
  const res = new Map<number, Realisation>()
  let basse = BASSE_INITIALE
  for (const i of indicesEntrees(p)) {
    const r = realiserEntree(p.entrees[i], basse, p.registre)
    res.set(i, r)
    basse = r.basse
  }
  return res
}

// ─── Accordages (§ 4.2) ───────────────────────────────────────────────────────

const arrondi2 = (x: number): number => parseFloat(x.toFixed(2))

/**
 * Écart au tempéré, en cents, d'un son situé à `intervalle` demi-tons de la
 * fondamentale. « juste » = mémoire « harmonique » du générateur
 * (`computeHarmonicOffsets`) : JUST_RATIOS_CENTS[i] − 100·i, sauf la septième
 * mineure d'une septième de dominante prise à 7:4 (968,825 ¢, soit −31,2 ¢).
 * « utilisateur » = `acc_temperament_user[i − 1]`, 0 si absent.
 */
export function centsAccordage(
  accordage: AccordageSon, qualite: QualiteAccord, intervalle: number, tempUser: readonly number[] = [],
): number {
  if (accordage === 'tempere') return 0
  if (accordage === 'juste') {
    const juste = qualite === 'dom7' && intervalle === 10 ? 968.825 : (JUST_RATIOS_CENTS as number[])[intervalle]
    return arrondi2(juste - intervalle * 100)
  }
  return intervalle === 0 ? 0 : arrondi2(tempUser[intervalle - 1] ?? 0)
}

/** Valeurs de réglage d'un rôle, avec leurs défauts. */
export function reglageDuRole(e: EntreeSlot, role: Role): Required<ReglageSon> & { manuel: boolean } {
  const r = e.sons[role] ?? {}
  return { cents: r.cents ?? 0, volume: r.volume ?? VOLUME_PAR_DEFAUT_SON, muet: r.muet ?? false, manuel: r.cents !== undefined }
}

/** Cents effectifs d'un rôle : réglage manuel s'il existe, sinon valeur de l'accordage. */
export function centsDuRole(e: EntreeSlot, role: Role, intervalle: number, tempUser: readonly number[] = []): number {
  const manuel = e.sons[role]?.cents
  return manuel !== undefined ? manuel : centsAccordage(e.accordage, e.qualite, intervalle, tempUser)
}

/** « Réinitialiser » : efface les réglages manuels de cents ; volumes et muets restent. */
export function reinitialiserAccordage(e: EntreeSlot): EntreeSlot {
  const sons: EntreeSlot['sons'] = {}
  for (const role of ROLES) {
    const s = e.sons[role]
    if (!s) continue
    const { cents: _c, ...reste } = s
    if (Object.keys(reste).length) sons[role] = reste
  }
  return { ...e, sons }
}

export function hzDeMidi(midi: number, diapason = 442): number {
  return diapason * Math.pow(2, (midi - 69) / 12)
}

export interface SonJoue {
  role: Role
  midi: number
  intervalle: number
  doublee: boolean
  cents: number         // cents effectifs (réglage manuel ou accordage)
  hz: number            // fréquence réglée
  volume: number
  muet: boolean
}

/** Les sons de l'accord, avec cents, fréquence, volume et muet. Tous les sons du même rôle partagent le réglage. */
export function sonsDeLEntree(e: EntreeSlot, r: Realisation, diapason = 442, tempUser: readonly number[] = []): SonJoue[] {
  return r.voix.map((v) => {
    const reg = reglageDuRole(e, v.role)
    const cents = centsDuRole(e, v.role, v.intervalle, tempUser)
    return {
      role: v.role, midi: v.midi, intervalle: v.intervalle, doublee: v.doublee, cents,
      hz: hzDeMidi(v.midi, diapason) * Math.pow(2, cents / 1200), volume: reg.volume, muet: reg.muet,
    }
  })
}

// ─── Formules, boucle, décompte (§ 4.3) ───────────────────────────────────────

export interface SegmentEntree {
  index: number          // index d'entrée (temps de départ)
  debut: number          // en temps (noires) depuis le début de la phrase
  fin: number
  formule: Formule
  attaques: number[]     // instants d'attaque, en temps
}

/** Instants d'attaque d'une entrée de `s` à `e` selon la formule. */
export function attaquesDeFormule(formule: Formule, s: number, e: number): number[] {
  const pas = formule === 'tenu' ? Infinity : formule === 'blanche' ? 2 : formule === 'noire' ? 1 : 0.5
  const out: number[] = []
  for (let t = s; t < e - 1e-9; t += pas) { out.push(t); if (pas === Infinity) break }
  return out
}

/**
 * Découpe la phrase en segments d'entrées. Chaque entrée EXPLICITE déclenche une
 * attaque en `s`, même si son contenu est identique à la précédente ; les slots
 * auto-remplis prolongent l'entrée en cours.
 */
export function segmentsDePhrase(p: Phrase): SegmentEntree[] {
  const idx = indicesEntrees(p)
  const fin = nbSlots(p)
  return idx.map((i, n) => {
    const e = idx[n + 1] ?? fin
    const entree = p.entrees[i]
    return { index: i, debut: i, fin: e, formule: entree.formule, attaques: attaquesDeFormule(entree.formule, i, e) }
  })
}

/**
 * Clics du décompte : un par temps de la mesure précédant le départ, le premier
 * accentué. Instants négatifs (en temps, relatifs au temps 0). Seulement au premier départ.
 */
export function clicsDecompte(p: Phrase): { t: number; accent: boolean }[] {
  if (!p.decompte) return []
  const pm = tempsParMesure(p.mesure)
  return Array.from({ length: pm }, (_, i) => ({ t: i - pm, accent: i === 0 }))
}

/** Durée d'une noire en secondes. */
export function dureeTempsS(p: Phrase): number {
  return 60 / p.tempo
}

/** Durée d'un tour de phrase en secondes. */
export function dureeTourS(p: Phrase): number {
  return nbSlots(p) * dureeTempsS(p)
}
