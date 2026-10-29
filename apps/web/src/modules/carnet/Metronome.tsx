// Métronome du carnet : 3 modes (son / visuel / les deux), potard 30–300,
// affichage numérique éditable, −1 / +1, figure rythmique (appui ≠ subdivisions).

import { useEffect, useRef, useState } from 'react'
import TempoKnob, { TEMPO_MAX, TEMPO_MIN, bornerTempo } from './TempoKnob.tsx'
import FigureSvg from './FigureSvg.tsx'
import { FIGURES, figureParId, type FigureId } from './figures.ts'
import { MoteurMetronome, type GenreTick } from './metronomeEngine.ts'

type Mode = 'son' | 'visuel' | 'les-deux'
const MODES: { id: Mode; label: string }[] = [
  { id: 'son', label: 'Son' },
  { id: 'visuel', label: 'Visuel' },
  { id: 'les-deux', label: 'Les deux' },
]
const CLE_MODE = 'carnet-metronome-mode-v1'

function lireMode(): Mode {
  try {
    const m = localStorage.getItem(CLE_MODE)
    if (m === 'son' || m === 'visuel' || m === 'les-deux') return m
  } catch { /* ignore */ }
  return 'les-deux'
}

interface Props {
  tempo: number
  onTempo: (t: number) => void
  figure: FigureId
  onFigure: (f: FigureId) => void
}

