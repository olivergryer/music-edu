// ─── Le mode d'une SESSION, distinct du mode d'un ITEM ───────────────────────
//
// ⚠ `Mode` (types.ts) ne bouge pas : il reste 'majeur' | 'mineur', et chaque item
// en porte un — `Progression.mode`, `ItemCadence.mode`. Ce qui s'élargit, c'est le
// RÉGLAGE D'ÉCRAN : « Majeur », « Mineur », ou les deux mêlés.
//
// `Mode ⊂ ModeSession` : les builders peuvent donc élargir leur paramètre sans
// qu'aucun appel existant ne change de comportement — un test l'épingle.

import { mulberry32 } from './rng.ts'
import type { Mode } from './types.ts'

export type ModeSession = Mode | 'les_deux'

export const MODES_SESSION: readonly ModeSession[] = ['majeur', 'mineur', 'les_deux']

export function estModeSession(v: unknown): v is ModeSession {
  return v === 'majeur' || v === 'mineur' || v === 'les_deux'
}

export const LIBELLES_MODE_SESSION: Readonly<Record<ModeSession, string>> = {
  majeur: 'Majeur',
  mineur: 'Mineur',
  les_deux: 'Les deux',
}

/**
 * Le mode de chaque item de la session.
 *
 * En « les deux » : autant de majeurs que de mineurs — à un près sur un nombre
 * impair — **puis mélange déterministe**. Même principe que `reponsesEquilibrees`
 * (binaire.ts) et pour la même raison : une alternance stricte serait équilibrée
 * mais devinable, et l'élève répondrait au rythme plutôt qu'à l'oreille.
 */
export function modesDeSession(
  modeSession: ModeSession,
  nombreItems: number,
  graine: number,
): Mode[] {
  if (modeSession !== 'les_deux') {
    return Array.from({ length: nombreItems }, () => modeSession)
  }

  const suite: Mode[] = Array.from({ length: nombreItems }, (_, i) =>
    i < Math.ceil(nombreItems / 2) ? 'majeur' : 'mineur',
  )

  // Graine décalée : sans cela, le mélange des modes suivrait exactement celui
  // des réponses du binaire, et les deux tirages seraient corrélés.
  const rng = mulberry32(graine + 977)
  for (let i = suite.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[suite[i], suite[j]] = [suite[j], suite[i]]
  }
  return suite
}
