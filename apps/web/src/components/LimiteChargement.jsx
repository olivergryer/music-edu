// ─── Garde-fou du chargement à la demande ────────────────────────────────────
// Depuis le découpage du bundle, chaque route est un chunk chargé au moment où
// on y accède. Si ce chargement échoue — hors ligne sur un module jamais visité,
// ou déploiement survenu entre-temps qui a invalidé les noms de fichiers —,
// React.lazy lève une erreur que <Suspense> ne rattrape pas : l'écran reste
// vide, sans explication ni issue.
//
// Cette limite d'erreur transforme cet échec en message actionnable. Le
// rechargement est proposé car il suffit à corriger le cas le plus fréquent :
// un déploiement pendant que l'onglet était ouvert.

import { Component } from 'react'

export default class LimiteChargement extends Component {
  constructor(props) {
    super(props)
    this.state = { enErreur: false }
  }

  static getDerivedStateFromError() {
    return { enErreur: true }
  }

  componentDidCatch(error) {
    console.warn('Chargement du module impossible.', error)
  }

  render() {
    if (!this.state.enErreur) return this.props.children

    return (
      <div className="bg-app text-app min-h-dvh flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div style={{ fontSize: 34, lineHeight: 1 }}>📡</div>
        <div style={{ fontSize: 16, fontWeight: 800 }}>Ce module n’a pas pu être chargé</div>
        <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-muted)', maxWidth: 320 }}>
          Il n’est pas encore disponible hors ligne. Reconnecte-toi une fois pour
          l’installer, puis il fonctionnera sans réseau.
        </div>
        <button
          onClick={() => window.location.reload()}
          className="border-none rounded-2xl cursor-pointer text-white text-sm font-bold"
          style={{ padding: '13px 26px', minHeight: 44, background: 'linear-gradient(135deg,#4A6CF7,#8B5CF6)' }}
        >
          Réessayer
        </button>
        <a href="/" style={{ fontSize: 13, fontWeight: 700, color: '#4A6CF7' }}>
          Retour à l’accueil
        </a>
      </div>
    )
  }
}
