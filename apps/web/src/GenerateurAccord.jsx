import { useState, useRef, useEffect, useCallback } from 'react'
import {
  ALL_ROOTS, CHORD_TYPES, buildChordMidis,
  buildEnharmonicScale, noteNameToPC, TRANSPOSITIONS,
  midiToHz, couleurJustesse,
} from './accordeurUtils'

const COL_SURFACE  = '#0a0f1a'
const COL_ACCENT   = '#c084fc'
const COL_ACCENT2  = '#7c3aed'
const COL_BORDER   = '#1f2937'
const COL_TEXT     = '#f9fafb'
const COL_MUTED2   = '#6b7280'

function midiToDisplayNote(midi, transpoKey, enharmoScale) {
  const offset    = TRANSPOSITIONS[transpoKey]?.offset ?? 0
  const midiDisp  = midi + offset
  const pc        = ((midiDisp % 12) + 12) % 12
  const octave    = Math.floor(midiDisp / 12) - 1
  const nom       = enharmoScale?.[pc] ?? '?'
  return { nom, octave }
}

// Compute transposed root name for enharmonic scale
function transposedRootName(rootName, transpoKey) {
  const offset  = TRANSPOSITIONS[transpoKey]?.offset ?? 0
  const rootPC  = noteNameToPC(rootName)
  const dispPC  = ((rootPC + offset) % 12 + 12) % 12
  // find the display name in ALL_ROOTS that matches dispPC
  const match = ALL_ROOTS.find(r => noteNameToPC(r) === dispPC)
  return match ?? rootName
}

