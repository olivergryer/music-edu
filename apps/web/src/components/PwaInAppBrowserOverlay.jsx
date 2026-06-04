// Overlay : navigateur in-app (Instagram, Facebook, TikTok) ne supporte pas l'install PWA.
// Invite à ouvrir Tessitura dans Safari/Chrome.

import { useState } from 'react'

const APP_LABELS = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
}

export default function PwaInAppBrowserOverlay({ pwa, onClose }) {
  const [dontShow, setDontShow] = useState(false)
  const [copied, setCopied] = useState(false)

  function handleLater() {
    if (dontShow) pwa.dismissInAppForever()
    onClose()
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  const appLabel = APP_LABELS[pwa.inAppBrowser] ?? 'l\'application'
  const instructions = pwa.platform === 'ios'
    ? 'Appuie sur ⋯ (en haut à droite) puis "Ouvrir dans Safari".'
    : pwa.platform === 'android'
    ? 'Appuie sur ⋮ (en haut à droite) puis "Ouvrir dans le navigateur" (Chrome).'
    : 'Ouvre cette page dans Safari ou Chrome.'

  return (
    <>
      <div onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 310 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 311, width: 'min(360px, 92vw)', maxHeight: '88vh', overflowY: 'auto',
        background: 'var(--surface)', border: '1.5px solid #FF8B3D', borderRadius: 20,
        padding: '26px 22px 20px', textAlign: 'center',
      }}>
        <div style={{ fontSize: 38, lineHeight: 1, marginBottom: 6 }}>⚠️</div>
        <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text)', marginBottom: 10 }}>
          Ouvre Tessitura dans Safari/Chrome
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.45 }}>
          Tu navigues depuis {appLabel}. Pour installer Tessitura comme appli,
          accéder hors ligne et profiter pleinement de toutes les fonctions,
          ouvre cette page dans ton navigateur.
        </div>

        <div style={{
          background: 'rgba(255,139,61,0.1)', border: '1px solid #FF8B3D40',
          borderRadius: 12, padding: '12px 14px', marginBottom: 16,
          fontSize: 13, color: 'var(--text)', textAlign: 'left', lineHeight: 1.4,
        }}>
          {instructions}
        </div>

        <button onClick={copyLink}
          style={{
            width: '100%', padding: '13px 0', borderRadius: 14, border: 'none',
            background: 'linear-gradient(135deg,#4A6CF7,#8B5CF6)', color: '#fff',
            fontSize: 15, fontWeight: 800, cursor: 'pointer', marginBottom: 8,
          }}>
          {copied ? '✓ Lien copié !' : '📋 Copier le lien'}
        </button>

        <button onClick={handleLater}
          style={{
            width: '100%', padding: '12px 0', borderRadius: 14, border: '1px solid var(--border-c)',
            background: 'var(--surface-2)', color: 'var(--text)', fontSize: 14, fontWeight: 700,
            cursor: 'pointer',
          }}>
          Plus tard
        </button>

        <label style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          marginTop: 12, fontSize: 12, color: '#6b7280', cursor: 'pointer', minHeight: 24,
        }}>
          <input type="checkbox" checked={dontShow} onChange={(e) => setDontShow(e.target.checked)}
            style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#4A6CF7' }} />
          Ne plus afficher
        </label>
      </div>
    </>
  )
}
