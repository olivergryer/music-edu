// ─── Corrections manuelles des notes d'une prise ────────────────────────────────────────
// Une note qui anticipe ou déborde à peine d'un changement d'accord est coupée en deux
// morceaux, chacun mesuré contre un accord différent. L'élève (ou le prof) peut supprimer
// une note intempestive, ou dire à quel accord elle appartient (avant / après). Les
// corrections sont rattachées à la note par son intervalle de temps : elles survivent au
// recalcul (réglages, autre moteur).

import type { NoteBrute } from './annotation.ts'
import { entreeAuTemps } from './annotation.ts'
import type { Planning } from './dsp/types.ts'

export type Correction =
  | { tOn: number; tOff: number; action: 'supprimer' }
  | { tOn: number; tOff: number; action: 'entree'; entree: number }

/** Recouvrement de deux intervalles, rapporté au plus court (0 à 1). */
export function recouvrement(a: { tOn: number; tOff: number }, b: { tOn: number; tOff: number }): number {
  const o = Math.min(a.tOff, b.tOff) - Math.max(a.tOn, b.tOn)
  const m = Math.min(a.tOff - a.tOn, b.tOff - b.tOn)
  return m > 0 ? Math.max(0, o) / m : (o >= 0 ? 1 : 0)
}

const CONCERNE = 0.5

/** Ajoute une correction en remplaçant celles qui visaient la même note. */
export function ajouterCorrection(liste: readonly Correction[], c: Correction): Correction[] {
  return [...liste.filter(x => recouvrement(x, c) < CONCERNE), c]
}

/** Entrées de l'accord d'avant et d'après la note (premières entrées différentes dans le planning). */
export function entreesVoisines(planning: Planning, tOn: number, tOff: number): { courante: number; avant: number | null; apres: number | null } {
  const milieu = 0.5 * (tOn + tOff)
  const courante = entreeAuTemps(planning, milieu)
  const evs = planning.evenements.filter(e => e.entree !== undefined)
  let avant: number | null = null, apres: number | null = null
  for (let i = evs.length - 1; i >= 0; i--) if (evs[i].tDebut <= milieu + 1e-9) {
    for (let j = i; j >= 0; j--) if (evs[j].entree !== courante) { avant = evs[j].entree ?? null; break }
    break
  }
  for (const e of evs) if (e.tDebut > milieu && e.entree !== courante) { apres = e.entree ?? null; break }
  return { courante, avant, apres }
}

const dureeNote = (n: NoteBrute): number => n.tOff - n.tOn

/**
 * Applique les corrections : suppressions, rattachement forcé à une entrée, puis fusion des
 * deux morceaux d'une même note quand ils se retrouvent sur le même accord (une seule note,
 * mesurée une seule fois).
 */
export function appliquerCorrections<T extends NoteBrute>(notes: readonly T[], corrections: readonly Correction[], planning: Planning): T[] {
  if (!corrections.length) return [...notes]
  const sortie: T[] = []
  for (const n of notes) {
    const c = corrections.find(x => recouvrement(x, n) >= CONCERNE)
    if (!c) { sortie.push(n); continue }
    if (c.action === 'supprimer') continue
    // battements : calculés contre les voix de l'ancien accord, ils ne valent plus
    sortie.push({ ...n, entree: c.entree, battements: [] })
  }
  sortie.sort((a, b) => a.tOn - b.tOn)
  const effective = (n: T): number => n.entree ?? entreeAuTemps(planning, 0.5 * (n.tOn + n.tOff))
  const fusionnees: T[] = []
  for (const n of sortie) {
    const p = fusionnees[fusionnees.length - 1]
    if (p && p.coupeApres && n.coupeAvant && n.tOn - p.tOff < 0.25 && effective(p) === effective(n)) {
      const base = dureeNote(p) >= dureeNote(n) ? p : n
      fusionnees[fusionnees.length - 1] = {
        ...base, tOn: Math.min(p.tOn, n.tOn), tOff: Math.max(p.tOff, n.tOff), entree: effective(p),
        coupeAvant: p.coupeAvant, coupeApres: n.coupeApres,
      }
    } else fusionnees.push(n)
  }
  return fusionnees
}
