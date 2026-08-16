// ─── File d'événements de progression ────────────────────────────────────────
// `useProgressFirebase` est appelé indépendamment par chaque module : la file ne
// peut donc pas y vivre, sinon chaque module aurait sa propre copie et l'écran
// d'affichage ne verrait rien. Elle vit ici, dans un contexte monté une fois
// dans App, alimenté par les modules et consommé par <CelebrationLayer />.
//
// Conséquence utile : les 11 appels à `addSession` n'ont pas à être modifiés —
// c'est le hook qui pousse dans la file.

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

export type Celebration =
  | { type: 'streak'; jours: number }
  | { type: 'rang'; rangId: string }
  | { type: 'trophee'; trophyId: string }

interface CelebrationContextValue {
  /** Événement en cours d'affichage, `null` si la file est vide. */
  courant: Celebration | null
  /** Empile des événements — ignoré si la liste est vide. */
  pousser: (events: Celebration[]) => void
  /** Passe au suivant : appelé par la couche d'affichage en fin d'animation. */
  suivant: () => void
}

const CelebrationContext = createContext<CelebrationContextValue>({
  courant: null,
  pousser: () => {},
  suivant: () => {},
})

export function CelebrationProvider({ children }: { children: ReactNode }) {
  const [file, setFile] = useState<Celebration[]>([])

  const pousser = useCallback((events: Celebration[]) => {
    if (events.length === 0) return
    setFile(f => [...f, ...events])
  }, [])

  const suivant = useCallback(() => {
    setFile(f => f.slice(1))
  }, [])

  return (
    <CelebrationContext.Provider value={{ courant: file[0] ?? null, pousser, suivant }}>
      {children}
    </CelebrationContext.Provider>
  )
}

export function useCelebrations() {
  return useContext(CelebrationContext)
}
