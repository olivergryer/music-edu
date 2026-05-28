// ─── Moteur de distracteurs — activités 3 & 4 ────────────────────────────────
// Génère 3 (ou 2) distracteurs calibrés autour d'un rythme cible, via un moteur
// de mutations typées piloté par une table de difficulté par niveau.
//
// Garanties (jamais d'échec silencieux) :
//  1. Chaque distracteur se décompose en formules de la SÉLECTION ACTIVE (notation valide).
//  2. Aucun doublon AUDIBLE (vs cible ni entre distracteurs) — voir audibleFingerprint.
//  3. lockAttackCount → retire addRemoveAttack des types autorisés.
//  4. Replis ordonnés si < 3 uniques, puis blocage propre (blocked=true).
//
// La validité (#1, #2) est garantie par FILTRAGE : on mute librement une grille fine
// puis on rejette tout résultat qui ne correspond pas à des formules sélectionnées.
// Les sémantiques de mutation sont « best-effort » (le filtre est le garde-fou dur).

import { figDur, groupOf, beatQuarters } from "./rhythmGrid.ts";
import type { Fig, Cell } from "./rhythmGrid.ts";

// ─── Table de difficulté (fournie) ───────────────────────────────────────────
// nMutations BAS = distracteurs proches = PLUS difficile.
export const DISTRACTOR_CONFIG = {
  "C1/1": { nMutations: 3, lockAttackCount: false, finestUnit: "8",
            mutations: ["shiftAttack", "addRemoveAttack", "holdRestSwap"] },
  "C1/2": { nMutations: 3, lockAttackCount: false, finestUnit: "8",
            mutations: ["shiftAttack", "addRemoveAttack", "dottedSwap", "holdRestSwap"] },
  "C1/3": { nMutations: 2, lockAttackCount: true,  finestUnit: "8",
            mutations: ["shiftAttack", "dottedSwap", "binaryTernarySwap", "holdRestSwap"] },
  "C1/4": { nMutations: 2, lockAttackCount: true,  finestUnit: "16",
            mutations: ["shiftAttack", "dottedSwap", "binaryTernarySwap", "holdRestSwap"] },
  "C2/1": { nMutations: 2, lockAttackCount: true,  finestUnit: "16",
            mutations: ["shiftAttack", "dottedSwap", "binaryTernarySwap", "holdRestSwap"] },
  "C2/2": { nMutations: 2, lockAttackCount: true,  finestUnit: "16",
            mutations: ["shiftAttack", "dottedSwap", "holdRestSwap"] },
  "C2/3": { nMutations: 1, lockAttackCount: true,  finestUnit: "16",
            mutations: ["shiftAttack", "dottedSwap", "binaryTernarySwap", "holdRestSwap"] },
  "C2/4": { nMutations: 1, lockAttackCount: true,  finestUnit: "16",
            mutations: ["shiftAttack", "dottedSwap", "binaryTernarySwap", "holdRestSwap"] },
  "C3":   { nMutations: 1, lockAttackCount: true,  finestUnit: "16",
            mutations: ["shiftAttack", "dottedSwap", "binaryTernarySwap", "holdRestSwap"] },
} as const;

// Ordre des clés (pour le repli (b) « niveau ≥ C1/3 »).
const CONFIG_ORDER = ["C1/1", "C1/2", "C1/3", "C1/4", "C2/1", "C2/2", "C2/3", "C2/4", "C3"];

// Le NIVEAU (cycle) dérivé EST déjà une clé C1/1…C3 (issue du CSV / fallback ré-aligné),
// donc il indexe DISTRACTOR_CONFIG / PALETTE_DISTRACTORS directement — pas de mapping.

// ─── Types ────────────────────────────────────────────────────────────────────
type Formula = { id: string; name?: string; group: "binary" | "ternary"; beats: number; figs: Fig[] };
type Measure = { timeSig: string; name: string; figs: Fig[] };
type Grid = { cells: Cell[]; triplet: boolean };
type MutationType = "shiftAttack" | "dottedSwap" | "binaryTernarySwap" | "holdRestSwap" | "addRemoveAttack";

// figDur · groupOf · beatQuarters : importés de rhythmGrid (modèle partagé).

// ─── Helpers aléatoires ───────────────────────────────────────────────────────
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

