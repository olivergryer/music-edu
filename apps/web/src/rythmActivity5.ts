// ─── Activité 5 — reconstituer un rythme entendu ──────────────────────────────
// Scoring PARTIEL par alignement sur une grille timeline (cases attack/hold/rest),
// et génération de la palette de cellules (formules) proposées à l'élève.

import { toTimelineCells, groupOf, attackCount, figDur, beatQuarters } from "./rhythmGrid.ts";
import type { Fig } from "./rhythmGrid.ts";
import { deriveNiveau } from "./rythmDistractors.ts";

export { groupOf } from "./rhythmGrid.ts";

type Formula = { id: string; name?: string; group: "binary" | "ternary"; beats: number; figs: Fig[] };

// Conformité de la mesure reconstruite (act 5) : la somme des durées doit valoir
// exactement 4 temps. Sinon l'exercice est NON VALIDE (ni %, ni point).
export function measureStatus(figs: Fig[], timeSig: string): "incomplete" | "complete" | "over" {
  const group = groupOf(timeSig);
  const totalQ = figs.reduce((s, f) => s + figDur(f), 0);
  const expectedQ = 4 * beatQuarters(group);
  if (Math.abs(totalQ - expectedQ) < 1e-6) return "complete";
  return totalQ < expectedQ - 1e-6 ? "incomplete" : "over";
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Palette de cellules (formules) proposée à l'élève ────────────────────────
// Quota N de « proches » ajoutés PAR cellule de la solution, selon le niveau.
export const PALETTE_DISTRACTORS: Record<string, number> = {
  "C1/1": 0, "C1/2": 0, "C1/3": 2, "C1/4": 2,
  "C2/1": 4, "C2/2": 4, "C2/3": 4, "C2/4": 4, "C3": 4,
};

// Une cellule est « proche » d'une cellule source si : même nombre de temps,
// même nombre d'attaques (silences comptés à part), issue de la sélection active,
// et id distinct. La solution est TOUJOURS constructible (toutes ses cellules y sont).
// Repli silencieux : si une cellule source a < N proches dispo, on prend ce qu'il y a
// (pas de blocage, pas d'assouplissement des règles) et on logge.
export function buildPalette(opts: {
  solution: { timeSig: string; formulaSlots?: { formula: Formula | null }[] };
  selectedFormulas: Set<string>;
  formulaCatalog: Formula[];
  niveauOrder: string[];
  niveauFormulaIds: Record<string, string[]>;
}): { palette: Formula[]; fallbackLogged: boolean } {
  const { solution, selectedFormulas, formulaCatalog, niveauOrder, niveauFormulaIds } = opts;
  const group = groupOf(solution.timeSig);
  const niveau = deriveNiveau(selectedFormulas, niveauOrder, niveauFormulaIds);
  const N = PALETTE_DISTRACTORS[niveau] ?? 0; // niveau = clé C1/1…C3 directe

  const selFormulas = formulaCatalog.filter((f) => selectedFormulas.has(f.id) && f.group === group);

  // Cellules de la solution (dédupliquées par id), garanties dans la palette.
  const sourceCells: Formula[] = [];
  const seen = new Set<string>();
  for (const slot of solution.formulaSlots ?? []) {
    const f = slot.formula;
    if (f && !seen.has(f.id)) { seen.add(f.id); sourceCells.push(f); }
  }

  const palette: Formula[] = [...sourceCells];
  const inPalette = new Set(sourceCells.map((f) => f.id));
  let fallbackLogged = false;

  for (const src of sourceCells) {
    if (N <= 0) break;
    const neighbors = shuffle(
      selFormulas.filter(
        (f) =>
          f.id !== src.id &&
          f.beats === src.beats &&
          attackCount(f.figs) === attackCount(src.figs),
      ),
    );
    if (neighbors.length < N) {
      fallbackLogged = true;
      console.warn(
        `[palette act5] repli : cellule "${src.id}" n'a que ${neighbors.length} proche(s) (< ${N}) au niveau ${niveau}`,
      );
    }
    for (const nb of neighbors.slice(0, N)) {
      if (!inPalette.has(nb.id)) { inPalette.add(nb.id); palette.push(nb); }
    }
  }

  return { palette: shuffle(palette), fallbackLogged };
}

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
