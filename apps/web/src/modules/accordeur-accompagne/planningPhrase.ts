// ─── Planning d'une phrase entière (brief UI v1, § 4.3 et § 4.4.1) ─────────────
// Construit le `Planning` du moteur (événements, décompte, gain) à partir d'une phrase :
// départ à un temps donné, boucle déroulée sur la durée demandée, sons muets exclus de
// la synthèse mais conservés dans `Voix` (drapeau `muet`), réglages de volume intégrés.
//
// Horloge du planning : t = 0 au départ du worklet (chirp), la musique commence en `t0`.
// Boucle : les tours se suivent sans silence ; on déroule les événements jusqu'à `dureeS`
// (les réglages en cours de lecture sont appliqués aux événements déroulés).

import { gainPourCrete, partielsDe } from './dsp/synthese.ts'
import type { EvenementAccord, Planning, Voix } from './dsp/types.ts'
import { DIAPASON_PAR_DEFAUT } from './dsp/types.ts'
import { nbSlots, tempsParMesure, type Phrase } from './phrase.ts'
import { clicsDecompte, dureeTempsS, realiserPhrase, segmentsDePhrase, sonsDeLEntree, type Realisation } from './realisation.ts'

/** Marge laissée au chirp d'alignement (50 ms) avant le premier clic ou la première note. */
export const MARGE_CHIRP_S = 0.3

export type OptionsPlanningPhrase = {
  sampleRate: number
  diapason?: number
  tempUser?: readonly number[]
  niveauDbfs?: number         // crête du mélange (défaut −12)
  departSlot?: number         // temps de départ (« ▶ part du slot sélectionné »)
  avecDecompte?: boolean      // seulement au premier départ
  dureeS?: number             // durée à dérouler (boucle) ; défaut : un tour
  latenceBoucleMs?: number
  t0Force?: number            // imposer l'instant de départ de la musique (changement de structure à chaud)
  tenuInfini?: boolean        // « Tenir l'accord » : l'entrée 0 sonne sans fin (un seul événement)
}

export type PlanningPhrase = {
  planning: Planning
  t0: number                  // instant (s) où commence le slot `departSlot`
  departSlot: number
  noireS: number
  nbSlots: number
}

function voixDe(p: Phrase, indexEntree: number, real: Map<number, Realisation>, diapason: number, tempUser: readonly number[]): Voix[] {
  const e = p.entrees[indexEntree]
  return sonsDeLEntree(e, real.get(indexEntree)!, diapason, tempUser).map(s => ({
    midi: s.midi, cents: s.cents, freqHz: s.hz, role: s.role, muet: s.muet, volume: s.volume,
    partiels: partielsDe(s.hz).map(q => ({ ...q, amp: s.muet ? 0 : q.amp * s.volume })),
  }))
}

export function construirePlanningPhrase(p: Phrase, o: OptionsPlanningPhrase): PlanningPhrase {
  const diapason = o.diapason ?? DIAPASON_PAR_DEFAUT
  const tempUser = o.tempUser ?? []
  const noire = dureeTempsS(p)
  const n = nbSlots(p)
  const depart = Math.min(Math.max(0, Math.floor(o.departSlot ?? 0)), n - 1)
  const pm = tempsParMesure(p.mesure)
  const decompte = !!o.avecDecompte && !!p.decompte
  const t0 = o.t0Force ?? MARGE_CHIRP_S + (decompte ? pm * noire : 0)
  const real = realiserPhrase(p)
  const segments = segmentsDePhrase(p)
  const dureeS = o.dureeS ?? (n - depart) * noire + t0     // un seul tour par défaut

  // voix par entrée, calculées une fois
  const voixParEntree = new Map<number, Voix[]>()
  for (const s of segments) voixParEntree.set(s.index, voixDe(p, s.index, real, diapason, tempUser))

  const gainDe = (): number => {
    // gain maître : la crête du mélange (volumes compris) de l'entrée la plus forte vaut `niveauDbfs`
    let gain = Infinity
    for (const v of voixParEntree.values()) {
      const g = gainPourCrete(v.filter(x => !x.muet), o.niveauDbfs ?? -12)
      if (g > 0 && g < gain) gain = g
    }
    return (Number.isFinite(gain) ? gain : 0.1) * p.volume
  }

  if (o.tenuInfini) {
    const e0 = p.entrees[0]
    const unique: EvenementAccord = {
      tDebut: t0, tFin: o.dureeS ?? 3600, accordId: 'e0', accordage: e0.accordage, voix: voixParEntree.get(0)!,
      formule: 'tenu', attaques: [t0], entree: 0,
    }
    return {
      planning: { sampleRate: o.sampleRate, latenceBoucleMs: o.latenceBoucleMs ?? 0, evenements: [unique], gain: gainDe(), clics: [] },
      t0, departSlot: 0, noireS: noire, nbSlots: n,
    }
  }

  const evenements: EvenementAccord[] = []
  const heure = (beat: number): number => t0 + beat * noire
  for (let tour = 0; ; tour++) {
    const decalage = tour * n - depart                 // temps (noires) du slot 0 de ce tour, relatif au départ
    if (tour > 0 && !p.boucle) break
    if (heure(decalage) >= dureeS - 1e-9) break
    for (const s of segments) {
      let att = s.attaques.map(a => a)
      if (tour === 0) {
        att = att.filter(a => a >= depart)
        // le départ tombe dans une entrée déjà commencée : on attaque au slot de départ
        if (s.debut < depart && s.fin > depart) att = [depart, ...att]
      }
      if (!att.length) continue
      att.forEach((a, i) => {
        const finBeat = i + 1 < att.length ? att[i + 1] : s.fin
        const tDebut = heure(decalage + a), tFin = heure(decalage + finBeat)
        if (tDebut >= dureeS - 1e-9) return
        evenements.push({
          tDebut, tFin, accordId: `e${s.index}`, accordage: p.entrees[s.index].accordage,
          voix: voixParEntree.get(s.index)!, formule: s.formule, attaques: [tDebut], entree: s.index,
        })
      })
    }
  }
  evenements.sort((a, b) => a.tDebut - b.tDebut)

  const gain = gainDe()

  const clics = decompte ? clicsDecompte(p).map(c => ({ t: heure(c.t), accent: c.accent })) : []
  return {
    planning: { sampleRate: o.sampleRate, latenceBoucleMs: o.latenceBoucleMs ?? 0, evenements, gain, clics },
    t0, departSlot: depart, noireS: noire, nbSlots: n,
  }
}

/** Temps musical (noires depuis le temps 0 de la phrase, tours cumulés) à l'instant t du planning. */
export function tempsMusical(pp: PlanningPhrase, t: number): number {
  return pp.departSlot + (t - pp.t0) / pp.noireS
}

/** Slot (0-based) et tour de boucle à l'instant t. */
export function slotEtTour(pp: PlanningPhrase, t: number): { slot: number; tour: number; fraction: number } {
  const m = tempsMusical(pp, t)
  const tour = Math.floor(m / pp.nbSlots)
  const dans = m - tour * pp.nbSlots
  return { slot: Math.floor(dans), tour, fraction: dans - Math.floor(dans) }
}
