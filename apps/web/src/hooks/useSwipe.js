import { useRef } from 'react'

export default function useSwipe({ onSwipeLeft, onSwipeRight, onTap, threshold = 50 }) {
  const start = useRef(null)

  return {
    onPointerDown: (e) => {
      start.current = { x: e.clientX, y: e.clientY }
    },
    onPointerUp: (e) => {
      if (!start.current) return
      const dx = e.clientX - start.current.x
      const dy = e.clientY - start.current.y
      start.current = null
      const absDx = Math.abs(dx)
      const absDy = Math.abs(dy)
      if (absDx >= threshold && absDx > absDy) {
        dx < 0 ? onSwipeLeft?.() : onSwipeRight?.()
      } else if (absDx < 10 && absDy < 10) {
        onTap?.()
      }
    },
    onPointerCancel: () => { start.current = null },
  }
}
