// ─── Barre de transport, fixée en bas (brief UI v1, § 5.5) ────────────────────────────
import type { ModeAffichage } from './protocole.ts'
import { ORANGE, pastille } from './stylesAcc.ts'
import type { EtatSession } from './useSession.ts'

interface Props {
  etat: EtatSession
  onJouer: () => void
  onArreter: () => void
  tempo: number
  onTempo: (t: number) => void
  mode: ModeAffichage
  onMode: (m: ModeAffichage) => void
  boucle: boolean
  onBoucle: (b: boolean) => void
  decompte: boolean
  onDecompte: (b: boolean) => void
  volume: number
  onVolume: (v: number) => void
  libelleDepart?: string
}

const IconePlay = () => <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" fill="currentColor" /></svg>
const IconeStop = () => <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" /></svg>
const IconeBoucle = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 2l4 4-4 4" /><path d="M3 11v-1a4 4 0 014-4h14" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v1a4 4 0 01-4 4H3" /></svg>

export default function BarreTransport(p: Props) {
  const joue = p.etat === 'joue' || p.etat === 'demarrage'
  const occupe = p.etat === 'demarrage' || p.etat === 'analyse'
  return (
    <div role="toolbar" aria-label="Transport" style={{
      position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 20, background: 'var(--surface)', borderTop: '1px solid var(--border-c)',
      padding: '8px 12px calc(8px + env(safe-area-inset-bottom))', display: 'flex', justifyContent: 'center',
    }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'center', maxWidth: 720, width: '100%' }}>
        <button
          onClick={joue ? p.onArreter : p.onJouer} disabled={occupe && !joue}
          aria-label={joue ? 'Arrêter' : p.libelleDepart ?? 'Jouer'}
          style={{ ...pastille(true), width: 56, height: 48, background: ORANGE, color: '#0D1026', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >{joue ? <IconeStop /> : <IconePlay />}</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }} role="group" aria-label="Tempo">
          <button style={pastille(false, { padding: 0, width: 44 })} onClick={() => p.onTempo(Math.max(40, p.tempo - 2))} disabled={joue} aria-label="Ralentir">−</button>
          <span style={{ minWidth: 62, textAlign: 'center', fontSize: 14 }}>♩ = {p.tempo}</span>
          <button style={pastille(false, { padding: 0, width: 44 })} onClick={() => p.onTempo(Math.min(160, p.tempo + 2))} disabled={joue} aria-label="Accélérer">+</button>
        </div>
        <div role="group" aria-label="Mode d’affichage" style={{ display: 'flex', gap: 4 }}>
          <button style={pastille(p.mode === 'live')} onClick={() => p.onMode('live')} aria-pressed={p.mode === 'live'}>Live</button>
          <button style={pastille(p.mode === 'fin')} onClick={() => p.onMode('fin')} aria-pressed={p.mode === 'fin'}>Fin</button>
        </div>
        <button style={pastille(p.boucle, { display: 'flex', alignItems: 'center', gap: 6 })} onClick={() => p.onBoucle(!p.boucle)} aria-pressed={p.boucle} disabled={joue}><IconeBoucle />Boucle</button>
        <button style={pastille(p.decompte)} onClick={() => p.onDecompte(!p.decompte)} aria-pressed={p.decompte} disabled={joue}>Décompte</button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
          Volume
          <input type="range" min={0.1} max={1} step={0.05} value={p.volume} onChange={e => p.onVolume(parseFloat(e.target.value))} style={{ width: 90, minHeight: 44, accentColor: ORANGE }} aria-label="Volume de l’accompagnement" />
        </label>
      </div>
    </div>
  )
}
