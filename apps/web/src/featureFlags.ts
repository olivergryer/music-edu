// Affiche bannière HUB + filigrane Accordeur uniquement en prod (branche main).
// Hidden en local + Vercel preview (dev) pour ne pas distraire pendant le dev.
export const SHOW_TEST_BADGE: boolean = (() => {
  if (typeof window === 'undefined') return false
  const h = window.location.hostname
  if (h.includes('-git-')) return false           // Vercel preview (tessitura-git-dev-*)
  if (h === 'localhost') return false
  if (h.startsWith('127.') || h.startsWith('192.168.') || h.startsWith('10.')) return false
  return true
})()
