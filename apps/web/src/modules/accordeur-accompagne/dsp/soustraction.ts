// ─── Soustraction du playback + MPM sur le résidu (spec §6.3) ─────────────────
// Dans chaque trame, on ajuste l'amplitude complexe de chaque partiel du playback
// par moindres carrés (partiels voisins fusionnés), puis on la retranche. Le résidu
// passe ensuite dans la chaîne existante (pré-accentuation + pitchy/MPM).

import { PitchDetector } from 'pitchy'
import { preEmphasis, HZ_MIN, HZ_MAX } from '../../../accordeurUtils.js'
import { fusionnerPartiels } from './fusionPartiels.ts'
import { creerContexte } from './modeleConjoint.ts'
import type { Voix } from './types.ts'

/**
 * Profil « accompagné » : initialisé avec les paramètres du profil legato
 * (AccordeurPage `_ACC_PROFILES_DEFAULTS`), À RECALIBRER pendant le spike.
 * Les portes sont relatives (résidu rapporté au niveau du playback au micro) pour
 * rester portables d'un appareil à l'autre (l'iPad capte ~100× plus faible que l'iPhone).
 */
export const PROFIL_ACCOMPAGNE = {
  clarityThreshold: 0.70,
  gateRelatif: 0.03,        // rmsRésidu / rmsPlayback
  gateAbsolu: 1e-4,         // plancher anti-bruit numérique
  silenceDurationMs: 105,
  noteJumpCents: 25,
  minNoteDurationMs: 85,
  reattackDropRatio: 0,
}

export type ResultatSoustraction = { residu: Float32Array; rmsResidu: number; rmsPlayback: number }

const rms = (x: ArrayLike<number>) => { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s / x.length) }

export function soustrairePlayback(trame: Float32Array, fs: number, voix: Voix[]): ResultatSoustraction {
  const N = trame.length
  const pb = fusionnerPartiels(voix, N / fs, 0.45 * fs)
  const ctx = creerContexte(trame, fs, pb)
  const fit = new Float32Array(N)
  for (let j = 0; j < ctx.P; j++) {
    const om = ctx.omPb[j]
    const a = ctx.u[2 * j], b = ctx.u[2 * j + 1]
    const dc = Math.cos(om), ds = Math.sin(om)
    let c = 1, s = 0
    for (let n = 0; n < N; n++) {
      fit[n] += a * c + b * s
      const nc = c * dc - s * ds; s = s * dc + c * ds; c = nc
    }
  }
  const residu = new Float32Array(N)
  for (let n = 0; n < N; n++) residu[n] = trame[n] - fit[n]
  return { residu, rmsResidu: rms(residu), rmsPlayback: rms(fit) }
}

const _detecteurs = new Map<number, ReturnType<typeof PitchDetector.forFloat32Array>>()

export type DetectionMpm = { f0Hz: number | null; clarte: number; hzBrut: number }

/** MPM sur un signal (pré-accentué), avec portes de clarté et de plage. */
export function mpm(signal: Float32Array, fs: number, clarityThreshold = PROFIL_ACCOMPAGNE.clarityThreshold): DetectionMpm {
  let det = _detecteurs.get(signal.length)
  if (!det) { det = PitchDetector.forFloat32Array(signal.length); _detecteurs.set(signal.length, det) }
  const [hz, clarte] = det.findPitch(preEmphasis(signal), fs)
  const ok = clarte >= clarityThreshold && hz >= HZ_MIN && hz <= HZ_MAX
  return { f0Hz: ok ? hz : null, clarte, hzBrut: hz }
}

/** Piste rapide complète : soustraction → portes relatives → MPM. */
export function detecterSurResidu(trame: Float32Array, fs: number, voix: Voix[], profil = PROFIL_ACCOMPAGNE) {
  const s = soustrairePlayback(trame, fs, voix)
  const rel = s.rmsPlayback > 0 ? s.rmsResidu / s.rmsPlayback : Infinity
  const porteOk = s.rmsResidu >= profil.gateAbsolu && rel >= profil.gateRelatif
  const d = mpm(s.residu, fs, profil.clarityThreshold)
  return { ...d, f0Hz: porteOk ? d.f0Hz : null, rmsResidu: s.rmsResidu, rmsPlayback: s.rmsPlayback, rapport: rel }
}
