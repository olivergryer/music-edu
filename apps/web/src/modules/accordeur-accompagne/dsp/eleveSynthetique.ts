// ─── Élève synthétique (spec §7.3) ───────────────────────────────────────────
// Génère un signal d'instrument à partir d'une famille de spectre, avec bruit de
// souffle (−30 dB), légère fluctuation d'amplitude et vibrato optionnel.
// Pur et déterministe (graine) : sert aux tests, au banc hors ligne et à la page 7.3.

import { mulberry32 } from '../../notes/rng.ts'

export type FamilleSpectre = 'flute' | 'ancheSimple' | 'ancheDouble' | 'cuivre' | 'corde' | 'voix'

const DEBUT: Record<FamilleSpectre, number[]> = {
  flute:       [1, 0.5, 0.3, 0.1, 0.05],
  ancheSimple: [1, 0.05, 0.6, 0.05, 0.4, 0.05, 0.25],
  ancheDouble: [0.5, 1, 0.8, 0.6, 0.5, 0.4, 0.3, 0.2],
  cuivre:      [0.6, 0.9, 1, 0.9, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2],
  corde:       [],   // 1/k
  voix:        [1, 0.7, 0.4, 0.5, 0.3, 0.2],
}

/** Amplitudes relatives des partiels 1..n (au-delà de la liste : décroissance ×0,75). */
export function spectreFamille(famille: FamilleSpectre, n = 16): number[] {
  const base = DEBUT[famille]
  const out: number[] = []
  for (let k = 1; k <= n; k++) {
    if (famille === 'corde') out.push(1 / k)
    else if (k <= base.length) out.push(base[k - 1])
    else out.push((out[k - 2] ?? 0.1) * 0.75)
  }
  return out
}

export type NoteSynthetique = {
  tDebut: number          // s
  duree: number           // s
  f0Hz: number            // fréquence réelle jouée (écart déjà appliqué)
  famille: FamilleSpectre
  niveau?: number         // amplitude de crête approximative (défaut 0,1)
  vibrato?: boolean       // 5,5 Hz, ±15 ¢
  nbPartiels?: number
}

/** Ajoute la note dans `sortie` (même fréquence d'échantillonnage). */
export function ajouterNote(sortie: Float32Array, fs: number, note: NoteSynthetique, seed = 1): void {
  const rng = mulberry32(seed)
  const n = note.nbPartiels ?? 16
  const spec = spectreFamille(note.famille, n)
  const norme = spec.reduce((s, a) => s + a, 0)
  const niveau = (note.niveau ?? 0.1) / norme
  const i0 = Math.floor(note.tDebut * fs), i1 = Math.min(sortie.length, Math.floor((note.tDebut + note.duree) * fs))
  const att = 0.03, rel = 0.05
  let phase = 0
  // fluctuation lente d'amplitude : bruit filtré ~ ±5 %
  let fluct = 0
  // souffle : bruit blanc filtré passe-bas simple, −30 dB du niveau
  let souffle = 0
  for (let i = i0; i < i1; i++) {
    const t = (i - i0) / fs
    const vib = note.vibrato ? Math.pow(2, (15 * Math.sin(2 * Math.PI * 5.5 * t)) / 1200) : 1
    phase += 2 * Math.PI * note.f0Hz * vib / fs
    fluct = 0.999 * fluct + 0.001 * (rng() - 0.5) * 8
    souffle = 0.6 * souffle + 0.4 * (rng() - 0.5)
    const env = Math.min(1, t / att, (note.duree - t) / rel)
    let s = 0
    for (let k = 1; k <= n; k++) {
      if (k * note.f0Hz * vib < fs / 2) s += spec[k - 1] * Math.sin(k * phase)
    }
    sortie[i] += env * ((1 + 0.05 * fluct) * niveau * s + Math.pow(10, -30 / 20) * niveau * norme * 0.5 * souffle)
  }
}
