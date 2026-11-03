// Panneau « Source des tempi » : modèle à télécharger, URL d'un CSV personnalisé,
// retour au document de la classe.

import { useState } from 'react'
import type { Source } from './sourceGammes.ts'

interface Props {
  source: Source
  horsLigne: boolean
  urlPerso: string | null
  /** Renvoie un message d'erreur, ou null si le chargement a réussi. */
  onAppliquer: (url: string | null) => Promise<string | null>
}

const LIBELLE_SOURCE: Record<Source, string> = {
  classe: 'Document de la classe',
  perso: 'Ton fichier personnalisé',
  secours: 'Copie de secours intégrée',
}

export default function SourceDonnees({ source, horsLigne, urlPerso, onAppliquer }: Props) {
  const [url, setUrl] = useState(urlPerso ?? '')
  const [erreur, setErreur] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)

  const appliquer = async (valeur: string | null) => {
    setEnCours(true)
    setErreur(null)
    const e = await onAppliquer(valeur)
    setErreur(e)
    if (!e && !valeur) setUrl('')
    setEnCours(false)
  }

  const bouton: React.CSSProperties = {
    minHeight: 44, padding: '0 14px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer',
    border: '1px solid var(--border-c)', background: 'var(--surface-2)', color: 'var(--text)',
  }

  return (
    <details style={{ fontSize: 14 }}>
      <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 16, minHeight: 44, display: 'flex', alignItems: 'center' }}>
        Source des tempi
      </summary>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8 }}>
        <p style={{ margin: 0, color: 'var(--text-muted)' }}>
          Source actuelle : <strong style={{ color: 'var(--text)' }}>{LIBELLE_SOURCE[source]}</strong>
          {horsLigne && source !== 'secours' && ' (dernière version enregistrée, document injoignable)'}
          {source === 'secours' && ' (document en ligne injoignable)'}
        </p>

        <div>
          <a href="/carnet-gammes.csv" download="carnet-gammes-exemple.csv"
            style={{ ...bouton, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
            Télécharger un fichier d’exemple
          </a>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
            Modifie-le, publie-le (Google Sheets : Fichier → Partager → Publier sur le Web, au format CSV) puis colle son adresse ci-dessous.
          </p>
        </div>

        <form onSubmit={e => { e.preventDefault(); void appliquer(url) }} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label htmlFor="carnet-url" style={{ fontWeight: 600 }}>Adresse de ton fichier CSV</label>
          <input id="carnet-url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" inputMode="url"
            autoCapitalize="none" autoCorrect="off" spellCheck={false}
            style={{ height: 44, boxSizing: 'border-box', borderRadius: 10, padding: '0 10px', fontSize: 14,
              border: '1px solid var(--border-c)', background: 'var(--input-bg)', color: 'var(--text)' }} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button type="submit" disabled={enCours || !url.trim()}
              style={{ ...bouton, border: 'none', background: url.trim() ? '#7c3aed' : 'var(--surface-2)',
                color: url.trim() ? '#fff' : 'var(--text-muted)' }}>
              {enCours ? 'Chargement…' : 'Charger'}
            </button>
            {urlPerso && (
              <button type="button" disabled={enCours} onClick={() => void appliquer(null)} style={bouton}>
                Revenir au document de la classe
              </button>
            )}
          </div>
          {erreur && <span role="alert" style={{ color: '#f87171', fontSize: 13 }}>{erreur}</span>}
        </form>
      </div>
    </details>
  )
}
