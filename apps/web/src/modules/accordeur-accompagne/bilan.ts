// ─── Bilan après arrêt (brief UI v1, § 9) ─────────────────────────────────────────────
// Scores de l'Accordeur (`scorePedagogique`, `scoreQualite`) sur les notes finales, tableau
// par rôle (moyenne pondérée par 1/σ²), échelle du mode colorée par l'écart moyen de chaque degré.

import { scorePedagogique, scoreQualite } from '../../accordeurUtils.js'
import type { NoteAnnotee } from './annotation.ts'

export type ClePoste = 'F' | '3' | '5' | '7' | 'etrangere'
export const LIBELLES_POSTES: Record<ClePoste, string> = {
  F: 'Fondamentales', '3': 'Tierces', '5': 'Quintes', '7': 'Septièmes', etrangere: 'Notes étrangères',
}
const ORDRE: ClePoste[] = ['F', '3', '5', '7', 'etrangere']

export interface LigneBilan {
  poste: ClePoste; libelle: string
  n: number; moyenne: number; sigmaIntra: number
  phrase: string                // « Tierces : +9 ¢ (12 notes) »
}
export interface DegreBilan { degre: number; n: number; moyenne: number }
export interface Bilan {
  n: number
  pedagogique: { justes: number; total: number; label: string }
  qualite: number
  lignes: LigneBilan[]
  degres: DegreBilan[]          // un par degré de l'échelle (0–6), n = 0 si jamais joué
  chromatiques: { n: number; moyenne: number }
}

const signe = (v: number): string => (v > 0.05 ? '+' : v < -0.05 ? '−' : '±')
export const formaterMoyenne = (v: number): string => `${signe(v)}${Math.abs(v).toFixed(0)} ¢`

/** Moyenne pondérée par 1/σ² (σ = incertitude d'estimation) ; sans poids exploitable, moyenne simple. */
export function moyennePonderee(notes: { ecart: number; sigma: number }[]): number {
  if (!notes.length) return 0
  let sw = 0, s = 0
  for (const n of notes) { const w = Number.isFinite(n.sigma) && n.sigma > 0 ? 1 / (n.sigma * n.sigma) : 0; sw += w; s += w * n.ecart }
  if (sw > 0) return s / sw
  return notes.reduce((a, n) => a + n.ecart, 0) / notes.length
}

export function bilanDe(notes: NoteAnnotee[], seuil: number): Bilan {
  const utiles = notes.filter(n => Number.isFinite(n.ecart))
  const pedagogique = scorePedagogique(utiles.map(n => ({ muCents: n.ecart })), seuil)
  const qualite = scoreQualite(utiles.map(n => ({ muCents: n.ecart, sigmaCents: n.sigmaIntra }))) as number
  const lignes: LigneBilan[] = []
  for (const poste of ORDRE) {
    const sel = utiles.filter(n => (poste === 'etrangere' ? n.type === 'etrangere' : n.role === poste))
    if (!sel.length) continue
    const moyenne = moyennePonderee(sel)
    const sigmaIntra = sel.reduce((a, n) => a + n.sigmaIntra, 0) / sel.length
    lignes.push({
      poste, libelle: LIBELLES_POSTES[poste], n: sel.length, moyenne, sigmaIntra,
      phrase: `${LIBELLES_POSTES[poste]} : ${formaterMoyenne(moyenne)} (${sel.length} note${sel.length > 1 ? 's' : ''})`,
    })
  }
  const degres: DegreBilan[] = Array.from({ length: 7 }, (_, degre) => {
    const sel = utiles.filter(n => 'degre' in n.place && n.place.degre === degre)
    return { degre, n: sel.length, moyenne: moyennePonderee(sel) }
  })
  const chroma = utiles.filter(n => 'entre' in n.place)
  return { n: utiles.length, pedagogique, qualite, lignes, degres, chromatiques: { n: chroma.length, moyenne: moyennePonderee(chroma) } }
}
