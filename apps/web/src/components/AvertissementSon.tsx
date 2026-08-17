// ─── Avertissement sonore ────────────────────────────────────────────────────
// Rappelle de sortir du mode silencieux avant d'entrer dans un module à son.
//
// Fréquence : UNE FOIS PAR JOUR, sans case « ne plus afficher ».
// Ce choix vient d'une limite technique : le web ne permet pas de savoir si
// l'appareil est en silencieux ni de lire le volume système. Aucune API ne
// l'expose — `HTMLMediaElement.volume` ne concerne que l'élément, et les
// méthodes de détection qui circulent reposent sur des mesures de durée qui
// cassent à chaque version d'iOS. Faute de pouvoir n'avertir qu'en cas de
// besoin, une case « ne plus afficher » ferait disparaître l'avertissement
// définitivement, y compris le jour où l'élève en a besoin. Un rappel quotidien
// est le compromis : assez rare pour ne pas lasser, assez régulier pour servir.

import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { COMMUN } from '../content/commun'

const CLE = 'tessitura-avert-son'

// Modules dont les exercices reposent sur le son. Le Hub, les dashboards, les
// pages d'authentification et le feedback en sont exclus.
const PREFIXES_SONORES = ['/rythme', '/theorie', '/notes', '/harmonie', '/accordeur']

function aujourdhui(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function dejaVuAujourdhui(): boolean {
  try { return localStorage.getItem(CLE) === aujourdhui() } catch { return false }
}

function marquerVu() {
  try { localStorage.setItem(CLE, aujourdhui()) } catch { /* stockage indisponible */ }
}

export default function AvertissementSon() {
  const { pathname } = useLocation()
  const [visible, setVisible] = useState(false)

  const moduleSonore = PREFIXES_SONORES.some(p => pathname === p || pathname.startsWith(`${p}/`))

  useEffect(() => {
    // Se déclenche à chaque entrée dans un module à son, mais `dejaVuAujourdhui`
    // le limite à une fois par jour — y compris en changeant de module.
    if (moduleSonore && !dejaVuAujourdhui()) setVisible(true)
  }, [moduleSonore, pathname])

  if (!visible) return null

  const fermer = () => { marquerVu(); setVisible(false) }

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
          background: 'rgba(192,132,252,0.14)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#c084fc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="#c084fc" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" />
          </svg>
        </div>

        <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', marginBottom: 10 }}>
          {COMMUN.avertissementSon.titre}
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--text-muted)', marginBottom: 20 }}>
          {COMMUN.avertissementSon.corps}
        </div>

        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={fermer}
          className="w-full border-none rounded-2xl text-sm font-bold cursor-pointer text-white"
          style={{ padding: '13px 0', minHeight: 44, background: 'linear-gradient(135deg,#4A6CF7,#8B5CF6)' }}
        >
          {COMMUN.avertissementSon.valider}
        </button>
      </div>
    </div>
  )
}
