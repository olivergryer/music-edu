import { useEffect, useRef } from 'react'

/** Boucle requestAnimationFrame : `cb(dtSecondes)` à chaque image, sans état React. */
export function useRaf(cb: (dt: number) => void, actif = true): void {
  const ref = useRef(cb)
  ref.current = cb
  useEffect(() => {
    if (!actif) return
    let id = 0, avant = performance.now()
    const boucle = (t: number) => {
      const dt = Math.min(0.05, Math.max(0, (t - avant) / 1000))
      avant = t
      ref.current(dt)
      id = requestAnimationFrame(boucle)
    }
    id = requestAnimationFrame(boucle)
    return () => cancelAnimationFrame(id)
  }, [actif])
}

export function useReduireMouvement(): boolean {
  const q = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
  return !!q?.matches
}