export default function Metronome({ tempo, onTempo, figure, onFigure }: Props) {
  const [mode, setMode] = useState<Mode>(lireMode)
  const [enMarche, setEnMarche] = useState(false)
  const [saisie, setSaisie] = useState<string | null>(null)
  const moteur = useRef<MoteurMetronome | null>(null)
  const bouton = useRef<HTMLButtonElement>(null)
  const modeRef = useRef(mode)
  const repetition = useRef<{ debut?: number; boucle?: number }>({})
  const annule = useRef(false)

  if (!moteur.current) moteur.current = new MoteurMetronome()

  // Synchronise le moteur avec les props / le mode.
  useEffect(() => { moteur.current!.bpm = tempo }, [tempo])
  useEffect(() => { moteur.current!.figure = figureParId(figure) }, [figure])
  useEffect(() => {
    modeRef.current = mode
    moteur.current!.son = mode !== 'visuel'
    try { localStorage.setItem(CLE_MODE, mode) } catch { /* ignore */ }
  }, [mode])

  // Flash visuel calé sur l'horloge audio.
  useEffect(() => {
    const m = moteur.current!
    m.onTick = (genre: GenreTick) => {
      const el = bouton.current
      if (!el || modeRef.current === 'son') return
      el.style.transition = 'none'
      el.style.background = genre === 'appui' ? '#c084fc' : '#7c3aed'
      el.style.transform = genre === 'appui' ? 'scale(1.08)' : 'scale(1.03)'
      window.setTimeout(() => {
        el.style.transition = 'background 0.12s, transform 0.12s'
        el.style.background = 'var(--surface)'
        el.style.transform = ''
      }, 55)
    }
    return () => { m.onTick = undefined }
  }, [])

  useEffect(() => () => {
    moteur.current?.dispose()
    clearTimeout(repetition.current.debut)
    clearInterval(repetition.current.boucle)
  }, [])

  const basculer = () => {
    const m = moteur.current!
    if (m.enMarche) { m.stop(); setEnMarche(false) } else { m.start(); setEnMarche(true) }
  }

  // ± avec répétition à l'appui prolongé.
  const pas = (delta: number) => (e: React.PointerEvent) => {
    e.stopPropagation()
    let courant = tempo
    const appliquer = () => { courant = bornerTempo(courant + delta); onTempo(courant) }
    appliquer()
    repetition.current.debut = window.setTimeout(() => {
      repetition.current.boucle = window.setInterval(appliquer, 70)
    }, 400)
  }
  const arreterRepetition = () => {
    clearTimeout(repetition.current.debut)
    clearInterval(repetition.current.boucle)
  }

  const valider = () => {
    if (saisie === null) return
    if (annule.current) { annule.current = false; setSaisie(null); return }
    const n = parseInt(saisie, 10)
    if (Number.isFinite(n)) onTempo(bornerTempo(n))
    setSaisie(null)
  }

  const btnPas: React.CSSProperties = {
    width: 52, height: 52, minHeight: 52, borderRadius: '50%', border: '1px solid var(--border-c)',
    background: 'var(--surface-2)', color: 'var(--text)', fontSize: 26, fontWeight: 600,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, touchAction: 'none',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
      {/* Mode : toggle triple */}
      <div role="radiogroup" aria-label="Mode du métronome"
        style={{ display: 'flex', border: '1px solid var(--border-c)', borderRadius: 12, overflow: 'hidden' }}>
        {MODES.map(m => (
          <button key={m.id} role="radio" aria-checked={mode === m.id} onClick={() => setMode(m.id)}
            style={{ minHeight: 44, padding: '0 14px', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600,
              background: mode === m.id ? '#7c3aed' : 'var(--surface)', color: mode === m.id ? '#fff' : 'var(--text)' }}>
            {m.label}
          </button>
        ))}
      </div>

      {/* Lecture / pulse visuel */}
      <button ref={bouton} onClick={basculer} aria-label={enMarche ? 'Arrêter le métronome' : 'Démarrer le métronome'}
        style={{ width: 72, height: 72, minHeight: 72, borderRadius: '50%', border: '2px solid #7c3aed', padding: 0,
          background: 'var(--surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text)', boxShadow: enMarche ? '0 0 0 4px rgba(124,58,237,0.25)' : 'none' }}>
        {enMarche ? (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>
        ) : (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
        )}
      </button>

      {/* Figure + valeur du tempo */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, color: 'var(--text)' }}>
        <FigureSvg id={figure} hauteur={52} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button aria-label="Diminuer le tempo de 1" style={btnPas}
            onPointerDown={pas(-1)} onPointerUp={arreterRepetition} onPointerLeave={arreterRepetition} onPointerCancel={arreterRepetition}>
            −
          </button>
          {saisie === null ? (
            <button onClick={() => setSaisie(String(tempo))} aria-label={`Tempo ${tempo}. Modifier au clavier`}
              style={{ minWidth: 96, minHeight: 52, border: '1px dashed var(--border-c)', borderRadius: 12, background: 'transparent',
                color: 'var(--text)', fontSize: 40, fontWeight: 700, cursor: 'text', fontVariantNumeric: 'tabular-nums',
                fontFamily: "'Righteous', 'Inter', sans-serif" }}>
              {tempo}
            </button>
          ) : (
            <input autoFocus inputMode="numeric" value={saisie} aria-label="Tempo exact"
              onChange={e => setSaisie(e.target.value.replace(/\D/g, '').slice(0, 3))}
              onFocus={e => e.target.select()}
              onBlur={valider}
              onKeyDown={e => { if (e.key === 'Enter') valider(); if (e.key === 'Escape') { annule.current = true; e.currentTarget.blur() } }}
              style={{ width: 96, height: 52, boxSizing: 'border-box', textAlign: 'center', fontSize: 40, fontWeight: 700,
                border: '2px solid #c084fc', borderRadius: 12, background: 'var(--input-bg)', color: 'var(--text)',
                fontFamily: "'Righteous', 'Inter', sans-serif" }} />
          )}
          <button aria-label="Augmenter le tempo de 1" style={btnPas}
            onPointerDown={pas(1)} onPointerUp={arreterRepetition} onPointerLeave={arreterRepetition} onPointerCancel={arreterRepetition}>
            +
          </button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          BPM · {TEMPO_MIN}–{TEMPO_MAX}
        </div>
      </div>

      <TempoKnob value={tempo} onChange={onTempo} />

      {/* Choix de la figure */}
      <div role="radiogroup" aria-label="Figure rythmique"
        style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 6 }}>
        {FIGURES.map(f => (
          <button key={f.id} role="radio" aria-checked={figure === f.id} aria-label={f.label} title={f.label}
            onClick={() => onFigure(f.id)}
            style={{ minWidth: 56, minHeight: 52, padding: '0 6px', borderRadius: 10, cursor: 'pointer',
              border: `2px solid ${figure === f.id ? '#c084fc' : 'var(--border-c)'}`,
              background: figure === f.id ? 'rgba(124,58,237,0.18)' : 'var(--surface)', color: 'var(--text)',
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FigureSvg id={f.id} hauteur={34} />
          </button>
        ))}
      </div>
    </div>
  )
}
