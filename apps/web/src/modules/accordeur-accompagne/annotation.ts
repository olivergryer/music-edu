// ─── Annotation des notes de l'élève : référence, écart, rôle, place dans l'échelle ──
// (brief UI v1, § 7 et § 5.2). Logique pure : le moteur fournit des notes (provisoires en
// Live, finales après la passe finale) ; ici on les compare à l'accord audible à ce moment.

import { hzVersMidi, type Battement, type Planning } from './dsp/types.ts'
import { placerDansEchelle } from './notation.ts'
import type { Phrase, Role } from './phrase.ts'
import { classerNote, type Referentiel } from './references.ts'
import { sonsDeLEntree, type Realisation } from './realisation.ts'

export interface NoteBrute {
  tOn: number; tOff: number; f0Hz: number
  sigmaCents?: number; sigmaIntraCents?: number
  entree?: number
  coupeAvant?: boolean; coupeApres?: boolean
  battements?: Battement[]
}

export interface ContexteAnnotation {
  phrase: Phrase
  real: Map<number, Realisation>
  planning: Planning
  ref: Referentiel
  diapason: number
  tempUser: readonly number[]
}

export interface NoteAnnotee {
  tOn: number; tOff: number; f0Hz: number
  sigma: number                 // incertitude d'estimation (¢), Infinity si inconnue
  sigmaIntra: number
  entree: number                // entrée de phrase en vigueur (référence harmonique)
  type: 'son' | 'etrangere'
  role: Role | null
  indexSon: number | null       // position du son dans l'accord (sphère)
  ecart: number                 // signé, négatif = trop bas
  midi: number                  // sons réels
  place: { degre: number } | { entre: number }
  provisoire: boolean
  coupeAvant: boolean; coupeApres: boolean
  battements: Battement[]       // par voix qui sonnait (notes finales)
}

/** Entrée de phrase en vigueur à l'instant t du planning (dernier événement commencé). */
export function entreeAuTemps(planning: Planning, t: number): number {
  let e = 0
  for (const ev of planning.evenements) {
    if (ev.tDebut <= t + 1e-9 && ev.entree !== undefined) e = ev.entree
    if (ev.tDebut > t) break
  }
  return e
}

export function annoterNote(n: NoteBrute, c: ContexteAnnotation, provisoire: boolean): NoteAnnotee {
  const entree = n.entree ?? entreeAuTemps(c.planning, 0.5 * (n.tOn + n.tOff))
  const e = c.phrase.entrees[entree] ?? c.phrase.entrees[0]
  const idx = c.phrase.entrees[entree] ? entree : 0
  const real = c.real.get(idx)!
  const sons = sonsDeLEntree(e, real, c.diapason, c.tempUser)
  const cl = classerNote(n.f0Hz, sons, e.tonalite.tonique, c.ref, c.diapason, c.tempUser)
  const midi = Math.round(hzVersMidi(n.f0Hz, c.diapason))
  return {
    tOn: n.tOn, tOff: n.tOff, f0Hz: n.f0Hz,
    sigma: n.sigmaCents ?? Infinity, sigmaIntra: n.sigmaIntraCents ?? 0,
    entree: idx,
    type: cl.type,
    role: cl.type === 'son' ? cl.son.role : null,
    indexSon: cl.type === 'son' ? cl.index : null,
    ecart: cl.ecart,
    midi,
    place: placerDansEchelle(midi - e.tonalite.tonique, e.tonalite.mode),
    provisoire, coupeAvant: !!n.coupeAvant, coupeApres: !!n.coupeApres, battements: n.battements ?? [],
  }
}

export function annoterNotes(notes: NoteBrute[], c: ContexteAnnotation, provisoire: boolean): NoteAnnotee[] {
  return notes.map(n => annoterNote(n, c, provisoire))
}
