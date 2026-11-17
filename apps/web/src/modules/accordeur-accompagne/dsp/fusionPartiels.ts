// ─── Fusion des partiels du playback (spec §6.3) ──────────────────────────────
// Deux partiels distants de moins de 1/T ne sont pas séparables sur une fenêtre de
// durée T : on les remplace par une seule fonction de base. En accordage juste,
// certains coïncident exactement (ex. Do3×5 = Mi4×2).

import type { Voix } from './types.ts'

export type MembrePartiel = { voix: number; m: number; amp: number }
export type PartielFusionne = { freqHz: number; ampTot: number; membres: MembrePartiel[] }

/**
 * @param voix       voix qui sonnent (indices = positions dans ce tableau)
 * @param dureeFenetreS  T, durée de la fenêtre d'ajustement
 * @param fMaxHz     on ignore les partiels au-dessus (bande du modèle)
 * @param seuilHz    seuil de fusion ; défaut 1/T
 */
export function fusionnerPartiels(voix: Voix[], dureeFenetreS: number, fMaxHz = Infinity, seuilHz?: number): PartielFusionne[] {
  const seuil = seuilHz ?? 1 / dureeFenetreS
  const tous: { freqHz: number; voix: number; m: number; amp: number }[] = []
  voix.forEach((v, iv) => v.partiels.forEach(p => {
    if (p.freqHz <= fMaxHz) tous.push({ freqHz: p.freqHz, voix: iv, m: p.k, amp: p.amp })
  }))
  tous.sort((a, b) => a.freqHz - b.freqHz)

  const groupes: PartielFusionne[] = []
  let courant: typeof tous = []
  const clore = () => {
    if (!courant.length) return
    const ampTot = courant.reduce((s, x) => s + x.amp, 0)
    const freqHz = courant.reduce((s, x) => s + x.freqHz * x.amp, 0) / ampTot
    groupes.push({ freqHz, ampTot, membres: courant.map(x => ({ voix: x.voix, m: x.m, amp: x.amp })) })
    courant = []
  }
  for (const p of tous) {
    if (courant.length && p.freqHz - courant[courant.length - 1].freqHz >= seuil) clore()
    courant.push(p)
  }
  clore()
  return groupes
}

/** Membre dominant (plus forte amplitude) d'un partiel fusionné. */
export function membreDominant(p: PartielFusionne): MembrePartiel {
  return p.membres.reduce((a, b) => (b.amp > a.amp ? b : a))
}
