import { useState, useRef, useEffect, useCallback } from 'react'
import AccordeurStaff from './AccordeurStaff'
import {
  ALL_ROOTS, SCALE_TYPES, buildScaleMidis,
  buildEnharmonicScale, noteNameToPC, TRANSPOSITIONS, NOTE_NAMES_FR,
  analyserBuffer, segmenter, calculerEcarts, courbebrute,
  scorePedagogique, scoreQualite, couleurJustesse, midiToHzReferentiel,
} from './accordeurUtils'

const COL_BG      = '#030712'
const COL_SURFACE = '#0a0f1a'
const COL_ACCENT  = '#c084fc'
const COL_ACCENT2 = '#7c3aed'
const COL_BORDER  = '#1f2937'
const COL_TEXT    = '#f9fafb'
const COL_MUTED   = '#4b5563'
const COL_MUTED2  = '#6b7280'

function Btn({ children, onClick, disabled, variant = 'primary', style = {} }) {
  const base = {
    border: 'none', borderRadius: 10, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: "'Inter','Segoe UI',sans-serif", transition: 'opacity 0.15s',
    opacity: disabled ? 0.4 : 1, fontSize: 14, padding: '12px 20px', ...style,
  }
  const variants = {
    primary:   { background: COL_ACCENT2, color: '#fff' },
    secondary: { background: COL_SURFACE, color: COL_ACCENT, border: `1px solid ${COL_BORDER}` },
  }
  return <button style={{ ...base, ...variants[variant] }} onClick={onClick} disabled={disabled}>{children}</button>
}

// Fix: for offset=0, return rootName directly; otherwise prefer matching accidental character
function transposedRootName(rootName, transpoKey) {
  const offset = TRANSPOSITIONS[transpoKey]?.offset ?? 0
  if (offset === 0) return rootName
  const pc = ((noteNameToPC(rootName) + offset) % 12 + 12) % 12
  return NOTE_NAMES_FR[pc]
}

function scaleMidisToStaffNotes(midis) {
  return midis.map(midiCible => ({ midiCible, muCents: 0, sigmaCents: 0 }))
}

// Play scale as quarter notes at 60 BPM using Web Audio OscillatorNodes
async function playScaleAudio(midis, tonikMidi, referentiel, diapason) {
  const ctx       = new (window.AudioContext || window.webkitAudioContext)()
  const bpm       = 60
  const noteDur   = 60 / bpm          // 1 second per beat
  const attackT   = 0.01
  const releaseT  = 0.08

  for (let i = 0; i < midis.length; i++) {
    const hz   = midiToHzReferentiel(midis[i], tonikMidi, referentiel, diapason)
    const t    = ctx.currentTime + i * noteDur
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.35, t + attackT)
    gain.gain.setValueAtTime(0.35, t + noteDur - releaseT)
    gain.gain.linearRampToValueAtTime(0, t + noteDur)
    gain.connect(ctx.destination)
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = hz
    osc.connect(gain)
    osc.start(t)
    osc.stop(t + noteDur)
  }

  // Auto-close after all notes finish
  const totalDur = midis.length * noteDur + 0.3
  setTimeout(() => { try { ctx.close() } catch {} }, totalDur * 1000)
}

