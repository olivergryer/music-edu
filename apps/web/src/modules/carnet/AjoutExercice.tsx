// Ajout d'un exercice personnel : ligne supplémentaire sous le tableau,
// valable pour toutes les tonalités du niveau courant.

import { useState } from 'react'

interface Props {
  onAjouter: (nom: string, objectif?: number) => void
}

const champ: React.CSSProperties = {
  height: 44, boxSizing: 'border-box', borderRadius: 10, padding: '0 10px', fontSize: 15,
  border: '1px solid var(--border-c)', background: 'var(--input-bg)', color: 'var(--text)',
}

export default function AjoutExercice({ onAjouter }: Props) {
  const [ouvert, setOuvert] = useState(false)
  const [nom, setNom] = useState('')
  const [objectif, setObjectif] = useState('')

  const fermer = () => { setOuvert(false); setNom(''); setObjectif('') }
  const valider = () => {
    if (!nom.trim()) return
    const n = parseInt(objectif, 10)
    onAjouter(nom.trim(), Number.isFinite(n) && n > 0 ? n : undefined)
    fermer()
  }

  if (!ouvert) {
    return (
      <button onClick={() => setOuvert(true)}
        style={{ marginTop: 8, minHeight: 44, padding: '0 14px', borderRadius: 12, border: '1px dashed var(--border-c)',
          background: 'transparent', color: 'var(--text)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
        + Ajouter un exercice
      </button>
    )
  }

  return (
    <form onSubmit={e => { e.preventDefault(); valider() }}
      style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      <input autoFocus value={nom} onChange={e => setNom(e.target.value.slice(0, 40))} placeholder="Nom de l’exercice"
        aria-label="Nom de l’exercice" style={{ ...champ, flex: '1 1 180px' }} />
      <input value={objectif} inputMode="numeric" onChange={e => setObjectif(e.target.value.replace(/\D/g, '').slice(0, 3))}
        placeholder="Objectif" aria-label="Tempo objectif (facultatif)" style={{ ...champ, width: 90, textAlign: 'center' }} />
      <button type="submit" disabled={!nom.trim()}
        style={{ minHeight: 44, padding: '0 16px', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 14,
          background: nom.trim() ? '#7c3aed' : 'var(--surface-2)', color: nom.trim() ? '#fff' : 'var(--text-muted)',
          cursor: nom.trim() ? 'pointer' : 'not-allowed' }}>
        Ajouter
      </button>
      <button type="button" onClick={fermer}
        style={{ minHeight: 44, padding: '0 12px', borderRadius: 10, border: '1px solid var(--border-c)',
          background: 'transparent', color: 'var(--text)', fontSize: 14, cursor: 'pointer' }}>
        Annuler
      </button>
    </form>
  )
}
