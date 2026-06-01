// ─── Fit affine robuste (Theil–Sen) + boucle alignement ⇄ fit ─────────────────
// Theil–Sen : pente = médiane des pentes par paires ; intercept = médiane des intercepts.
// Robuste à une fraction des outliers, solution fermée (idéal pour N petit).

import type { Alignment, FitResult, RhythmAttempt, ScoringParams } from "./rythmScoringTypes.ts";
import { alignOnsets } from "./rythmScoringAlign.ts";

export function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function medianDiff(xs: number[]): number {
  if (xs.length < 2) return 0;
  const diffs: number[] = [];
  for (let i = 1; i < xs.length; i++) diffs.push(xs[i] - xs[i - 1]);
  return median(diffs);
}

export interface FitPair { target: number; user: number }

export function theilSenFit(pairs: FitPair[]): FitResult {
  const N = pairs.length;
  if (N === 0) return { a: 1, b: 0, residuals: [] };
  if (N === 1) return { a: 1, b: pairs[0].user - pairs[0].target, residuals: [0] };

  const slopes: number[] = [];
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const dt = pairs[j].target - pairs[i].target;
      if (dt !== 0) slopes.push((pairs[j].user - pairs[i].user) / dt);
    }
  }
  const a = slopes.length > 0 ? median(slopes) : 1;
  const intercepts = pairs.map(p => p.user - a * p.target);
  const b = median(intercepts);
  const residuals = pairs.map(p => p.user - (a * p.target + b));
  return { a, b, residuals };
}

/**
 * Boucle EM : init → (align → fit) jusqu'à stabilité de l'ensemble des paires
 * ou `maxIter` atteint. Converge typiquement en 1-2 tours sur données réelles.
 */
export function fitWithAlignment(
  attempt: RhythmAttempt,
  params: ScoringParams,
): { alignment: Alignment; fit: FitResult } {
  const { targetOnsets, userOnsets, targetTempoMsPerUnit } = attempt;
  const N = targetOnsets.length;
  const M = userOnsets.length;

  // Cas dégénérés : pas assez d'onsets pour fitter
  if (N < 2 || M < 2) {
    return {
      alignment: {
        pairs: [],
        missingTargetIdx: targetOnsets.map((_, i) => i),
        extraUserIdx:     userOnsets.map((_, j) => j),
      },
      fit: { a: targetTempoMsPerUnit ?? 1, b: 0, residuals: [] },
    };
  }

  // Init
  let a: number;
  let b: number;
  if (targetTempoMsPerUnit != null) {
    a = targetTempoMsPerUnit;
    b = userOnsets[0] - a * targetOnsets[0];
  } else {
    const tSpan = targetOnsets[N - 1] - targetOnsets[0];
    const uSpan = userOnsets[M - 1] - userOnsets[0];
    a = tSpan !== 0 ? uSpan / tSpan : 1;
    b = userOnsets[0] - a * targetOnsets[0];
  }

  let alignment: Alignment = {
    pairs: [],
    missingTargetIdx: targetOnsets.map((_, i) => i),
    extraUserIdx:     userOnsets.map((_, j) => j),
  };
  let prevKey = "";
  let fit: FitResult = { a, b, residuals: [] };

  const targetIOIunits = medianDiff(targetOnsets);

  for (let iter = 0; iter < params.maxIter; iter++) {
    const pred = targetOnsets.map(t => a * t + b);
    const gap = params.gapFactor * Math.max(1, Math.abs(a) * targetIOIunits);

    alignment = alignOnsets(pred, userOnsets, gap, targetOnsets);

    const key = alignment.pairs.map(p => `${p.targetIdx}-${p.userIdx}`).join(",");
    if (key === prevKey) break;
    prevKey = key;

    if (alignment.pairs.length < 2) {
      fit = { a, b, residuals: [] };
      break;
    }

    const fitPairs: FitPair[] = alignment.pairs.map(p => ({ target: p.targetTime, user: p.userTime }));
    fit = theilSenFit(fitPairs);
    a = fit.a;
    b = fit.b;
  }

  // Recalcule les résidus alignés sur l'ordre final des paires
  const residuals = alignment.pairs.map(p => p.userTime - (a * p.targetTime + b));
  return { alignment, fit: { a, b, residuals } };
}
