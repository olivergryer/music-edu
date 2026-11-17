// ─── Synthèse additive du playback (spec §6.1) ────────────────────────────────
// 8 partiels d'amplitude 1/k, phase 0 à chaque attaque. Enveloppe : attaque 20 ms,
// relâchement 50 ms ; ni vibrato, ni trémolo, ni chorus, ni réverbération.

import {
  DIAPASON_PAR_DEFAUT, midiVersHz,
  type Accordage, type EvenementAccord, type Formule, type Partiel, type Planning, type Voix,
} from './types.ts'

export const NB_PARTIELS = 8
export const ATTAQUE_S = 0.020
export const RELACHEMENT_S = 0.050

/** Accords de test (do majeur), registre médium (spec §8). */
export const ACCORDS: Record<string, { racine: number; midis: number[] }> = {
  I:  { racine: 48, midis: [48, 55, 60, 64] },   // Do3 Sol3 Do4 Mi4
  V7: { racine: 43, midis: [43, 59, 62, 65] },   // Sol2 Si3 Ré4 Fa4
}

/** Écart (¢) au tempéré, par intervalle en demi-tons au-dessus de la fondamentale de l'accord. */
const ECART_JUSTE_CENTS: Record<number, number> = {
  0: 0,
  3: 15.64,    // tierce mineure 6:5
  4: -13.69,   // tierce majeure 5:4
  7: 1.96,     // quinte 3:2
  10: -31.17,  // septième mineure 7:4
}

export function partielsDe(freqHz: number, nb = NB_PARTIELS): Partiel[] {
  return Array.from({ length: nb }, (_, i) => ({ k: i + 1, freqHz: (i + 1) * freqHz, amp: 1 / (i + 1), phase0: 0 }))
}

export function voixDeAccord(accordId: string, accordage: Accordage, diapason = DIAPASON_PAR_DEFAUT): Voix[] {
  const def = ACCORDS[accordId]
  if (!def) throw new Error(`Accord inconnu : ${accordId}`)
  return def.midis.map(midi => {
    const intervalle = (((midi - def.racine) % 12) + 12) % 12
    const cents = accordage === 'juste' ? (ECART_JUSTE_CENTS[intervalle] ?? 0) : 0
    const freqHz = midiVersHz(midi, diapason) * Math.pow(2, cents / 1200)
    return { midi, cents, freqHz, partiels: partielsDe(freqHz) }
  })
}

/** Enveloppe d'un événement à l'instant t (secondes). */
export function enveloppe(t: number, ev: Pick<EvenementAccord, 'tDebut' | 'tFin'>): number {
  if (t < ev.tDebut || t >= ev.tFin) return 0
  const a = Math.min(1, (t - ev.tDebut) / ATTAQUE_S)
  const r = Math.min(1, (ev.tFin - t) / RELACHEMENT_S)
  return Math.min(a, r)
}

/** Gain maître tel que la crête du mélange vaille `dbfs` (−24, −12, −6). */
export function gainPourCrete(voix: Voix[], dbfs: number, fs = 32000): number {
  let crete = 0
  const n = fs   // 1 s
  for (let i = 0; i < n; i++) {
    const t = i / fs
    let s = 0
    for (const v of voix) for (const p of v.partiels) s += p.amp * Math.sin(2 * Math.PI * p.freqHz * t + p.phase0)
    if (Math.abs(s) > crete) crete = Math.abs(s)
  }
  return crete > 0 ? Math.pow(10, dbfs / 20) / crete : 0
}

export type OptionsPlanning = {
  accordId: string
  accordage: Accordage
  formule: Formule
  tempo?: number          // bpm, défaut 90
  duree: number           // secondes
  diapason?: number
  sampleRate: number
  tDebut?: number
  niveauDbfs?: number     // −24 | −12 | −6 (défaut −12)
  latenceBoucleMs?: number
}

/** Fraction de la période réellement sonore pour les formules répétées (laisse le relâchement). */
const FRACTION_SONORE = 0.9

export function construirePlanning(o: OptionsPlanning): Planning {
  const diapason = o.diapason ?? DIAPASON_PAR_DEFAUT
  const tempo = o.tempo ?? 90
  const t0 = o.tDebut ?? 0
  const voix = voixDeAccord(o.accordId, o.accordage, diapason)
  const noire = 60 / tempo
  const periode =
    o.formule === 'blanche' ? 2 * noire :
    o.formule === 'noire'   ? noire :
    o.formule === 'croche'  ? noire / 2 :
    o.formule === 'clignotant' ? 4 : o.duree
  const evenements: EvenementAccord[] = []
  for (let t = 0; t < o.duree - 1e-9; t += periode) {
    const debut = t0 + t
    let fin: number
    if (o.formule === 'tenu') fin = t0 + o.duree
    else if (o.formule === 'clignotant') fin = debut + 2           // 2 s joué, 2 s de silence
    else fin = debut + periode * FRACTION_SONORE
    fin = Math.min(fin, t0 + o.duree)
    evenements.push({ tDebut: debut, tFin: fin, accordId: o.accordId, accordage: o.accordage, voix, formule: o.formule, attaques: [debut] })
  }
  return {
    sampleRate: o.sampleRate,
    latenceBoucleMs: o.latenceBoucleMs ?? 0,
    evenements,
    gain: gainPourCrete(voix, o.niveauDbfs ?? -12),
  }
}

/** Rend le signal numérique du playback (le contenu de `sortie.wav`). */
export function rendrePlayback(planning: Planning, nEchantillons: number, n0 = 0): Float32Array {
  const fs = planning.sampleRate
  const out = new Float32Array(nEchantillons)
  for (const ev of planning.evenements) {
    const i0 = Math.max(n0, Math.floor(ev.tDebut * fs))
    const i1 = Math.min(n0 + nEchantillons, Math.ceil(ev.tFin * fs))
    for (let i = i0; i < i1; i++) {
      const t = i / fs
      const e = enveloppe(t, ev)
      if (e === 0) continue
      const tau = t - ev.tDebut                // phase 0 à l'attaque
      let s = 0
      for (const v of ev.voix) for (const p of v.partiels) s += p.amp * Math.sin(2 * Math.PI * p.freqHz * tau + p.phase0)
      out[i - n0] += planning.gain * e * s
    }
  }
  return out
}