// ─── Empreinte AUDIBLE ────────────────────────────────────────────────────────
// Lecture tenue : chaque note non-silence sonne de son onset pendant sa durée.
// Deux rythmes sont audiblement identiques ssi mêmes (onset, durée) des notes.
// Capte la distinction hold vs silence (≠ attackFingerprint qui ignorait la durée).
export function audibleFingerprint(figs: Fig[]): string {
  let pos = 0;
  const parts: string[] = [];
  for (const f of figs) {
    const onset = pos;
    pos += figDur(f);
    if (!f.rest) parts.push(`${Math.round(onset * 1000)}:${Math.round(figDur(f) * 1000)}`);
  }
  return parts.join(",");
}

// ─── Dérivation du NIVEAU (cycle C1/1…C3) depuis la sélection ──────────────────
// Niveau = cycle scolaire (≠ Rang XP cross-module). Le plus haut niveau dont TOUTES
// les formules du subset (cumulatif) sont sélectionnées. Ajouter des formules partielles
// du niveau suivant ne fait PAS monter le niveau tant que ce subset n'est pas complet.
// Défaut : niveau le plus bas si aucun subset complet.
export function deriveNiveau(
  selectedIds: Iterable<string>,
  niveauOrder: string[],
  niveauFormulaIds: Record<string, string[]>,
): string {
  const sel = new Set(selectedIds);
  let best = niveauOrder[0];
  let found = false;
  const cum: string[] = [];
  for (const lv of niveauOrder) {
    (niveauFormulaIds[lv] ?? []).forEach((id) => cum.push(id));
    if (cum.length > 0 && cum.every((id) => sel.has(id))) {
      best = lv;
      found = true;
    }
  }
  return found ? best : niveauOrder[0];
}

// ─── Grille ⇄ figures (par unité de formule, 1–2 temps, auto-contenue) ────────
// Représentation FIXE à la double-croche (binaire /4, ternaire /6) + triolet /3.
// finestUnit ne pilote QUE le pas de déplacement (shiftAttack / dottedSwap / addRemove).
// (groupOf / beatQuarters viennent de rhythmGrid ; cellsPerBeat est propre au matching.)
function cellsPerBeat(group: "binary" | "ternary", triplet: boolean): number {
  if (triplet) return 3;            // triolet binaire : 3 cellules / temps
  return group === "ternary" ? 6 : 4;
}

function figsToGrid(figs: Fig[], group: "binary" | "ternary"): Grid {
  const triplet = figs.some((f) => f.triplet);
  const cpb = cellsPerBeat(group, triplet);
  const cd = beatQuarters(group) / cpb; // durée d'une cellule en noires
  const totalQ = figs.reduce((s, f) => s + figDur(f), 0);
  const totalCells = Math.max(1, Math.round(totalQ / cd));
  const cells: Cell[] = new Array(totalCells).fill("R");
  let pos = 0;
  for (const f of figs) {
    const startCell = Math.round(pos / cd);
    const nCells = Math.max(1, Math.round(figDur(f) / cd));
    for (let k = 0; k < nCells; k++) {
      const idx = startCell + k;
      if (idx >= totalCells) break;
      cells[idx] = f.rest ? "R" : k === 0 ? "A" : "H";
    }
    pos += figDur(f);
  }
  return { cells, triplet };
}

function gridKey(grid: Grid): string {
  return (grid.triplet ? "t" : "d") + grid.cells.join("");
}
function beatsOfGrid(grid: Grid, group: "binary" | "ternary"): number {
  return grid.triplet ? 1 : Math.max(1, Math.round(grid.cells.length / cellsPerBeat(group, false)));
}

// ─── Index de la sélection par signature de grille ────────────────────────────
type SelectionIndex = {
  whole: Map<string, Formula>; // `${beats}|${gridKey}` → formule (1 ou 2 temps)
  one: Map<string, Formula>;   // `${gridKey}` → formule 1 temps
};
function buildSelectionIndex(formulas: Formula[], group: "binary" | "ternary"): SelectionIndex {
  const whole = new Map<string, Formula>();
  const one = new Map<string, Formula>();
  for (const f of formulas) {
    if (f.group !== group) continue;
    const g = figsToGrid(f.figs, group);
    const k = gridKey(g);
    const beats = beatsOfGrid(g, group);
    whole.set(`${beats}|${k}`, f);
    if (beats === 1) one.set(k, f);
  }
  return { whole, one };
}

