import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreActivity5 } from "./rythmActivity5.ts";

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
