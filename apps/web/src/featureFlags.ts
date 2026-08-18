// Affiche le bandeau diagonal « En test » (cartes du Hub des modules `enTest`)
// uniquement en prod (branche main). Masqué en local + preview Vercel (dev)
// pour ne pas distraire pendant le développement.
export const SHOW_TEST_BADGE: boolean = (() => {
  if (typeof window === 'undefined') return false
  const h = window.location.hostname
  if (h.includes('-git-')) return false           // Vercel preview (tessitura-git-dev-*)
  if (h === 'localhost') return false
  if (h.startsWith('127.') || h.startsWith('192.168.') || h.startsWith('10.')) return false
  return true
})()
