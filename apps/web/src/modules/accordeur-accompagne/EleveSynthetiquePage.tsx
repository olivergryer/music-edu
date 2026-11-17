// ─── /accordeur/test-accompagne/eleve-synthetique (spec §7.3) ─────────────────
// À ouvrir sur un second appareil posé à l'emplacement de l'instrument (~1 m).
// Joue : chirp d'alignement, 2 s de silence, puis les notes. Exporte verite.json.

import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { NOTES_A } from './dsp/banc.ts'
import { spectreFamille, type FamilleSpectre } from './dsp/eleveSynthetique.ts'
import { construireSequenceEleve } from './dsp/sequenceEleve.ts'
import type { Accordage } from './dsp/types.ts'

const FAMILLES: [FamilleSpectre, string][] = [
  ['corde', 'Corde frottée'], ['ancheSimple', 'Anche simple (clarinette)'], ['flute', 'Flûte'],
  ['ancheDouble', 'Anche double'], ['cuivre', 'Cuivre'], ['voix', 'Voix'],
]
const ECARTS = [-20, -10, -5, -2, 0, 2, 5, 10, 14, 20]
const carte: React.CSSProperties = { background: 'var(--bg-surface, #0a0f1a)', border: '1px solid var(--border, #1f2937)', borderRadius: 16, padding: 14, marginBottom: 12 }
const champ: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, color: 'var(--text-muted, #6b7280)', flex: '1 1 130px' }
const entree: React.CSSProperties = { minHeight: 44, borderRadius: 10, border: '1px solid var(--border, #1f2937)', background: 'var(--bg, #030712)', color: 'var(--text, #f9fafb)', padding: '0 8px', fontSize: 14 }
const bouton = (couleur = '#7c3aed'): React.CSSProperties => ({ minHeight: 44, padding: '0 16px', borderRadius: 12, border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer', background: couleur, color: '#fff' })

export default function EleveSynthetiquePage() {
  const [famille, setFamille] = useState<FamilleSpectre>('corde')
  const [accordage, setAccordage] = useState<Accordage>('juste')
  const [notes, setNotes] = useState<string[]>(['Mi4', 'Do4', 'Mi5', 'Sol4', 'Ré5'])
  const [ecarts, setEcarts] = useState<number[]>([-10, -2, 0, 5, 14])
  const [dureeNote, setDureeNote] = useState(2.5)
  const [vibrato, setVibrato] = useState(false)
  const [niveau, setNiveau] = useState(0.5)
  const [etat, setEtat] = useState<'repos' | 'joue'>('repos')
  const [rmsMesure, setRmsMesure] = useState('')
  const dernier = useRef<ReturnType<typeof construireSequenceEleve> | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const srcRef = useRef<AudioBufferSourceNode | null>(null)

  const bascule = <T,>(l: T[], v: T) => (l.includes(v) ? l.filter(x => x !== v) : [...l, v])
  const apercu = useMemo(() => spectreFamille(famille, 10).map(a => a.toFixed(2)).join(' · '), [famille])

  const jouer = async () => {
    const ctx = ctxRef.current ?? new AudioContext()
    ctxRef.current = ctx
    await ctx.resume()
    const seq = construireSequenceEleve({ fs: ctx.sampleRate, accordage, notes, ecarts, famille, dureeNote, vibrato, niveau })
    dernier.current = seq
    const buf = ctx.createBuffer(1, seq.signal.length, ctx.sampleRate)
    buf.copyToChannel(seq.signal as Float32Array<ArrayBuffer>, 0)
    // niveau crête réel de la séquence (à noter à côté du niveau mesuré au micro)
    let crete = 0; for (let i = 0; i < seq.signal.length; i++) crete = Math.max(crete, Math.abs(seq.signal[i]))
    setRmsMesure(`crête ${(20 * Math.log10(crete)).toFixed(1)} dBFS`)
    const src = ctx.createBufferSource()
    src.buffer = buf; src.connect(ctx.destination)
    src.onended = () => setEtat('repos')
    srcRef.current = src
    setEtat('joue'); src.start()
  }
  const arreter = () => { srcRef.current?.stop(); setEtat('repos') }
  const exporter = () => {
    if (!dernier.current) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ ...dernier.current.verite, famille, vibrato, niveauMicro: rmsMesure }, null, 2)], { type: 'application/json' }))
    a.download = `verite-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.json`
    document.body.appendChild(a); a.click(); a.remove()
  }

  return (
    <div style={{ maxWidth: 540, margin: '0 auto', padding: '16px 16px 80px', color: 'var(--text, #f9fafb)', fontFamily: "'Poppins','Inter',sans-serif" }}>
      <Link to="/accordeur/test-accompagne" style={{ fontSize: 12, fontWeight: 700, color: 'inherit', textDecoration: 'none' }}>← Test accompagné</Link>
      <h1 style={{ fontFamily: "'Righteous','Inter',sans-serif", fontSize: 22, margin: '12px 0 4px' }}>Élève synthétique</h1>
      <p style={{ fontSize: 12, color: 'var(--text-muted, #6b7280)', margin: '0 0 12px' }}>
        À ouvrir sur un second appareil posé à l’emplacement de l’instrument (environ 1 m). Séquence : chirp d’alignement, 2 s de silence, puis les notes. Volume au maximum sans saturation.
      </p>
      <section style={carte}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <label style={champ}>Famille de spectre<select style={entree} value={famille} onChange={e => setFamille(e.target.value as FamilleSpectre)}>{FAMILLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label style={champ}>Accordage de référence<select style={entree} value={accordage} onChange={e => setAccordage(e.target.value as Accordage)}><option value="juste">Juste</option><option value="tempere">Tempéré</option></select></label>
          <label style={champ}>Durée des notes<select style={entree} value={dureeNote} onChange={e => setDureeNote(+e.target.value)}><option value={2.5}>2,5 s</option><option value={0.5}>500 ms</option><option value={0.25}>250 ms</option><option value={0.125}>125 ms</option></select></label>
          <label style={champ}>Niveau du signal (0–1)<input style={entree} type="number" step={0.05} min={0.05} max={0.95} value={niveau} onChange={e => setNiveau(+e.target.value)} /></label>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted, #6b7280)', margin: '8px 0' }}>Partiels 1 à 10 : {apercu}</p>
        <div style={{ fontSize: 12, marginBottom: 4 }}>Notes</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
          {NOTES_A.map(n => <label key={n.nom} style={{ display: 'flex', gap: 6, alignItems: 'center', minHeight: 44 }}><input type="checkbox" style={{ width: 20, height: 20 }} checked={notes.includes(n.nom)} onChange={() => setNotes(bascule(notes, n.nom))} />{n.nom}</label>)}
        </div>
        <div style={{ fontSize: 12, marginBottom: 4 }}>Écarts (¢) par rapport à la voix liée (ou au tempéré)</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {ECARTS.map(e => <label key={e} style={{ display: 'flex', gap: 6, alignItems: 'center', minHeight: 44 }}><input type="checkbox" style={{ width: 20, height: 20 }} checked={ecarts.includes(e)} onChange={() => setEcarts(bascule(ecarts, e).sort((a, b) => a - b))} />{e > 0 ? `+${e}` : e}</label>)}
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', minHeight: 44, marginTop: 8 }}><input type="checkbox" style={{ width: 20, height: 20 }} checked={vibrato} onChange={e => setVibrato(e.target.checked)} />Vibrato (5,5 Hz, ±15 ¢)</label>
      </section>
      <section style={{ ...carte, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button style={bouton()} onClick={() => void jouer()} disabled={etat === 'joue' || !notes.length || !ecarts.length}>Jouer la séquence</button>
        <button style={bouton('#dc2626')} onClick={arreter} disabled={etat !== 'joue'}>Arrêter</button>
        <button style={bouton('#0ea5e9')} onClick={exporter} disabled={!dernier.current}>Exporter verite.json</button>
        <span style={{ fontSize: 12 }}>{etat === 'joue' ? 'Lecture en cours…' : rmsMesure}</span>
      </section>
      <p style={{ fontSize: 11, color: 'var(--text-muted, #6b7280)' }}>
        Lancez d’abord l’enregistrement sur l’appareil de test, puis la séquence ici : le chirp doit être audible au micro de l’appareil de test. Après l’arrêt, joignez ce verite.json à l’export.
      </p>
    </div>
  )
}
