import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreActivity5, buildPalette } from "./rythmActivity5.ts";

// Figures (sous-ensemble du catalogue)
const q = { dur: "q" };
const h = { dur: "h" };
const e = { dur: "8" };
const qr = { dur: "qr", rest: true };
const et = { dur: "8", triplet: true };

// ─── scoreActivity5 ───────────────────────────────────────────────────────────
test("scoring : mesure complète exacte → 100%", () => {
  const sol = [q, q, q, q];
  const r = scoreActivity5(sol, [q, q, q, q], "binary", "16");
  assert.equal(r.pct, 100);
  assert.equal(r.identical, r.denom);
});

test("scoring : un temps faux → partiel (<100, >0)", () => {
  // solution noire×4 ; réponse 2 croches sur le 1er temps (cases différentes ensuite)
  const r = scoreActivity5([q, q, q, q], [e, e, q, q, q], "binary", "16");
  assert.ok(r.pct < 100, `attendu <100, reçu ${r.pct}`);
  assert.ok(r.pct > 0, `attendu >0, reçu ${r.pct}`);
});

test("scoring : réponse incomplète → partiel, jamais 0 si début correct", () => {
  // 4 temps attendus, l'élève n'en pose que 2 corrects
  const r = scoreActivity5([q, q, q, q], [q, q], "binary", "16");
  // moitié des cases correctes (2 temps sur 4), reste = silence vs noire → faux
  assert.ok(r.pct > 0 && r.pct < 100, `reçu ${r.pct}`);
  assert.equal(r.denom, 48); // 4 temps × 12 ticks
});

test("scoring : sur-remplissage pénalisé via le dénominateur", () => {
  // réponse identique sur les 4 temps mais avec un 5e temps en trop
  const exact = scoreActivity5([q, q, q, q], [q, q, q, q], "binary", "16");
  const over = scoreActivity5([q, q, q, q], [q, q, q, q, q], "binary", "16");
  assert.equal(exact.pct, 100);
  assert.ok(over.pct < 100, `sur-rempli devrait être <100, reçu ${over.pct}`);
  assert.ok(over.denom > exact.denom, "le dénominateur doit grossir avec l'excès");
});

test("scoring : réponse vide → crédit = cases silence de la solution", () => {
  // solution = noire + soupir + noire + soupir (moitié silences)
  const sol = [q, qr, q, qr];
  const r = scoreActivity5(sol, [], "binary", "16");
  // les cases silence matchent (réponse vide = tout silence), les cases jouées non
  assert.ok(r.pct > 0 && r.pct < 100, `reçu ${r.pct}`);
});

test("scoring : ternaire / triolet alignés (timeline uniforme)", () => {
  // triolet binaire vs lui-même → 100% (le ×3 de la grille absorbe le /3)
  const r = scoreActivity5([et, et, et, q, q, q], [et, et, et, q, q, q], "binary", "16");
  assert.equal(r.pct, 100);
  // triolet vs 2 croches sur le 1er temps → différent
  const r2 = scoreActivity5([et, et, et, q, q, q], [e, e, q, q, q], "binary", "16");
  assert.ok(r2.pct < 100, `reçu ${r2.pct}`);
});

test("scoring : blanche (note tenue) ≠ noire+silence", () => {
  const tenue = scoreActivity5([h, h], [h, h], "binary", "16");
  assert.equal(tenue.pct, 100);
  // h (tenue 2 temps) vs q+qr+q+qr : les cases hold diffèrent des cases rest
  const diff = scoreActivity5([h, h], [q, qr, q, qr], "binary", "16");
  assert.ok(diff.pct < 100, `reçu ${diff.pct}`);
});

