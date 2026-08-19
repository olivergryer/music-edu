// ─── Le geste d'écoute d'un accord — appui, ou glissé vers le haut ───────────
//
// Sur une case de saisie (flux, dictée) :
//   appui bref          → l'accord PLAQUÉ
//   glissé vers le haut → l'accord ARPÉGÉ, du grave à l'aigu
//
// Le vocabulaire du glissement vertical est celui de `RoueFigee` : on appuie, on
// tire, on relâche. Une deuxième grammaire de geste dans le même écran ferait
// hésiter la main.
//
// ⚠ CAPTURE DU POINTEUR obligatoire : l'arpège se demande en tirant vers le haut,
// donc HORS des limites de la case. Sans `setPointerCapture`, le `pointerup`
// partirait ailleurs et le geste serait perdu.
//
// Le `onClick` existant de la case (poser le curseur, choisir le focus) n'est pas
// touché : il continue de se déclencher sur un appui bref, et pas sur un glissé —
// ce qui est le comportement voulu.

import { useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

import type { FormeAccord } from './intro.ts'

/** Du même ordre que `SEUIL_DRAG_PX` du flux (28 px) : une seule main, un seul seuil. */
export const SEUIL_ARPEGE_PX = 24

export function useEcouteAccord(ecouter: (index: number, forme: FormeAccord) => void) {
  const depart = useRef<{ index: number; y: number } | null>(null)

  return function handlers(index: number) {
    return {
      onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
        depart.current = { index, y: e.clientY }
        e.currentTarget.setPointerCapture?.(e.pointerId)
      },
      onPointerUp: (e: ReactPointerEvent<HTMLElement>) => {
        const d = depart.current
        depart.current = null
        e.currentTarget.releasePointerCapture?.(e.pointerId)
        if (!d || d.index !== index) return
        ecouter(index, d.y - e.clientY >= SEUIL_ARPEGE_PX ? 'arpege' : 'plaque')
      },
      onPointerCancel: () => {
        depart.current = null
      },
    }
  }
}
