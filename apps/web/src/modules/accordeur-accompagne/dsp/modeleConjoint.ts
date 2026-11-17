// ─── Modèle conjoint playback + élève (spec §6.4) ────────────────────────────
//
//   x(t) ≈ Σ_j Re{ C_j e^{i 2π f_j t} }  +  Σ_{k=1..K} Re{ S_k e^{i 2π k f0 t} }
//
// f_j : partiels (fusionnés) du playback, connus. C_j, S_k : amplitudes complexes
// inconnues (linéaires). f0 : seule inconnue non linéaire. À f0 fixé, moindres carrés
// pondérés (Hann). On minimise l'énergie résiduelle E(f0).
//
// Les phases du playback n'interviennent pas : elles sont absorbées dans C_j
// (le retard de la boucle acoustique aussi).
//
// Calcul : produits scalaires entre sinusoïdes en forme close (transformée de la
// Hann), bloc du playback pré-inversé une fois par fenêtre, complément de Schur
// creux pour les blocs qui dépendent de f0, projections du signal par FFT
// interpolée (grille grossière) ou exactes (raffinement).

import { cholesky, inverseCholesky, resoudreCholesky } from './algebre.ts'
import { hann, transformeeHann } from './fenetre.ts'
import { membreDominant, type PartielFusionne } from './fusionPartiels.ts'
import type { Battement } from './types.ts'

const DEUX_PI = 2 * Math.PI
const LN2 = Math.LN2

export type OptionsModele = {
  kMax?: number               // harmoniques max de l'élève (16)
  bandeHz?: number            // plafond de bande (6000)
  seuilResolutionHz?: number  // défaut 1/(2T)
  pasGrilleCents?: number     // 2
  demiLargeurCents?: number   // 60
  kGrossier?: number          // harmoniques utilisées pour la grille (8)
  seuilF?: number             // seuil de la statistique de présence (25)
  coupureBins?: number        // couplage négligé au-delà (16 bins)
  battementMaxHz?: number     // 25
  gainRelatifMin?: number     // plancher de présence : (E_playback − E) / énergie du signal (1e-6 ≈ −60 dB)
}

const DEF = {
  kMax: 16, bandeHz: 6000, pasGrilleCents: 2, demiLargeurCents: 60,
  kGrossier: 8, seuilF: 25, coupureBins: 16, battementMaxHz: 25, gainRelatifMin: 1e-6,
}

// ─── FFT radix-2 ─────────────────────────────────────────────────────────────
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) { const tr = re[i]; re[i] = re[j]; re[j] = tr; const ti = im[i]; im[i] = im[j]; im[j] = ti }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -DEUX_PI / len
    const wr = Math.cos(ang), wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = i + k + len / 2
        const xr = re[b] * cr - im[b] * ci
        const xi = re[b] * ci + im[b] * cr
        re[b] = re[a] - xr; im[b] = im[a] - xi
        re[a] += xr; im[a] += xi
        const ncr = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = ncr
      }
    }
  }
}

/** Projections Σ wy·cos(ωn) et Σ wy·sin(ωn), exactes (récurrence de rotation). */
function projeterExact(wy: Float64Array, omega: number, out: Float64Array, off: number): void {
  const dc = Math.cos(omega), ds = Math.sin(omega)
  let c = 1, s = 0, sc = 0, ss = 0
  for (let n = 0; n < wy.length; n++) {
    sc += wy[n] * c; ss += wy[n] * s
    const nc = c * dc - s * ds
    s = s * dc + c * ds
    c = nc
    if ((n & 1023) === 1023) { const r = 1 / Math.hypot(c, s); c *= r; s *= r }
  }
  out[off] = sc; out[off + 1] = ss
}

