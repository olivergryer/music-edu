import type { CSSProperties } from 'react'

export const ORANGE = '#FF8B3D'          // commandes uniquement (jamais dans les zones de mesure)
export const NEUTRE = 'rgba(128,128,128,0.18)'

export const carte: CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: 14, padding: 10 }

export const pastille = (actif: boolean, extra: CSSProperties = {}): CSSProperties => ({
  minHeight: 44, minWidth: 44, padding: '0 12px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14,
  border: `1.5px solid ${actif ? ORANGE : 'var(--border-strong, var(--border-c))'}`,
  background: actif ? 'rgba(255,139,61,0.14)' : 'transparent', color: actif ? ORANGE : 'var(--text)', fontWeight: actif ? 700 : 400, ...extra,
})

export const titreSection: CSSProperties = { fontSize: 12, color: 'var(--text-muted)', margin: '10px 0 4px', fontWeight: 600 }
export const rangee: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 6 }