// ─── buildPalette ─────────────────────────────────────────────────────────────
const er = { dur: "8r", rest: true };
const F = (id: string, beats: number, figs: any[]): any => ({ id, group: "binary", beats, figs });
// Catalogue synthétique : classes (beats, attackCount) variées.
const CAT: any[] = [
  F("q1", 1, [q]),        // 1 attaque
  F("ee", 1, [e, e]),     // 2 attaques
  F("eer", 1, [e, er]),   // 1 attaque (silence)
  F("ere", 1, [er, e]),   // 1 attaque (silence)
  F("qr", 1, [qr]),       // 0 attaque
  F("qr2", 1, [er, er]),  // 0 attaque (2e variante de silence)
  F("x2a", 1, [e, e]),    // 2 attaques (variantes synthétiques)
  F("x2b", 1, [e, e]),
  F("x2c", 1, [e, e]),
  F("x2d", 1, [e, e]),
  F("h2", 2, [h]),        // 1 attaque, 2 temps
];
const byId = (id: string) => CAT.find((f) => f.id === id);
// Niveaux = cycles C1/1…C3 (clés directes de PALETTE_DISTRACTORS).
const NIVEAU_ORDER = ["C1/1", "C1/2", "C1/3", "C1/4", "C2/2", "C2/3", "C3"];
const NIVEAU_FORMULA_IDS: Record<string, string[]> = {
  "C1/1": ["q1", "ee", "qr"],
  "C1/2": ["eer", "ere"],
  "C1/3": ["qr2"],
  "C1/4": ["x2a", "x2b"],
  "C2/2": ["h2"],
  "C2/3": ["x2c"],
  "C3": ["x2d"],
};
const sol = (ids: string[]) => ({ timeSig: "4/4", formulaSlots: ids.map((id) => ({ formula: byId(id) })) });
const call = (selIds: string[], solIds: string[]) =>
  buildPalette({
    solution: sol(solIds),
    selectedFormulas: new Set(selIds),
    formulaCatalog: CAT,
    niveauOrder: NIVEAU_ORDER,
    niveauFormulaIds: NIVEAU_FORMULA_IDS,
  });
const ids = (fs: any[]) => new Set(fs.map((f) => f.id));

test("palette : solution simple C1/1 (N=0) → palette = cellules de la solution", () => {
  const { palette, fallbackLogged } = call(["q1", "ee", "qr"], ["q1", "ee", "q1", "qr"]);
  assert.deepEqual(ids(palette), new Set(["q1", "ee", "qr"]));
  assert.equal(palette.length, 3);
  assert.equal(fallbackLogged, false);
});

test("palette : cellule à 0 attaque n'a que des proches à 0 attaque", () => {
  // niveau Instrumentiste (C1/3, N=2) ; source qr (0 attaque)
  const sel = ["q1", "ee", "qr", "eer", "ere", "qr2"];
  const { palette } = call(sel, ["qr", "q1", "ee", "q1"]);
  const zeroAttackCells = palette.filter((f) => f.beats === 1 && f.figs.every((x: any) => x.rest));
  // seuls qr et qr2 (0 attaque) peuvent apparaître comme proches de qr
  assert.deepEqual(ids(zeroAttackCells), new Set(["qr", "qr2"]));
});

test("palette : quota saturé C3 (N=4) → source + 4 proches, pas de repli", () => {
  const all = Object.values(LEVEL_FORMULA_IDS).flat();
  const { palette, fallbackLogged } = call(all, ["ee", "ee", "ee", "ee"]);
  // ee (2 attaques, 1 temps) a 4 proches : x2a..x2d
  assert.deepEqual(ids(palette), new Set(["ee", "x2a", "x2b", "x2c", "x2d"]));
  assert.equal(palette.length, 5);
  assert.equal(fallbackLogged, false);
});

test("palette : repli si une cellule a moins de N proches → fallbackLogged", () => {
  const all = Object.values(LEVEL_FORMULA_IDS).flat();
  // C3 N=4 ; source q1 (1 attaque) n'a que 2 proches : eer, ere
  const { palette, fallbackLogged } = call(all, ["q1", "q1", "q1", "q1"]);
  assert.deepEqual(ids(palette), new Set(["q1", "eer", "ere"]));
  assert.equal(fallbackLogged, true);
});
