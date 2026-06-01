// ─── Appariement DP monotone (Needleman–Wunsch) ───────────────────────────────
// Aligne les onsets prédits utilisateur (pred[]) avec les onsets utilisateur réels (user[]).
// Gère extras (frappes sans cible) et missing (cibles sans frappe) sans biaiser le fit.
// Coût d'un match = |pred - user| (ms). Coût d'un gap = `gap` (ms).
//   match préféré à 2 gaps tant que |écart| < 2·gap.

import type { Alignment, AlignedPair } from "./rythmScoringTypes.ts";

export function alignOnsets(
  pred: number[],
  user: number[],
  gap: number,
  targetOnsets: number[],
): Alignment {
  const N = pred.length;
  const M = user.length;

  // Cas dégénérés : tout missing ou tout extra
  if (N === 0) {
    return {
      pairs: [],
      missingTargetIdx: [],
      extraUserIdx: user.map((_, j) => j),
    };
  }
  if (M === 0) {
    return {
      pairs: [],
      missingTargetIdx: targetOnsets.map((_, i) => i),
      extraUserIdx: [],
    };
  }

  // D[i][j] = coût d'aligner pred[0..i-1] avec user[0..j-1]
  const D: number[][] = [];
  for (let i = 0; i <= N; i++) D.push(new Array(M + 1).fill(0));
  for (let i = 1; i <= N; i++) D[i][0] = i * gap;
  for (let j = 1; j <= M; j++) D[0][j] = j * gap;
  for (let i = 1; i <= N; i++) {
    for (let j = 1; j <= M; j++) {
      const match = D[i - 1][j - 1] + Math.abs(pred[i - 1] - user[j - 1]);
      const del   = D[i - 1][j] + gap;     // cible i-1 non frappée
      const ins   = D[i][j - 1] + gap;     // frappe j-1 sans cible
      D[i][j] = Math.min(match, del, ins);
    }
  }

  // Backtrack
  const pairs: AlignedPair[] = [];
  const missingTargetIdx: number[] = [];
  const extraUserIdx: number[] = [];
  let i = N, j = M;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const matchCost = D[i - 1][j - 1] + Math.abs(pred[i - 1] - user[j - 1]);
      if (D[i][j] === matchCost) {
        pairs.unshift({
          targetIdx: i - 1,
          userIdx:   j - 1,
          targetTime: targetOnsets[i - 1],
          userTime:   user[j - 1],
        });
        i--; j--;
        continue;
      }
    }
    if (i > 0 && (j === 0 || D[i][j] === D[i - 1][j] + gap)) {
      missingTargetIdx.unshift(i - 1);
      i--;
    } else {
      extraUserIdx.unshift(j - 1);
      j--;
    }
  }

  return { pairs, missingTargetIdx, extraUserIdx };
}
