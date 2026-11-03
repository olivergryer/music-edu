// Tableau des tempi : exercice · objectif · max / précédent (empilés) · saisie du jour.
// Toute valeur affichée est cliquable et envoie son tempo au métronome. Un appui
// sur le nom d'un exercice le rend « actif » : c'est lui que remplit « Noter ».

export interface LigneTableau {
  exercice: string
  label: string
  objectif?: number
  /** Exercice ajouté par l'élève (supprimable). */
  perso?: boolean
  max?: number
  precedent?: number
}

interface Props {
  lignes: LigneTableau[]
  saisis: Record<string, string>
  onSaisie: (exercice: string, valeur: string) => void
  onEnvoyer: (tempo: number) => void
  onSupprimerPerso?: (exercice: string) => void
  actif: string | null
  onActiver: (exercice: string) => void
}

const cellule: React.CSSProperties = { padding: '3px 2px', textAlign: 'center', verticalAlign: 'middle' }
const entete: React.CSSProperties = { ...cellule, fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', lineHeight: 1.2 }

export default function TableauTempi({ lignes, saisis, onSaisie, onEnvoyer, onSupprimerPerso, actif, onActiver }: Props) {
  const valeur = (v: number | undefined, opts: { hauteur: number; forte?: boolean; legende?: string }) =>
    v === undefined ? (
      <span style={{ color: 'var(--text-muted)', display: 'block', lineHeight: `${opts.hauteur}px` }}>—</span>
    ) : (
      <button onPointerDown={e => e.stopPropagation()} onClick={() => onEnvoyer(v)}
        aria-label={`${opts.legende ?? 'Tempo'} ${v} : envoyer au métronome`}
        style={{ display: 'block', width: '100%', minWidth: 46, height: opts.hauteur, border: '1px solid var(--border-c)', borderRadius: 8,
          background: 'var(--surface-2)', color: opts.forte === false ? 'var(--text-muted)' : 'var(--text)',
          fontSize: opts.forte === false ? 13 : 16, fontWeight: opts.forte === false ? 500 : 700,
          fontVariantNumeric: 'tabular-nums', cursor: 'pointer', padding: 0 }}>
        {v}
      </button>
    )

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 300 }}>
        <thead>
          <tr>
            <th style={{ ...entete, textAlign: 'left' }}>Exercice</th>
            <th style={entete}>Objectif</th>
            <th style={entete}>Max<br />Préc.</th>
            <th style={entete}>Aujourd’hui</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map(l => {
            const val = saisis[l.exercice] ?? ''
            const n = parseInt(val, 10)
            const atteint = Number.isFinite(n) && l.objectif !== undefined && n >= l.objectif
            const estActif = l.exercice === actif
            return (
              <tr key={l.exercice} style={{ borderTop: '1px solid var(--border-c)',
                background: estActif ? 'rgba(124,58,237,0.14)' : 'transparent' }}>
                <td style={{ ...cellule, textAlign: 'left', boxShadow: estActif ? 'inset 3px 0 0 #c084fc' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <button onPointerDown={e => e.stopPropagation()} onClick={() => onActiver(l.exercice)} aria-pressed={estActif}
                      style={{ flex: 1, minHeight: 60, textAlign: 'left', border: 'none', background: 'transparent', color: 'var(--text)',
                        fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: '0 4px 0 8px' }}>
                      {l.label}
                    </button>
                    {l.perso && onSupprimerPerso && (
                      <button onPointerDown={e => e.stopPropagation()}
                        onClick={() => { if (window.confirm(`Supprimer l’exercice « ${l.label} » ?`)) onSupprimerPerso(l.exercice) }}
                        aria-label={`Supprimer l’exercice ${l.label}`}
                        style={{ width: 44, height: 44, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                      </button>
                    )}
                  </div>
                </td>
                <td style={cellule}>{valeur(l.objectif, { hauteur: 44, legende: 'Objectif' })}</td>
                <td style={{ ...cellule, padding: '3px 4px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {valeur(l.max, { hauteur: 28, legende: 'Maximum atteint' })}
                    {valeur(l.precedent, { hauteur: 28, forte: false, legende: 'Séance précédente' })}
                  </div>
                </td>
                <td style={cellule}>
                  <input
                    inputMode="numeric"
                    value={val}
                    aria-label={`Tempo atteint, ${l.label}`}
                    placeholder="—"
                    onPointerDown={e => e.stopPropagation()}
                    onFocus={() => { onActiver(l.exercice); if (Number.isFinite(n)) onEnvoyer(n) }}
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