export default function JeuGamme({ transpoKey, referentiel, diapason, seuil, silenceDurationMs, noteJumpCents, clarityThreshold, gateLevel }) {
  const [root,       setRoot]       = useState('Do')
  const [scaleType,  setScaleType]  = useState('major')
  const [baseOctave, setBaseOctave] = useState(4)
  const [phase,      setPhase]      = useState('pret')
  const [notes,      setNotes]      = useState([])
  const [scoreP,     setScoreP]     = useState(null)
  const [scoreQ,     setScoreQ]     = useState(null)
  const [erreur,     setErreur]     = useState(null)
  const [vue,        setVue]        = useState('portee')
  const [playing,    setPlaying]    = useState(false)

  const mediaRecorderRef = useRef(null)
  const chunksRef        = useRef([])
  const streamRef        = useRef(null)
  const analyserRef      = useRef(null)
  const animRef          = useRef(null)
  const vuRef            = useRef(null)

  const scaleMidis   = buildScaleMidis(root, scaleType, baseOctave)
  const dispRootName = transposedRootName(root, transpoKey)
  const enharmoScale = buildEnharmonicScale(dispRootName)
  const staffNotes   = scaleMidisToStaffNotes(scaleMidis)
  const tonikMidi    = noteNameToPC(root) + (baseOctave + 1) * 12

  const _transpoOffset = TRANSPOSITIONS[transpoKey]?.offset ?? 0
  const labelsX = notes.map(n => {
    const midiDisp = n.midiCible + _transpoOffset
    const pc       = ((midiDisp % 12) + 12) % 12
    const oct      = Math.floor(midiDisp / 12) - 1
    return `${enharmoScale[pc]}${oct}`
  })
  const muMoyen    = notes.length ? (notes.reduce((a, n) => a + n.muCents, 0) / notes.length).toFixed(1) : null
  const sigmaMoyen = notes.length ? (notes.reduce((a, n) => a + n.sigmaCents, 0) / notes.length).toFixed(1) : null

  const handlePlay = async () => {
    if (playing) return
    setPlaying(true)
    await playScaleAudio(scaleMidis, tonikMidi, referentiel, diapason)
    // Delay reset slightly so last note finishes
    setTimeout(() => setPlaying(false), (scaleMidis.length + 0.3) * 1000)
  }

  const demarrer = useCallback(async () => {
    setErreur(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      streamRef.current = stream

      const audioCtx  = new AudioContext()
      const source    = audioCtx.createMediaStreamSource(stream)
      const analyser  = audioCtx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = { analyser, audioCtx }

      const VU_SCALE = 5
      const drawVU = () => {
        animRef.current = requestAnimationFrame(drawVU)
        const canvas = vuRef.current
        if (!canvas) return
        const ctx2 = canvas.getContext('2d')
        const data = new Uint8Array(analyser.fftSize)
        analyser.getByteTimeDomainData(data)
        let sum = 0
        for (let k = 0; k < data.length; k++) { const s = (data[k] - 128) / 128; sum += s * s }
        const rms = Math.sqrt(sum / data.length)
        const W = canvas.width, H = canvas.height
        ctx2.clearRect(0, 0, W, H)
        ctx2.fillStyle = COL_SURFACE
        ctx2.fillRect(0, 0, W, H)
        const barW = Math.min(rms * VU_SCALE * W, W)
        const grad = ctx2.createLinearGradient(0, 0, W, 0)
        grad.addColorStop(0,   '#34d399')
        grad.addColorStop(0.6, '#fbbf24')
        grad.addColorStop(1,   '#f87171')
        ctx2.fillStyle = grad
        ctx2.fillRect(0, 0, barW, H)
        const gateX = Math.min(gateLevel * VU_SCALE * W, W - 1)
        ctx2.strokeStyle = '#f9fafb'
        ctx2.lineWidth   = 1.5
        ctx2.setLineDash([3, 3])
        ctx2.beginPath(); ctx2.moveTo(gateX, 0); ctx2.lineTo(gateX, H); ctx2.stroke()
        ctx2.setLineDash([])
      }
      drawVU()

      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.start()
      mediaRecorderRef.current = recorder
      setPhase('enregistrement')
    } catch (e) {
      setErreur('Microphone inaccessible : ' + e.message)
    }
  }, [gateLevel])

  const arreter = useCallback(async () => {
    setPhase('analyse')
    cancelAnimationFrame(animRef.current)

    const recorder = mediaRecorderRef.current
    const stream   = streamRef.current
    const { audioCtx } = analyserRef.current ?? {}

    await new Promise(resolve => {
      recorder.onstop = resolve
      recorder.stop()
    })
    stream.getTracks().forEach(t => t.stop())
    audioCtx?.close()

    const blob      = new Blob(chunksRef.current, { type: 'audio/webm' })
    const arrayBuf  = await blob.arrayBuffer()
    const decodeCtx = new AudioContext()
    let audioBuffer
    try {
      audioBuffer = await decodeCtx.decodeAudioData(arrayBuf)
    } catch (e) {
      setErreur('Décodage audio échoué : ' + e.message)
      setPhase('pret')
      decodeCtx.close()
      return
    }
    decodeCtx.close()

    const serieCalc = analyserBuffer(audioBuffer, { clarityThreshold, rmsGate: gateLevel })
    const segments  = segmenter(serieCalc, diapason, { silenceDurationMs, noteJumpCents })
    const notesAv   = calculerEcarts(segments, referentiel, tonikMidi, diapason)

    setNotes(notesAv)
    setScoreP(scorePedagogique(notesAv, seuil))
    setScoreQ(scoreQualite(notesAv))
    setPhase('resultats')
  }, [clarityThreshold, gateLevel, diapason, silenceDurationMs, noteJumpCents, referentiel, tonikMidi, seuil])

  const reinitialiser = () => {
    setPhase('pret'); setNotes([]); setScoreP(null); setScoreQ(null); setErreur(null)
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
      {/* Sélecteurs */}
      {phase !== 'enregistrement' && phase !== 'analyse' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select style={selectStyle} value={root} onChange={e => { setRoot(e.target.value); reinitialiser() }}>
            {ALL_ROOTS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <select style={selectStyle} value={scaleType} onChange={e => { setScaleType(e.target.value); reinitialiser() }}>
            {Object.entries(SCALE_TYPES).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>

          {/* Octave */}
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

          {/* Play scale button */}
          <button
            onClick={handlePlay}
            disabled={playing}
            title="Jouer la gamme (♩ = 60)"
            style={{
              background: playing ? COL_MUTED : COL_SURFACE,
              border: `1px solid ${playing ? COL_MUTED : COL_ACCENT}`,
              borderRadius: 8, padding: '6px 12px', cursor: playing ? 'not-allowed' : 'pointer',
              color: playing ? COL_MUTED2 : COL_ACCENT, display: 'flex', alignItems: 'center', gap: 6,
              fontFamily: "'Inter','Segoe UI',sans-serif", fontSize: 13,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill={playing ? COL_MUTED2 : COL_ACCENT} stroke="none">
              <polygon points="5,3 19,12 5,21"/>
            </svg>
            {playing ? 'Lecture…' : 'Écouter'}
          </button>
        </div>
      )}

      {/* Portée de référence */}
      {(phase === 'pret' || phase === 'resultats') && (
        <div style={{ background: COL_SURFACE, borderRadius: 12, padding: '12px 8px', border: `1px solid ${COL_BORDER}` }}>
          <div style={{ fontSize: 11, color: COL_MUTED2, marginBottom: 8, paddingLeft: 8 }}>
            Gamme de référence — {dispRootName} {SCALE_TYPES[scaleType].label}
          </div>
          <AccordeurStaff
            notes={staffNotes}
            seuil={999}
            transpoKey={transpoKey}
            tonicName={dispRootName}
            containerWidth={524}
            height={140}
            notePx={window.innerWidth <= 540 ? 26 : 40}
          />
        </div>
      )}

      {erreur && (
        <div style={{ background: '#1f0a0a', border: '1px solid #7f1d1d', borderRadius: 8, padding: '10px 14px', color: '#fca5a5', fontSize: 13 }}>
          {erreur}
        </div>
      )}

      {/* Contrôles */}
      {phase === 'pret' && (
        <Btn onClick={demarrer} style={{ fontSize: 15, padding: '14px 32px', alignSelf: 'flex-start' }}>
          Enregistrer
        </Btn>
      )}

      {phase === 'enregistrement' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <canvas ref={vuRef} width={300} height={18} style={{ borderRadius: 6, display: 'block' }} />
          <Btn onClick={arreter} variant="secondary" style={{ fontSize: 14, padding: '11px 28px', alignSelf: 'flex-start' }}>
            Arrêter
          </Btn>
        </div>
      )}

      {phase === 'analyse' && (
        <div style={{ color: COL_MUTED2, fontSize: 14 }}>Analyse en cours…</div>
      )}

      {/* Résultats */}
      {phase === 'resultats' && notes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {[['portee', 'Portée'], ['tableau', 'Tableau']].map(([v, label]) => (
              <button key={v} onClick={() => setVue(v)} style={{
                padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
                background: vue === v ? COL_ACCENT2 : COL_BG,
                color:      vue === v ? '#fff' : COL_MUTED,
                border:     `1px solid ${vue === v ? COL_ACCENT2 : COL_BORDER}`,
              }}>{label}</button>
            ))}
            <span style={{ marginLeft: 'auto', color: COL_MUTED, fontSize: 11, alignSelf: 'center' }}>
              μ <strong style={{ color: COL_TEXT }}>{muMoyen}¢</strong>
              &nbsp;&nbsp;σ <strong style={{ color: COL_TEXT }}>{sigmaMoyen}¢</strong>
            </span>
          </div>

          {vue === 'portee' && (
            <div style={{ background: COL_SURFACE, borderRadius: 12, padding: '16px 8px', border: `1px solid ${COL_BORDER}` }}>
              <AccordeurStaff
                notes={notes} seuil={seuil} transpoKey={transpoKey} tonicName={dispRootName}
                containerWidth={524} height={180} notePx={window.innerWidth <= 540 ? 26 : 52}
              />
            </div>
          )}

          {vue === 'tableau' && (
            <div style={{ background: COL_SURFACE, borderRadius: 12, padding: 16, border: `1px solid ${COL_BORDER}` }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ color: COL_MUTED, borderBottom: `1px solid ${COL_BORDER}` }}>
                    <th style={{ padding: '4px 8px', textAlign: 'left',  fontWeight: 600 }}>Note</th>
                    <th style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600 }}>μ (¢)</th>
                    <th style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600 }}>σ (¢)</th>
                    <th style={{ padding: '4px 8px', textAlign: 'left',  fontWeight: 600 }}>Écart</th>
                  </tr>
                </thead>
                <tbody>
                  {notes.map((note, i) => {
                    const couleur  = couleurJustesse(note.muCents, seuil)
                    const barScale = Math.min(Math.abs(note.muCents) / 30, 1)
                    return (
                      <tr key={i} style={{ borderBottom: `1px solid ${COL_BORDER}` }}>
                        <td style={{ padding: '8px 8px', fontWeight: 700, color: couleur }}>{labelsX[i]}</td>
                        <td style={{ padding: '8px 8px', textAlign: 'right', color: couleur, fontWeight: 700 }}>
                          {note.muCents >= 0 ? '+' : ''}{note.muCents.toFixed(1)}
                        </td>
                        <td style={{ padding: '8px 8px', textAlign: 'right', color: COL_MUTED2 }}>
                          {note.sigmaCents.toFixed(1)}
                        </td>
                        <td style={{ padding: '8px 8px', width: 100 }}>
                          <div style={{ position: 'relative', height: 8, background: COL_BG, borderRadius: 4 }}>
                            <div style={{
                              position: 'absolute',
                              left:   note.muCents < 0 ? `${(0.5 - barScale / 2) * 100}%` : '50%',
                              width:  `${barScale * 50}%`,
                              height: '100%',
                              background: couleur, borderRadius: 4, opacity: 0.8,
                            }} />
                            <div style={{ position: 'absolute', left: '50%', top: 0, width: 1, height: '100%', background: COL_MUTED }} />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ background: COL_SURFACE, borderRadius: 12, padding: 16, border: `1px solid ${COL_BORDER}`, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: COL_MUTED, marginBottom: 4 }}>Notes justes</div>
              <div style={{ fontSize: 26, fontWeight: 900, color: '#34d399' }}>{scoreP?.label}</div>
              <div style={{ fontSize: 10, color: COL_MUTED }}>seuil ±{seuil}¢</div>
            </div>
            <div style={{ background: COL_SURFACE, borderRadius: 12, padding: 16, border: `1px solid ${COL_BORDER}`, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: COL_MUTED, marginBottom: 4 }}>Score qualité</div>
              <div style={{ fontSize: 26, fontWeight: 900, color: COL_ACCENT }}>{scoreQ}%</div>
              <div style={{ fontSize: 10, color: COL_MUTED }}>précision + stabilité</div>
            </div>
          </div>

          <Btn onClick={reinitialiser} variant="secondary" style={{ fontSize: 13, padding: '10px 20px', alignSelf: 'flex-start' }}>
            ↩ Réessayer
          </Btn>
        </div>
      )}

      {phase === 'resultats' && notes.length === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ color: COL_MUTED2, fontSize: 13 }}>Aucune note détectée. Vérifier les réglages de segmentation.</div>
          <Btn onClick={reinitialiser} variant="secondary" style={{ fontSize: 13, padding: '10px 20px', alignSelf: 'flex-start' }}>
            ↩ Réessayer
          </Btn>
        </div>
      )}
    </div>
  )
}
