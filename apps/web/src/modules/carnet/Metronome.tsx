// Métronome du carnet.
//
// Un seul moteur audio, deux présentations :
//  • compact (téléphone) : mini-barre fixée en bas — −, tempo, +, lecture,
//    « Noter » — dont un appui sur le tempo ouvre un panneau avec la couronne ;
//  • complet (tablette / ordinateur) : le panneau directement, dans la page.
// Mode (son / visuel / les deux) et figure sont repliés dans « Réglages ».

import { useEffect, useRef, useState } from 'react'
import CouronneTempo, { bornerTempo } from './CouronneTempo.tsx'
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

export interface ActionNoter {
  /** Libellé accessible : « Noter 92 · Diatonique lié ». */
  label: string
  onClick: () => void
}

interface Props {
  tempo: number
  onTempo: (t: number) => void
  figure: FigureId
  onFigure: (f: FigureId) => void
  compact: boolean
  noter: ActionNoter | null
}

// ─── Bouton −/+ avec répétition à l'appui prolongé ───────────────────────────

function BoutonPas({ delta, tempo, onTempo, taille = 52 }: { delta: 1 | -1; tempo: number; onTempo: (t: number) => void; taille?: number }) {
  const minuteur = useRef<{ debut?: number; boucle?: number }>({})
  const arreter = () => {
    window.clearTimeout(minuteur.current.debut)
    window.clearInterval(minuteur.current.boucle)
  }
  useEffect(() => arreter, [])
  const onDown = (e: React.PointerEvent) => {
    e.stopPropagation()
    let courant = tempo
    const appliquer = () => { courant = bornerTempo(courant + delta); onTempo(courant) }
    appliquer()
    minuteur.current.debut = window.setTimeout(() => {
      minuteur.current.boucle = window.setInterval(appliquer, 70)
    }, 400)
  }
  return (
    <button aria-label={delta > 0 ? 'Augmenter le tempo de 1' : 'Diminuer le tempo de 1'}
      onPointerDown={onDown} onPointerUp={arreter} onPointerLeave={arreter} onPointerCancel={arreter}
      style={{ width: taille, height: taille, minHeight: taille, borderRadius: '50%', border: '1px solid var(--border-c)', padding: 0,
        background: 'var(--surface-2)', color: 'var(--text)', fontSize: 26, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'none' }}>
      {delta > 0 ? '+' : '−'}
    </button>
  )
}

