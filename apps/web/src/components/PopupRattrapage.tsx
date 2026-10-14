// ─── Pop-up de rattrapage de série ───────────────────────────────────────────
// À l'ouverture de l'app, si la série est rompue depuis 1 à 3 jours, annonce
// l'objectif qui permet de la réparer aujourd'hui (règle dans
// progressLogic.rattrapageDuJour). Une fois par jour : le rattrapage ne vaut
// que pour ce jour-là, et la jauge prend le relais pour suivre l'avancée.
// La réussite est annoncée par la couche de célébration (« Série réparée »).

import { useEffect, useState } from 'react'
import useProgressFirebase, { todayStr } from '../hooks/useProgressFirebase'
import { MULTIPLES_RATTRAPAGE } from '../hooks/progressLogic'
import { COMMUN } from '../content/commun'
import { useAuth } from '../auth/AuthProvider'
import TropheeIcon from './TropheeIcon'

const CLE = 'tessitura-popup-rattrapage'

function dejaVu(jour: string): boolean {
  try { return localStorage.getItem(CLE) === jour } catch { return false }
}

function marquerVu(jour: string) {
  try { localStorage.setItem(CLE, jour) } catch { /* stockage indisponible */ }
}

export default function PopupRattrapage() {
  const { loading } = useAuth()
  const { loaded, rattrapage, pointsDuJour } = useProgressFirebase()
  const [visible, setVisible] = useState(false)

  // `!loading` : tant que l'auth n'a pas répondu, le hook lit la progression
  // invité — un rattrapage y serait détecté à tort chez un élève connecté.
  const aRelever = !loading && loaded && rattrapage !== null && !rattrapage.done && pointsDuJour < rattrapage.target

  useEffect(() => {
    if (!aRelever) return
    const jour = todayStr()
    if (dejaVu(jour)) return
    // Marqué à l'AFFICHAGE : l'élève qui recharge la page ne le revoit pas.
    marquerVu(jour)
    setVisible(true)
  }, [aRelever])

  if (!visible || !rattrapage) return null

  const multiple = MULTIPLES_RATTRAPAGE[rattrapage.missed - 1]
  const fermer = () => setVisible(false)

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(3,7,18,0.82)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div style={{
        maxWidth: 380, width: '100%', background: 'var(--surface)',
        border: '1px solid var(--border-c)', borderRadius: 20, padding: '28px 24px',
        textAlign: 'center', boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
      }}>
        <div style={{
          width: 48, height: 48, margin: '0 auto 16px', borderRadius: '50%',
          background: 'rgba(251,191,36,0.14)', color: '#fbbf24',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <TropheeIcon id="flamme" size={26} strokeWidth={1.8} />
        </div>

        <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', marginBottom: 10 }}>
          {COMMUN.rattrapage.titre}
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--text-muted)', marginBottom: 20 }}>
          {COMMUN.rattrapage.corps(rattrapage.previous, rattrapage.missed, multiple, rattrapage.target)}
        </div>

        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={fermer}
          className="w-full border-none rounded-2xl text-sm font-bold cursor-pointer text-white"
          style={{ padding: '13px 0', minHeight: 44, background: 'linear-gradient(135deg,#f59e0b,#f97316)' }}
        >
          {COMMUN.rattrapage.valider}
        </button>
      </div>
    </div>
  )
}
