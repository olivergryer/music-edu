// ─── Analyse des résidus : dispersion robuste + dérive progressive ────────────
// regularityMs = 1.4826 × MAD(résidus) après dead-zone (plancher de bruit).
// drift = tendance du tempo local (pente robuste sur k → localTempo_k).

import type { Alignment, Drift, FitResult, ScoringParams } from "./rythmScoringTypes.ts";
import { median, theilSenFit } from "./rythmScoringFit.ts";

/** Dead-zone : neutralise les valeurs sous le plancher de bruit (en ms). */
export function deadzone(x: number, floor: number): number {
  return Math.sign(x) * Math.max(0, Math.abs(x) - floor);
}

export interface ResidualAnalysis {
  regularityMs: number;
  drift: Drift;
}

export function analyzeResiduals(
  fit: FitResult,
  alignment: Alignment,
  params: ScoringParams,
): ResidualAnalysis {
  const r = fit.residuals;
  if (r.length === 0) return { regularityMs: 0, drift: "none" };

  // Dispersion robuste (MAD) sur résidus dead-zonés
  const rDz = r.map(x => deadzone(x, params.inputNoiseFloorMs));
  const med = median(rDz);
  const mad = median(rDz.map(x => Math.abs(x - med)));
  const regularityMs = 1.4826 * mad;

  // Dérive : tendance robuste de localTempo_k vs k
  let drift: Drift = "none";
  const pairs = alignment.pairs;
  if (pairs.length >= 3) {
    const localTempos: { target: number; user: number }[] = [];
    for (let k = 0; k < pairs.length - 1; k++) {
      const dt = pairs[k + 1].targetTime - pairs[k].targetTime;
      const du = pairs[k + 1].userTime  - pairs[k].userTime;
      if (dt !== 0) localTempos.push({ target: k, user: du / dt });
    }
    if (localTempos.length >= 2) {
      const tempoTrend = theilSenFit(localTempos);
      const medTempo = median(localTempos.map(x => x.user));
      const range = localTempos.length - 1;
      const totalChange = tempoTrend.a * range;
      const relChange = medTempo !== 0 ? Math.abs(totalChange / medTempo) : 0;
      if (relChange > params.driftThresholdRel) {
        // tempo qui DIMINUE (intervalles plus courts) ⇒ l'élève accélère.
        drift = totalChange < 0 ? "accelerating" : "decelerating";
      }
    }
  }

  return { regularityMs, drift };
}