function BoutonLecture({ enMarche, onClick, taille }: { enMarche: boolean; onClick: () => void; taille: number }) {
  return (
    <button data-flash onClick={onClick} aria-label={enMarche ? 'Arrêter le métronome' : 'Démarrer le métronome'}
      style={{ width: taille, height: taille, minHeight: taille, borderRadius: '50%', padding: 0, flexShrink: 0, cursor: 'pointer',
        border: `2px solid ${enMarche ? '#c084fc' : '#7c3aed'}`, background: enMarche ? '#7c3aed' : 'var(--surface)',
        color: enMarche ? '#fff' : 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {enMarche ? (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>
      ) : (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
      )}
    </button>
  )
}

// ─── Composant principal ─────────────────────────────────────────────────────

export default function Metronome({ tempo, onTempo, figure, onFigure, compact, noter }: Props) {
  const [mode, setMode] = useState<Mode>(lireMode)
  const [enMarche, setEnMarche] = useState(false)
  const [ouvert, setOuvert] = useState(false)          // panneau (téléphone)
  const [reglages, setReglages] = useState(false)
  const moteur = useRef<MoteurMetronome | null>(null)
  const racine = useRef<HTMLDivElement>(null)
  const modeRef = useRef(mode)

  if (!moteur.current) moteur.current = new MoteurMetronome()

  useEffect(() => { moteur.current!.bpm = tempo }, [tempo])
  useEffect(() => { moteur.current!.figure = figureParId(figure) }, [figure])
  useEffect(() => {
    modeRef.current = mode
    moteur.current!.son = mode !== 'visuel'
    try { localStorage.setItem(CLE_MODE, mode) } catch { /* ignore */ }
  }, [mode])

  // Flash visuel calé sur l'horloge audio : tout élément portant `data-flash`.
  useEffect(() => {
    const m = moteur.current!
    m.onTick = (genre: GenreTick) => {
      if (modeRef.current === 'son') return
      racine.current?.querySelectorAll<HTMLElement>('[data-flash]').forEach(el => {
        el.style.transition = 'none'
        el.style.boxShadow = genre === 'appui' ? '0 0 0 6px rgba(192,132,252,0.85)' : '0 0 0 4px rgba(124,58,237,0.5)'
        window.setTimeout(() => {
          el.style.transition = 'box-shadow 0.12s'
          el.style.boxShadow = ''
        }, 60)
      })
    }
    return () => { m.onTick = undefined }
  }, [])

  useEffect(() => () => moteur.current?.dispose(), [])

  const basculer = () => {
    const m = moteur.current!
    if (m.enMarche) { m.stop(); setEnMarche(false) } else { m.start(); setEnMarche(true) }
  }

  const libelleMode = MODES.find(m => m.id === mode)!.label

  const boutonNoter = noter && (
    <button onPointerDown={e => e.stopPropagation()} onClick={noter.onClick} aria-label={noter.label}
      style={{ minHeight: 48, padding: '0 16px', borderRadius: 14, border: 'none', background: '#7c3aed', color: '#fff',
        fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
      Noter
    </button>
  )

  const blocReglages = (
    <div style={{ width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <button onClick={() => setReglages(o => !o)} aria-expanded={reglages}
        aria-label={`Réglages du métronome : ${libelleMode}, ${figureParId(figure).label}`}
        style={{ minHeight: 56, padding: '4px 14px', borderRadius: 14, cursor: 'pointer', color: 'var(--text)', width: '100%',
          border: '2px solid var(--border-c)', background: 'var(--surface-2)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: 12, fontSize: 14, fontWeight: 600 }}>
        <FigureSvg id={figure} hauteur={44} />
        <span>{libelleMode}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: reglages ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {reglages && (
        <>
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
        </>
      )}
    </div>
  )

  const corps = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <BoutonPas delta={-1} tempo={tempo} onTempo={onTempo} />
        <CouronneTempo value={tempo} onChange={onTempo} />
        <BoutonPas delta={1} tempo={tempo} onTempo={onTempo} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <BoutonLecture enMarche={enMarche} onClick={basculer} taille={64} />
        {boutonNoter}
      </div>
      {blocReglages}
    </div>
  )

  if (!compact) return <div ref={racine}>{corps}</div>

  return (
    <div ref={racine}>
      {ouvert && (
        <div onClick={() => setOuvert(false)} aria-hidden
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 40 }} />
      )}
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 41, margin: '0 auto', maxWidth: 560,
        background: 'var(--surface)', borderTop: '1px solid var(--border-c)', borderRadius: '20px 20px 0 0',
        boxShadow: '0 -4px 16px rgba(0,0,0,0.25)', padding: '4px 12px calc(10px + env(safe-area-inset-bottom))',
        maxHeight: '92dvh', overflowY: 'auto' }}>
        <button onClick={() => setOuvert(o => !o)} aria-expanded={ouvert}
          aria-label={ouvert ? 'Réduire le métronome' : 'Ouvrir le métronome'}
          style={{ display: 'block', width: '100%', height: 26, minHeight: 26, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}>
          <svg width="28" height="14" viewBox="0 0 28 14" fill="none" stroke="var(--text-muted)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: ouvert ? 'none' : 'rotate(180deg)' }}>
            <path d="M4 3l10 8 10-8" />
          </svg>
        </button>
        {ouvert ? corps : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
            <BoutonPas delta={-1} tempo={tempo} onTempo={onTempo} taille={48} />
            <button onClick={() => setOuvert(true)} aria-label={`Tempo ${tempo}. Ouvrir le métronome`}
              style={{ flex: 1, minWidth: 64, minHeight: 48, border: 'none', background: 'transparent', color: 'var(--text)', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
              <span style={{ fontSize: 28, lineHeight: 1, fontWeight: 700, fontVariantNumeric: 'tabular-nums', fontFamily: "'Righteous', 'Inter', sans-serif" }}>{tempo}</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>BPM</span>
            </button>
            <BoutonPas delta={1} tempo={tempo} onTempo={onTempo} taille={48} />
            <BoutonLecture enMarche={enMarche} onClick={basculer} taille={52} />
            {boutonNoter}
          </div>
        )}
      </div>
    </div>
  )
}