// Une grille mutée est valide ssi elle correspond à des formules sélectionnées :
//  - match direct (1 ou 2 temps), OU
//  - (2 temps non-triolet) découpe en deux formules 1 temps (si aucune note ne
//    traverse la barre de temps → 2e moitié commence par A ou R).
// Retourne la liste des figs des unités résultantes, ou null si invalide.
function matchGridToSelection(grid: Grid, group: "binary" | "ternary", idx: SelectionIndex): Fig[][] | null {
  const beats = beatsOfGrid(grid, group);
  const direct = idx.whole.get(`${beats}|${gridKey(grid)}`);
  if (direct) return [direct.figs];

  if (beats === 2 && !grid.triplet) {
    const half = grid.cells.length / 2;
    if (Number.isInteger(half)) {
      const c1 = grid.cells.slice(0, half);
      const c2 = grid.cells.slice(half);
      if (c2[0] === "A" || c2[0] === "R") {
        const f1 = idx.one.get(gridKey({ cells: c1, triplet: false }));
        const f2 = idx.one.get(gridKey({ cells: c2, triplet: false }));
        if (f1 && f2) return [f1.figs, f2.figs];
      }
    }
  }
  return null;
}

// ─── Mutations typées (sur cellules) ──────────────────────────────────────────
function attackIndices(cells: Cell[]): number[] {
  const out: number[] = [];
  cells.forEach((c, i) => { if (c === "A") out.push(i); });
  return out;
}

// Déplace une attaque de ±step cellules. internalOnly : ne pas bouger l'onset 0.
function shiftOneAttack(cells: Cell[], step: number, internalOnly: boolean): Cell[] | null {
  const attacks = shuffle(attackIndices(cells).filter((i) => !internalOnly || i > 0));
  for (const i of attacks) {
    for (const dir of shuffle([-1, 1])) {
      const j = i + dir * step;
      if (j < 0 || j >= cells.length) continue;
      if (cells[j] === "A") continue; // collision avec une autre attaque
      const nc = cells.slice();
      if (dir > 0) {
        // onset i → j : cellules [i..j-1] comblées (prolongation si note avant, sinon silence)
        const fill: Cell = i > 0 && nc[i - 1] !== "R" ? "H" : "R";
        for (let k = i; k < j; k++) nc[k] = fill;
        nc[j] = "A";
      } else {
        // onset i → j (gauche) : la note démarre plus tôt et s'étend jusqu'à i
        for (let k = j; k <= i; k++) nc[k] = k === j ? "A" : "H";
      }
      return nc;
    }
  }
  return null;
}

// Échange attaque+silence ↔ note tenue (nombre d'attaques inchangé).
function holdRestSwap(cells: Cell[]): Cell[] | null {
  const candidates: number[] = [];
  cells.forEach((c, i) => {
    if (c === "R" && i > 0 && cells[i - 1] !== "R") candidates.push(i); // R→H : prolonge la note précédente sur le silence
    if (c === "H") candidates.push(i);                                  // H→R : coupe la note en silence
  });
  if (!candidates.length) return null;
  const idx = pick(candidates);
  const nc = cells.slice();
  if (nc[idx] === "R") {
    nc[idx] = "H";
  } else {
    nc[idx] = "R";
    for (let k = idx + 1; k < nc.length && nc[k] === "H"; k++) nc[k] = "R"; // pas de prolongation orpheline
  }
  return nc;
}

// Ajoute ou retire une attaque (change le nombre d'attaques).
function addRemoveAttack(cells: Cell[]): Cell[] | null {
  if (Math.random() < 0.5) {
    // AJOUTER : transforme une H ou R en A
    const cand: number[] = [];
    cells.forEach((c, i) => { if (c === "H" || c === "R") cand.push(i); });
    if (!cand.length) return null;
    const nc = cells.slice();
    nc[pick(cand)] = "A";
    return nc;
  }
  // RETIRER : transforme une A (pas la dernière) en H (fusion) ou R
  const attacks = attackIndices(cells);
  if (attacks.length <= 1) return null;
  const i = pick(attacks);
  const nc = cells.slice();
  nc[i] = i > 0 && nc[i - 1] !== "R" ? "H" : "R";
  return nc;
}

