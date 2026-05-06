import { useState, useRef, useEffect, useCallback } from 'react'
import {
  ALL_ROOTS, CHORD_TYPES, buildChordMidis,
  buildEnharmonicScale, noteNameToPC, TRANSPOSITIONS,
  midiToHzReferentiel, couleurJustesse,
} from './accordeurUtils'

const COL_SURFACE  = '#0a0f1a'
const COL_ACCENT   = '#c084fc'
const COL_ACCENT2  = '#7c3aed'
const COL_BORDER   = '#1f2937'
const COL_TEXT     = '#f9fafb'
const COL_MUTED2   = '#6b7280'
const COL_BG       = '#030712'

// Fix: for offset=0, return rootName directly to preserve flat/sharp.
// For non-zero offsets, prefer same accidental character.
function transposedRootName(rootName, transpoKey) {
  const offset = TRANSPOSITIONS[transpoKey]?.offset ?? 0
  if (offset === 0) return rootName
  const rootPC    = noteNameToPC(rootName)
  const dispPC    = ((rootPC + offset) % 12 + 12) % 12
  const isFlat    = rootName.endsWith('b')
  const candidates = ALL_ROOTS.filter(r => noteNameToPC(r) === dispPC)
  if (candidates.length === 1) return candidates[0]
  const preferred  = candidates.find(r => isFlat ? r.endsWith('b') : !r.endsWith('b'))
  return preferred ?? candidates[0]
}

function midiToDisplayNote(midi, transpoKey, enharmoScale) {
  const offset   = TRANSPOSITIONS[transpoKey]?.offset ?? 0
  const midiDisp = midi + offset
  const pc       = ((midiDisp % 12) + 12) % 12
  const octave   = Math.floor(midiDisp / 12) - 1
  const nom      = enharmoScale?.[pc] ?? '?'
  return { nom, octave }
}