/** Spectre du signal fenêtré, suréchantillonné ×pad, interpolable (Lagrange 4 points). */
class SpectreInterp {
  private re: Float64Array
  private im: Float64Array
  private M: number
  private demiN: number
  constructor(wy: Float64Array, pad = 8) {
    const N = wy.length
    let M = 1; while (M < N * pad) M <<= 1
    this.M = M
    this.demiN = (N - 1) / 2
    const re = new Float64Array(M), im = new Float64Array(M)
    re.set(wy)
    fft(re, im)
    // dé-rotation de la phase linéaire e^{−iω(N−1)/2}
    for (let q = 0; q <= M / 2; q++) {
      const ph = (DEUX_PI * q / M) * this.demiN
      const c = Math.cos(ph), s = Math.sin(ph)
      const r = re[q], i = im[q]
      re[q] = r * c - i * s; im[q] = r * s + i * c
    }
    this.re = re; this.im = im
  }
  /** Σ wy cos(ωn) → out[off], Σ wy sin(ωn) → out[off+1]. */
  eval(omega: number, out: Float64Array, off: number): void {
    const x = omega * this.M / DEUX_PI
    const i0 = Math.floor(x)
    const t = x - i0
    const l0 = -t * (t - 1) * (t - 2) / 6
    const l1 = (t + 1) * (t - 1) * (t - 2) / 2
    const l2 = -(t + 1) * t * (t - 2) / 2
    const l3 = (t + 1) * t * (t - 1) / 6
    const a = Math.max(1, i0)
    const idx = [a - 1, a, a + 1, a + 2]
    const lw = [l0, l1, l2, l3]
    let zr = 0, zi = 0
    for (let m = 0; m < 4; m++) { zr += lw[m] * this.re[idx[m]]; zi += lw[m] * this.im[idx[m]] }
    // re-rotation à la fréquence exacte puis conjugaison (Y = Σ wy e^{−iωn})
    const ph = -omega * this.demiN
    const c = Math.cos(ph), s = Math.sin(ph)
    const yr = zr * c - zi * s, yi = zr * s + zi * c
    out[off] = yr; out[off + 1] = -yi
  }
}

// ─── Contexte par fenêtre ────────────────────────────────────────────────────
export type Contexte = {
  N: number; fs: number
  wy: Float64Array
  Ey: number; sumW: number; sumW2: number; nEff: number
  pb: PartielFusionne[]; P: number
  omPb: Float64Array
  Ginv: Float64Array      // (2P)² inverse du bloc playback
  u: Float64Array         // Ginv · bp : amplitudes du playback seul
  EP: number              // énergie résiduelle « playback seul »
  _spectre: SpectreInterp | null
  seuilResHz: number
  opts: Required<OptionsModele>
}

function spectreDe(ctx: Contexte): SpectreInterp {
  return (ctx._spectre ??= new SpectreInterp(ctx.wy))
}

/** Produits scalaires fenêtrés entre (cos a, sin a) et (cos b, sin b) : [cc, cs, sc, ss]. */
const _w1 = new Float64Array(2), _w2 = new Float64Array(2)
function bloc(a: number, b: number, N: number, out: Float64Array, off: number): void {
  transformeeHann(a - b, N, _w1)
  transformeeHann(a + b, N, _w2)
  out[off] = 0.5 * (_w1[0] + _w2[0])
  out[off + 1] = 0.5 * (_w2[1] - _w1[1])
  out[off + 2] = 0.5 * (_w2[1] + _w1[1])
  out[off + 3] = 0.5 * (_w1[0] - _w2[0])
}