// 2 croches ↔ triolet de croches (bascule subdivision /2 ↔ /3 sur un temps binaire).
function binaryTernarySwap(grid: Grid, group: "binary" | "ternary"): Grid | null {
  if (group !== "binary") return null;
  if (grid.triplet) {
    // ttt [A,A,A] → ee [A,H,A,H]
    if (grid.cells.length === 3 && grid.cells.every((c) => c === "A")) {
      return { cells: ["A", "H", "A", "H"], triplet: false };
    }
    return null;
  }
  // ee → ttt : motif « 2 attaques régulières » sur la grille /4
  const half = grid.cells.length / 2;
  const isEe =
    grid.cells.length % 2 === 0 &&
    grid.cells.every((c, i) => (i === 0 || i === half ? c === "A" : c === "H"));
  if (isEe) return { cells: ["A", "A", "A"], triplet: true };
  return null;
}

function applyMutation(
  type: MutationType,
  grid: Grid,
  group: "binary" | "ternary",
  step: number,
): Grid | null {
  switch (type) {
    case "shiftAttack": {
      const c = shiftOneAttack(grid.cells, step, false);
      return c ? { cells: c, triplet: grid.triplet } : null;
    }
    case "dottedSwap": {
      // nuance pointé↔égal : déplacement fin (1 cellule) d'un onset interne
      const c = shiftOneAttack(grid.cells, 1, true);
      return c ? { cells: c, triplet: grid.triplet } : null;
    }
    case "holdRestSwap": {
      const c = holdRestSwap(grid.cells);
      return c ? { cells: c, triplet: grid.triplet } : null;
    }
    case "addRemoveAttack": {
      const c = addRemoveAttack(grid.cells);
      return c ? { cells: c, triplet: grid.triplet } : null;
    }
    case "binaryTernarySwap":
      return binaryTernarySwap(grid, group);
    default:
      return null;
  }
}

// ─── Pré-filtre des types selon la sélection (gating #2) ──────────────────────
function eligibleTypes(
  configTypes: readonly string[],
  selFormulas: Formula[],
  group: "binary" | "ternary",
  locked: boolean,
): MutationType[] {
  const figsAll = selFormulas.filter((f) => f.group === group).flatMap((f) => f.figs);
  const hasTriplet = figsAll.some((f) => f.triplet);
  const hasDuple1 = selFormulas.some(
    (f) => f.group === "binary" && f.beats === 1 && !f.figs.some((x) => x.triplet),
  );
  const hasDotted = figsAll.some((f) => /d/.test(f.dur));
  const hasRest = figsAll.some((f) => f.rest);
  const hasSustainable = figsAll.some((f) => !f.rest && figDur(f) >= 0.5);
  return configTypes.filter((t) => {
    if (t === "binaryTernarySwap") return hasTriplet && hasDuple1;
    if (t === "dottedSwap") return hasDotted;
    if (t === "holdRestSwap") return hasRest || hasSustainable;
    if (t === "addRemoveAttack") return !locked;
    return true; // shiftAttack toujours possible
  }) as MutationType[];
}

// ─── Génère un candidat = cible + nMut mutations distinctes (validées) ────────
type Unit = { figs: Fig[] };
function mutateCandidate(
  targetUnits: Unit[],
  group: "binary" | "ternary",
  types: MutationType[],
  nMut: number,
  step: number,
  idx: SelectionIndex,
): Fig[] | null {
  let units: Unit[] = targetUnits.map((u) => ({ figs: u.figs.map((f) => ({ ...f })) }));
  let applied = 0;
  let guard = 0;
  while (applied < nMut && guard < 40) {
    guard++;
    const type = pick(types);
    let done = false;
    for (const ui of shuffle(units.map((_, i) => i))) {
      const grid = figsToGrid(units[ui].figs, group);
      const mutated = applyMutation(type, grid, group, step);
      if (!mutated) continue;
      const matched = matchGridToSelection(mutated, group, idx);
      if (!matched) continue;
      units = [
        ...units.slice(0, ui),
        ...matched.map((figs) => ({ figs: figs.map((f) => ({ ...f })) })),
        ...units.slice(ui + 1),
      ];
      applied++;
      done = true;
      break;
    }
    if (!done) continue;
  }
  if (applied === 0) return null;
  return units.flatMap((u) => u.figs.map((f) => ({ ...f })));
}

