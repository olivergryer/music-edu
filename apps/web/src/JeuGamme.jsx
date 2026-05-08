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
  const baseStyle = { transition: 'opacity 0.15s', opacity: disabled ? 0.4 : 1, ...style }
  const variantStyle = {
    primary:   { background: '#FF8B3D', color: '#fff' },
    secondary: { background: 'var(--surface-2)', color: '#FF8B3D', border: '1px solid var(--border-c)' },
  }
  return (
    <button
      className="border-none rounded-xl font-bold text-sm px-5 py-3 cursor-pointer"
      style={{ ...baseStyle, ...variantStyle[variant], cursor: disabled ? 'not-allowed' : 'pointer' }}
      onClick={onClick}
      disabled={disabled}
    >{children}</button>
  )
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

  const selectCls = "bg-(--input-bg) text-app border border-app rounded-lg px-2.5 py-1.5 text-sm cursor-pointer"
  const numBtnCls = "bg-(--input-bg) text-app border border-app rounded-md w-7 h-7 cursor-pointer text-sm flex items-center justify-center"

  return (
    <div className="flex flex-col gap-3.5">
      {/* Sélecteurs */}
      {phase !== 'enregistrement' && phase !== 'analyse' && (
        <div className="flex gap-2 flex-wrap items-center">
          <select className={selectCls} value={root} onChange={e => { setRoot(e.target.value); reinitialiser() }}>
            {ALL_ROOTS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <select className={selectCls} value={scaleType} onChange={e => { setScaleType(e.target.value); reinitialiser() }}>
            {Object.entries(SCALE_TYPES).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>

          {/* Octave */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-app-muted">Octave</span>
            <button className={numBtnCls} onClick={() => setBaseOctave(o => Math.max(2, o - 1))}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 15 12 9 18 15"/></svg>
            </button>
            <span className="text-sm font-bold text-app text-center" style={{ minWidth: 14 }}>{baseOctave}</span>
            <button className={numBtnCls} onClick={() => setBaseOctave(o => Math.min(6, o + 1))}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          </div>

          {/* Play scale button */}
          <button
            onClick={handlePlay}
            disabled={playing}
            title="Jouer la gamme (♩ = 60)"
            className="rounded-lg px-3 py-1.5 flex items-center gap-1.5 text-sm border"
            style={{
              background: playing ? 'var(--surface-2)' : 'var(--surface)',
              borderColor: playing ? 'var(--border-c)' : '#FF8B3D',
              color: playing ? 'var(--text-muted)' : '#FF8B3D',
              cursor: playing ? 'not-allowed' : 'pointer',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill={playing ? 'var(--text-muted)' : '#FF8B3D'} stroke="none">
              <polygon points="5,3 19,12 5,21"/>
            </svg>
            {playing ? 'Lecture…' : 'Écouter'}
          </button>
        </div>
      )}

      {/* Portée de référence */}
      {(phase === 'pret' || phase === 'resultats') && (
        <div className="bg-surface rounded-xl px-2 py-3 border border-app">
          <div className="text-[11px] text-app-muted mb-2 pl-2">
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
        <div className="rounded-lg px-3.5 py-2.5 text-sm text-red-300" style={{ background: '#1f0a0a', border: '1px solid #7f1d1d' }}>
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
        <div className="flex flex-col gap-3">
          <canvas ref={vuRef} width={300} height={18} className="rounded-md block" />
          <Btn onClick={arreter} variant="secondary" style={{ fontSize: 14, padding: '11px 28px', alignSelf: 'flex-start' }}>
            Arrêter
          </Btn>
        </div>
      )}

      {phase === 'analyse' && (
        <div className="text-sm text-app-muted">Analyse en cours…</div>
      )}

      {/* Résultats */}
      {phase === 'resultats' && notes.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex gap-1.5 items-center flex-wrap">
            {[['portee', 'Portée'], ['tableau', 'Tableau']].map(([v, label]) => (
              <button key={v} onClick={() => setVue(v)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer border"
                style={{
                  background: vue === v ? '#FF8B3D' : 'var(--surface-2)',
                  color: vue === v ? '#fff' : 'var(--text-muted)',
                  borderColor: vue === v ? '#FF8B3D' : 'var(--border-c)',
                }}
              >{label}</button>
            ))}
            <span className="ml-auto text-[11px] text-app-muted self-center">
              μ <strong className="text-app">{muMoyen}¢</strong>
              &nbsp;&nbsp;σ <strong className="text-app">{sigmaMoyen}¢</strong>
            </span>
          </div>

          {vue === 'portee' && (
            <div className="bg-surface rounded-xl px-2 py-4 border border-app">
              <AccordeurStaff
                notes={notes} seuil={seuil} transpoKey={transpoKey} tonicName={dispRootName}
                containerWidth={524} height={180} notePx={window.innerWidth <= 540 ? 26 : 52}
              />
            </div>
          )}

          {vue === 'tableau' && (
            <div className="bg-surface rounded-xl p-4 border border-app">
              <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr className="text-app-muted" style={{ borderBottom: '1px solid var(--border-c)' }}>
                    <th className="py-1 px-2 text-left font-semibold">Note</th>
                    <th className="py-1 px-2 text-right font-semibold">μ (¢)</th>
                    <th className="py-1 px-2 text-right font-semibold">σ (¢)</th>
                    <th className="py-1 px-2 text-left font-semibold">Écart</th>
                  </tr>
                </thead>
                <tbody>
                  {notes.map((note, i) => {
                    const couleur  = couleurJustesse(note.muCents, seuil)
                    const barScale = Math.min(Math.abs(note.muCents) / 30, 1)
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-c)' }}>
                        <td className="py-2 px-2 font-bold" style={{ color: couleur }}>{labelsX[i]}</td>
                        <td className="py-2 px-2 text-right font-bold" style={{ color: couleur }}>
                          {note.muCents >= 0 ? '+' : ''}{note.muCents.toFixed(1)}
                        </td>
                        <td className="py-2 px-2 text-right text-app-muted">{note.sigmaCents.toFixed(1)}</td>
                        <td className="py-2 px-2 w-[100px]">
                          <div className="relative h-2 bg-surface-2 rounded" style={{ position: 'relative' }}>
                            <div style={{
                              position: 'absolute',
                              left: note.muCents < 0 ? `${(0.5 - barScale / 2) * 100}%` : '50%',
                              width: `${barScale * 50}%`,
                              height: '100%',
                              background: couleur, borderRadius: 4, opacity: 0.8,
                            }} />
                            <div className="absolute top-0 w-px h-full bg-app-muted" style={{ left: '50%' }} />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-surface rounded-xl p-4 border border-app text-center">
              <div className="text-[11px] text-app-muted mb-1">Notes justes</div>
              <div className="text-2xl font-black" style={{ color: '#22C55E' }}>{scoreP?.label}</div>
              <div className="text-[10px] text-app-muted">seuil ±{seuil}¢</div>
            </div>
            <div className="bg-surface rounded-xl p-4 border border-app text-center">
              <div className="text-[11px] text-app-muted mb-1">Score qualité</div>
              <div className="text-2xl font-black" style={{ color: '#FF8B3D' }}>{scoreQ}%</div>
              <div className="text-[10px] text-app-muted">précision + stabilité</div>
            </div>
          </div>

          <Btn onClick={reinitialiser} variant="secondary" style={{ fontSize: 13, padding: '10px 20px', alignSelf: 'flex-start' }}>
            ↩ Réessayer
          </Btn>
        </div>
      )}

      {phase === 'resultats' && notes.length === 0 && (
        <div className="flex flex-col gap-2.5">
          <div className="text-sm text-app-muted">Aucune note détectée. Vérifier les réglages de segmentation.</div>
          <Btn onClick={reinitialiser} variant="secondary" style={{ fontSize: 13, padding: '10px 20px', alignSelf: 'flex-start' }}>
            ↩ Réessayer
          </Btn>
        </div>
      )}
    </div>
  )
}
