// ─── Bilan après arrêt (brief UI v1, § 9) ─────────────────────────────────────────────
import type { NoteAnnotee } from './annotation.ts'
import { bilanDe } from './bilan.ts'
import { couleurEcart } from './couleurs.ts'
import EchelleMode from './EchelleMode.tsx'
import type { TonaliteEcrite } from './notation.ts'
import type { Mode } from '../harmonie/types.ts'
import { ORANGE, carte, pastille } from './stylesAcc.ts'

interface Props {
  notes: NoteAnnotee[]
  seuil: number
  ecrite: TonaliteEcrite
  mode: Mode
  sonsAccord: number[]
  nomTonalite: string
  onRejouer: () => void
  onEffacer: () => void
}

export default function Bilan({ notes, seuil, ecrite, mode, sonsAccord, nomTonalite, onRejouer, onEffacer }: Props) {
  const b = bilanDe(notes, seuil)
  if (!b.n) {
    return (
      <section style={carte} aria-label="Bilan">
        <p style={{ margin: 0, fontSize: 14 }}>Aucune note retenue. Joue un peu plus fort ou rapproche l’appareil de l’instrument, puis rejoue.</p>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button style={pastille(true)} onClick={onRejouer}>▶ Rejouer</button>
          <button style={pastille(false)} onClick={onEffacer}>Effacer</button>
        </div>
      </section>
    )
  }
  const bilanDegres = b.degres.map(d => ({ degre: d.degre, n: d.n, couleur: couleurEcart(d.moyenne, seuil) }))
  return (
    <section style={carte} aria-label="Bilan">
      <h2 style={{ fontSize: 16, margin: '0 0 6px' }}>Bilan</h2>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 14, marginBottom: 8 }}>
        <div><div style={{ fontSize: 24, fontWeight: 700 }}>{b.pedagogique.label}</div><div style={{ color: 'var(--text-muted)', fontSize: 12 }}>notes justes (≤ {seuil} ¢)</div></div>
        <div><div style={{ fontSize: 24, fontWeight: 700 }}>{b.qualite} %</div><div style={{ color: 'var(--text-muted)', fontSize: 12 }}>qualité (écart et stabilité)</div></div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead><tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}><th style={{ padding: '4px 0' }}>Son</th><th>Écart moyen</th><th>σ intra</th><th>Notes</th></tr></thead>
        <tbody>
          {b.lignes.map(l => (
            <tr key={l.poste} style={{ borderTop: '1px solid var(--border-c)' }}>
              <td style={{ padding: '6px 0' }}>{l.libelle}</td>
              <td><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 5, background: couleurEcart(l.moyenne, seuil), marginRight: 6 }} />{l.moyenne > 0.5 ? '+' : l.moyenne < -0.5 ? '−' : '±'}{Math.abs(l.moyenne).toFixed(1).replace('.', ',')} ¢</td>
              <td>{l.sigmaIntra.toFixed(1).replace('.', ',')} ¢</td>
              <td>{l.n}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul style={{ margin: '8px 0', paddingLeft: 18, fontSize: 13 }}>{b.lignes.map(l => <li key={l.poste}>{l.phrase}</li>)}</ul>
      <EchelleMode ecrite={ecrite} mode={mode} sonsAccord={sonsAccord} bilan={bilanDegres} nomTonalite={nomTonalite} />
      {b.chromatiques.n > 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>{b.chromatiques.n} note(s) chromatique(s) hors échelle.</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button style={pastille(true, { background: ORANGE, color: '#0D1026', border: 'none' })} onClick={onRejouer}>▶ Rejouer</button>
        <button style={pastille(false)} onClick={onEffacer}>Effacer</button>
      </div>
    </section>
  )
}
