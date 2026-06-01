// ─── Score rythmique : composantes + agrégation produit ───────────────────────
// `scoreRhythm` est la façade publique du module : orchestre align → fit → analyze
// → score → diagnose, et retourne `RhythmScore` complet.

import type {
  RhythmAttempt, RhythmScore, ScoringParams, RhythmScoreComponents,
} from "./rythmScoringTypes.ts";
import { fitWithAlignment } from "./rythmScoringFit.ts";
import { analyzeResiduals, deadzone } from "./rythmScoringAnalyze.ts";
import { diagnose } from "./rythmScoringDiagnose.ts";

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function scoreRhythm(attempt: RhythmAttempt, params: ScoringParams): RhythmScore {
  const { alignment, fit } = fitWithAlignment(attempt, params);
  const analysis = analyzeResiduals(fit, alignment, params);

  const N = attempt.targetOnsets.length;
  const pairs   = alignment.pairs.length;
  const missing = alignment.missingTargetIdx.length;
  const extra   = alignment.extraUserIdx.length;

  // Complétude (F1-like) — pénalise extras ET missing
  const denomCompl = pairs + 0.5 * (missing + extra);
  const completeness = denomCompl > 0 ? pairs / denomCompl : 0;

  // Régularité — signal principal
  const regularity = Math.pow(
    clamp(1 - analysis.regularityMs / params.regMaxMs, 0, 1),
    params.regExp,
  );

  // Décalage (b, après dead-zone)
  const offsetEffective = Math.abs(deadzone(fit.b, params.inputNoiseFloorMs));
  const offset = clamp(1 - offsetEffective / params.offsetMaxMs, 0, 1);

  // Tempo — pondéré selon l'activité ; ignoré si tempo libre
  const tempoErrRel = attempt.targetTempoMsPerUnit
    ? Math.abs(fit.a / attempt.targetTempoMsPerUnit - 1)
    : 0;
  const tempo = clamp(
    1 - Math.max(0, tempoErrRel - params.tempoTolRel) / params.tempoMaxRel,
    0, 1,
  );

  // Motifs courts : tempo neutralisé (override prioritaire sur wTempo[activity])
  const wTempoEff = N < params.minNotesForTempo ? 0 : params.wTempo[attempt.activity];
  const wOffEff   = params.wOffset[attempt.activity];

  // Agrégation produit pondéré
  const total =
    completeness *
    Math.pow(regularity, params.wRegularity) *
    Math.pow(offset,     wOffEff) *
    Math.pow(tempo,      wTempoEff);

  const components: RhythmScoreComponents = { completeness, regularity, offset, tempo };
  const diagnosis = diagnose(fit, alignment, analysis, attempt, params);

  return { total, components, diagnosis, alignment, fit };
}