export function creerContexte(y: ArrayLike<number>, fs: number, pb: PartielFusionne[], options: OptionsModele = {}): Contexte {
  const opts = { ...DEF, seuilResolutionHz: 0, ...options } as Required<OptionsModele>
  const N = y.length
  const w = hann(N)
  const wy = new Float64Array(N)
  let Ey = 0, sumW = 0, sumW2 = 0
  for (let n = 0; n < N; n++) { wy[n] = w[n] * y[n]; Ey += wy[n] * y[n]; sumW += w[n]; sumW2 += w[n] * w[n] }
  if (!opts.seuilResolutionHz) opts.seuilResolutionHz = 1 / (2 * (N / fs))
  const P = pb.length
  const omPb = Float64Array.from(pb, p => DEUX_PI * p.freqHz / fs)

  const n2 = 2 * P
  const G = new Float64Array(n2 * n2)
  const tmp = new Float64Array(4)
  for (let i = 0; i < P; i++) for (let j = i; j < P; j++) {
    bloc(omPb[i], omPb[j], N, tmp, 0)
    G[(2 * i) * n2 + 2 * j] = tmp[0]; G[(2 * i) * n2 + 2 * j + 1] = tmp[1]
    G[(2 * i + 1) * n2 + 2 * j] = tmp[2]; G[(2 * i + 1) * n2 + 2 * j + 1] = tmp[3]
    if (j !== i) {
      G[(2 * j) * n2 + 2 * i] = tmp[0]; G[(2 * j + 1) * n2 + 2 * i] = tmp[1]
      G[(2 * j) * n2 + 2 * i + 1] = tmp[2]; G[(2 * j + 1) * n2 + 2 * i + 1] = tmp[3]
    }
  }
  const bp = new Float64Array(n2)
  for (let j = 0; j < P; j++) projeterExact(wy, omPb[j], bp, 2 * j)

  let Ginv: Float64Array = new Float64Array(0), u: Float64Array = new Float64Array(0), EP = Ey
  if (P > 0) {
    const L = G.slice()
    let tr = 0; for (let i = 0; i < n2; i++) tr += G[i * n2 + i]
    if (!cholesky(L, n2, 1e-10 * tr / n2)) throw new Error('Bloc playback non défini positif')
    Ginv = inverseCholesky(L, n2)
    u = new Float64Array(n2)
    for (let r = 0; r < n2; r++) { let s = 0; for (let c = 0; c < n2; c++) s += Ginv[r * n2 + c] * bp[c]; u[r] = s }
    let q = 0; for (let r = 0; r < n2; r++) q += bp[r] * u[r]
    EP = Math.max(0, Ey - q)
  }
  return {
    N, fs, wy, Ey, sumW, sumW2, nEff: (sumW * sumW) / sumW2,
    pb, P, omPb, Ginv, u, EP, _spectre: null, seuilResHz: opts.seuilResolutionHz, opts,
  }
}

// ─── Évaluation de E(f0) ─────────────────────────────────────────────────────
export type Evaluation = {
  f0: number; K: number
  libres: number[]        // harmoniques k estimées
  nonResolues: number[]   // harmoniques k absorbées par un partiel du playback
  E: number; crit: number; nParams: number
  degenere: boolean       // aucune harmonique libre
  s?: Float64Array        // coefficients [cos,sin] des harmoniques libres
  c?: Float64Array        // coefficients [cos,sin] du playback (avec élève)
}

function distanceMin(f: number, pb: PartielFusionne[]): number {
  let d = Infinity
  for (const p of pb) { const x = Math.abs(f - p.freqHz); if (x < d) d = x }
  return d
}

export function harmoniquesDe(ctx: Contexte, f0: number, kMax: number): { libres: number[]; nonResolues: number[]; K: number } {
  const K = Math.max(0, Math.min(kMax, Math.floor(ctx.opts.bandeHz / f0)))
  const libres: number[] = [], nonResolues: number[] = []
  for (let k = 1; k <= K; k++) {
    if (distanceMin(k * f0, ctx.pb) < ctx.seuilResHz) nonResolues.push(k); else libres.push(k)
  }
  return { libres, nonResolues, K }
}

