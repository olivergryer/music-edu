// ─── Réglages en cours de lecture et remplacement du planning (brief UI v1, § 4.4.2) ──
// Fonctions pures : le worklet et le Worker appliquent la MÊME fonction au même instant
// (le worklet transmet l'instant exact), donc leurs plannings restent identiques.
//
// Cents / volume / muet d'un son qui sonne : l'événement en cours est COUPÉ à l'instant t et
// continué par un nouvel événement dont les partiels glissent en 30 ms vers leurs nouvelles
// valeurs, phase continue. La coupure est déclarée comme une attaque (`attaques`) : l'analyse
// écarte la zone de transition, comme pour une attaque du playback.

import type { EvenementAccord, Partiel, Planning, Voix } from './types.ts'
import { phasePartiel, ampPartiel, partielsDe } from './synthese.ts'

export const GLISSEMENT_S = 0.030

export type Reglage = { cents?: number; volume?: number; muet?: boolean }

/** Nouvelle voix après réglage ; `de` = partiels de départ pour la transition (null : changement net). */
function voixReglee(v: Voix, r: Reglage, de: { p: Partiel[]; tau: number; glissS?: number } | null): Voix {
  const cents = r.cents ?? v.cents
  const freqHz = v.freqHz * Math.pow(2, (cents - v.cents) / 1200)
  const volume = r.volume ?? v.volume ?? 1
  const muet = r.muet ?? v.muet ?? false
  const base = partielsDe(freqHz)
  const partiels: Partiel[] = base.map((b, i) => {
    const ampBase = b.amp * volume * (muet ? 0 : 1)
    const q = de?.p[i]
    if (!de || !q) return { ...b, amp: ampBase, phase0: v.partiels[i]?.phase0 ?? 0 }
    const f = { ...b, amp: ampBase }
    // phase continue : on reprend la phase atteinte par l'ancien partiel à l'instant de la coupure
    f.phase0 = phasePartiel(q, de.tau, de.glissS) % (2 * Math.PI)
    f.freqDe = q.freqHz
    f.ampDe = ampPartiel(q, de.tau, de.glissS)
    return f
  })
  return { ...v, cents, freqHz, volume, muet, partiels }
}

/**
 * Applique un réglage au son de rôle `role` de l'entrée `entree` à partir de l'instant t.
 * Événements futurs de cette entrée : valeurs mises à jour d'office. Événement en cours :
 * coupé en t et prolongé avec transition. Renvoie un nouveau planning (l'ancien est intact).
 */
export function appliquerReglage(p: Planning, entree: number, role: string, r: Reglage, t: number): Planning {
  const sortie: EvenementAccord[] = []
  for (const ev of p.evenements) {
    if (ev.entree !== entree || !ev.voix.some(v => v.role === role)) { sortie.push(ev); continue }
    if (ev.tFin <= t) { sortie.push(ev); continue }
    if (ev.tDebut >= t) { sortie.push({ ...ev, voix: ev.voix.map(v => (v.role === role ? voixReglee(v, r, null) : v)) }); continue }
    // événement en cours à l'instant t : coupure + continuation
    const tau = t - ev.tDebut
    const de = ev.voix.map(v => ({ p: v.partiels, tau, glissS: ev.glissS }))
    sortie.push({ ...ev, tFin: t, continuiteApres: true })
    sortie.push({
      // toutes les voix sont ré-ancrées sur le nouvel instant de départ (phase continue) ; seule celle du rôle change
      ...ev, tDebut: t, voix: ev.voix.map((v, i) => voixReglee(v, v.role === role ? r : {}, de[i])),
      attaques: [t], continuiteAvant: true, glissS: GLISSEMENT_S,
    })
  }
  return { ...p, evenements: sortie }
}

/**
 * Remplace la suite du planning à partir de `tCoupure` (frontière d'entrée suivante, § 4.4.2) :
 * les événements de l'ancien planning qui commencent avant sont conservés (celui qui chevauche
 * la coupure est raccourci), ceux du nouveau qui commencent à partir de là prennent le relais.
 */
export function remplacerAPartirDe(ancien: Planning, nouveau: Planning, tCoupure: number): Planning {
  const garde = ancien.evenements
    .filter(e => e.tDebut < tCoupure)
    .map(e => (e.tFin > tCoupure ? { ...e, tFin: tCoupure } : e))
  const suite = nouveau.evenements.filter(e => e.tDebut >= tCoupure - 1e-9)
  const clics = [...(ancien.clics ?? []).filter(c => c.t < tCoupure), ...(nouveau.clics ?? []).filter(c => c.t >= tCoupure)]
  return { ...nouveau, latenceBoucleMs: ancien.latenceBoucleMs, evenements: [...garde, ...suite], clics }
}

/** Prochaine frontière d'événement strictement après `t + marge` (pour programmer un changement de structure). */
export function prochaineFrontiere(p: Planning, t: number, marge = 0.15): number | null {
  let meilleur: number | null = null
  for (const e of p.evenements) if (e.tDebut > t + marge && (meilleur === null || e.tDebut < meilleur)) meilleur = e.tDebut
  return meilleur
}
