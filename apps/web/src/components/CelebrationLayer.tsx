// ─── Couche de célébration ───────────────────────────────────────────────────
// Montée UNE fois dans App. Elle affiche streak validé, montée de rang et
// trophées débloqués, quel que soit le module d'origine.
//
// Avant : `addSession` était appelé depuis 11 endroits mais son résultat n'était
// affiché qu'à un seul — l'écran de fin de série Rythme. Débloquer un trophée en
// Théorie, Notes, Harmonie ou Accordeur était totalement silencieux.

import { useEffect, useState } from 'react'
import { useCelebrations, type Celebration } from '../hooks/CelebrationContext'
import { RANKS, TROPHIES, rankLabel } from '../hooks/progressLogic'

const DUREE_MS = 2600

interface Contenu {
  icone: string
  titre: string
  detail: string
  couleur: string
}

function contenuDe(c: Celebration): Contenu {
  if (c.type === 'streak') {
    return {
      icone: '🔥',
      titre: 'Journée validée !',
      detail: c.jours > 1 ? `${c.jours} jours d’affilée` : 'Premier jour de ta série',
      couleur: '#fbbf24',
    }
  }
  if (c.type === 'rang') {
    const rang = RANKS.find(r => r.id === c.rangId)
    return {
      icone: '⭐',
      titre: 'Rang supérieur !',
      detail: rang ? rankLabel(rang) : c.rangId,
      couleur: '#c084fc',
    }
  }
  const trophee = TROPHIES.find(t => t.id === c.trophyId)
  return {
    icone: trophee?.icon ?? '🏅',
    titre: 'Trophée débloqué !',
    detail: trophee?.label ?? c.trophyId,
    couleur: '#34d399',
  }
}

export default function CelebrationLayer() {
  const { courant, suivant } = useCelebrations()
  const [sortie, setSortie] = useState(false)

  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  // Chaque événement s'affiche puis cède la place au suivant. La `key` du
  // conteneur étant l'événement lui-même, l'animation d'entrée se rejoue à
  // chaque fois, y compris pour deux trophées consécutifs.
  useEffect(() => {
    if (!courant) return
    setSortie(false)
    const tSortie = setTimeout(() => setSortie(true), DUREE_MS - 380)
    const tFin = setTimeout(() => suivant(), DUREE_MS)
    return () => { clearTimeout(tSortie); clearTimeout(tFin) }
  }, [courant, suivant])

  if (!courant) return null

  const { icone, titre, detail, couleur } = contenuDe(courant)
  const cle = `${courant.type}-${'trophyId' in courant ? courant.trophyId : 'rangId' in courant ? courant.rangId : courant.jours}`

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 400,
        display: 'flex', justifyContent: 'center',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 14px)',
        pointerEvents: 'none',
      }}
      role="status"
      aria-live="polite"
    >
      <div
        key={cle}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          maxWidth: 'min(360px, 92vw)',
          padding: '12px 18px',
          borderRadius: 16,
          background: 'var(--surface)',
          border: `1.5px solid ${couleur}`,
          boxShadow: `0 10px 34px rgba(0,0,0,0.34), 0 0 22px ${couleur}33`,
          animation: reducedMotion
            ? undefined
            : `${sortie ? 'celebration-sortie 0.36s ease-in forwards' : 'celebration-entree 0.42s cubic-bezier(0.18,1.2,0.4,1)'}`,
          opacity: reducedMotion && sortie ? 0 : 1,
          transition: reducedMotion ? 'opacity 0.3s' : undefined,
        }}
      >
        <span style={{ fontSize: 30, lineHeight: 1 }}>{icone}</span>
        <div style={{ textAlign: 'left', minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: couleur }}>{titre}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{detail}</div>
        </div>
      </div>
    </div>
  )
}
