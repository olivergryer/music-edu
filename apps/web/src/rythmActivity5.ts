// ─── Activité 5 — reconstituer un rythme entendu ──────────────────────────────
// Scoring PARTIEL par alignement sur une grille timeline (cases attack/hold/rest),
// et génération de la palette de cellules (formules) proposées à l'élève.

import { toTimelineCells, groupOf } from "./rhythmGrid.ts";
import type { Fig } from "./rhythmGrid.ts";
import { deriveLevel, LEVEL_TO_CONFIG, DISTRACTOR_CONFIG } from "./rythmDistractors.ts";

// ─── Scoring partiel ──────────────────────────────────────────────────────────
// Compare solution et réponse case à case sur la même grille (finestUnit du niveau).
// - réponse plus courte → cases manquantes = silence (donc fausses si la solution joue)
// - réponse plus longue → l'excès n'est pas comparé mais gonfle le dénominateur (pénalité)
// pct = cases identiques / max(longueurs). JAMAIS figure par figure.
export function scoreActivity5(
  solutionFigs: Fig[],
  answerFigs: Fig[],
  group: "binary" | "ternary",
  finestUnit: string,
): { pct: number; identical: number; denom: number } {
  const sol = toTimelineCells(solutionFigs, group, finestUnit);
  const ans = toTimelineCells(answerFigs, group, finestUnit);
  const denom = Math.max(sol.length, ans.length);
  let identical = 0;
  for (let i = 0; i < sol.length; i++) {
    const ansCell = i < ans.length ? ans[i] : "R"; // au-delà de la réponse = silence
    if (sol[i] === ansCell) identical++;
  }
  const pct = denom > 0 ? Math.round((identical / denom) * 100) : 0;
  return { pct, identical, denom };
}

// finestUnit du niveau dérivé de la sélection (réutilise DISTRACTOR_CONFIG).
export function finestUnitForLevel(level: string): string {
  const key = LEVEL_TO_CONFIG[level] ?? "C1/1";
  return DISTRACTOR_CONFIG[key as keyof typeof DISTRACTOR_CONFIG]?.finestUnit ?? "16";
}

// Helper pratique : finestUnit + group depuis une mesure solution + une sélection.
export function gridContextFor(
  solutionTimeSig: string,
  selectedIds: Iterable<string>,
  levelOrder: string[],
  levelFormulaIds: Record<string, string[]>,
): { group: "binary" | "ternary"; finestUnit: string; level: string } {
  const level = deriveLevel(selectedIds, levelOrder, levelFormulaIds);
  return { group: groupOf(solutionTimeSig), finestUnit: finestUnitForLevel(level), level };
}
