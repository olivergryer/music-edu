// ─── Statistiques pures (partagées sélection/summary) ─────────────────────────

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0
  return xs.reduce((s, x) => s + x, 0) / xs.length
}

export function median(xs: number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export function stddev(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  const variance = xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length
  return Math.sqrt(variance)
}

// Coefficient de variation = écart-type / moyenne. 0 si moyenne nulle ou < 2 points.
export function coefficientOfVariation(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  if (m === 0) return 0
  return stddev(xs) / m
}
