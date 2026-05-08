import { useState, useRef, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  ALL_ROOTS, CHORD_TYPES, buildChordMidis,
  buildEnharmonicScale, noteNameToPC,
  midiToHz, JUST_RATIOS_CENTS,
} from './accordeurUtils'

function computeHarmonicOffsets(chordType, chordMidis, rootName) {
  const rootPC = noteNameToPC(rootName)
  return chordMidis.map(midi => {
    const interval = ((midi - rootPC) % 12 + 12) % 12
    const justCents = (chordType === 'dom7' && interval === 10) ? 968.825 : JUST_RATIOS_CENTS[interval]
    return parseFloat((justCents - interval * 100).toFixed(2))
  })
}

// ─── Knob circulaire ±50¢ ────────────────────────────────────────────────────────
function Knob({ value, onChange, note, octave }) {
  const CX = 36, CY = 36, R = 26, SW = 6
  const COLOR = '#FF8B3D'

  // SVG angle mapping: -50¢ → SVG 135°, 0¢ → SVG 270° (top), +50¢ → SVG 45°
  const valToSVGAngle = v => (270 + (v / 50) * 135 + 360) % 360
  const svgPt = (deg, r) => ({
    x: CX + r * Math.cos(deg * Math.PI / 180),
    y: CY + r * Math.sin(deg * Math.PI / 180),
  })

  const trackStart = svgPt(135, R)  // -50¢
  const trackEnd   = svgPt(45, R)   // +50¢
  const curSVGAngle = valToSVGAngle(value)
  const curPt = svgPt(curSVGAngle, R)
  const valueSpan = (curSVGAngle - 135 + 360) % 360
  const largeArc  = valueSpan > 180 ? 1 : 0
  const indPt = svgPt(curSVGAngle, R - 5)

  const f = n => n.toFixed(2)
  const trackPath = `M ${f(trackStart.x)} ${f(trackStart.y)} A ${R} ${R} 0 1 1 ${f(trackEnd.x)} ${f(trackEnd.y)}`
  const valuePath = valueSpan > 0.5
    ? `M ${f(trackStart.x)} ${f(trackStart.y)} A ${R} ${R} 0 ${largeArc} 1 ${f(curPt.x)} ${f(curPt.y)}`
    : null

  const dragging  = useRef(false)
  const lastY     = useRef(0)
  const dragValue = useRef(value)
  useEffect(() => { dragValue.current = value }, [value])

  const onPD = (e) => {
    e.preventDefault()
    dragging.current = true
    lastY.current = e.clientY
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPM = (e) => {
    if (!dragging.current) return
    const dy = lastY.current - e.clientY
    lastY.current = e.clientY
    const nv = Math.round(Math.max(-50, Math.min(50, dragValue.current + dy * 0.5)) * 10) / 10
    dragValue.current = nv
    onChange(nv)
  }
  const onPU = () => { dragging.current = false }

  const centsColor = Math.abs(value) < 0.5 ? 'var(--text-muted)' : COLOR

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="text-sm font-bold text-app leading-tight">
        {note}<span className="text-[11px] font-normal text-app-muted ml-0.5">{octave}</span>
      </div>
      <svg
        width={CX * 2} height={CY * 2}
        style={{ cursor: 'ns-resize', touchAction: 'none', userSelect: 'none' }}
        onPointerDown={onPD} onPointerMove={onPM} onPointerUp={onPU}
      >
        <path d={trackPath} fill="none" stroke="var(--border-c)" strokeWidth={SW} strokeLinecap="round" />
        {valuePath && <path d={valuePath} fill="none" stroke={COLOR} strokeWidth={SW} strokeLinecap="round" />}
        <line x1={CX} y1={CY} x2={f(indPt.x)} y2={f(indPt.y)} stroke={COLOR} strokeWidth="2" strokeLinecap="round" />
        <circle cx={CX} cy={CY} r="4" fill={COLOR} />
      </svg>
      <div className="text-[11px] font-bold tabular-nums" style={{ color: centsColor }}>
        {value >= 0 ? '+' : ''}{value.toFixed(1)}¢
      </div>
    </div>
  )
}

