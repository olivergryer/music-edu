// Lecture de l'état de battement d'un son (par rôle) pour l'anneau stroboscopique.
import type { EtatAnneau } from './AnneauBattements.tsx'
import { voixSonnantes } from './dsp/synthese.ts'
import type { EvenementAccord, Planning } from './dsp/types.ts'
import type { Role } from './phrase.ts'
import type { EtatStrobe } from './dsp/types.ts'

/** Événement qui sonne à l'instant t (recherche dichotomique, les événements sont triés). */
export function evenementAu(p: Planning, t: number): EvenementAccord | null {
  const ev = p.evenements
  let a = 0, b = ev.length - 1, r = -1
  while (a <= b) { const m = (a + b) >> 1; if (ev[m].tDebut <= t) { r = m; a = m + 1 } else b = m - 1 }
  for (let i = r; i >= 0 && i > r - 3; i--) if (t < ev[i].tFin && t >= ev[i].tDebut) return ev[i]
  return null
}

/**
 * État du battement pour le son de rôle `role` : parmi les voix de ce rôle (doublure comprise),
 * celle dont l'intensité est la plus forte. null si rien d'exploitable (pas de note, intensité faible).
 */
export function etatAnneauDuRole(planning: Planning | null, t: number | null, etats: EtatStrobe[], role: Role, intensiteMin = 0.05): EtatAnneau | null {
  if (!planning || t === null || !etats.length) return null
  const ev = evenementAu(planning, t)
  if (!ev) return null
  const idx = voixSonnantes(ev).map((v, i) => (v.role === role ? i : -1)).filter(i => i >= 0)
  let best: EtatStrobe | null = null
  for (const e of etats) if (idx.includes(e.voix) && (!best || e.intensite > best.intensite)) best = e
  return best && best.intensite >= intensiteMin ? { vitesseHz: best.vitesseHz, intensite: best.intensite } : null
}
