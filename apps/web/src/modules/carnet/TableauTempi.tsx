// Tableau des tempi : objectif · max atteint · séance précédente · saisie actuelle.
// Toute valeur affichée est cliquable et envoie son tempo au métronome.

import type { FigureId } from './figures.ts'

export interface LigneTableau {
  exercice: string
  label: string
  objectif?: number
  figure?: FigureId
  max?: number
  precedent?: number
}

interface Props {
  lignes: LigneTableau[]
  saisis: Record<string, string>
  onSaisie: (exercice: string, valeur: string) => void
  onEnvoyer: (tempo: number, figure?: FigureId) => void
}

const cellule: React.CSSProperties = { padding: '4px 3px', textAlign: 'center', verticalAlign: 'middle' }
const entete: React.CSSProperties = { ...cellule, fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', lineHeight: 1.2 }

export default function TableauTempi({ lignes, saisis, onSaisie, onEnvoyer }: Props) {
  const valeurCliquable = (v: number | undefined, figure?: FigureId) =>
    v === undefined ? (
      <span style={{ color: 'var(--text-muted)' }}>—</span>
    ) : (
      <button onPointerDown={e => e.stopPropagation()} onClick={() => onEnvoyer(v, figure)}
        aria-label={`Envoyer ${v} au métronome`}
        style={{ minWidth: 48, minHeight: 44, border: '1px solid var(--border-c)', borderRadius: 10,
          background: 'var(--surface-2)', color: 'var(--text)', fontSize: 16, fontWeight: 600,
          fontVariantNumeric: 'tabular-nums', cursor: 'pointer' }}>
        {v}
      </button>
    )

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 320 }}>
        <thead>
          <tr>
            <th style={{ ...entete, textAlign: 'left' }}>Exercice</th>
            <th style={entete}>Objectif</th>
            <th style={entete}>Max atteint</th>
            <th style={entete}>Séance préc.</th>
            <th style={entete}>Aujourd’hui</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map(l => {
            const val = saisis[l.exercice] ?? ''
            const n = parseInt(val, 10)
            const atteint = Number.isFinite(n) && l.objectif !== undefined && n >= l.objectif
            return (
              <tr key={l.exercice} style={{ borderTop: '1px solid var(--border-c)' }}>
                <td style={{ ...cellule, textAlign: 'left', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{l.label}</td>
                <td style={cellule}>{valeurCliquable(l.objectif, l.figure)}</td>
                <td style={cellule}>{valeurCliquable(l.max)}</td>
                <td style={cellule}>{valeurCliquable(l.precedent)}</td>
                <td style={cellule}>
                  <input
                    inputMode="numeric"
                    value={val}
                    aria-label={`Tempo atteint, ${l.label}`}
                    placeholder="—"
                    onPointerDown={e => e.stopPropagation()}
                    onFocus={() => { if (Number.isFinite(n)) onEnvoyer(n) }}
                    onChange={e => onSaisie(l.exercice, e.target.value.replace(/\D/g, '').slice(0, 3))}
                    style={{ width: 56, height: 44, boxSizing: 'border-box', textAlign: 'center', fontSize: 16, fontWeight: 700,
                      borderRadius: 10, background: 'var(--input-bg)', color: 'var(--text)',
                      border: `2px solid ${atteint ? '#34d399' : 'var(--border-c)'}` }} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
