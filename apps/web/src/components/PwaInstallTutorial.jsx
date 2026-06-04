// Overlay tutoriel : installer Tessitura comme PWA sur le device.
// 2 contextes : 'hub' (case "Ne plus afficher" simple) | 'dashboard' (case + modal de confirmation).

import { useState } from 'react'

const BENEFICES = [
  '✦ Accès rapide depuis ton écran d\'accueil',
  '✦ Lancement en plein écran (sans barre de navigateur)',
  '✦ Utilisation hors ligne',
  '✦ Notifications de pratique (à venir)',
]

export default function PwaInstallTutorial({ pwa, context, onClose }) {
  const [dontShow, setDontShow] = useState(false)
  const [confirmDismiss, setConfirmDismiss] = useState(false)

  function handleLater() {
    if (dontShow) {
      if (context === 'hub') {
        pwa.dismissHubForever()
        onClose()
      } else {
        // Dashboard : passer par modal de confirmation
        setConfirmDismiss(true)
      }
    } else {
      if (context === 'dashboard') pwa.markDashboardShown()
      onClose()
    }
  }

  function confirmDashboardDismiss() {
    pwa.dismissDashboardForever()
    onClose()
  }

  function cancelDashboardDismiss() {
    // Annuler la désactivation : on garde la session affichée comme "shown today"
    pwa.markDashboardShown()
    setConfirmDismiss(false)
    onClose()
  }

  if (confirmDismiss) {
    return <ConfirmDismissModal onConfirm={confirmDashboardDismiss} onCancel={cancelDashboardDismiss} />
  }

  return (
    <>
      <div onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 300 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 301, width: 'min(360px, 92vw)', maxHeight: '88vh', overflowY: 'auto',
        background: 'var(--surface)', border: '1.5px solid rgba(74,108,247,0.3)', borderRadius: 20,
        padding: '26px 22px 20px', textAlign: 'center',
      }}>
        <div style={{ fontSize: 38, lineHeight: 1, marginBottom: 6 }}>📱</div>
        <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text)', marginBottom: 8 }}>
          Installe Tessitura sur ton appareil
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 18, lineHeight: 1.4 }}>
          Comme une vraie appli — sur ton écran d'accueil, en plein écran, hors ligne.
        </div>

        <InstallInstructions pwa={pwa} />

        <button onClick={handleLater}
          style={{
            width: '100%', padding: '12px 0', borderRadius: 14, border: '1px solid var(--border-c)',
            background: 'var(--surface-2)', color: 'var(--text)', fontSize: 14, fontWeight: 700,
            cursor: 'pointer', marginTop: 14,
          }}>
          Plus tard
        </button>

        <label style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          marginTop: 12, fontSize: 12, color: '#6b7280', cursor: 'pointer', minHeight: 24,
        }}>
          <input type="checkbox" checked={dontShow} onChange={(e) => setDontShow(e.target.checked)}
            style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#4A6CF7' }} />
          Ne plus afficher {context === 'hub' ? 'sur l\'accueil' : 'sur le tableau de bord'}
        </label>
      </div>
    </>
  )
}

function InstallInstructions({ pwa }) {
  if (pwa.platform === 'android' && pwa.canTriggerInstall) {
    return (
      <div style={{ marginBottom: 4 }}>
        <button onClick={() => pwa.triggerInstall()}
          style={{
            width: '100%', padding: '13px 0', borderRadius: 14, border: 'none',
            background: 'linear-gradient(135deg,#4A6CF7,#8B5CF6)', color: '#fff',
            fontSize: 15, fontWeight: 800, cursor: 'pointer',
          }}>
          📥 Installer maintenant
        </button>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.4 }}>
          Tu peux aussi passer par Menu ⋮ → "Installer l'application".
        </p>
      </div>
    )
  }

  if (pwa.platform === 'ios') {
    return (
      <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 4 }}>
        <Step n={1} text="Appuie sur l'icône Partager en bas de Safari." icon={<ShareIcon />} />
        <Step n={2} text="Fais défiler et choisis « Sur l'écran d'accueil »." icon="🏠" />
        <Step n={3} text="Confirme avec « Ajouter » en haut à droite." icon="✓" />
      </div>
    )
  }

  if (pwa.platform === 'desktop' && pwa.canTriggerInstall) {
    return (
      <div style={{ marginBottom: 4 }}>
        <button onClick={() => pwa.triggerInstall()}
          style={{
            width: '100%', padding: '13px 0', borderRadius: 14, border: 'none',
            background: 'linear-gradient(135deg,#4A6CF7,#8B5CF6)', color: '#fff',
            fontSize: 15, fontWeight: 800, cursor: 'pointer',
          }}>
          📥 Installer maintenant
        </button>
      </div>
    )
  }

  // Fallback (Android sans prompt, Desktop sans prompt, autre)
  return (
    <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, textAlign: 'left' }}>
      Ouvre le menu de ton navigateur (⋮ ou ⋯) puis cherche{' '}
      <b style={{ color: 'var(--text)' }}>« Installer l'application »</b> ou{' '}
      <b style={{ color: 'var(--text)' }}>« Ajouter à l'écran d'accueil »</b>.
    </div>
  )
}

function Step({ n, text, icon }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{
        flexShrink: 0, width: 28, height: 28, borderRadius: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(74,108,247,0.15)', color: '#4A6CF7',
        fontSize: 13, fontWeight: 800,
      }}>{n}</span>
      <span style={{ flexShrink: 0, fontSize: 18 }}>{icon}</span>
      <span style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.35 }}>{text}</span>
    </div>
  )
}

function ShareIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4A6CF7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <rect x="4" y="13" width="16" height="8" rx="2" />
    </svg>
  )
}

function ConfirmDismissModal({ onConfirm, onCancel }) {
  return (
    <>
      <div onClick={onCancel}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 400 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 401, width: 'min(360px, 92vw)', maxHeight: '88vh', overflowY: 'auto',
        background: 'var(--surface)', border: '1.5px solid #FF8B3D', borderRadius: 20,
        padding: '26px 22px 20px',
      }}>
        <div style={{ fontSize: 32, lineHeight: 1, marginBottom: 6, textAlign: 'center' }}>⚠️</div>
        <div style={{ fontSize: 17, fontWeight: 900, color: 'var(--text)', marginBottom: 10, textAlign: 'center' }}>
          Tu es sûr ?
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.45 }}>
          Sans installer Tessitura comme appli, tu rateras :
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
          {BENEFICES.map((b, i) => (
            <div key={i} style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.4 }}>{b}</div>
          ))}
        </div>

        <button onClick={onConfirm}
          style={{
            width: '100%', padding: '12px 0', borderRadius: 14, border: 'none',
            background: '#FF8B3D', color: '#fff', fontSize: 14, fontWeight: 800,
            cursor: 'pointer', marginBottom: 8,
          }}>
          Je confirme, ne plus afficher
        </button>
        <button onClick={onCancel}
          style={{
            width: '100%', padding: '12px 0', borderRadius: 14, border: '1px solid var(--border-c)',
            background: 'var(--surface-2)', color: 'var(--text)', fontSize: 14, fontWeight: 700,
            cursor: 'pointer',
          }}>
          Annuler
        </button>
      </div>
    </>
  )
}
