// ─── Segmentation : adaptateur autour de `segmenter` existant (spec §6.8) ──────
// On ne modifie pas `segmenter`. On lui fournit une série `{ tMs, hz, rms }` bâtie à
// partir des trames d'analyse, avec le profil « accompagné ». La présence fournie par
// le modèle conjoint complète la piste rapide dans les cas multiples.

import { segmenter } from '../../../accordeurUtils.js'
import { PROFIL_ACCOMPAGNE } from './soustraction.ts'
import type { TrameAnalyse } from './types.ts'

export type PointSerie = { tMs: number; hz: number | null; rms: number }

export function serieDepuisTrames(trames: TrameAnalyse[]): PointSerie[] {
  return trames.map(t => ({ tMs: t.t * 1000, hz: t.presence ? t.f0Hz : null, rms: t.rmsResidu }))
}

export function segmenterTrames(trames: TrameAnalyse[], diapason: number, profil = PROFIL_ACCOMPAGNE) {
  return segmenter(serieDepuisTrames(trames), diapason, {
    silenceDurationMs: profil.silenceDurationMs,
    noteJumpCents: profil.noteJumpCents,
    minNoteDurationMs: profil.minNoteDurationMs,
    reattackDropRatio: profil.reattackDropRatio,
  })
}