// ─── Point d'entrée ───────────────────────────────────────────────────────────
export type DistractorResult = {
  distractors: Measure[];
  blocked: boolean;
  choiceCount: number; // 4 (1 + 3 distracteurs) ou 3 (1 + 2) en dernier recours
  niveau: string;
  configKey: string;
};

export function generateDistractorSet(
  target: { timeSig: string; figs: Fig[]; formulaSlots?: { formula: Formula | null; beats: number }[] },
  opts: { selectedFormulas: Set<string>; formulaCatalog: Formula[]; niveau: string },
): DistractorResult {
  const { selectedFormulas, formulaCatalog, niveau } = opts;
  const group = groupOf(target.timeSig);
  // Le niveau EST une clé C1/1…C3 → indexe DISTRACTOR_CONFIG directement.
  const configKey = niveau in DISTRACTOR_CONFIG ? niveau : "C1/1";
  const config = DISTRACTOR_CONFIG[configKey as keyof typeof DISTRACTOR_CONFIG] ?? DISTRACTOR_CONFIG["C1/1"];

  const selFormulas = formulaCatalog.filter((f) => selectedFormulas.has(f.id));
  const idx = buildSelectionIndex(selFormulas, group);

  // Unités du pattern cible (depuis les slots de formule ; figs auto-contenues).
  const targetUnits: Unit[] = (target.formulaSlots ?? [])
    .filter((s) => s.formula)
    .map((s) => ({ figs: (s.formula as Formula).figs.map((f) => ({ ...f })) }));
  if (targetUnits.length === 0) targetUnits.push({ figs: target.figs.map((f) => ({ ...f })) });

  const baseTypes = eligibleTypes(config.mutations, selFormulas, group, config.lockAttackCount);

  const targetFp = audibleFingerprint(target.figs);
  const seen = new Set<string>([targetFp]);
  const found: Measure[] = [];

  const collect = (nMut: number, types: MutationType[], maxAttempts: number) => {
    if (!types.length) return;
    const step = config.finestUnit === "16" ? 1 : 2;
    let a = 0;
    while (found.length < 3 && a < maxAttempts) {
      a++;
      const figs = mutateCandidate(targetUnits, group, types, nMut, step, idx);
      if (!figs) continue;
      if (figs.filter((f) => !f.rest).length < 1) continue; // jamais une mesure vide
      const fp = audibleFingerprint(figs);
      if (seen.has(fp)) continue;
      seen.add(fp);
      found.push({ timeSig: target.timeSig, name: "Aléatoire", figs });
    }
  };

  // Tirage nominal
  collect(config.nMutations, baseTypes, 300);

  // Repli (a) : nMutations + 1
  if (found.length < 3) {
    console.warn(`[distractors] repli (a) nMutations ${config.nMutations}→${config.nMutations + 1} (niveau ${niveau} / ${configKey})`);
    collect(config.nMutations + 1, baseTypes, 300);
  }

  // Repli (b) : si bloqué et niveau ≥ C1/3, autoriser temporairement addRemoveAttack
  if (found.length < 3 && CONFIG_ORDER.indexOf(configKey) >= 2) {
    const relaxed = Array.from(new Set([...baseTypes, "addRemoveAttack"])) as MutationType[];
    console.warn(`[distractors] repli (b) addRemoveAttack autorisé temporairement (niveau ${niveau} / ${configKey})`);
    collect(config.nMutations + 1, relaxed, 400);
  }

  // Repli (c) / blocage
  let choiceCount = 4;
  let blocked = false;
  if (found.length < 3) {
    if (found.length >= 2) {
      console.warn(`[distractors] repli (c) 3 propositions au lieu de 4 (niveau ${niveau} / ${configKey})`);
      choiceCount = 3;
    } else {
      console.warn(`[distractors] BLOCAGE act 3/4 : < 2 distracteurs audibles uniques (niveau ${niveau} / ${configKey}) — sélection trop pauvre`);
      blocked = true;
    }
  }

  return {
    distractors: found.slice(0, choiceCount - 1),
    blocked,
    choiceCount,
    niveau,
    configKey,
  };
}
