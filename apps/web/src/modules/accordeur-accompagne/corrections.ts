// ─── Corrections manuelles des notes d'une prise ────────────────────────────────────────
// Une note qui anticipe ou déborde à peine d'un changement d'accord est coupée en deux
// morceaux, chacun mesuré contre un accord différent. L'élève (ou le prof) peut supprimer
// une note intempestive, ou dire à quel accord elle appartient (avant / après). Les
// corrections sont rattachées à la note par son intervalle de temps : elles survivent au
// recalcul (réglages, autre moteur).

import type { NoteBrute } from './annotation.ts'
import { entreeAuTemps } from './annotation.ts'
import type { Planning } from './dsp/types.ts'

/**
 * Les instants sont ceux de la prise SANS décalage temporel : une correction suit sa note quand
 * on bouge le curseur de décalage. `bout` : la correction ne vise qu'un morceau de la note
 * (tête liée de part et d'autre d'une barre ou d'un changement d'accord).
 */
export type Correction =
  | { tOn: number; tOff: number; action: 'supprimer'; bout?: { t0: number; t1: number } }
  | { tOn: number; tOff: number; action: 'entree'; entree: number; bout?: { t0: number; t1: number } }

/** Recouvrement de deux intervalles, rapporté au plus court (0 à 1). */
export function recouvrement(a: { tOn: number; tOff: number }, b: { tOn: number; tOff: number }): number {
  const o = Math.min(a.tOff, b.tOff) - Math.max(a.tOn, b.tOn)
  const m = Math.min(a.tOff - a.tOn, b.tOff - b.tOn)
  return m > 0 ? Math.max(0, o) / m : (o >= 0 ? 1 : 0)
}

const CONCERNE = 0.5
const BOUT_MIN_S = 0.02

const intervalleDe = (c: Correction): { tOn: number; tOff: number } => (c.bout ? { tOn: c.bout.t0, tOff: c.bout.t1 } : c)

/** Ajoute une correction en remplaçant celles qui visaient la même cible (même note, ou même bout). */
export function ajouterCorrection(liste: readonly Correction[], c: Correction): Correction[] {
  return [...liste.filter(x => !!x.bout !== !!c.bout || recouvrement(intervalleDe(x), intervalleDe(c)) < CONCERNE), c]
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

/** Le bout est dans la note si au moins la moitié de sa durée la recouvre. */
function boutDans(b: { t0: number; t1: number }, n: { tOn: number; tOff: number }): boolean {
  const o = Math.min(b.t1, n.tOff) - Math.max(b.t0, n.tOn)
  return b.t1 > b.t0 && o / (b.t1 - b.t0) >= CONCERNE
}

const dureeNote = (n: NoteBrute): number => n.tOff - n.tOn

/**
 * Applique les corrections : suppressions, rattachement forcé à une entrée (note entière ou
 * un bout seulement), puis fusion des deux morceaux d'une même note quand ils se retrouvent
 * sur le même accord (une seule note, mesurée une seule fois). `decalageS` : décalage
 * temporel courant des notes, pour retrouver leurs instants d'origine.
 */
export function appliquerCorrections<T extends NoteBrute>(notes: readonly T[], corrections: readonly Correction[], planning: Planning, decalageS = 0): T[] {
  if (!corrections.length) return [...notes]
  const effective = (n: T): number => n.entree ?? entreeAuTemps(planning, 0.5 * (n.tOn + n.tOff))
  const sortie: T[] = []
  for (const n of notes) {
    const base = { tOn: n.tOn - decalageS, tOff: n.tOff - decalageS }
    const entiere = corrections.find(x => !x.bout && recouvrement(x, base) >= CONCERNE)
    const bouts = corrections.filter((x): x is Correction & { bout: { t0: number; t1: number } } => !!x.bout && boutDans(x.bout, base))
      .sort((a, b) => a.bout.t0 - b.bout.t0)
    let parts: T[] = [n]
    if (entiere) {
      if (entiere.action === 'supprimer') continue
      parts = [{ ...n, entree: entiere.entree, battements: [] }]
    }
    for (const c of bouts) {
      const t0 = c.bout.t0 + decalageS, t1 = c.bout.t1 + decalageS
      const milieu = 0.5 * (t0 + t1)
      const i = parts.findIndex(p => milieu >= p.tOn && milieu <= p.tOff)
      if (i < 0) continue
      const p = parts[i], eff = effective(p), retire = c.action === 'supprimer'
      const nouveaux: T[] = []
      if (t0 - p.tOn >= BOUT_MIN_S) nouveaux.push({ ...p, tOff: t0, entree: eff, coupeApres: retire ? p.coupeApres : true })
      if (!retire) nouveaux.push({ ...p, tOn: Math.max(p.tOn, t0), tOff: Math.min(p.tOff, t1), entree: c.action === 'entree' ? c.entree : eff, battements: [], coupeAvant: true, coupeApres: true })
      if (p.tOff - t1 >= BOUT_MIN_S) nouveaux.push({ ...p, tOn: t1, entree: eff, coupeAvant: retire ? p.coupeAvant : true })
      parts = [...parts.slice(0, i), ...nouveaux, ...parts.slice(i + 1)]
    }
    sortie.push(...parts)
  }
  sortie.sort((a, b) => a.tOn - b.tOn)
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
