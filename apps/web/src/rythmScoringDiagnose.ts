// ─── Taxonomie d'erreurs ──────────────────────────────────────────────────────
// Produit `RhythmDiagnosis` (avec `flags: string[]`) à partir du fit, de l'alignement
// et de l'analyse de résidus. Les messages FR vivent côté UI ; ici on n'expose que des clés.

import type {
  Alignment, FitResult, RhythmAttempt, RhythmDiagnosis, ScoringParams,
} from "./rythmScoringTypes.ts";
import { deadzone, type ResidualAnalysis } from "./rythmScoringAnalyze.ts";

export function diagnose(
  fit: FitResult,
  alignment: Alignment,
  analysis: ResidualAnalysis,
  attempt: RhythmAttempt,
  params: ScoringParams,
): RhythmDiagnosis {
  const flags: string[] = [];

  const offsetMs = deadzone(fit.b, params.inputNoiseFloorMs);
  const tempoRatio = attempt.targetTempoMsPerUnit
    ? fit.a / attempt.targetTempoMsPerUnit
    : 1;

  if (offsetMs >  params.offsetMaxMs / 2) flags.push("OFFSET_LATE");
  if (offsetMs < -params.offsetMaxMs / 2) flags.push("OFFSET_EARLY");

  if (attempt.targetTempoMsPerUnit != null) {
    if (fit.a < attempt.targetTempoMsPerUnit * (1 - params.tempoTolRel)) flags.push("TEMPO_FAST");
    if (fit.a > attempt.targetTempoMsPerUnit * (1 + params.tempoTolRel)) flags.push("TEMPO_SLOW");
  }

  if (analysis.drift === "accelerating") flags.push("DRIFT_ACCEL");
  if (analysis.drift === "decelerating") flags.push("DRIFT_DECEL");

  if (analysis.regularityMs > params.regMaxMs * 0.6) flags.push("IRREGULAR");
  if (alignment.extraUserIdx.length    > 0) flags.push("EXTRA_ONSETS");
  if (alignment.missingTargetIdx.length > 0) flags.push("MISSING_ONSETS");

  if (attempt.targetOnsets.length === params.minNotesForTempo) {
    flags.push("LOW_CONFIDENCE_REGULARITY");
  }

  return {
    offsetMs,
    tempoRatio,
    regularityMs: analysis.regularityMs,
    drift: analysis.drift,
    extraCount:   alignment.extraUserIdx.length,
    missingCount: alignment.missingTargetIdx.length,
    flags,
  };
}
