// Liste des séances sauvegardées, la plus récente d'abord. Un clic rouvre la
// séance dans le tableau (niveau, tonalité, objectifs et tempi saisis mémorisés).

import { useState } from 'react'
import { affichageTonalite, labelExercice } from './gammesData.ts'
import type { Seance } from './carnetStorage.ts'

interface Props {
  seances: Seance[]
  ouverte: string | null
  onOuvrir: (s: Seance) => void
  onSupprimer: (s: Seance) => void
}

function formaterDate(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
}

export default function ListeSeances({ seances, ouverte, onOuvrir, onSupprimer }: Props) {
  const [aConfirmer, setAConfirmer] = useState<string | null>(null)
  const triees = [...seances].sort((a, b) => (a.date < b.date ? 1 : -1))

  if (!triees.length) {
    return <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>Aucune séance sauvegardée pour l’instant.</p>
  }

  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {triees.map(s => {
        const actif = s.id === ouverte
        const resume = Object.keys(s.saisis).map(labelExercice).join(', ')
        return (
          <li key={s.id} style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
            <button onClick={() => onOuvrir(s)} aria-current={actif}
              style={{ flex: 1, minHeight: 56, textAlign: 'left', padding: '8px 12px', borderRadius: 12, cursor: 'pointer',
                border: `2px solid ${actif ? '#c084fc' : 'var(--border-c)'}`,
                background: actif ? 'rgba(124,58,237,0.15)' : 'var(--surface)', color: 'var(--text)' }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>
                {s.niveau} · {affichageTonalite(s.tonalite)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formaterDate(s.date)}</div>
              {resume && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{resume}</div>}
            </button>
            {aConfirmer === s.id ? (
              <button onClick={() => { setAConfirmer(null); onSupprimer(s) }}
                style={{ minWidth: 76, minHeight: 56, borderRadius: 12, border: '2px solid #f87171', background: 'transparent',
                  color: '#f87171', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                Confirmer
              </button>
            ) : (
              <button onClick={() => setAConfirmer(s.id)} aria-label="Supprimer cette séance"
                style={{ width: 48, minHeight: 56, borderRadius: 12, border: '1px solid var(--border-c)', background: 'var(--surface)',
                  color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" />
                </svg>
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
