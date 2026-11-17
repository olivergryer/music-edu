// ─── Algèbre dense minimale (matrices symétriques définies positives) ─────────
// Matrices stockées en Float64Array ligne par ligne (n×n).

/** Cholesky en place (triangle inférieur). Retourne false si non définie positive. */
export function cholesky(a: Float64Array, n: number, ridge = 0): boolean {
  for (let i = 0; i < n; i++) a[i * n + i] += ridge
  for (let j = 0; j < n; j++) {
    let d = a[j * n + j]
    for (let k = 0; k < j; k++) d -= a[j * n + k] * a[j * n + k]
    if (!(d > 1e-300)) return false
    const ljj = Math.sqrt(d)
    a[j * n + j] = ljj
    for (let i = j + 1; i < n; i++) {
      let s = a[i * n + j]
      for (let k = 0; k < j; k++) s -= a[i * n + k] * a[j * n + k]
      a[i * n + j] = s / ljj
    }
  }
  return true
}

/** Résout L Lᵀ x = b, L issue de `cholesky`. Écrit dans x (peut être b). */
export function resoudreCholesky(L: Float64Array, n: number, b: ArrayLike<number>, x: Float64Array): void {
  for (let i = 0; i < n; i++) {
    let s = b[i]
    for (let k = 0; k < i; k++) s -= L[i * n + k] * x[k]
    x[i] = s / L[i * n + i]
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = x[i]
    for (let k = i + 1; k < n; k++) s -= L[k * n + i] * x[k]
    x[i] = s / L[i * n + i]
  }
}

/** Inverse d'une matrice SDP à partir de son Cholesky. */
export function inverseCholesky(L: Float64Array, n: number): Float64Array {
  const inv = new Float64Array(n * n)
  const e = new Float64Array(n)
  const col = new Float64Array(n)
  for (let j = 0; j < n; j++) {
    e.fill(0); e[j] = 1
    resoudreCholesky(L, n, e, col)
    for (let i = 0; i < n; i++) inv[i * n + j] = col[i]
  }
  return inv
}