export default function GenerateurAccord({ transpoKey, referentiel, diapason, seuil, liveNote, onGeneratorPcsChange }) {
  const [root,       setRoot]       = useState('Do')
  const [chordType,  setChordType]  = useState('maj')
  const [inversion,  setInversion]  = useState(0)
  const [removedIdx, setRemovedIdx] = useState(null)
  const [playing,    setPlaying]    = useState(false)
  const [baseOctave, setBaseOctave] = useState(4)

  const audioCtxRef = useRef(null)
  const oscsRef     = useRef([]) // { osc, gain, midi }[]

  // These refs let oscillators react to param changes without restart
  const referentielRef = useRef(referentiel)
  const diapasonRef    = useRef(diapason)
  useEffect(() => { referentielRef.current = referentiel }, [referentiel])
  useEffect(() => { diapasonRef.current    = diapason    }, [diapason])

  const chordMidis   = buildChordMidis(root, chordType, inversion, baseOctave)
  const maxInversion = CHORD_TYPES[chordType].intervals.length - 1
  const tonikMidi    = noteNameToPC(root) + (baseOctave + 1) * 12  // concert tonic

  const dispRootName = transposedRootName(root, transpoKey)
  const enharmoScale = buildEnharmonicScale(dispRootName)

  // Active pitch classes (concert) = all notes except the removed one
  const activePcs = chordMidis
    .filter((_, i) => i !== removedIdx)
    .map(m => ((m % 12) + 12) % 12)

  useEffect(() => {
    onGeneratorPcsChange?.(playing ? new Set(activePcs) : new Set())
  }, [playing, root, chordType, inversion, removedIdx, baseOctave]) // eslint-disable-line

  const stopOscs = useCallback(() => {
    if (!audioCtxRef.current) return
    const t = audioCtxRef.current.currentTime
    oscsRef.current.forEach(({ osc, gain }) => {
      try { gain.gain.setTargetAtTime(0, t, 0.05) } catch {}
      try { osc.stop(t + 0.15) } catch {}
    })
    oscsRef.current = []
  }, [])

  const startOscs = useCallback((midis, tonik) => {
    stopOscs()
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
    }
    const ctx = audioCtxRef.current
    if (ctx.state === 'suspended') ctx.resume()

    oscsRef.current = midis.map(midi => {
      const hz   = midiToHzReferentiel(midi, tonik, referentielRef.current, diapasonRef.current)
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0, ctx.currentTime)
      gain.gain.setTargetAtTime(0.3, ctx.currentTime, 0.02)
      gain.connect(ctx.destination)
      const osc = ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = hz
      osc.connect(gain)
      osc.start()
      return { osc, gain, midi }
    })
  }, [stopOscs])

  // Restart oscillators when chord/octave changes while playing
  useEffect(() => {
    if (playing) {
      const activeMidis = chordMidis.filter((_, i) => i !== removedIdx)
      startOscs(activeMidis, tonikMidi)
    }
  }, [root, chordType, inversion, removedIdx, baseOctave, playing]) // eslint-disable-line

  // Update oscillator frequencies dynamically when referentiel or diapason changes
  useEffect(() => {
    if (!playing || !audioCtxRef.current) return
    oscsRef.current.forEach(({ osc, midi }) => {
      const hz = midiToHzReferentiel(midi, tonikMidi, referentiel, diapason)
      osc.frequency.setTargetAtTime(hz, audioCtxRef.current.currentTime, 0.05)
    })
  }, [referentiel, diapason, tonikMidi, playing])

  useEffect(() => {
    return () => {
      stopOscs()
      try { audioCtxRef.current?.close() } catch {}
      onGeneratorPcsChange?.(new Set())
    }
  }, []) // eslint-disable-line

  const togglePlay = () => {
    if (playing) {
      stopOscs()
      setPlaying(false)
    } else {
      const activeMidis = chordMidis.filter((_, i) => i !== removedIdx)
      startOscs(activeMidis, tonikMidi)
      setPlaying(true)
    }
  }

  const handleRemove = (idx) => setRemovedIdx(prev => prev === idx ? null : idx)

  const handleChordType = (t) => {
    setChordType(t)
    const maxInv = CHORD_TYPES[t].intervals.length - 1
    if (inversion > maxInv) setInversion(0)
    if (removedIdx !== null && removedIdx > maxInv) setRemovedIdx(null)
  }

  const selectStyle = {
    background: COL_BG, color: COL_TEXT, border: `1px solid ${COL_BORDER}`,
    borderRadius: 8, padding: '6px 10px', fontSize: 14, cursor: 'pointer',
    fontFamily: "'Inter','Segoe UI',sans-serif",
  }
  const numBtnStyle = {
    background: COL_BG, color: COL_TEXT, border: `1px solid ${COL_BORDER}`,
    borderRadius: 6, width: 28, height: 28, cursor: 'pointer', fontSize: 14,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: "'Inter','Segoe UI',sans-serif",
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Row 1: chord selectors */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select style={selectStyle} value={root} onChange={e => { setRoot(e.target.value); setRemovedIdx(null) }}>
          {ALL_ROOTS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>

        <select style={selectStyle} value={chordType} onChange={e => handleChordType(e.target.value)}>
          {Object.entries(CHORD_TYPES).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>

        <select style={selectStyle} value={inversion} onChange={e => { setInversion(Number(e.target.value)); setRemovedIdx(null) }}>
          {Array.from({ length: maxInversion + 1 }, (_, i) => (
            <option key={i} value={i}>{i === 0 ? 'État fondamental' : `${i}${i === 1 ? 'er' : 'e'} renversement`}</option>
          ))}
        </select>
      </div>

      {/* Row 2: octave + play */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: COL_MUTED2 }}>Octave</span>
          <button style={numBtnStyle} onClick={() => setBaseOctave(o => Math.max(2, o - 1))}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 15 12 9 18 15"/></svg>
          </button>
          <span style={{ color: COL_TEXT, fontWeight: 700, fontSize: 14, minWidth: 14, textAlign: 'center' }}>{baseOctave}</span>
          <button style={numBtnStyle} onClick={() => setBaseOctave(o => Math.min(6, o + 1))}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
        </div>

        <button
          onClick={togglePlay}
          style={{
            background: playing ? '#7f1d1d' : COL_ACCENT2, color: '#fff',
            border: 'none', borderRadius: 8, padding: '8px 20px',
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
            fontFamily: "'Inter','Segoe UI',sans-serif", minWidth: 80,
          }}
        >
          {playing ? 'Stop' : 'Jouer'}
        </button>
      </div>

      {/* Note cards */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {chordMidis.map((midi, i) => {
          const { nom, octave } = midiToDisplayNote(midi, transpoKey, enharmoScale)
          const isRemoved = i === removedIdx

          // Match live note against this concert pc
          const concertPc = ((midi % 12) + 12) % 12
          const livePC    = liveNote ? ((noteNameToPC(liveNote.nom) - (TRANSPOSITIONS[transpoKey]?.offset ?? 0) + 12 * 10) % 12) : -1
          const isLive    = isRemoved && liveNote && livePC === concertPc
          const centsVal  = isLive ? liveNote.muCents : null

          const borderColor = isRemoved
            ? (isLive ? couleurJustesse(centsVal, seuil) : COL_BORDER)
            : 'transparent'

          return (
            <button
              key={i}
              onClick={() => handleRemove(i)}
              title={isRemoved ? "Restaurer dans l'accord" : 'Retirer (je joue cette note)'}
              style={{
                background:   isRemoved ? COL_BG : COL_ACCENT2,
                border:       `2px solid ${borderColor}`,
                borderRadius: 10, padding: '10px 16px',
                color:        isRemoved ? (isLive ? couleurJustesse(centsVal, seuil) : COL_MUTED2) : '#fff',
                cursor: 'pointer', textAlign: 'center', minWidth: 64,
                fontFamily: "'Inter','Segoe UI',sans-serif",
                transition: 'all 0.15s',
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 700 }}>{nom}</div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>{octave}</div>
              {isLive && centsVal !== null && (
                <div style={{ fontSize: 11, marginTop: 2, fontWeight: 600, color: couleurJustesse(centsVal, seuil) }}>
                  {centsVal >= 0 ? '+' : ''}{centsVal.toFixed(1)}¢
                </div>
              )}
              {isRemoved && !isLive && (
                <div style={{ fontSize: 10, marginTop: 3, color: COL_MUTED2 }}>jouer</div>
              )}
            </button>
          )
        })}
      </div>

      {removedIdx === null && (
        <div style={{ fontSize: 12, color: COL_MUTED2 }}>
          Cliquer sur une note pour la retirer de l'accord et la jouer sur votre instrument.
        </div>
      )}
    </div>
  )
}