// ─── Page principale ─────────────────────────────────────────────────────────────
export default function GenerateurAccordPage() {
  const [diapason]   = useState(() => { const v = parseFloat(localStorage.getItem('acc_diapason')); return isNaN(v) ? 442 : v })
  const [root,       setRoot]       = useState('Do')
  const [chordType,  setChordType]  = useState('maj')
  const [inversion,  setInversion]  = useState(0)
  const [baseOctave, setBaseOctave] = useState(4)
  const [mode,       setMode]       = useState('tempere') // 'tempere' | 'harmonique'
  const [noteOffsets, setNoteOffsets] = useState([0, 0, 0])
  const [playing,    setPlaying]    = useState(false)

  const audioCtxRef = useRef(null)
  const oscsRef     = useRef([])

  const chordMidis   = buildChordMidis(root, chordType, inversion, baseOctave)
  const maxInversion = CHORD_TYPES[chordType].intervals.length - 1
  const n = chordMidis.length
  const offsets = noteOffsets.length === n ? noteOffsets : Array(n).fill(0)

  const enharmoScale = buildEnharmonicScale(root)
  const noteNames = chordMidis.map(midi => ({
    nom: enharmoScale[((midi % 12) + 12) % 12] ?? '?',
    octave: Math.floor(midi / 12) - 1,
  }))

  // Sync offsets when chord or mode changes
  useEffect(() => {
    if (mode === 'harmonique') {
      setNoteOffsets(computeHarmonicOffsets(chordType, chordMidis, root))
    } else {
      setNoteOffsets(Array(buildChordMidis(root, chordType, inversion, baseOctave).length).fill(0))
    }
  }, [root, chordType, inversion, baseOctave, mode]) // eslint-disable-line

  const stopOscs = useCallback(() => {
    if (!audioCtxRef.current) return
    const t = audioCtxRef.current.currentTime
    oscsRef.current.forEach(({ osc, gain }) => {
      try { gain.gain.setTargetAtTime(0, t, 0.05) } catch {}
      try { osc.stop(t + 0.15) } catch {}
    })
    oscsRef.current = []
  }, [])

  const startOscs = useCallback((midis, offs) => {
    stopOscs()
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
    }
    const ctx = audioCtxRef.current
    if (ctx.state === 'suspended') ctx.resume()
    oscsRef.current = midis.map((midi, i) => {
      const hz = midiToHz(midi, diapason) * Math.pow(2, (offs[i] ?? 0) / 1200)
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0, ctx.currentTime)
      gain.gain.setTargetAtTime(0.25, ctx.currentTime, 0.02)
      gain.connect(ctx.destination)
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = hz
      osc.connect(gain)
      osc.start()
      return { osc, gain, midi, idx: i }
    })
  }, [stopOscs, diapason])

  // Restart when chord shape changes while playing
  const prevMidisRef = useRef([])
  useEffect(() => {
    if (!playing) return
    if (JSON.stringify(chordMidis) !== JSON.stringify(prevMidisRef.current)) {
      prevMidisRef.current = chordMidis
      startOscs(chordMidis, offsets)
    }
  }, [root, chordType, inversion, baseOctave, playing]) // eslint-disable-line

  // Update oscillator frequencies smoothly on offset change
  useEffect(() => {
    if (!playing || !audioCtxRef.current) return
    if (oscsRef.current.length !== offsets.length) return
    const t = audioCtxRef.current.currentTime
    oscsRef.current.forEach(({ osc, midi, idx }) => {
      const hz = midiToHz(midi, diapason) * Math.pow(2, (offsets[idx] ?? 0) / 1200)
      osc.frequency.setTargetAtTime(hz, t, 0.05)
    })
  }, [offsets, playing, diapason])

  useEffect(() => {
    return () => { stopOscs(); try { audioCtxRef.current?.close() } catch {} }
  }, []) // eslint-disable-line

  const togglePlay = () => {
    if (playing) { stopOscs(); setPlaying(false) }
    else { prevMidisRef.current = chordMidis; startOscs(chordMidis, offsets); setPlaying(true) }
  }

  const setOffset = (i, newVal) => {
    setNoteOffsets(prev => { const next = [...prev]; next[i] = newVal; return next })
  }

  const handleChordType = (t) => {
    setChordType(t)
    const maxInv = CHORD_TYPES[t].intervals.length - 1
    if (inversion > maxInv) setInversion(0)
  }

  const handleModeChange = (m) => setMode(m)

  const selectCls = "bg-(--input-bg) text-app border border-app rounded-lg px-2.5 py-1.5 text-sm cursor-pointer"
  const numBtnCls = "bg-(--input-bg) text-app border border-app rounded-md w-7 h-7 cursor-pointer text-sm flex items-center justify-center"

  return (
    <div className="bg-app min-h-dvh flex flex-col items-center px-4 py-5">
      <div className="w-full max-w-xl">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <Link to="/accordeur" className="bg-surface border border-app rounded-lg px-3 py-1.5 text-xs font-bold no-underline text-app">
            ← Accordeur
          </Link>
          <h2 className="text-xl font-bold m-0" style={{ color: '#FF8B3D' }}>Générateur d'accord</h2>
          <div style={{ width: 90 }} />
        </div>

        {/* Chord selectors */}
        <div className="bg-surface border border-app rounded-xl p-4 mb-3">
          <div className="flex gap-2 flex-wrap items-center mb-3">
            <select className={selectCls} value={root} onChange={e => setRoot(e.target.value)}>
              {ALL_ROOTS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <select className={selectCls} value={chordType} onChange={e => handleChordType(e.target.value)}>
              {Object.entries(CHORD_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select className={selectCls} value={inversion} onChange={e => setInversion(Number(e.target.value))}>
              {Array.from({ length: maxInversion + 1 }, (_, i) => (
                <option key={i} value={i}>{i === 0 ? 'Fund.' : `${i}${i === 1 ? 'er' : 'e'} renv.`}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-3 items-center">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-app-muted">Oct.</span>
              <button className={numBtnCls} onClick={() => setBaseOctave(o => Math.max(2, o - 1))}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 15 12 9 18 15"/></svg>
              </button>
              <span className="text-sm font-bold text-app text-center" style={{ minWidth: 14 }}>{baseOctave}</span>
              <button className={numBtnCls} onClick={() => setBaseOctave(o => Math.min(6, o + 1))}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
            </div>
            <button
              onClick={togglePlay}
              className="text-white border-none rounded-lg px-5 py-2 text-sm font-bold cursor-pointer"
              style={{ background: playing ? '#7f1d1d' : '#FF8B3D', minWidth: 80 }}
            >{playing ? 'Stop' : 'Jouer'}</button>
          </div>
        </div>

        {/* Temperament toggle */}
        <div className="bg-surface border border-app rounded-xl p-4 mb-3">
          <div className="text-xs text-app-muted font-semibold mb-2">Tempérament</div>
          <div className="flex gap-1.5">
            {[['tempere', 'Tempéré'], ['harmonique', 'Harmonique (5-limite)']].map(([k, label]) => (
              <button key={k} onClick={() => handleModeChange(k)}
                className="flex-1 py-2 rounded-lg border-none font-bold text-sm cursor-pointer"
                style={{
                  background: mode === k ? '#FF8B3D' : 'var(--surface-2)',
                  color: mode === k ? '#fff' : 'var(--text-muted)',
                }}
              >{label}</button>
            ))}
          </div>
          {mode === 'harmonique' && (
            <div className="text-[11px] text-app-muted mt-2 leading-snug">
              Ratios 5-limite. Dom7 : septième 7:4 (−31.2¢). Glisser les knobs pour affiner.
            </div>
          )}
        </div>

        {/* Knob blocks */}
        <div className="bg-surface border border-app rounded-xl p-4 mb-3">
          <div className="text-xs text-app-muted font-semibold mb-3">Intonation par note — glisser ↑↓</div>
          <div className="flex gap-3 flex-wrap justify-center">
            {noteNames.map((note, i) => (
              <div key={i} className="bg-app rounded-xl px-3 py-3 border border-app flex flex-col items-center" style={{ minWidth: 80 }}>
                <Knob value={offsets[i] ?? 0} onChange={v => setOffset(i, v)} note={note.nom} octave={note.octave} />
              </div>
            ))}
          </div>
          <div className="flex justify-center mt-3 gap-2">
            <button
              onClick={() => { setMode('tempere'); setNoteOffsets(Array(n).fill(0)) }}
              className="text-xs text-app-muted bg-app border border-app rounded-lg px-3 py-1.5 cursor-pointer"
            >Réinitialiser</button>
            <button
              onClick={() => { setMode('harmonique'); setNoteOffsets(computeHarmonicOffsets(chordType, chordMidis, root)) }}
              className="text-xs bg-app border border-app rounded-lg px-3 py-1.5 cursor-pointer font-semibold"
              style={{ color: '#FF8B3D', borderColor: 'rgba(255,139,61,0.4)' }}
            >≈ Harmonique</button>
          </div>
        </div>

      </div>
    </div>
  )
}