export function evaluer(
  ctx: Contexte, f0: number,
  o: { exact: boolean; kMax: number; libresForces?: number[]; detail?: boolean; nLibresMax?: number },
): Evaluation {
  const { N, fs, P } = ctx
  const { libres: lib0, nonResolues, K } = harmoniquesDe(ctx, f0, o.kMax)
  const libres = o.libresForces ?? (o.nLibresMax ? lib0.slice(0, o.nLibresMax) : lib0)
  const nF = libres.length
  const nParams = 2 * P + 2 * nF
  const critDe = (E: number) => ctx.nEff * Math.log((E + 1e-10 * ctx.Ey) / ctx.nEff) + nParams * Math.log(ctx.nEff)
  if (nF === 0) return { f0, K, libres, nonResolues, E: ctx.EP, crit: critDe(ctx.EP), nParams, degenere: true }

  const om0 = DEUX_PI * f0 / fs
  const n2 = 2 * nF, p2 = 2 * P
  // projections du signal
  const bs = new Float64Array(n2)
  for (let i = 0; i < nF; i++) {
    const om = om0 * libres[i]
    if (o.exact) projeterExact(ctx.wy, om, bs, 2 * i); else spectreDe(ctx).eval(om, bs, 2 * i)
  }
  // Gss
  const Gss = new Float64Array(n2 * n2)
  const tmp = new Float64Array(4)
  for (let i = 0; i < nF; i++) for (let l = i; l < nF; l++) {
    bloc(om0 * libres[i], om0 * libres[l], N, tmp, 0)
    Gss[(2 * i) * n2 + 2 * l] = tmp[0]; Gss[(2 * i) * n2 + 2 * l + 1] = tmp[1]
    Gss[(2 * i + 1) * n2 + 2 * l] = tmp[2]; Gss[(2 * i + 1) * n2 + 2 * l + 1] = tmp[3]
    if (l !== i) {
      Gss[(2 * l) * n2 + 2 * i] = tmp[0]; Gss[(2 * l + 1) * n2 + 2 * i] = tmp[1]
      Gss[(2 * l) * n2 + 2 * i + 1] = tmp[2]; Gss[(2 * l + 1) * n2 + 2 * i + 1] = tmp[3]
    }
  }
  // Gps creux : par colonne, lignes + valeurs
  const coupure = ctx.opts.coupureBins * DEUX_PI / N
  const colRows: number[][] = Array.from({ length: n2 }, () => [])
  const colVals: number[][] = Array.from({ length: n2 }, () => [])
  for (let i = 0; i < nF; i++) {
    const a = om0 * libres[i]
    for (let j = 0; j < P; j++) {
      const b = ctx.omPb[j]
      if (Math.abs(a - b) > coupure && a + b > coupure) continue
      bloc(b, a, N, tmp, 0)   // (cos/sin du playback) × (cos/sin de l'élève)
      colRows[2 * i].push(2 * j, 2 * j + 1);     colVals[2 * i].push(tmp[0], tmp[2])
      colRows[2 * i + 1].push(2 * j, 2 * j + 1); colVals[2 * i + 1].push(tmp[1], tmp[3])
    }
  }
  // Schur : Ĝ = Gss − Gpsᵀ Ginv Gps ; b̂ = bs − Gpsᵀ u
  const Gh = Gss.slice()
  const bh = bs.slice()
  const z = new Float64Array(p2)
  for (let c = 0; c < n2; c++) {
    const rows = colRows[c], vals = colVals[c]
    if (!rows.length) continue
    z.fill(0)
    for (let t = 0; t < rows.length; t++) {
      const v = vals[t], r = rows[t]
      for (let q = 0; q < p2; q++) z[q] += v * ctx.Ginv[q * p2 + r]
    }
    for (let d = 0; d < n2; d++) {
      const rd = colRows[d], vd = colVals[d]
      let s = 0
      for (let t = 0; t < rd.length; t++) s += vd[t] * z[rd[t]]
      Gh[d * n2 + c] -= s
    }
    let su = 0
    for (let t = 0; t < rows.length; t++) su += vals[t] * ctx.u[rows[t]]
    bh[c] -= su
  }
  // symétrisation (erreurs d'arrondi) + résolution
  for (let i = 0; i < n2; i++) for (let j = i + 1; j < n2; j++) { const m = 0.5 * (Gh[i * n2 + j] + Gh[j * n2 + i]); Gh[i * n2 + j] = m; Gh[j * n2 + i] = m }
  let tr = 0; for (let i = 0; i < n2; i++) tr += Gh[i * n2 + i]
  const L = Gh.slice()
  if (!cholesky(L, n2, 1e-10 * Math.max(tr / n2, 1e-300))) {
    return { f0, K, libres, nonResolues, E: ctx.EP, crit: critDe(ctx.EP), nParams, degenere: true }
  }
  const s = new Float64Array(n2)
  resoudreCholesky(L, n2, bh, s)
  let gain = 0; for (let i = 0; i < n2; i++) gain += bh[i] * s[i]
  const E = Math.max(0, ctx.EP - gain)
  const ev: Evaluation = { f0, K, libres, nonResolues, E, crit: critDe(E), nParams, degenere: false }
  if (o.detail) {
    ev.s = s
    // c = u − Ginv · (Gps s)
    const gs = new Float64Array(p2)
    for (let c = 0; c < n2; c++) for (let t = 0; t < colRows[c].length; t++) gs[colRows[c][t]] += colVals[c][t] * s[c]
    const cc = new Float64Array(p2)
    for (let r = 0; r < p2; r++) { let q = 0; for (let m = 0; m < p2; m++) q += ctx.Ginv[r * p2 + m] * gs[m]; cc[r] = ctx.u[r] - q }
    ev.c = cc
  }
  return ev
}

