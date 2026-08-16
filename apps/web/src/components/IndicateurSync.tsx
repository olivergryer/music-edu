// ─── Indicateur de synchronisation ───────────────────────────────────────────
// Discret, non bloquant, en bas d'écran. Il ne s'affiche QUE hors ligne : en
// ligne, tout est instantané et un badge permanent serait du bruit.
//
// Pourquoi il existe : depuis que les écritures Firestore ne sont plus attendues
// (useProgressFirebase), la progression est enregistrée localement et rejouée à
// la reconnexion. Sans retour visuel, l'élève hors ligne n'a aucun moyen de
// savoir si son travail est conservé — l'ancien comportement était un silence
// total, y compris en cas de perte réelle.

import { useEffect, useState } from 'react'

export default function IndicateurSync() {
  const [horsLigne, setHorsLigne] = useState(
    typeof navigator !== 'undefined' && navigator.onLine === false,
  )
  // Affiché brièvement au retour du réseau, pour confirmer la synchronisation.
  const [reconnecte, setReconnecte] = useState(false)

  useEffect(() => {
    const online = () => {
      setHorsLigne(false)
      setReconnecte(true)
      setTimeout(() => setReconnecte(false), 2800)
    }
    const offline = () => { setHorsLigne(true); setReconnecte(false) }

    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    return () => {
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
    }
  }, [])

  if (!horsLigne && !reconnecte) return null

  const couleur = horsLigne ? '#fbbf24' : '#34d399'
  const texte = horsLigne
    ? 'Hors ligne — ta progression sera synchronisée au retour du réseau'
    : 'Progression synchronisée'

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed', zIndex: 350,
        left: '50%', transform: 'translateX(-50%)',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 14px)',
        maxWidth: 'min(340px, 92vw)',
        display: 'flex', alignItems: 'center', gap: 9,
        padding: '9px 15px', borderRadius: 999,
        background: 'var(--surface)',
        border: `1px solid ${couleur}66`,
        boxShadow: '0 6px 20px rgba(0,0,0,0.3)',
        fontSize: 11, lineHeight: 1.3, color: 'var(--text-muted)',
        textAlign: 'left', pointerEvents: 'none',
      }}
    >
      <span style={{
        flexShrink: 0, width: 8, height: 8, borderRadius: '50%', background: couleur,
      }} />
      {texte}
    </div>
  )
}
