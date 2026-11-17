// ─── Rééchantillonnage vers 16 kHz (spec §6.4) ────────────────────────────────
// Sinc fenêtré (Hann), coupure à 0,45·fsSortie. Gère les rapports non entiers
// (44,1 kHz → 16 kHz) en plus de 48 → 16.

export function reechantillonner(x: ArrayLike<number>, fsEntree: number, fsSortie = 16000, demiTaps = 24): Float32Array {
  if (fsEntree === fsSortie) return Float32Array.from(x as ArrayLike<number>)
  const ratio = fsEntree / fsSortie
  const nOut = Math.floor((x.length - 1) / ratio) + 1
  const out = new Float32Array(nOut)
  const fc = Math.min(0.45 * fsSortie, 0.45 * fsEntree) / fsEntree    // cycles/échantillon d'entrée
  const demi = demiTaps * Math.max(1, ratio)
  for (let m = 0; m < nOut; m++) {
    const centre = m * ratio
    const i0 = Math.max(0, Math.ceil(centre - demi)), i1 = Math.min(x.length - 1, Math.floor(centre + demi))
    let s = 0, gain = 0
    for (let i = i0; i <= i1; i++) {
      const d = i - centre
      const arg = 2 * Math.PI * fc * d
      const sinc = Math.abs(arg) < 1e-12 ? 1 : Math.sin(arg) / arg
      const w = 0.5 * (1 + Math.cos(Math.PI * d / demi))
      const h = 2 * fc * sinc * w
      s += h * x[i]; gain += h
    }
    out[m] = gain > 0 ? s / gain : 0
  }
  return out
}