// ─── Recherche de f0 ─────────────────────────────────────────────────────────
export type ResultatModele = {
  f0Hz: number | null
  sigmaCents: number
  E: number; EPlayback: number
  statF: number
  presence: boolean
  degenere: boolean
  libres: number[]; nonResolues: number[]
  battements: Battement[]
  ampEleve: { k: number; amp: number }[]
  ampPlayback: number[]
  scores: { f0Hz: number; crit: number }[]
}

const centsVers = (f: number, c: number) => f * Math.pow(2, c / 1200)

function dedoublonner(cands: number[], tolCents: number): number[] {
  const tri = [...cands].filter(f => f > 0).sort((a, b) => a - b)
  const out: number[] = []
  for (const f of tri) if (!out.length || 1200 * Math.log2(f / out[out.length - 1]) > tolCents) out.push(f)
  return out
}

/**
 * Raffinement exact par recherche en section dorée dans [−demi, +demi] ¢ autour de
 * f0Depart (le minimum y est encadré par la grille). Ensemble d'harmoniques figé.
 */
function raffiner(ctx: Contexte, f0Depart: number, demiCents: number): Evaluation {
  const kMax = ctx.opts.kMax
  const libres = evaluer(ctx, f0Depart, { exact: true, kMax }).libres
  const E = (c: number) => evaluer(ctx, centsVers(f0Depart, c), { exact: true, kMax, libresForces: libres }).E
  const PHI = 0.6180339887498949
  let a = -demiCents, b = demiCents
  let c = b - PHI * (b - a), d = a + PHI * (b - a)
  let Ec = E(c), Ed = E(d)
  for (let it = 0; it < 12; it++) {
    if (Ec < Ed) { b = d; d = c; Ed = Ec; c = b - PHI * (b - a); Ec = E(c) }
    else { a = c; c = d; Ec = Ed; d = a + PHI * (b - a); Ed = E(d) }
  }
  return evaluer(ctx, centsVers(f0Depart, 0.5 * (a + b)), { exact: true, kMax, libresForces: libres, detail: true })
}
/** Largeur approximative (¢) du bassin de E(f0) : ≈ 1731 / (K·f0·T). */
export function largeurBassinCents(ctx: Contexte, f0: number): number {
  const K = Math.max(1, Math.min(ctx.opts.kGrossier, Math.floor(ctx.opts.bandeHz / f0)))
  return 1731 / (K * f0 * (ctx.N / ctx.fs))
}

