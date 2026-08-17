// ─── Modèle de grille rythmique partagé ───────────────────────────────────────
// Briques communes aux activités 3/4 (distracteurs) et 5 (reconstitution) :
// durées, groupe binaire/ternaire, nombre d'attaques, et une grille TIMELINE
// uniforme (cellules attack/hold/rest) pour comparer deux rythmes case par case.

export type Fig = { dur: string; rest?: boolean; triplet?: boolean; duplet?: boolean };
export type Cell = "A" | "H" | "R"; // attack · hold (prolongation) · rest (silence)

// Durées en noires (suffixe "d" = pointé, "r" = silence).
export const DUR_Q: Record<string, number> = {
  w: 4, h: 2, hd: 3, q: 1, qd: 1.5,
  "8": 0.5, "8d": 0.75, "16": 0.25,
  wr: 4, hr: 2, qr: 1, "8r": 0.5, "16r": 0.25,
};

// Durée d'une figure en noires (triolet = ×2/3).
export function figDur(fig: Fig): number {
  const raw = fig.dur.replace(/r$/, "");
  const base = raw.endsWith("d") ? raw.slice(0, -1) : raw;
  const dur = DUR_Q[raw] ?? DUR_Q[base] ?? 1;
  if (fig.triplet) return dur * (2 / 3);
  if (fig.duplet) return dur * (3 / 2); // duolet ternaire : 2 croches dans l'espace de 3 (0,75 noire)
  return dur;
}

export function groupOf(timeSig: string): "binary" | "ternary" {
  return ["12/8", "6/8", "9/8"].includes(timeSig) ? "ternary" : "binary";
}

// Durée d'un temps en noires : 1 (binaire) ou 1.5 (ternaire = noire pointée).
export function beatQuarters(group: "binary" | "ternary"): number {
  return group === "ternary" ? 1.5 : 1;
}

// Nombre d'attaques (figures non-silences).
export function attackCount(figs: Fig[]): number {
  return figs.filter((f) => !f.rest).length;
}

// Grille TIMELINE uniforme : `ticksPerBeat = base × 3` pour que les subdivisions
// duples (/2, /4) ET le triolet (/3) tombent toutes sur des entiers → comparaison
// linéaire valide même en mélange duple/triolet. "16" → 12 ticks/temps, "8" → 6.
export function toTimelineCells(
  figs: Fig[],
  group: "binary" | "ternary",
  finestUnit: string,
): Cell[] {
  const ticksPerBeat = (finestUnit === "16" ? 4 : 2) * 3;
  const cd = beatQuarters(group) / ticksPerBeat; // noires par tick
  const totalQ = figs.reduce((s, f) => s + figDur(f), 0);
  const totalCells = Math.max(0, Math.round(totalQ / cd));
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
  return cells;
}
