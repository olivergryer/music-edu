// ─── Stroboscope par démodulation (spec §6.7) ─────────────────────────────────
// Pour chaque voix v et partiel m = 1..6 : z = passe-bas{ x[n]·e^{−iω_{v,m}n} }
// (Butterworth ordre 2 à 25 Hz, décimé à 200 Hz). Le playback donne un centre
// Ĉ constant ; le partiel de l'élève à Δ Hz tourne autour à la vitesse Δ.
// arg(z − Ĉ) tourne donc au rythme du battement, son sens donne le signe de Δ
// (Δ = partiel élève − partiel playback).
//
// Pur : utilisé tel quel dans le worklet et dans les tests.

import { cholesky, resoudreCholesky } from './algebre.ts'
import type { EtatStrobe } from './types.ts'

export type OptionsStrobe = { lpHz?: number; sortieHz?: number; tauCentreS?: number; mMax?: number }

type Demod = {
  voix: number; m: number; omega: number; cosw: number; sinw: number
  cr: number; ci: number          // phaseur courant e^{−iωn}
  // biquads (forme transposée II) pour I et Q
  i1: number; i2: number; q1: number; q2: number
  z: [number, number]
  centre: [number, number] | null
  angle: number; vitesse: number; angleOk: boolean
}

/** Cercle par moindres carrés (Kåsa) : retourne le centre. */
export function centreParCercle(pts: [number, number][]): [number, number] | null {
  if (pts.length < 6) return null
  // x²+y² + D x + E y + F = 0  →  moindres carrés sur (D,E,F)
  const A = new Float64Array(9), b = new Float64Array(3)
  for (const [x, y] of pts) {
    const r = [x, y, 1], t = -(x * x + y * y)
    for (let i = 0; i < 3; i++) { b[i] += r[i] * t; for (let j = 0; j < 3; j++) A[i * 3 + j] += r[i] * r[j] }
  }
  if (!cholesky(A, 3, 1e-12)) return null
  const sol = new Float64Array(3)
  resoudreCholesky(A, 3, b, sol)
  return [-sol[0] / 2, -sol[1] / 2]
}

export class Strobe {
  private fs: number
  private demods: Demod[] = []
  private nbVoix = 0
  private b0: number; private b1: number; private b2: number; private a1: number; private a2: number
  private D: number
  private compteur = 0
  private dtSortie: number
  private alphaCentre: number
  private presentFlag = false
  private tampon: [number, number][][] = []   // collecte pour l'ajustement de cercle
  private collecte = 0
  private mMax: number
  private static readonly NB_COLLECTE = 60    // 300 ms à 200 Hz

  constructor(fs: number, o: OptionsStrobe = {}) {
    this.fs = fs
    const lp = o.lpHz ?? 25, sortie = o.sortieHz ?? 200
    this.mMax = o.mMax ?? 6
    this.D = Math.max(1, Math.round(fs / sortie))
    this.dtSortie = this.D / fs
    this.alphaCentre = this.dtSortie / (o.tauCentreS ?? 0.3)
    const K = Math.tan(Math.PI * lp / fs), norm = 1 / (1 + Math.SQRT2 * K + K * K)
    this.b0 = K * K * norm; this.b1 = 2 * this.b0; this.b2 = this.b0
    this.a1 = 2 * (K * K - 1) * norm; this.a2 = (1 - Math.SQRT2 * K + K * K) * norm
  }

  /** Nouvel accord : fréquences fondamentales des voix. Réinitialise les centres. */
  definirVoix(freqsVoix: number[]): void {
    this.nbVoix = freqsVoix.length
    this.demods = []
    freqsVoix.forEach((f, v) => {
      for (let m = 1; m <= this.mMax; m++) {
        this.demods.push({
          voix: v, m, omega: 2 * Math.PI * m * f / this.fs, cosw: Math.cos(2 * Math.PI * m * f / this.fs), sinw: Math.sin(2 * Math.PI * m * f / this.fs), cr: 1, ci: 0,
          i1: 0, i2: 0, q1: 0, q2: 0, z: [0, 0], centre: null, angle: 0, vitesse: 0, angleOk: false,
        })
      }
    })
    this.compteur = 0
    this.collecte = 0
    this.tampon = this.demods.map(() => [])
    this.presentFlag = false
  }