/** Estime f0 à partir de candidats (Hz). Retourne null si aucun candidat n'est exploitable. */
export function ajusterF0(ctx: Contexte, candidats: number[], surcharge: { demiLargeurCents?: number } = {}): ResultatModele {
  const o = ctx.opts
  const demi = surcharge.demiLargeurCents ?? o.demiLargeurCents
  const cands = dedoublonner(candidats, demi)
  const vide: ResultatModele = {
    f0Hz: null, sigmaCents: Infinity, E: ctx.EP, EPlayback: ctx.EP, statF: 0, presence: false, degenere: true,
    libres: [], nonResolues: [], battements: [], ampEleve: [], ampPlayback: [], scores: [],
  }
  if (!cands.length) return vide

  // 1) grille grossière (projections interpolées, K réduit) autour de chaque candidat
  const scores: { f0Hz: number; crit: number }[] = []
  for (const c of cands) {
    let best: Evaluation | null = null
    // le pas suit la largeur du bassin (fenêtre longue → minimum étroit)
    const pas = Math.max(0.03, Math.min(o.pasGrilleCents, 0.35 * largeurBassinCents(ctx, c)))
    for (let d = -demi; d <= demi + 1e-9; d += pas) {
      const f = centsVers(c, d)
      const ev = evaluer(ctx, f, { exact: false, kMax: o.kMax, nLibresMax: o.kGrossier })
      if (!best || ev.crit < best.crit) best = ev
    }
    if (best) scores.push({ f0Hz: best.f0, crit: best.crit, pas } as { f0Hz: number; crit: number; pas: number })
  }
  scores.sort((a, b) => a.crit - b.crit)

  // 2) raffinement exact des deux meilleurs, choix par critère complet
  let final: Evaluation | null = null
  for (const sc of scores.slice(0, 2)) {
    const ev = raffiner(ctx, sc.f0Hz, (sc as unknown as { pas: number }).pas * 1.2)
    if (!final || ev.crit < final.crit) final = ev
  }
  if (!final) return vide
  if (final.degenere) return { ...vide, f0Hz: final.f0, nonResolues: final.nonResolues, scores }

  // 3) incertitude : courbure de E(f0) à ±1 ¢, variance du bruit résiduel
  const libres = final.libres
  const e0 = final.E
  const em = evaluer(ctx, centsVers(final.f0, -1), { exact: true, kMax: o.kMax, libresForces: libres }).E
  const ep = evaluer(ctx, centsVers(final.f0, +1), { exact: true, kMax: o.kMax, libresForces: libres }).E
  const hHz = final.f0 * (Math.pow(2, 1 / 1200) - 1)
  const d2 = (em - 2 * e0 + ep) / (hHz * hHz)
  const dof = ctx.nEff - final.nParams
  const sigma2 = dof > 1 ? e0 / (ctx.sumW * Math.max(1e-9, 1 - final.nParams / ctx.nEff)) : Infinity
  const varF = d2 > 0 ? sigma2 * (ctx.sumW2 / ctx.sumW) * 2 / d2 : Infinity
  const sigmaCents = Number.isFinite(varF) ? (1200 / LN2) * Math.sqrt(varF) / final.f0 : Infinity

  // 4) présence : l'élève réduit-il significativement l'énergie du modèle « playback seul » ?
  const nS = 2 * libres.length
  const statF = dof > 0 && e0 > 0 ? ((ctx.EP - e0) / nS) / (e0 / dof) : (ctx.EP > e0 ? Infinity : 0)
  // plancher absolu : sans bruit, E → 0 et F explose pour un gain négligeable
  const presence = statF > o.seuilF && (ctx.EP - e0) > o.gainRelatifMin * ctx.Ey

  // 5) battements
  const amp = (v: Float64Array, i: number) => Math.hypot(v[2 * i], v[2 * i + 1])
  const ampEleve = libres.map((k, i) => ({ k, amp: amp(final!.s!, i) }))
  const ampPlayback = ctx.pb.map((_, j) => amp(final!.c!, j))
  const battements: Battement[] = []
  for (let k = 1; k <= final.K; k++) {
    const fk = k * final.f0
    for (let j = 0; j < ctx.P; j++) {
      const delta = fk - ctx.pb[j].freqHz
      if (Math.abs(delta) >= o.battementMaxHz) continue
      const dom = membreDominant(ctx.pb[j])
      const iLibre = libres.indexOf(k)
      const resolu = iLibre >= 0
      let intensite = 0
      if (resolu) {
        const a = ampEleve[iLibre].amp, b = ampPlayback[j]
        intensite = Math.max(a, b) > 0 ? Math.min(a, b) / Math.max(a, b) : 0
      }
      battements.push({ voix: dom.voix, kEleve: k, mPlayback: dom.m, deltaHz: delta, intensite, resolu })
    }
  }
  return {
    f0Hz: final.f0, sigmaCents, E: e0, EPlayback: ctx.EP, statF, presence, degenere: false,
    libres, nonResolues: final.nonResolues, battements, ampEleve, ampPlayback, scores,
  }
}

/** Amplitudes du playback seul (sans élève) : sert à apprendre le niveau (§6.6). */
export function amplitudesPlaybackSeul(ctx: Contexte): number[] {
  return ctx.pb.map((_, j) => Math.hypot(ctx.u[2 * j], ctx.u[2 * j + 1]))
}
