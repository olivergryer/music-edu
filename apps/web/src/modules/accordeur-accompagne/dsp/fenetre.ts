// ─── Fenêtre de Hann et sa transformée en forme close ────────────────────────
// Sert à calculer les produits scalaires fenêtrés entre sinusoïdes sans sommer
// sur les échantillons : ⟨cos a, cos b⟩_w = ½[Wr(a−b) + Wr(a+b)], etc.

/** Hann périodique : w[n] = ½(1 − cos(2πn/N)). */
export function hann(N: number): Float64Array {
  const w = new Float64Array(N)
  for (let n = 0; n < N; n++) w[n] = 0.5 * (1 - Math.cos((2 * Math.PI * n) / N))
  return w
}

const DEUX_PI = 2 * Math.PI

/** D(Ω) = Σ_{n=0}^{N−1} e^{iΩn}, écrit dans out[0] (réel), out[1] (imag). */
function dirichlet(omega: number, N: number, out: Float64Array, off: number): void {
  const demi = omega / 2
  const sd = Math.sin(demi)
  let r: number
  if (Math.abs(sd) < 1e-9) {
    // limite en Ω = 2πm : sin(NΩ/2)/sin(Ω/2) → N·(−1)^{m(N−1)}
    r = N * Math.cos(N * demi) / Math.cos(demi)
  } else {
    r = Math.sin(N * demi) / sd
  }
  const phi = omega * (N - 1) / 2
  out[off] = r * Math.cos(phi)
  out[off + 1] = r * Math.sin(phi)
}

const _tmp = new Float64Array(6)

/**
 * W(Ω) = Σ w[n] e^{iΩn} pour la Hann périodique de longueur N.
 * Résultat dans out[0] (partie réelle) et out[1] (partie imaginaire).
 */
export function transformeeHann(omega: number, N: number, out: Float64Array): void {
  const beta = DEUX_PI / N
  dirichlet(omega, N, _tmp, 0)
  dirichlet(omega - beta, N, _tmp, 2)
  dirichlet(omega + beta, N, _tmp, 4)
  out[0] = 0.5 * _tmp[0] - 0.25 * _tmp[2] - 0.25 * _tmp[4]
  out[1] = 0.5 * _tmp[1] - 0.25 * _tmp[3] - 0.25 * _tmp[5]
}