  /** L'élève joue-t-il ? Absent : le centre suit (τ = 300 ms). Présent : il est figé. */
  definirPresence(present: boolean): void {
    if (present && !this.presentFlag && this.demods.some(d => d.centre === null)) this.collecte = Strobe.NB_COLLECTE
    this.presentFlag = present
  }

  traiter(x: ArrayLike<number>): void {
    const { b0, b1, b2, a1, a2, D } = this
    for (let n = 0; n < x.length; n++) {
      const xn = x[n]
      for (const d of this.demods) {
        const I = xn * d.cr, Q = xn * d.ci   // x · e^{−iωn}
        const yi = b0 * I + d.i1; d.i1 = b1 * I - a1 * yi + d.i2; d.i2 = b2 * I - a2 * yi
        const yq = b0 * Q + d.q1; d.q1 = b1 * Q - a1 * yq + d.q2; d.q2 = b2 * Q - a2 * yq
        d.z[0] = 2 * yi; d.z[1] = 2 * yq
        // rotation du phaseur e^{−iωn} (e^{−iω} = cosω − i sinω)
        const c = d.cosw, s = d.sinw
        const nr = d.cr * c + d.ci * s
        d.ci = d.ci * c - d.cr * s
        d.cr = nr
      }
      if (++this.compteur >= D) { this.compteur = 0; this.sortie() }
    }
    // renormalisation des phaseurs (dérive numérique)
    for (const d of this.demods) { const r = 1 / Math.hypot(d.cr, d.ci); d.cr *= r; d.ci *= r }
  }

  private sortie(): void {
    this.demods.forEach((d, idx) => {
      const [zr, zi] = d.z
      if (!this.presentFlag) {
        if (d.centre === null) d.centre = [zr, zi]
        else { d.centre[0] += this.alphaCentre * (zr - d.centre[0]); d.centre[1] += this.alphaCentre * (zi - d.centre[1]) }
        d.angleOk = false
        return
      }
      if (this.collecte > 0 && d.centre === null) {
        this.tampon[idx].push([zr, zi])
        return
      }
      if (!d.centre) return
      const ang = Math.atan2(zi - d.centre[1], zr - d.centre[0])
      if (d.angleOk) {
        let da = ang - d.angle
        while (da > Math.PI) da -= 2 * Math.PI
        while (da < -Math.PI) da += 2 * Math.PI
        const v = da / (2 * Math.PI * this.dtSortie)
        d.vitesse += 0.35 * (v - d.vitesse)
      } else d.vitesse = 0
      d.angle = ang; d.angleOk = true
    })
    if (this.collecte > 0 && this.presentFlag) {
      this.collecte--
      if (this.collecte === 0) {
        this.demods.forEach((d, idx) => {
          if (d.centre === null) d.centre = centreParCercle(this.tampon[idx]) ?? [this.tampon[idx][0]?.[0] ?? 0, this.tampon[idx][0]?.[1] ?? 0]
          this.tampon[idx] = []
        })
      }
    }
  }

  /** Un état par voix : partiel dominant (|z − Ĉ| maximal). */
  etats(): EtatStrobe[] {
    const out: EtatStrobe[] = []
    for (let v = 0; v < this.nbVoix; v++) {
      let best: Demod | null = null, bestR = -1
      for (const d of this.demods) {
        if (d.voix !== v || !d.centre) continue
        const r = Math.hypot(d.z[0] - d.centre[0], d.z[1] - d.centre[1])
        if (r > bestR) { bestR = r; best = d }
      }
      if (!best) continue
      out.push({ voix: v, m: best.m, angle: best.angle, vitesseHz: best.vitesse, intensite: bestR })
    }
    return out
  }
}
