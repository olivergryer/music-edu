// ─── RNG déterministe à graine ───────────────────────────────────────────────
//
// `genererProgression` est déterministe par seed (spec §3) : indispensable pour
// rejouer un exercice raté et pour les tests. Aucune fonction de tirage n'appelle
// `Math.random` directement ; elles reçoivent un `Rng`.
//
// Copie assumée de `modules/notes/rng.ts` (30 lignes, zéro dépendance) pour garder
// les modules indépendants. À factoriser dans `src/lib/rng.ts` le jour où un
// troisième module en a besoin.

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

// Tirage uniforme dans un tableau. Renvoie `undefined` si vide. Un `rng()` consommé.
export function pick<T>(items: readonly T[], rng: Rng): T | undefined {
  if (items.length === 0) return undefined
  return items[Math.floor(rng() * items.length)]
}

// Entier uniforme dans [min, max] inclus. Un `rng()` consommé.
export function pickInt(min: number, max: number, rng: Rng): number {
  return min + Math.floor(rng() * (max - min + 1))
}
