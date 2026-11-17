// ─── Candidats, amorce, fusion des deux pistes (spec §6.5) ────────────────────

import { HZ_MAX, HZ_MIN } from './constantes.ts'
import type { Voix } from './types.ts'

/** Incertitude par défaut de MPM sur résidu (¢) tant que la table de calibration n'existe pas. */
export const SIGMA_MPM_DEFAUT_CENTS = 5

export type RelationMultiple = { voix: number; q: number; ecartCents: number }

/** Si f est à moins de `tolCents` d'un multiple entier q·f_v (q = 1..4) d'une voix qui sonne. */
export function relationMultiple(f: number, voix: Voix[], tolCents = 30): RelationMultiple | null {
  let meilleur: RelationMultiple | null = null
  voix.forEach((v, iv) => {
    for (let q = 1; q <= 4; q++) {
      const ecart = 1200 * Math.log2(f / (q * v.freqHz))
      if (Math.abs(ecart) <= tolCents && (!meilleur || Math.abs(ecart) < Math.abs(meilleur.ecartCents))) {
        meilleur = { voix: iv, q, ecartCents: ecart }
      }
    }
  })
  return meilleur
}

/** Candidats : proposition MPM, multiples q·f_v (q = 1..4) dans 60–2000 Hz, f0 précédente. */
export function genererCandidats(voix: Voix[], f0Mpm: number | null, f0Precedente: number | null): number[] {
  const out: number[] = []
  if (f0Mpm) out.push(f0Mpm)
  if (f0Precedente) out.push(f0Precedente)
  for (const v of voix) for (let q = 1; q <= 4; q++) {
    const f = q * v.freqHz
    if (f >= HZ_MIN && f <= HZ_MAX) out.push(f)
  }
  return out
}

export type Estimation = { f0Hz: number; sigmaCents: number }

/** Moyenne pondérée par l'inverse des variances, dans le domaine des cents. */
export function fusionnerEstimations(a: Estimation | null, b: Estimation | null): (Estimation & { source: 'mpm' | 'modele' | 'fusion' }) | null {
  const ok = (e: Estimation | null): e is Estimation => !!e && Number.isFinite(e.sigmaCents) && e.sigmaCents > 0 && e.f0Hz > 0
  const va = ok(a), vb = ok(b)
  if (!va && !vb) return null
  if (va && !vb) return { ...a!, source: 'mpm' }
  if (!va && vb) return { ...b!, source: 'modele' }
  const ref = a!.f0Hz
  const ca = 0, cb = 1200 * Math.log2(b!.f0Hz / ref)
  // désaccord franc (ex. MPM sur résidu qui voit un multiple) : on ne moyenne pas, on garde le plus sûr
  if (Math.abs(cb) > 4 * Math.hypot(a!.sigmaCents, b!.sigmaCents) + 30) {
    return b!.sigmaCents <= a!.sigmaCents ? { ...b!, source: 'modele' } : { ...a!, source: 'mpm' }
  }
  const wa = 1 / (a!.sigmaCents ** 2), wb = 1 / (b!.sigmaCents ** 2)
  const c = (wa * ca + wb * cb) / (wa + wb)
  return { f0Hz: ref * Math.pow(2, c / 1200), sigmaCents: Math.sqrt(1 / (wa + wb)), source: 'fusion' }
}

/**
 * Garde-fou d'octave : si le modèle (a) trouve une f0 à ±40 ¢ d'une octave de MPM,
 * c'est le modèle qui l'emporte.
 */
export function ecartOctave(fModele: number, fMpm: number): boolean {
  const e = Math.abs(1200 * Math.log2(fModele / fMpm))
  const reste = Math.abs(e - 1200 * Math.round(e / 1200))
  return Math.round(e / 1200) !== 0 && reste < 40
}
