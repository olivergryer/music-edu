// ─── Tests du moteur de scoring rythmique ─────────────────────────────────────
// node --test "src/**/*.test.ts"

import { test } from "node:test";
import assert from "node:assert/strict";

import { alignOnsets }        from "./rythmScoringAlign.ts";
import { theilSenFit, fitWithAlignment, median } from "./rythmScoringFit.ts";
import { analyzeResiduals, deadzone } from "./rythmScoringAnalyze.ts";
import { scoreRhythm }        from "./rythmScoringScore.ts";
import { diagnose }           from "./rythmScoringDiagnose.ts";
import { DEFAULT_PARAMS }     from "./rythmScoringParams.ts";
import type { RhythmAttempt } from "./rythmScoringTypes.ts";

// Helpers ──────────────────────────────────────────────────────────────────────
const T = [0, 1, 2, 3, 4, 5, 6, 7];          // 8 onsets cibles (unités de temps-partition)
const MS_PER_UNIT = 500;                      // tempo cible
const perfectUser = T.map(t => t * MS_PER_UNIT);

function approx(actual: number, expected: number, tol: number, label = "") {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${label} : attendu ≈ ${expected} (±${tol}), reçu ${actual}`,
  );
}

function mkAttempt(opts: Partial<RhythmAttempt> & { user: number[] }): RhythmAttempt {
  return {
    targetOnsets: T,
    userOnsets: opts.user,
    targetTempoMsPerUnit: opts.targetTempoMsPerUnit ?? MS_PER_UNIT,
    activity: opts.activity ?? 1,
  };
}

// ─── alignOnsets ──────────────────────────────────────────────────────────────
test("alignOnsets : séquences égales → toutes appariées", () => {
  const al = alignOnsets(perfectUser, perfectUser, 250, T);
  assert.equal(al.pairs.length, T.length);
  assert.equal(al.missingTargetIdx.length, 0);
  assert.equal(al.extraUserIdx.length, 0);
});

test("alignOnsets : 1 frappe en trop (extra) au milieu", () => {
  const user = [...perfectUser];
  user.splice(4, 0, 1750); // entre la 4e et la 5e cible
  const al = alignOnsets(T.map(t => t * MS_PER_UNIT), user, 250, T);
  assert.equal(al.pairs.length, T.length);
  assert.equal(al.extraUserIdx.length, 1);
  assert.equal(al.missingTargetIdx.length, 0);
});

test("alignOnsets : 1 cible manquée", () => {
  const user = [...perfectUser];
  user.splice(4, 1); // retire la 5e frappe
  const al = alignOnsets(T.map(t => t * MS_PER_UNIT), user, 250, T);
  assert.equal(al.pairs.length, T.length - 1);
  assert.equal(al.missingTargetIdx.length, 1);
  assert.equal(al.missingTargetIdx[0], 4);
});

test("alignOnsets : 1 extra + 1 missing → ne se compensent pas", () => {
  const user = [...perfectUser];
  user.splice(2, 1);        // retire la 3e
  user.splice(5, 0, 2850);  // ajoute un parasite
  const al = alignOnsets(T.map(t => t * MS_PER_UNIT), user, 250, T);
  assert.equal(al.missingTargetIdx.length, 1);
  assert.equal(al.extraUserIdx.length, 1);
});

// ─── theilSenFit ──────────────────────────────────────────────────────────────
test("theilSenFit : droite parfaite → résidus nuls", () => {
  const pairs = T.map(t => ({ target: t, user: t * 500 + 30 }));
  const fit = theilSenFit(pairs);
  approx(fit.a, 500, 1e-9, "pente");
  approx(fit.b, 30,  1e-9, "intercept");
  fit.residuals.forEach((r, i) => approx(r, 0, 1e-9, `résidu ${i}`));
});

test("theilSenFit : 1 outlier ne tire pas la droite", () => {
  const pairs = T.map(t => ({ target: t, user: t * 500 }));
  pairs[3].user += 400; // outlier énorme
  const fit = theilSenFit(pairs);
  approx(fit.a, 500, 5, "pente robuste");
  approx(fit.b, 0,   30, "intercept robuste");
});

// ─── fitWithAlignment ─────────────────────────────────────────────────────────
test("fitWithAlignment : converge sur données parfaites", () => {
  const r = fitWithAlignment(mkAttempt({ user: perfectUser }), DEFAULT_PARAMS);
  approx(r.fit.a, MS_PER_UNIT, 1e-6, "pente");
  approx(r.fit.b, 0,           1e-6, "intercept");
  assert.equal(r.alignment.pairs.length, T.length);
});

test("fitWithAlignment : stable après alignement, extras n'affectent pas (a,b)", () => {
  // Ajoute une frappe parasite éloignée
  const user = [...perfectUser];
  user.splice(4, 0, 1740);
  const r = fitWithAlignment(mkAttempt({ user }), DEFAULT_PARAMS);
  approx(r.fit.a, MS_PER_UNIT, 2,  "pente ≈ parfaite malgré extra");
  approx(r.fit.b, 0,           5,  "intercept ≈ parfait malgré extra");
});

// ─── analyzeResiduals ─────────────────────────────────────────────────────────
test("analyzeResiduals : régulier → régularité ≈ 0", () => {
  const r = fitWithAlignment(mkAttempt({ user: perfectUser }), DEFAULT_PARAMS);
  const a = analyzeResiduals(r.fit, r.alignment, DEFAULT_PARAMS);
  approx(a.regularityMs, 0, 1, "regularityMs");
  assert.equal(a.drift, "none");
});

test("analyzeResiduals : tous résidus sous le bruit → régularité dead-zonée à 0", () => {
  // résidus simulés ±10 ms < inputNoiseFloorMs (15 ms par défaut)
  const user = T.map((t, i) => t * MS_PER_UNIT + (i % 2 === 0 ? 10 : -10));
  const r = fitWithAlignment(mkAttempt({ user }), DEFAULT_PARAMS);
  const a = analyzeResiduals(r.fit, r.alignment, DEFAULT_PARAMS);
  assert.ok(a.regularityMs < 5, `attendu ~0, reçu ${a.regularityMs}`);
});

test("analyzeResiduals : accélération progressive → drift = accelerating", () => {
  // Intervalles qui se raccourcissent (l'élève accélère)
  let acc = 0;
  const intervals = [600, 580, 560, 540, 520, 500, 480, 460];
  const user = intervals.map(d => (acc += d));
  user.unshift(0); user.pop(); // 8 onsets
  const r = fitWithAlignment(mkAttempt({ user }), DEFAULT_PARAMS);
  const a = analyzeResiduals(r.fit, r.alignment, DEFAULT_PARAMS);
  assert.equal(a.drift, "accelerating", `reçu ${a.drift}`);
});

test("analyzeResiduals : décélération progressive → drift = decelerating", () => {
  let acc = 0;
  const intervals = [400, 420, 440, 460, 480, 500, 520, 540];
  const user = intervals.map(d => (acc += d));
  user.unshift(0); user.pop();
  const r = fitWithAlignment(mkAttempt({ user }), DEFAULT_PARAMS);
  const a = analyzeResiduals(r.fit, r.alignment, DEFAULT_PARAMS);
  assert.equal(a.drift, "decelerating", `reçu ${a.drift}`);
});

// ─── scoreRhythm — composantes ────────────────────────────────────────────────
test("scoreRhythm : performance parfaite → total ≈ 1, aucun flag d'erreur", () => {
  const r = scoreRhythm(mkAttempt({ user: perfectUser }), DEFAULT_PARAMS);
  assert.ok(r.total > 0.95, `total = ${r.total}`);
  assert.ok(r.components.completeness > 0.99);
  assert.ok(r.components.regularity   > 0.95);
  assert.ok(r.components.offset       > 0.95);
  assert.ok(r.components.tempo        > 0.95);
  // Aucun flag négatif
  const badFlags = ["OFFSET_LATE","OFFSET_EARLY","TEMPO_FAST","TEMPO_SLOW","IRREGULAR","EXTRA_ONSETS","MISSING_ONSETS","DRIFT_ACCEL","DRIFT_DECEL"];
  for (const f of badFlags) assert.ok(!r.diagnosis.flags.includes(f), `flag inattendu : ${f}`);
});

test("scoreRhythm : motif court (3 notes) → wTempo neutralisé, pas de pénalité tempo", () => {
  const target = [0, 1, 2];
  const user = [0, 700, 1400]; // tempo 700 ms/unité, très loin du 500 cible
  const r = scoreRhythm({ targetOnsets: target, userOnsets: user, targetTempoMsPerUnit: 500, activity: 1 }, DEFAULT_PARAMS);
  // Le tempo est foireux MAIS comme N < minNotesForTempo (4), wTempo = 0 → tempo ne tue pas le score.
  assert.ok(r.components.tempo < 0.5, "tempo réellement bas...");
  assert.ok(r.total > 0.7, `... mais total préservé (${r.total})`);
});

test("scoreRhythm : motif limite (minNotesForTempo notes) → flag LOW_CONFIDENCE_REGULARITY", () => {
  const N = DEFAULT_PARAMS.minNotesForTempo;
  const target = Array.from({ length: N }, (_, i) => i);
  const user = target.map(t => t * 500);
  const r = scoreRhythm({ targetOnsets: target, userOnsets: user, targetTempoMsPerUnit: 500, activity: 1 }, DEFAULT_PARAMS);
  assert.ok(r.diagnosis.flags.includes("LOW_CONFIDENCE_REGULARITY"), `flags = ${r.diagnosis.flags.join(",")}`);
});

// ─── diagnose — un cas par flag (critère §4) ──────────────────────────────────
test("diagnose : OFFSET_LATE quand b > offsetMaxMs/2", () => {
  const user = perfectUser.map(u => u + 130); // +130 ms > 200/2
  const r = scoreRhythm(mkAttempt({ user }), DEFAULT_PARAMS);
  assert.ok(r.diagnosis.flags.includes("OFFSET_LATE"));
});

test("diagnose : OFFSET_EARLY quand b < -offsetMaxMs/2", () => {
  const user = perfectUser.map(u => u - 130);
  const r = scoreRhythm(mkAttempt({ user }), DEFAULT_PARAMS);
  assert.ok(r.diagnosis.flags.includes("OFFSET_EARLY"));
});

test("diagnose : TEMPO_FAST en activité 1 quand l'élève joue plus vite", () => {
  const user = T.map(t => t * 460); // -8% du tempo cible
  const r = scoreRhythm(mkAttempt({ user }), DEFAULT_PARAMS);
  assert.ok(r.diagnosis.flags.includes("TEMPO_FAST"), `flags = ${r.diagnosis.flags.join(",")}`);
});

test("diagnose : TEMPO_SLOW en activité 1 quand l'élève joue plus lentement", () => {
  const user = T.map(t => t * 540); // +8%
  const r = scoreRhythm(mkAttempt({ user }), DEFAULT_PARAMS);
  assert.ok(r.diagnosis.flags.includes("TEMPO_SLOW"));
});

test("diagnose : activité 2 (tempo libre) → AUCUN flag tempo même si très différent", () => {
  const user = T.map(t => t * 700); // tempo très différent
  const r = scoreRhythm({ ...mkAttempt({ user }), activity: 2, targetTempoMsPerUnit: undefined }, DEFAULT_PARAMS);
  assert.ok(!r.diagnosis.flags.includes("TEMPO_FAST"));
  assert.ok(!r.diagnosis.flags.includes("TEMPO_SLOW"));
});

test("diagnose : IRREGULAR quand dispersion > 0.6 × regMaxMs", () => {
  // Résidus alternés bien au-delà du plancher (25 ms) pour atteindre le seuil IRREGULAR (0.6 × regMaxMs)
  const user = T.map((t, i) => t * MS_PER_UNIT + (i % 2 === 0 ? 120 : -120));
  const r = scoreRhythm(mkAttempt({ user }), DEFAULT_PARAMS);
  assert.ok(r.diagnosis.flags.includes("IRREGULAR"), `regularityMs=${r.diagnosis.regularityMs}, flags=${r.diagnosis.flags.join(",")}`);
});

test("diagnose : EXTRA_ONSETS quand une frappe parasite", () => {
  const user = [...perfectUser];
  user.splice(4, 0, 1740);
  const r = scoreRhythm(mkAttempt({ user }), DEFAULT_PARAMS);
  assert.ok(r.diagnosis.flags.includes("EXTRA_ONSETS"));
  assert.equal(r.diagnosis.extraCount, 1);
});

test("diagnose : MISSING_ONSETS quand une cible manquée", () => {
  const user = perfectUser.filter((_, i) => i !== 4);
  const r = scoreRhythm(mkAttempt({ user }), DEFAULT_PARAMS);
  assert.ok(r.diagnosis.flags.includes("MISSING_ONSETS"));
  assert.equal(r.diagnosis.missingCount, 1);
});

// ─── Non-régression critique : alignement protège le fit ──────────────────────
test("NON-RÉGRESSION : EXTRA_TAP donne (a,b) ≈ PERFECT", () => {
  const perfect = scoreRhythm(mkAttempt({ user: perfectUser }), DEFAULT_PARAMS);
  const userExtra = [...perfectUser];
  userExtra.splice(4, 0, 1740);
  const extra = scoreRhythm(mkAttempt({ user: userExtra }), DEFAULT_PARAMS);
  approx(extra.fit.a, perfect.fit.a, 2, "pente EXTRA_TAP vs PERFECT");
  approx(extra.fit.b, perfect.fit.b, 5, "intercept EXTRA_TAP vs PERFECT");
});

test("NON-RÉGRESSION : MISSED_NOTE donne (a,b) ≈ PERFECT", () => {
  const perfect = scoreRhythm(mkAttempt({ user: perfectUser }), DEFAULT_PARAMS);
  const userMiss = perfectUser.filter((_, i) => i !== 4);
  const missed = scoreRhythm(mkAttempt({ user: userMiss }), DEFAULT_PARAMS);
  approx(missed.fit.a, perfect.fit.a, 2, "pente MISSED vs PERFECT");
  approx(missed.fit.b, perfect.fit.b, 5, "intercept MISSED vs PERFECT");
});

// ─── deadzone (helper) ────────────────────────────────────────────────────────
test("deadzone : neutralise sous le plancher, préserve au-dessus", () => {
  approx(deadzone(10, 15), 0, 1e-9);
  approx(deadzone(-10, 15), 0, 1e-9);
  approx(deadzone(20, 15), 5, 1e-9);
  approx(deadzone(-20, 15), -5, 1e-9);
});

// ─── median (helper) ──────────────────────────────────────────────────────────
test("median : impair, pair, vide", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), 0);
});
