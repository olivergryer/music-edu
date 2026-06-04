import { useState, useRef, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { PitchDetector } from 'pitchy'
import {
  ALL_ROOTS, CHORD_TYPES, buildChordMidis,
  buildEnharmonicScale, noteNameToPC,
  midiToHz, JUST_RATIOS_CENTS, HARMONIQUE_OFFSETS,
  centsTempere, hzToMidi, frameRMS, preEmphasis, HZ_MIN, HZ_MAX,
} from './accordeurUtils'
import { INSTRUMENTS, isOscillatorInstrument, loadInstrumentSamples, playChord, playChordOscillator } from './windEngine'
import TestPhaseWatermark from './TestPhaseWatermark'

function computeUserOffsets(chordMidis, rootName, userTemperament) {
  const rootPC = noteNameToPC(rootName)
  return chordMidis.map(midi => {
    const interval = ((midi - rootPC) % 12 + 12) % 12
    if (interval === 0) return 0
    return parseFloat((userTemperament[interval - 1] ?? 0).toFixed(2))
  })
}

function computeHarmonicOffsets(chordType, chordMidis, rootName) {
  const rootPC = noteNameToPC(rootName)
  return chordMidis.map(midi => {
    const interval = ((midi - rootPC) % 12 + 12) % 12
    const justCents = (chordType === 'dom7' && interval === 10) ? 968.825 : JUST_RATIOS_CENTS[interval]
    return parseFloat((justCents - interval * 100).toFixed(2))
  })
}

function intonationColor(cents) {
  if (cents === null || cents === undefined) return null
  if (Math.abs(cents) <= 3)  return '#34d399'
  if (Math.abs(cents) <= 10) return '#fbbf24'
  return '#f87171'
}

// ─── Knob circulaire ±50¢ ────────────────────────────────────────────────────────
function Knob({ value, onChange }) {
  const CX = 36, CY = 36, R = 26, SW = 6
  const COLOR = '#FF8B3D'

  const valToSVGAngle = v => (270 + (v / 50) * 135 + 360) % 360
  const svgPt = (deg, r) => ({
    x: CX + r * Math.cos(deg * Math.PI / 180),
    y: CY + r * Math.sin(deg * Math.PI / 180),
  })

  const trackStart  = svgPt(135, R)
  const trackEnd    = svgPt(45, R)
  const curSVGAngle = valToSVGAngle(value)
  const curPt       = svgPt(curSVGAngle, R)
  const valueSpan   = (curSVGAngle - 135 + 360) % 360
  const largeArc    = valueSpan > 180 ? 1 : 0
  const indPt       = svgPt(curSVGAngle, R - 5)

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
      <svg
        width={CX * 2} height={CY * 2}
        style={{ cursor: 'ns-resize', touchAction: 'none', userSelect: 'none' }}
        onClick={e => e.stopPropagation()}
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
  const [diapason] = useState(() => { const v = parseFloat(localStorage.getItem('acc_diapason')); return isNaN(v) ? 442 : v })
  const [root,       setRoot]       = useState('Do')
  const [chordType,  setChordType]  = useState('maj')
  const [inversion,  setInversion]  = useState(0)
  const [baseOctave, setBaseOctave] = useState(4)
  const [mode,       setMode]       = useState('tempere')
  const [playing,    setPlaying]    = useState(false)
  const [removedIdx, setRemovedIdx] = useState(null)
  const [liveCents,  setLiveCents]  = useState(null)
  const [liveError,  setLiveError]  = useState(false)

  // Three independent offset memories
  const [tempereOffsets,    setTempereOffsets]    = useState([0, 0, 0])
  const [harmoniqueOffsets, setHarmoniqueOffsets] = useState([0, 0, 0])
  const [utilisateurOffsets, setUtilisateurOffsets] = useState([0, 0, 0])

  const globalUserTemperament = (() => {
    try { const v = JSON.parse(localStorage.getItem('acc_temperament_user')); return Array.isArray(v) && v.length === 12 ? v : Array(12).fill(0) } catch { return Array(12).fill(0) }
  })()

  const [instrument,    setInstrument]    = useState(() => localStorage.getItem('accordeur_instrument_preference') || 'flute')
  const [sampleMap,     setSampleMap]     = useState(null)
  const [sampleLoadPct, setSampleLoadPct] = useState(0)
  const [sampleLoading, setSampleLoading] = useState(false)

  const [showDetectionHint, setShowDetectionHint] = useState(false)
  const noDetectCountRef = useRef(0)

  const audioCtxRef   = useRef(null)
  const sampleSrcsRef = useRef([])   // [{src, midi}] depuis playChord
  const oscSrcsRef    = useRef([])   // [{osc, gain, midi}] depuis playChordOscillator
  const liveStreamRef    = useRef(null)
  const liveAudioCtxRef  = useRef(null)
  const liveAnalyserRef  = useRef(null)
  const liveRafRef       = useRef(null)
  const liveDetectorRef  = useRef(null)
  const removedMidiRef   = useRef(null)
  const removedOffsetRef = useRef(0)

  const chordMidis   = buildChordMidis(root, chordType, inversion, baseOctave)
  const maxInversion = CHORD_TYPES[chordType].intervals.length - 1
  const n            = chordMidis.length

  // Current offsets depending on mode
  const rawTempere     = tempereOffsets.length    === n ? tempereOffsets    : Array(n).fill(0)
  const rawHarmonique  = harmoniqueOffsets.length === n ? harmoniqueOffsets : Array(n).fill(0)
  const rawUtilisateur = utilisateurOffsets.length === n ? utilisateurOffsets : Array(n).fill(0)
  const offsets    = mode === 'tempere' ? rawTempere : mode === 'harmonique' ? rawHarmonique : rawUtilisateur
  const setOffsets = mode === 'tempere' ? setTempereOffsets : mode === 'harmonique' ? setHarmoniqueOffsets : setUtilisateurOffsets

  const enharmoScale = buildEnharmonicScale(root)
  const noteNames = chordMidis.map(midi => ({
    nom:    enharmoScale[((midi % 12) + 12) % 12] ?? '?',
    octave: Math.floor(midi / 12) - 1,
  }))

  // When chord structure changes: reset both memories
  useEffect(() => {
    const midis = buildChordMidis(root, chordType, inversion, baseOctave)
    setTempereOffsets(Array(midis.length).fill(0))
    setHarmoniqueOffsets(computeHarmonicOffsets(chordType, midis, root))
    setUtilisateurOffsets(computeUserOffsets(midis, root, globalUserTemperament))
    setRemovedIdx(null)
  }, [root, chordType, inversion, baseOctave]) // eslint-disable-line

  // Charger les samples à chaque changement d'instrument
  useEffect(() => {
    localStorage.setItem('accordeur_instrument_preference', instrument)
    setSampleMap(null)
    setSampleLoadPct(0)
    setSampleLoading(true)
    loadInstrumentSamples(instrument, p => setSampleLoadPct(p))
      .then(map => { setSampleMap(map); setSampleLoading(false) })
      .catch(() => setSampleLoading(false))
  }, [instrument])

  // Keep removed note refs fresh for the live loop (no stale closure)
  useEffect(() => {
    if (removedIdx !== null) {
      removedMidiRef.current   = chordMidis[removedIdx]
      removedOffsetRef.current = offsets[removedIdx] ?? 0
    }
  }) // runs every render — intentional

  // ─── Live pitch detection ───────────────────────────────────────────────────────
  useEffect(() => {
    if (removedIdx === null) {
      cancelAnimationFrame(liveRafRef.current)
      liveStreamRef.current?.getTracks().forEach(t => t.stop())
      try { liveAudioCtxRef.current?.close() } catch {}
      liveAudioCtxRef.current = null
      liveStreamRef.current   = null
      noDetectCountRef.current = 0
      setLiveCents(null)
      setLiveError(false)
      setShowDetectionHint(false)
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        liveStreamRef.current  = stream
        const audioCtx         = new (window.AudioContext || window.webkitAudioContext)()
        liveAudioCtxRef.current = audioCtx
        const source           = audioCtx.createMediaStreamSource(stream)
        const analyser         = audioCtx.createAnalyser()
        analyser.fftSize       = 2048
        source.connect(analyser)
        liveAnalyserRef.current = analyser
        liveDetectorRef.current = PitchDetector.forFloat32Array(analyser.fftSize)

        const buf = new Float32Array(analyser.fftSize)
        let lastUpdate = 0
        const loop = () => {
          liveRafRef.current = requestAnimationFrame(loop)
          const now = performance.now()
          if (now - lastUpdate < 100) return
          lastUpdate = now

          analyser.getFloatTimeDomainData(buf)
          const rms = frameRMS(buf)
          if (rms < 0.015) {
            noDetectCountRef.current++
            if (noDetectCountRef.current === 30) setShowDetectionHint(true)
            setLiveCents(null); return
          }

          const emp = preEmphasis(buf)
          const [hz, clarity] = liveDetectorRef.current.findPitch(emp, audioCtx.sampleRate)
          if (clarity < 0.80 || hz < HZ_MIN || hz > HZ_MAX) {
            noDetectCountRef.current++
            if (noDetectCountRef.current === 30) setShowDetectionHint(true)
            setLiveCents(null); return
          }

          const detectedMidi = Math.round(hzToMidi(hz, diapason))
          const targetMidi   = removedMidiRef.current
          if (targetMidi === null) { setLiveCents(null); return }
          const semidiff = ((detectedMidi - targetMidi) % 12 + 12) % 12
          if (semidiff > 1 && semidiff < 11) {
            noDetectCountRef.current++
            if (noDetectCountRef.current === 30) setShowDetectionHint(true)
            setLiveCents(null); return
          }

          // Détection réussie
          if (noDetectCountRef.current > 0) {
            noDetectCountRef.current = 0
            setShowDetectionHint(false)
          }
          const centsET = centsTempere(hz, diapason)
          const muCents = parseFloat((centsET - removedOffsetRef.current).toFixed(1))
          setLiveCents(muCents)
        }
        loop()
      } catch {
        setLiveError(true)
      }
    })()

    return () => {
      cancelled = true
      noDetectCountRef.current = 0
      cancelAnimationFrame(liveRafRef.current)
      liveStreamRef.current?.getTracks().forEach(t => t.stop())
      try { liveAudioCtxRef.current?.close() } catch {}
      liveAudioCtxRef.current = null
      liveStreamRef.current   = null
      setLiveCents(null)
    }
  }, [removedIdx]) // eslint-disable-line

  // ─── Chord playback ───────────────────────────────────────────────────────────
  const stopAll = useCallback(() => {
    sampleSrcsRef.current.forEach(({ src }) => { try { src.stop() } catch {} })
    sampleSrcsRef.current = []
    const t = audioCtxRef.current?.currentTime ?? 0
    oscSrcsRef.current.forEach(({ osc, gain }) => {
      try { gain.gain.setTargetAtTime(0, t, 0.04) } catch {}
      try { osc.stop(t + 0.1) } catch {}
    })
    oscSrcsRef.current = []
    try { audioCtxRef.current?.close() } catch {}
    audioCtxRef.current = null
  }, [])

  const startPlayback = useCallback((midis, offs) => {
    stopAll()
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    audioCtxRef.current = ctx
    if (ctx.state === 'suspended') ctx.resume()
    if (isOscillatorInstrument(instrument)) {
      oscSrcsRef.current    = playChordOscillator(ctx, midis, offs, diapason)
      sampleSrcsRef.current = []
    } else {
      if (!sampleMap) return
      sampleSrcsRef.current = playChord(ctx, midis, offs, sampleMap, diapason)
      oscSrcsRef.current    = []
    }
  }, [stopAll, instrument, sampleMap, diapason])

  // Restart when chord or removedIdx changes while playing
  const prevMidisRef = useRef([])
  useEffect(() => {
    if (!playing) return
    const activeMidis   = chordMidis.filter((_, i) => i !== removedIdx)
    const activeOffsets = offsets.filter((_, i) => i !== removedIdx)
    if (JSON.stringify(activeMidis) !== JSON.stringify(prevMidisRef.current)) {
      prevMidisRef.current = activeMidis
      startPlayback(activeMidis, activeOffsets)
    }
  }, [root, chordType, inversion, baseOctave, removedIdx, playing]) // eslint-disable-line

  // Smooth freq/rate update when offsets or mode change
  useEffect(() => {
    if (!playing || !audioCtxRef.current) return
    const ctx = audioCtxRef.current
    const t   = ctx.currentTime
    if (isOscillatorInstrument(instrument)) {
      oscSrcsRef.current.forEach(({ osc, midi }) => {
        const chordIdx = chordMidis.indexOf(midi)
        const offset   = offsets[chordIdx] ?? 0
        const hz = midiToHz(midi, diapason) * Math.pow(2, offset / 1200)
        try { osc.frequency.setTargetAtTime(hz, t, 0.05) } catch {}
      })
    } else {
      const diapasonCents = 1200 * Math.log2(diapason / 440)
      sampleSrcsRef.current.forEach(({ src, midi, pitchCorrCents = 0 }) => {
        const chordIdx = chordMidis.indexOf(midi)
        const offset   = offsets[chordIdx] ?? 0
        const rate     = Math.pow(2, (diapasonCents + offset + pitchCorrCents) / 1200)
        try { src.playbackRate.setTargetAtTime(rate, t, 0.05) } catch {}
      })
    }
  }, [offsets, mode, playing, diapason, instrument]) // eslint-disable-line

  useEffect(() => {
    return () => {
      stopAll()
      cancelAnimationFrame(liveRafRef.current)
      liveStreamRef.current?.getTracks().forEach(t => t.stop())
      try { liveAudioCtxRef.current?.close() } catch {}
    }
  }, []) // eslint-disable-line

  // ─── Handlers ───────────────────────────────────────────────────────────────────
  const togglePlay = () => {
    if (playing) {
      stopAll()
      setPlaying(false)
    } else {
      const activeMidis   = chordMidis.filter((_, i) => i !== removedIdx)
      const activeOffsets = offsets.filter((_, i) => i !== removedIdx)
      prevMidisRef.current = activeMidis
      startPlayback(activeMidis, activeOffsets)
      setPlaying(true)
    }
  }

  const setOffset = (i, newVal) => {
    setOffsets(prev => { const next = [...prev]; next[i] = newVal; return next })
  }

  const handleChordType = (t) => {
    setChordType(t)
    const maxInv = CHORD_TYPES[t].intervals.length - 1
    if (inversion > maxInv) setInversion(0)
  }

  const handleToggleRemoved = (i) => {
    setRemovedIdx(prev => prev === i ? null : i)
    setLiveCents(null)
    setLiveError(false)
  }

  const handleReset = () => {
    if (mode === 'tempere') setTempereOffsets(Array(n).fill(0))
    else if (mode === 'harmonique') setHarmoniqueOffsets(computeHarmonicOffsets(chordType, chordMidis, root))
    else setUtilisateurOffsets(computeUserOffsets(chordMidis, root, globalUserTemperament))
  }

  const selectCls = "bg-(--input-bg) text-app border border-app rounded-lg px-2.5 py-1.5 text-sm cursor-pointer"
  const numBtnCls = "bg-(--input-bg) text-app border border-app rounded-md w-7 h-7 cursor-pointer text-sm flex items-center justify-center"

  return (
    <div className="bg-app min-h-dvh flex flex-col items-center px-4 py-5">
      <TestPhaseWatermark />
      <div className="w-full max-w-xl">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <Link to="/accordeur" className="bg-surface border border-app rounded-lg px-3 py-1.5 text-xs font-bold no-underline text-app">
            ← Accordeur
          </Link>
          <h2 className="text-xl font-bold m-0" style={{ color: '#FF8B3D' }}>Générateur d'accord</h2>
          <div style={{ width: 90 }} />
        </div>

        {/* Instrument */}
        <div className="bg-surface border border-app rounded-xl p-4 mb-3">
          <div className="flex gap-2 items-center">
            <span className="text-xs text-app-muted whitespace-nowrap">Instrument</span>
            <select
              className={selectCls + ' flex-1'}
              value={instrument}
              onChange={e => setInstrument(e.target.value)}
            >
              {Object.entries(INSTRUMENTS).map(([k, v]) => (
                <option key={k} value={k} disabled={k !== 'oscillator'}>
                  {v.label}{k !== 'oscillator' ? ' (bientôt)' : ''}
                </option>
              ))}
            </select>
          </div>
          {sampleLoading && (
            <div style={{ height: 3, borderRadius: 2, background: 'var(--border-c)', overflow: 'hidden', marginTop: 8 }}>
              <div style={{ height: '100%', width: `${Math.round(sampleLoadPct * 100)}%`, background: '#FF8B3D', borderRadius: 2, transition: 'width 0.15s' }} />
            </div>
          )}
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
            {(() => {
              const isOsc     = isOscillatorInstrument(instrument)
              const notReady  = !isOsc && (sampleLoading || !sampleMap)
              return (
                <button
                  onClick={togglePlay}
                  disabled={notReady}
                  className="text-white border-none rounded-lg px-5 py-2 text-sm font-bold cursor-pointer transition-opacity"
                  style={{ background: playing ? '#7f1d1d' : '#FF8B3D', minWidth: 80, opacity: notReady ? 0.4 : 1 }}
                >{playing ? 'Stop' : sampleLoading && !isOsc ? 'Chargement…' : 'Jouer'}</button>
              )
            })()}
          </div>
        </div>

        {/* Temperament toggle */}
        <div className="bg-surface border border-app rounded-xl p-4 mb-3">
          <div className="text-xs text-app-muted font-semibold mb-2">Tempérament</div>
          <div className="flex gap-1.5">
            {[['tempere', 'Tempéré'], ['harmonique', 'Harmonique'], ['utilisateur', 'Utilisateur']].map(([k, label]) => (
              <button key={k} onClick={() => {
                if (k === 'utilisateur') setUtilisateurOffsets(computeUserOffsets(chordMidis, root, globalUserTemperament))
                setMode(k)
              }}
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
          {mode === 'utilisateur' && (
            <div className="text-[11px] text-app-muted mt-2 leading-snug">
              Basé sur votre tempérament (réglages accordeur). Glisser les knobs pour affiner.
            </div>
          )}
        </div>

        {/* Knob blocks */}
        <div className="bg-surface border border-app rounded-xl p-4 mb-3">
          <div className="text-xs text-app-muted font-semibold mb-1">Intonation par note — glisser ↑↓</div>
          <div className="text-[11px] text-app-muted mb-3">
            Cliquer sur une note pour la retirer de l'accord et mesurer votre intonation.
          </div>
          <div className="flex gap-3 flex-wrap justify-center">
            {noteNames.map((note, i) => {
              const isRemoved   = i === removedIdx
              const liveCentsI  = isRemoved ? liveCents : null
              const liveColor   = intonationColor(liveCentsI)
              const bgColor     = isRemoved
                ? (liveColor ? liveColor + '22' : 'rgba(255,139,61,0.07)')
                : 'var(--bg)'
              const borderColor = isRemoved
                ? (liveColor ?? '#FF8B3D')
                : 'var(--border-c)'

              return (
                <div
                  key={i}
                  onClick={() => handleToggleRemoved(i)}
                  className="rounded-xl px-3 pt-2 pb-3 flex flex-col items-center cursor-pointer transition-all duration-150"
                  style={{ minWidth: 80, background: bgColor, border: `2px solid ${borderColor}` }}
                >
                  {/* Note label — clickable area above knob */}
                  <div className="text-sm font-bold text-app leading-tight mb-0.5">
                    {note.nom}
                    <span className="text-[11px] font-normal text-app-muted ml-0.5">{note.octave}</span>
                  </div>

                  {/* Knob — SVG click stops propagation, drag only */}
                  <Knob value={offsets[i] ?? 0} onChange={v => setOffset(i, v)} />

                  {/* Live feedback or static hint */}
                  {isRemoved && !liveError && liveCentsI !== null && (
                    <div className="text-xs font-bold mt-1 tabular-nums" style={{ color: liveColor }}>
                      {liveCentsI >= 0 ? '+' : ''}{liveCentsI.toFixed(1)}¢
                    </div>
                  )}
                  {isRemoved && !liveError && liveCentsI === null && !showDetectionHint && (
                    <div className="text-[10px] text-app-muted mt-1">jouez…</div>
                  )}
                  {isRemoved && !liveError && liveCentsI === null && showDetectionHint && (
                    <div className="text-[10px] mt-1 text-center leading-tight" style={{ color: '#fbbf24' }}>
                      Plus fort<br/>ou plus près
                    </div>
                  )}
                  {isRemoved && liveError && (
                    <div className="text-[10px] mt-1" style={{ color: '#f87171' }}>micro ?</div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="flex justify-center mt-3">
            <button
              onClick={handleReset}
              className="text-xs text-app-muted bg-app border border-app rounded-lg px-3 py-1.5 cursor-pointer"
            >Réinitialiser</button>
          </div>
        </div>

      </div>
    </div>
  )
}
