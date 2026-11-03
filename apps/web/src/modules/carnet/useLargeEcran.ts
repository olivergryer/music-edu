import { useEffect, useState } from 'react'

/** Vrai quand la fenêtre atteint `largeurMin` px (tablette / ordinateur). */
export function useLargeEcran(largeurMin = 900): boolean {
  const requete = `(min-width: ${largeurMin}px)`
  const [large, setLarge] = useState(() => typeof window !== 'undefined' && window.matchMedia(requete).matches)
  useEffect(() => {
    const mq = window.matchMedia(requete)
    const maj = () => setLarge(mq.matches)
    maj()
    mq.addEventListener('change', maj)
    return () => mq.removeEventListener('change', maj)
  }, [requete])
  return large
}
