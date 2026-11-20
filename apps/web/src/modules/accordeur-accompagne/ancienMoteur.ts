// ─── Ancien moteur de détection (celui de l'Accordeur) sur la session de la page ────
// Micro SEUL, sans modèle de l'accompagnement : hauteur MPM par trame, gate RMS normalisé,
// seuil de clarté, segmentation par silence / saut de hauteur / ré-attaque. Le gate haut
// suffit à écarter l'accompagnement. Les trames brutes ne dépendent d'aucun réglage : on les
// calcule une fois (au fil de l'eau pendant le jeu) et on ré-applique les seuils à volonté.
//
// Logique pure : tourne dans le Worker (Live) comme sur le fil principal (recalcul).

import {
  TAILLE_TRAME, PAS_TRAME, analyserTramesBrutes, appliquerSeuils, nbTramesBrutes, segmenter,
} from '../../accordeurUtils.js'
import type { NoteBrute } from './annotation.ts'
import { changementsDAccord } from './dsp/pipeline.ts'
import type { Planning } from './dsp/types.ts'
import type { ReglagesSegmentation } from '../../profilsSegmentation.ts'

export type { ReglagesSegmentation }

/** Trames brutes (indice k = échantillons [k·512, k·512 + 2048) du micro). */
export interface BrutAncien {
  hz: ArrayLike<number>
  clarity: ArrayLike<number>
  rms: ArrayLike<number>
}

export interface NoteAncien extends NoteBrute { ouverte: boolean }

/** Série brute qui grandit avec le micro : seules les nouvelles trames sont calculées. */
export class SerieBrute {
  readonly hz: number[] = []
  readonly clarity: number[] = []
  readonly rms: number[] = []

  get n(): number { return this.hz.length }

  /** Calcule les trames devenues complètes ; renvoie le nombre de trames ajoutées. */
  avancer(micro: Float32Array, fs: number): number {
    const k1 = nbTramesBrutes(micro.length)
    if (k1 <= this.n) return 0
    const b = analyserTramesBrutes(micro, fs, this.n, k1) as { hz: number[]; clarity: number[]; rms: number[] }
    for (let i = 0; i < b.hz.length; i++) { this.hz.push(b.hz[i]); this.clarity.push(b.clarity[i]); this.rms.push(b.rms[i]) }
    return b.hz.length
  }

  vider(): void { this.hz.length = 0; this.clarity.length = 0; this.rms.length = 0 }

  /** Copie compacte pour le transfert (Float32 suffit : 1e-3 ¢ de précision). */
  exporter(): { hz: Float32Array; clarity: Float32Array; rms: Float32Array } {
    return { hz: Float32Array.from(this.hz), clarity: Float32Array.from(this.clarity), rms: Float32Array.from(this.rms) }
  }
}

/** Centre d'une trame (s) : l'ancien moteur date une trame par son début, on date par son milieu. */
const DEMI_TRAME_MS = (TAILLE_TRAME / 2)

type Seg = { debutMs: number; finMs: number; frames: { tMs: number; hz: number }[] }

/** Une note (ou un morceau de note) : hauteur moyenne en cents (comme μ de l'Accordeur), σ intra. */
function noteDe(frames: { tMs: number; hz: number }[], fs: number, offsetS: number, coupeAvant: boolean, coupeApres: boolean): NoteAncien | null {
  if (!frames.length) return null
  const decalage = DEMI_TRAME_MS / fs * 1000
  const lnMoy = frames.reduce((a, f) => a + Math.log2(f.hz), 0) / frames.length
  const f0Hz = Math.pow(2, lnMoy)
  const cents = frames.map(f => 1200 * Math.log2(f.hz / f0Hz))
  const sigmaIntra = Math.sqrt(cents.reduce((a, c) => a + c * c, 0) / cents.length)
  // incertitude d'estimation : variabilité / √n, avec un plancher (une trame ne vaut pas 0 ¢)
  const sigma = Math.max(0.5, sigmaIntra / Math.sqrt(frames.length))
  const t = (ms: number): number => (ms + decalage) / 1000 - offsetS
  return {
    tOn: t(frames[0].tMs), tOff: t(frames[frames.length - 1].tMs), f0Hz,
    sigmaCents: sigma, sigmaIntraCents: sigmaIntra,
    ...(coupeAvant ? { coupeAvant: true } : {}), ...(coupeApres ? { coupeApres: true } : {}),
    ouverte: false,
  }
}

export interface OptionsNotes {
  fs: number
  /** Retard de boucle (s) : l'instant t du planning est entendu au micro à t + offsetS. */
  offsetS: number
  diapason: number
  planning: Planning
  reglages: ReglagesSegmentation
}

/**
 * Notes de la série brute. Une note tenue à travers un changement d'accord est coupée en deux
 * morceaux (même règle que le nouveau moteur) ; la dernière note est « ouverte » si elle vient
 * de se terminer (< silence + 1 trame avant la fin du signal) : utile en Live.
 */
export function notesAncien(brut: BrutAncien, o: OptionsNotes): NoteAncien[] {
  const r = o.reglages
  const n = brut.hz.length
  if (!n) return []
  const serie = appliquerSeuils(brut, o.fs, { clarityThreshold: r.clarityThreshold, rmsGate: r.gateLevel }) as { tMs: number; hz: number | null }[]
  const segs = segmenter(serie, o.diapason, {
    silenceDurationMs: r.silenceDurationMs, noteJumpCents: r.noteJumpCents,
    minNoteDurationMs: r.minNoteDurationMs, reattackDropRatio: r.reattackDropRatio,
  }) as Seg[]
  const dernierMs = serie[serie.length - 1].tMs
  const out: NoteAncien[] = []
  for (const s of segs) {
    const decalage = DEMI_TRAME_MS / o.fs * 1000
    const tOn = (s.debutMs + decalage) / 1000 - o.offsetS, tOff = (s.finMs + decalage) / 1000 - o.offsetS
    const bornes = [tOn, ...changementsDAccord(o.planning, tOn, tOff), tOff]
    for (let i = 0; i + 1 < bornes.length; i++) {
      const x0 = bornes[i], x1 = bornes[i + 1]
      const fr = bornes.length === 2 ? s.frames
        : s.frames.filter(f => (f.tMs + decalage) / 1000 - o.offsetS >= x0 - 1e-9 && (f.tMs + decalage) / 1000 - o.offsetS < x1 - 1e-9)
      const note = noteDe(fr, o.fs, o.offsetS, i > 0, i + 2 < bornes.length)
      if (note) out.push(note)
    }
  }
  const der = out[out.length - 1]
  if (der && segs.length && dernierMs - segs[segs.length - 1].finMs <= r.silenceDurationMs + 2 * PAS_TRAME / o.fs * 1000) der.ouverte = true
  return out
}
