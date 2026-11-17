// ─── Banc : jeu A numérique (playback + élève synthétique) ────────────────────
// Reproduit le protocole §8 « jeu A » sans passage acoustique : le micro est le
// playback (retardé, atténué) plus l'élève, plus un bruit de fond. Sert à valider le
// pipeline hors ligne avant les enregistrements réels. Les temps de `verite` sont
// relatifs au chirp (t = 0), comme dans l'export de la page 7.3.

import { genererChirp } from './chirp.ts'
import { ajouterNote, type FamilleSpectre } from './eleveSynthetique.ts'
import { relationMultiple } from './fusion.ts'
import { gainPourCrete, voixDeAccord } from './synthese.ts'
import { mulberry32 } from '../../notes/rng.ts'
import { DIAPASON_PAR_DEFAUT, hzVersMidi, midiVersHz, type Accordage, type Planning, type EvenementAccord } from './types.ts'

export type NoteVerite = {
  tOn: number; tOff: number; f0Hz: number; midi: number
  famille: FamilleSpectre; vibrato: boolean; ecartCents: number
  reference: string                  // « voix 3 ×1 » ou « tempéré »
  relation: { q: number; voix: number } | null    // multiple d'une voix (±30 ¢), calculé
  accordage: Accordage; accordId: string
}
export type Verite = {
  sampleRate: number
  notes: NoteVerite[]
  phasesSansEleve: [number, number][]
  chirpT: 0
}

export type DefNote = { nom: string; midi: number; voix?: number; mult?: number }
export const NOTES_A: DefNote[] = [
  { nom: 'Mi4', midi: 64, voix: 3, mult: 1 },
  { nom: 'Do4', midi: 60, voix: 2, mult: 1 },
  { nom: 'Mi5', midi: 76, voix: 3, mult: 2 },
  { nom: 'Sol4', midi: 67, voix: 1, mult: 2 },
  { nom: 'Ré5', midi: 74 },                       // « note étrangère » du §8 (en réalité 12e de Sol3)
]

export type OptionsJeuA = {
  fs?: number
  reduit?: boolean              // 3 écarts, une famille, un accordage, 8 s de playback seul
  seed?: number
  retardMs?: number             // retard de boucle simulé
  rapportPlaybackEleveDb?: number   // H2 : le playback est plus fort que l'élève au micro
  bruitDbfs?: number
  niveauDbfs?: number
  dureeNote?: number
  vibrato?: boolean
  familles?: FamilleSpectre[]
  ecarts?: number[]
  accordages?: Accordage[]
  playbackSeulS?: number
}

export type JeuNumerique = {
  fs: number; planning: Planning; sortie: Float32Array; micro: Float32Array; verite: Verite; duree: number
}

export function construireJeuA(o: OptionsJeuA = {}): JeuNumerique {
  const fs = o.fs ?? 48000
  const rng = mulberry32(o.seed ?? 7)
  const ecarts = o.ecarts ?? (o.reduit ? [-10, 0, 14] : [-10, -2, 0, 5, 14])
  const familles = o.familles ?? (o.reduit ? ['corde'] : ['corde', 'ancheSimple'])
  const accordages: Accordage[] = o.accordages ?? (o.reduit ? ['juste'] : ['juste', 'tempere'])
  const dNote = o.dureeNote ?? 2.5
  const seul = o.playbackSeulS ?? (o.reduit ? 8 : 30)
  const t0 = 0.3                               // début du playback après le chirp
  const evenements: EvenementAccord[] = []
  const notes: NoteVerite[] = []
  const phases: [number, number][] = []
  const eleveNotes: { tDebut: number; duree: number; f0Hz: number; famille: FamilleSpectre; vibrato: boolean }[] = []
  let t = t0
  for (const accordage of accordages) {
    const voix = voixDeAccord('I', accordage)
    const debutBloc = t
    phases.push([t, t + seul]); t += seul
    for (const famille of familles) for (const def of NOTES_A) for (const ecart of ecarts) {
      const ref = def.voix !== undefined ? voix[def.voix].freqHz * (def.mult ?? 1) : midiVersHz(def.midi)
      const f0 = ref * Math.pow(2, ecart / 1200)
      notes.push({
        tOn: t, tOff: t + dNote, f0Hz: f0, midi: def.midi, famille, vibrato: !!o.vibrato, ecartCents: ecart,
        reference: def.voix !== undefined ? `voix ${def.voix} ×${def.mult}` : 'tempéré',
        relation: (() => { const r = relationMultiple(f0, voix, 30); return r ? { q: r.q, voix: r.voix } : null })(),
        accordage, accordId: 'I',
      })
      eleveNotes.push({ tDebut: t, duree: dNote, f0Hz: f0, famille, vibrato: !!o.vibrato })
      phases.push([t + dNote, t + dNote + 0.5])
      t += dNote + 0.5
    }
    evenements.push({ tDebut: debutBloc, tFin: t, accordId: 'I', accordage, voix, formule: 'tenu', attaques: [debutBloc] })
  }
  const duree = t + 0.5
  const N = Math.round(duree * fs)
  const planning: Planning = { sampleRate: fs, latenceBoucleMs: 0, evenements, gain: gainPourCrete(evenements[0].voix, o.niveauDbfs ?? -12) }

  // sortie = chirp + playback
  const sortie = new Float32Array(N)
  const chirp = genererChirp(fs)
  sortie.set(chirp)
  for (const ev of evenements) {
    const i0 = Math.floor(ev.tDebut * fs), i1 = Math.min(N, Math.ceil(ev.tFin * fs))
    for (let i = i0; i < i1; i++) {
      const tt = i / fs
      const att = Math.min(1, (tt - ev.tDebut) / 0.02), rel = Math.min(1, (ev.tFin - tt) / 0.05)
      const e = Math.min(att, rel)
      let s = 0
      for (const v of ev.voix) for (const p of v.partiels) s += p.amp * Math.sin(2 * Math.PI * p.freqHz * (tt - ev.tDebut) + p.phase0)
      sortie[i] += planning.gain * e * s
    }
  }

  // élève : synthèse puis mise à niveau relative au playback au micro
  const eleve = new Float32Array(N)
  eleveNotes.forEach((n, i) => ajouterNote(eleve, fs, { ...n, niveau: 0.1 }, 100 + i))
  const rms = (x: Float32Array, a: number, b: number) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, b - a)) }
  const rmsPlay = rms(sortie, Math.round(t0 * fs), Math.round((t0 + seul) * fs))
  const nActifs = eleveNotes.reduce((s, n) => s + Math.round(n.duree * fs), 0)
  let e2 = 0; for (let i = 0; i < N; i++) e2 += eleve[i] * eleve[i]
  const rmsEleveActif = Math.sqrt(e2 / Math.max(1, nActifs))
  const gE = rmsEleveActif > 0 ? (rmsPlay * Math.pow(10, -(o.rapportPlaybackEleveDb ?? 10) / 20)) / rmsEleveActif : 0

  // micro = sortie retardée + élève + bruit
  const retard = Math.round(((o.retardMs ?? 45) / 1000) * fs)
  const bruit = Math.pow(10, (o.bruitDbfs ?? -60) / 20)
  const micro = new Float32Array(N)
  for (let i = 0; i < N; i++) micro[i] = (i >= retard ? sortie[i - retard] : 0) + gE * eleve[i] + bruit * (rng() - 0.5) * 2
  return { fs, planning, sortie, micro, duree, verite: { sampleRate: fs, notes, phasesSansEleve: phases, chirpT: 0 } }
}

export { hzVersMidi, DIAPASON_PAR_DEFAUT }
