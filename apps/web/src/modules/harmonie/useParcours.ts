// ─── Hook de lecture des paramètres du parcours ─────────────────────────────
//
// Mince enveloppe sur `lireParametresParcours` : la logique vit dans `parcours.ts`
// (pur, testé). Ici on ne fait que brancher l'URL.

import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

import { lireParametresParcours, type ParametresParcours } from './parcours.ts'

export function useParcours(): ParametresParcours {
  const [search] = useSearchParams()
  const texte = search.toString()
  return useMemo(() => lireParametresParcours(texte), [texte])
}
