// ─── Construction du pool d'items actif (spec §9) ─────────────────────────────
//
// P0 (Repères) : pool = les notes ancres du profil.
// P1 (Extension) / P2 (Fluidité) : pool = toutes les hauteurs diatoniques de
// l'étape d'ambitus courante (low..high inclus). En P2 sans étape précisée, on
// prend l'ambitus cible (dernière étape).

import type { ReadingProfile } from './profiles.ts'
import type { NoteItem, Phase } from './types.ts'

export function itemId(clef: NoteItem['clef'], diatonicIndex: number): string {
  return `${clef}:${diatonicIndex}`
}

function makeItem(clef: NoteItem['clef'], diatonicIndex: number): NoteItem {
  return { id: itemId(clef, diatonicIndex), clef, diatonicIndex }
}

// Index d'étape effectif : borné à la séquence ; P2 par défaut = ambitus cible.
export function resolveAmbitusStep(profile: ReadingProfile, phase: Phase, step?: number): number {
  const last = profile.ambitusSequence.length - 1
  if (step != null) return Math.max(0, Math.min(step, last))
  return phase === 'P2' ? last : 0
}

export function buildPool(profile: ReadingProfile, phase: Phase, ambitusStep?: number): NoteItem[] {
  const { clef } = profile

  if (phase === 'P0') {
    // Ancres uniquement, dédoublonnées et triées.
    const uniq = [...new Set(profile.landmarks)].sort((a, b) => a - b)
    return uniq.map(idx => makeItem(clef, idx))
  }

  const stepIdx = resolveAmbitusStep(profile, phase, ambitusStep)
  const { low, high } = profile.ambitusSequence[stepIdx]
  const items: NoteItem[] = []
  for (let idx = low; idx <= high; idx++) items.push(makeItem(clef, idx))
  return items
}