export default function GenerateurAccord({ transpoKey, referentiel, diapason, seuil, liveNote, onGeneratorPcsChange }) {
  const [root,       setRoot]       = useState('Do')
  const [chordType,  setChordType]  = useState('maj')
  const [inversion,  setInversion]  = useState(0)
  const [removedIdx, setRemovedIdx] = useState(null) // index in chord midi array
  const [playing,    setPlaying]    = useState(false)

  const audioCtxRef = useRef(null)
  const gainNodeRef = useRef(null)
  const oscsRef     = useRef([])   // { osc, gain, midi }[]

  const chordMidis = buildChordMidis(root, chordType, inversion)
  const maxInversion = CHORD_TYPES[chordType].intervals.length - 1

  // Transposed display helpers
  const dispRootName  = transposedRootName(root, transpoKey)
  const enharmoScale  = buildEnharmonicScale(dispRootName)

  // Active pitch classes = all notes except the removed one
  const activePcs = chordMidis
    .filter((_, i) => i !== removedIdx)
    .map(m => ((m % 12) + 12) % 12)

  // Notify parent whenever active pcs change
  useEffect(() => {
    onGeneratorPcsChange?.(playing ? new Set(activePcs) : new Set())
  }, [playing, root, chordType, inversion, removedIdx]) // eslint-disable-line

  // Start/stop oscillators
  const stopOscs = useCallback(() => {
    oscsRef.current.forEach(({ osc, gain }) => {
      try { gain.gain.setTargetAtTime(0, audioCtxRef.current.currentTime, 0.05) } catch {}
      try { osc.stop(audioCtxRef.current.currentTime + 0.15) } catch {}
    })
    oscsRef.current = []
  }, [])

  const startOscs = useCallback(() => {
    stopOscs()
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
    }
    const ctx = audioCtxRef.current
    if (ctx.state === 'suspended') ctx.resume()

    const master = ctx.createGain()
    master.gain.value = 0.5
    master.connect(ctx.destination)
    gainNodeRef.current = master

    oscsRef.current = chordMidis
      .filter((_, i) => i !== removedIdx)
      .map(midi => {
        const hz   = midiToHz(midi, diapason)
        const gain = ctx.createGain()
        gain.gain.setValueAtTime(0, ctx.currentTime)
        gain.gain.setTargetAtTime(0.12, ctx.currentTime, 0.02)
        gain.connect(master)
        const osc = ctx.createOscillator()
        osc.type      = 'sine'
        osc.frequency.value = hz
        osc.connect(gain)
        osc.start()
        return { osc, gain, midi }
      })
  }, [chordMidis, removedIdx, diapason, stopOscs])

  // Re-trigger oscillators when chord config changes while playing
  useEffect(() => {
    if (playing) startOscs()
  }, [root, chordType, inversion, removedIdx, playing]) // eslint-disable-line

  // Cleanup on unmount
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
      startOscs()
      setPlaying(true)
    }
  }

  const handleRemove = (idx) => {
    setRemovedIdx(prev => prev === idx ? null : idx)
  }

  // Clamp inversion when chord type changes
  const handleChordType = (t) => {
    setChordType(t)
    const maxInv = CHORD_TYPES[t].intervals.length - 1
    if (inversion > maxInv) setInversion(0)
    if (removedIdx !== null && removedIdx > maxInv) setRemovedIdx(null)
  }

  const selectStyle = {
    background: COL_SURFACE, color: COL_TEXT, border: `1px solid ${COL_BORDER}`,
    borderRadius: 8, padding: '6px 10px', fontSize: 14, cursor: 'pointer',
    fontFamily: "'Inter','Segoe UI',sans-serif",
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Controls */}
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
            <option key={i} value={i}>{i === 0 ? 'État fondamental' : `${i}er renversement`}</option>
          ))}
        </select>

        <button
          onClick={togglePlay}
          style={{
            background: playing ? '#7f1d1d' : COL_ACCENT2, color: '#fff',
            border: 'none', borderRadius: 8, padding: '8px 18px',
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
            fontFamily: "'Inter','Segoe UI',sans-serif",
            minWidth: 80,
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
          const pc = ((midi % 12) + 12) % 12
          // Is the live note matching this pitch class?
          const isLive = liveNote && ((noteNameToPC(liveNote.nom) % 12 + 12) % 12) === ((pc + (TRANSPOSITIONS[transpoKey]?.offset ?? 0)) % 12 + 12) % 12
          const centsVal = isRemoved && isLive ? liveNote.muCents : null
          const cardColor = isRemoved
            ? (isLive ? couleurJustesse(centsVal, seuil) : COL_MUTED2)
            : COL_ACCENT2

          return (
            <button
              key={i}
              onClick={() => handleRemove(i)}
              title={isRemoved ? 'Restaurer dans l\'accord' : 'Retirer (je joue cette note)'}
              style={{
                background: isRemoved ? 'transparent' : cardColor,
                border: `2px solid ${isRemoved ? (isLive ? couleurJustesse(centsVal, seuil) : COL_BORDER) : 'transparent'}`,
                borderRadius: 10, padding: '10px 16px',
                color: isRemoved ? (isLive ? couleurJustesse(centsVal, seuil) : COL_MUTED2) : '#fff',
                cursor: 'pointer', textAlign: 'center', minWidth: 64,
                fontFamily: "'Inter','Segoe UI',sans-serif",
                opacity: isRemoved ? 0.8 : 1,
                transition: 'all 0.15s',
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 700 }}>{nom}</div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>{octave}</div>
              {isRemoved && isLive && centsVal !== null && (
                <div style={{ fontSize: 11, marginTop: 2, fontWeight: 600, color: couleurJustesse(centsVal, seuil) }}>
                  {centsVal >= 0 ? '+' : ''}{centsVal.toFixed(1)}¢
                </div>
              )}
              {isRemoved && (
                <div style={{ fontSize: 10, marginTop: 3, color: COL_MUTED2 }}>jouer</div>
              )}
            </button>
          )
        })}
      </div>

      {removedIdx !== null && (
        <div style={{ fontSize: 12, color: COL_MUTED2 }}>
          Cliquer sur une note pour la retirer de l'accord (vous la jouerez). Recliquer pour la restaurer.
        </div>
      )}
    </div>
  )
}
