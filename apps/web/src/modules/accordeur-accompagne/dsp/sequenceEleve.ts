// ─── Séquence de l'élève synthétique (spec §7.3) ──────────────────────────────
// Un chirp d'alignement, 2 s de silence, puis les notes. `verite` donne les instants
// relatifs au chirp et les fréquences absolues. Jouée par un second appareil posé à
// l'emplacement de l'instrument.

import { genererChirp } from './chirp.ts'
import { NOTES_A, type NoteVerite, type Verite } from './banc.ts'
import { ajouterNote, type FamilleSpectre } from './eleveSynthetique.ts'
import { relationMultiple } from './fusion.ts'
import { voixDeAccord } from './synthese.ts'
import { midiVersHz, type Accordage } from './types.ts'

export type OptionsSequence = {
  fs: number
  accordId?: string
  accordage: Accordage
  notes: string[]               // noms : Mi4, Do4, Mi5, Sol4, Ré5
  ecarts: number[]
  famille: FamilleSpectre
  dureeNote: number             // 2.5 | 0.5 | 0.25 | 0.125
  pause?: number
  vibrato: boolean
  niveau?: number
}

export const SILENCE_APRES_CHIRP_S = 2

export function construireSequenceEleve(o: OptionsSequence): { signal: Float32Array; verite: Verite; duree: number } {
  const voix = voixDeAccord(o.accordId ?? 'I', o.accordage)
  const pause = o.pause ?? 0.5
  const chirp = genererChirp(o.fs)
  let t = chirp.length / o.fs + SILENCE_APRES_CHIRP_S
  const defs = NOTES_A.filter(n => o.notes.includes(n.nom))
  const duree = t + defs.length * o.ecarts.length * (o.dureeNote + pause) + 0.5
  const signal = new Float32Array(Math.ceil(duree * o.fs))
  signal.set(chirp)
  const notes: NoteVerite[] = []
  const phases: [number, number][] = [[0.05, t]]
  let i = 0
  for (const def of defs) for (const ecart of o.ecarts) {
    const ref = def.voix !== undefined ? voix[def.voix].freqHz * (def.mult ?? 1) : midiVersHz(def.midi)
    const f0 = ref * Math.pow(2, ecart / 1200)
    ajouterNote(signal, o.fs, { tDebut: t, duree: o.dureeNote, f0Hz: f0, famille: o.famille, vibrato: o.vibrato, niveau: o.niveau ?? 0.5 }, 500 + i++)
    const r = relationMultiple(f0, voix, 30)
    notes.push({
      tOn: t, tOff: t + o.dureeNote, f0Hz: f0, midi: def.midi, famille: o.famille, vibrato: o.vibrato, ecartCents: ecart,
      reference: def.voix !== undefined ? `voix ${def.voix} ×${def.mult}` : 'tempéré',
      relation: r ? { q: r.q, voix: r.voix } : null, accordage: o.accordage, accordId: o.accordId ?? 'I',
    })
    phases.push([t + o.dureeNote, t + o.dureeNote + pause])
    t += o.dureeNote + pause
  }
  return { signal, verite: { sampleRate: o.fs, notes, phasesSansEleve: phases, chirpT: 0 }, duree }
}
