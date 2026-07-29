// ─── RNG déterministe à graine (injecté partout — spec §12) ───────────────────
//
// mulberry32 : générateur 32 bits rapide et reproductible. Aucune fonction de
// tirage n'appelle Math.random directement ; elles reçoivent un `Rng`, ce qui rend
// pool/sélection/lignes testables avec une graine fixe.

export type Rng = () => number

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Tirage pondéré : renvoie l'index choisi selon les poids (≥ 0). Renvoie -1 si la
// somme des poids est nulle. Consomme exactement un `rng()`.
export function weightedPick(weights: number[], rng: Rng): number {
  const total = weights.reduce((s, w) => s + Math.max(0, w), 0)
  if (total <= 0) return -1
  let r = rng() * total
  for (let i = 0; i < weights.length; i++) {
    r -= Math.max(0, weights[i])
    if (r < 0) return i
  }
  return weights.length - 1
}
