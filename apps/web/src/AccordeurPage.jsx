import { useState, useRef, useEffect, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PitchDetector } from 'pitchy'
import AccordeurStaff from './AccordeurStaff'
import SpectrePaneau from './SpectrePaneau'
import GenerateurAccord from './GenerateurAccord'
import JeuGamme from './JeuGamme'
import { INSTRUMENTS, loadInstrumentSamples, isOscillatorInstrument, playPhrase, playPhraseOscillator, phraseDurationMs } from './sampleEngine'
import {
  analyserBuffer, segmenter, calculerEcarts, courbebrute,
  scorePedagogique, scoreQualite, couleurJustesse,
  lireStructures, sauvegarderStructure, supprimerStructure,
  lireSessions, sauvegarderSession, supprimerSession,
  structureVersURL, urlVersStructure,
  transposerNom, computeSpectreParNote,
  TRANSPOSITIONS, uuid,
  NOTE_NAMES_FR, DEFAULT_STRUCTURES,
  frameRMS, preEmphasis, HZ_MIN, HZ_MAX,
  hzToMidi, midiToNoteName, centsTempere, centsCinqLimite, centsUtilisateur,
  buildEnharmonicScale, noteNameToPC, HARMONIQUE_OFFSETS,
} from './accordeurUtils'

// ─── Constantes canvas (toujours dark pour les graphes scientifiques) ───────────
const DIAPASON_DEFAULT        = 442
const SEUIL_DEFAULT           = 10
const SILENCE_MS_DEFAULT      = 40
const NOTE_JUMP_CENTS_DEFAULT = 30
const REFERENTIELS            = ['tempere', '5-limite', 'utilisateur']
const INTERVAL_NAMES          = ['m2','M2','m3','M3','P4','TT','P5','m6','M6','m7','M7','8ve']
const TEMPERAMENT_TEMPERE     = Array(12).fill(0)
const USER_TEMP_KEY           = 'acc_temperament_user'
const USER_PRESETS_KEY        = 'acc_temperament_presets'
// Canvas colors (dark, used only in canvas 2D API)
const C_BG      = '#0D1026'
const C_SURFACE = '#131929'
const C_ACCENT  = '#4A6CF7'
const C_MUTED   = '#4b5563'
const C_MUTED2  = '#6b7280'
const C_TRITONE = '#FF8B3D'

// ─── Bouton ─────────────────────────────────────────────────────────────────────
function Btn({ children, onClick, disabled, variant = 'primary', className = '' }) {
  const variants = {
    primary:   'bg-rhythm text-white',
    secondary: 'bg-surface text-rhythm border border-app',
    danger:    'bg-red-900 text-red-300',
    ghost:     'bg-transparent text-app-muted text-xs',
  }
  return (
    <button
      className={`rounded-xl font-bold transition-opacity px-5 py-3 text-sm border-none ${variants[variant]} ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

// ─── Graphe canvas centré sur 0 ─────────────────────────────────────────────────
function GrapheCents({ data, labelX, couleurs, tritoneMask, width = 460, height = 90, title }) {
  const ref = useRef(null)
  const [tooltip, setTooltip] = useState(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !data?.length) return
    const ctx2 = canvas.getContext('2d')
    const W = width, H = height
    ctx2.clearRect(0, 0, W, H)

    ctx2.fillStyle = C_SURFACE
    ctx2.fillRect(0, 0, W, H)

    ctx2.strokeStyle = '#374151'
    ctx2.lineWidth   = 1
    ctx2.setLineDash([4, 4])
    ctx2.beginPath()
    ctx2.moveTo(0, H / 2)
    ctx2.lineTo(W, H / 2)
    ctx2.stroke()
    ctx2.setLineDash([])

    const maxAbs = Math.max(30, ...data.map(d => Math.abs(d.value)))
    const scale  = (H / 2 - 8) / maxAbs

    if (Array.isArray(data[0]?.value)) {
      ctx2.strokeStyle = couleurs?.[0] ?? C_ACCENT
      ctx2.lineWidth   = 1.5
      ctx2.beginPath()
      data.forEach((pt, i) => {
        const x = (i / (data.length - 1)) * W
        const y = H / 2 - pt.value * scale
        i === 0 ? ctx2.moveTo(x, y) : ctx2.lineTo(x, y)
      })
      ctx2.stroke()
    } else {
      const barW = Math.max(8, W / data.length - 4)
      data.forEach((pt, i) => {
        const x    = (i + 0.5) * (W / data.length)
        const barH = Math.abs(pt.value) * scale
        const y    = pt.value >= 0 ? H / 2 - barH : H / 2
        ctx2.fillStyle = couleurs?.[i] ?? C_ACCENT
        ctx2.beginPath()
        ctx2.roundRect?.(x - barW / 2, y, barW, barH || 1, 3) ?? ctx2.rect(x - barW / 2, y, barW, barH || 1)
        ctx2.fill()

        if (tritoneMask?.[i]) {
          ctx2.fillStyle = C_TRITONE
          ctx2.font      = 'bold 11px Inter,sans-serif'
          ctx2.textAlign = 'center'
          const markerY  = pt.value >= 0 ? H / 2 - barH - 10 : H / 2 + barH + 12
          ctx2.fillText('?', x, Math.max(12, Math.min(H - 4, markerY)))
        }

        if (labelX?.[i]) {
          ctx2.fillStyle = C_MUTED2
          ctx2.font      = '9px Inter,sans-serif'
          ctx2.textAlign = 'center'
          ctx2.fillText(labelX[i], x, H - 2)
        }
      })
    }

    if (title) {
      ctx2.fillStyle = C_MUTED
      ctx2.font      = '9px Inter,sans-serif'
      ctx2.textAlign = 'left'
      ctx2.fillText(title, 4, 10)
    }

    ;[-30, -20, -10, 10, 20, 30].forEach(c => {
      const y = H / 2 - c * scale
      if (y < 0 || y > H) return
      ctx2.strokeStyle = '#1f2937'
      ctx2.lineWidth   = 0.5
      ctx2.beginPath()
      ctx2.moveTo(0, y)
      ctx2.lineTo(W, y)
      ctx2.stroke()
      ctx2.fillStyle  = '#374151'
      ctx2.font       = '8px Inter,sans-serif'
      ctx2.textAlign  = 'right'
      ctx2.fillText(`${c > 0 ? '+' : ''}${c}¢`, W - 2, y - 1)
    })
  }, [data, couleurs, labelX, tritoneMask, width, height, title])

  const handleMouseMove = (e) => {
    if (!tritoneMask?.some(Boolean) || !data?.length) { setTooltip(null); return }
    const rect = ref.current.getBoundingClientRect()
    const mouseX = (e.clientX - rect.left) * (width / rect.width)
    const idx = Math.floor(mouseX / (width / data.length))
    if (idx >= 0 && idx < data.length && tritoneMask[idx]) {
      setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    } else {
      setTooltip(null)
    }
  }

  return (
    <div className="relative inline-block">
      <canvas
        ref={ref} width={width} height={height}
        className="rounded-lg block"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
      />
      {tooltip && (
        <div
          className="absolute text-xs rounded-lg pointer-events-none z-10 leading-snug border"
          style={{
            left: tooltip.x + 10, top: Math.max(0, tooltip.y - 38),
            background: '#1f2937', color: '#f9fafb',
            padding: '5px 8px', maxWidth: 210, border: '1px solid #374151',
          }}
        >
          Intervalle ambigu en intonation pure — deux valeurs possibles (±9.8 ¢)
        </div>
      )}
    </div>
  )
}

// ─── VU-mètre arc SVG ────────────────────────────────────────────────────────────
function VuMetre({ cents, seuil }) {
  const CX = 120, CY = 112, R = 90
  const active = cents !== null && cents !== undefined
  const couleur = active ? couleurJustesse(cents, seuil) : '#374151'
  const rotation = active ? (cents / 50) * 90 : 0

  const svgPt = (deg, r) => ({
    x: CX + r * Math.cos(deg * Math.PI / 180),
    y: CY + r * Math.sin(deg * Math.PI / 180),
  })

  // Arc: 180° (left) → 270° (top) → 0° (right), clockwise, sweep=1, large-arc=0
  const arcPath = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`

  const ticks = [-50, -30, -20, -10, 0, 10, 20, 30, 50]

  return (
    <svg viewBox="0 0 240 130" style={{ width: '100%', maxWidth: 260, display: 'block', margin: '0 auto' }}>
      <path d={arcPath} fill="none" stroke="#1f2937" strokeWidth="10" strokeLinecap="round" />
      {ticks.map(c => {
        // -50¢ → SVG 180°, 0¢ → SVG 270° (top), +50¢ → SVG 0°/360°
        const angle = (270 + (c / 50) * 90 + 360) % 360
        const outer = svgPt(angle, R)
        const inner = svgPt(angle, R - (c === 0 || Math.abs(c) === 50 ? 14 : 8))
        return (
          <line key={c}
            x1={outer.x.toFixed(2)} y1={outer.y.toFixed(2)}
            x2={inner.x.toFixed(2)} y2={inner.y.toFixed(2)}
            stroke={c === 0 ? '#6b7280' : '#374151'} strokeWidth={c === 0 ? 1.5 : 1}
          />
        )
      })}
      <g transform={`rotate(${rotation}, ${CX}, ${CY})`} style={{ transition: 'transform 0.08s ease-out' }}>
        <line x1={CX} y1={CY} x2={CX} y2={CY - R + 10} stroke={couleur} strokeWidth="2.5" strokeLinecap="round" />
      </g>
      <circle cx={CX} cy={CY} r="6" fill="#374151" />
      <text x={CX - R - 6} y={CY + 16} fontSize="9" fill="#4b5563" textAnchor="middle">-50¢</text>
      <text x={CX} y={CY - R - 6} fontSize="9" fill="#4b5563" textAnchor="middle">0</text>
      <text x={CX + R + 6} y={CY + 16} fontSize="9" fill="#4b5563" textAnchor="middle">+50¢</text>
    </svg>
  )
}

// ─── Composant principal ─────────────────────────────────────────────────────────
export default function AccordeurPage() {
  const [searchParams] = useSearchParams()

  const [diapason,    setDiapason]    = useState(() => { const v = parseFloat(localStorage.getItem('acc_diapason')); return isNaN(v) ? DIAPASON_DEFAULT : v })
  const [transpoKey,  setTranspoKey]  = useState(() => localStorage.getItem('acc_transpo') || 'C')
  const [referentiel, setReferentiel] = useState(() => localStorage.getItem('acc_ref') || '5-limite')
  const [seuil,       setSeuil]       = useState(() => { const v = parseInt(localStorage.getItem('acc_seuil')); return isNaN(v) ? SEUIL_DEFAULT : v })
  const [structureId, setStructureId] = useState(null)

  const [silenceDurationMs, setSilenceDurationMs] = useState(() => { const v = parseInt(localStorage.getItem('acc_silence')); return isNaN(v) ? SILENCE_MS_DEFAULT : v })
  const [noteJumpCents,     setNoteJumpCents]     = useState(() => { const v = parseInt(localStorage.getItem('acc_noteJump')); return isNaN(v) ? NOTE_JUMP_CENTS_DEFAULT : v })
  const [clarityThreshold,  setClarityThreshold]  = useState(() => { const v = parseFloat(localStorage.getItem('acc_clarity')); return isNaN(v) ? 0.82 : v })
  const [gateLevel,         setGateLevel]         = useState(() => { const v = parseFloat(localStorage.getItem('acc_gate')); return isNaN(v) ? 0.02 : v })
  const gateLevelRef = useRef(0.02)

  const [modeLive,    setModeLive]   = useState(true)
  const [liveNote,    setLiveNote]   = useState(null)
  const [liveActive,  setLiveActive] = useState(false)
  const liveStreamRef   = useRef(null)
  const liveAudioCtxRef = useRef(null)
  const liveAnalyserRef = useRef(null)
  const liveRafRef      = useRef(null)
  const liveDetectorRef = useRef(null)
  const liveParamsRef   = useRef({})

  const [ouvertPanel,     setOuvertPanel]     = useState(null)
  const generatorPcsRef = useRef(new Set())

  const [showSpectre,    setShowSpectre]    = useState(false)
  const spectreAnalyserRef = useRef(null)
  const spectreParNoteRef  = useRef(null)
  const liveHzRef          = useRef(null)

  const [phase,  setPhase]  = useState('pret')
  const serieRef        = useRef([])
  const audioBufferRef  = useRef(null)
  const [notes,  setNotes]  = useState([])
  const [courbe, setCourbe] = useState([])
  const [scoreP, setScoreP] = useState(null)
  const [scoreQ, setScoreQ] = useState(null)
  const [erreur, setErreur] = useState(null)

  const [dirty,      setDirty]      = useState(false)
  const [vue,        setVue]        = useState('portee')
  const [showCourbe, setShowCourbe] = useState(true)
  const [showBarres, setShowBarres] = useState(true)
  const [showSigma,  setShowSigma]  = useState(true)

  const [structures,    setStructures]    = useState(() => lireStructures())
  const [showStructMgr, setShowStructMgr] = useState(false)
  const [newStructNom,  setNewStructNom]  = useState('')
  const [newStructRows, setNewStructRows] = useState([{ indexNote: 1, tonique: 'Do' }])

  const [sessions,     setSessions]    = useState(() => lireSessions())
  const [showReglages, setShowReglages] = useState(false)

  const [userTemperament, setUserTemperament] = useState(() => {
    try { const v = JSON.parse(localStorage.getItem(USER_TEMP_KEY)); return Array.isArray(v) && v.length === 12 ? v : TEMPERAMENT_TEMPERE.slice() } catch { return TEMPERAMENT_TEMPERE.slice() }
  })
  const [userPresets, setUserPresets] = useState(() => {
    try { return JSON.parse(localStorage.getItem(USER_PRESETS_KEY)) || [] } catch { return [] }
  })
  const [newPresetNom, setNewPresetNom] = useState('')
  const [importStr,    setImportStr]    = useState('')

  // ── Samples ──
  const [instrument,     setInstrument]     = useState(() => localStorage.getItem('accordeur_instrument_preference') || 'flute')
  const [sampleMap,      setSampleMap]      = useState(null)
  const [sampleLoadPct,  setSampleLoadPct]  = useState(0)
  const [sampleLoading,  setSampleLoading]  = useState(false)

  // Enregistrement brut (Blob MediaRecorder, éphémère)
  const recordingBlobRef    = useRef(null)
  const reecouteAudioRef    = useRef(null)
  const [hasRecordingBlob,  setHasRecordingBlob] = useState(false)

  // Version juste
  const [versionJustePlaying, setVersionJustePlaying] = useState(false)
  const stopVersionJusteRef   = useRef(null)

  const mediaRecorderRef = useRef(null)
  const chunksRef        = useRef([])
  const streamRef        = useRef(null)
  const vuRef            = useRef(null)
  const animRef          = useRef(null)
  const analyserRef      = useRef(null)

  useEffect(() => {
    const s = searchParams.get('s')
    if (!s) return
    const struct = urlVersStructure(s)
    sauvegarderStructure(struct)
    setStructures(lireStructures())
    setStructureId(struct.id)
  }, [])

  useEffect(() => {
    const t = searchParams.get('t')
    if (!t) return
    try {
      const offsets = JSON.parse(atob(t))
      if (Array.isArray(offsets) && offsets.length === 12) {
        setUserTemperament(offsets)
        setReferentiel('utilisateur')
      }
    } catch {}
  }, [])

  const recalculer = useCallback(() => {
    if (!audioBufferRef.current) return
    const s = analyserBuffer(audioBufferRef.current, { clarityThreshold, rmsGate: gateLevel })
    serieRef.current = s
    const struct    = [...DEFAULT_STRUCTURES, ...structures].find(x => x.id === structureId)
    const tonikMidi = struct ? (noteNameToPC(struct.toniques[0]?.tonique ?? 'Do') + 60) : 60
    const segs      = segmenter(s, diapason, { silenceDurationMs, noteJumpCents })
    const notesCalc = calculerEcarts(segs, referentiel, tonikMidi, diapason, userTemperament)
    const courbeB   = courbebrute(s, referentiel, tonikMidi, diapason, userTemperament)
    setNotes(notesCalc)
    setCourbe(courbeB)
    setScoreP(scorePedagogique(notesCalc, seuil))
    setScoreQ(scoreQualite(notesCalc))
    setDirty(false)
  }, [clarityThreshold, gateLevel, referentiel, seuil, silenceDurationMs, noteJumpCents, diapason, structureId, structures, userTemperament])

  useEffect(() => {
    if (!audioBufferRef.current) return
    setDirty(true)
  }, [clarityThreshold, gateLevel, referentiel, seuil, silenceDurationMs, noteJumpCents, diapason, structureId, structures, userTemperament])

  useEffect(() => {
    const struct = [...DEFAULT_STRUCTURES, ...structures].find(x => x.id === structureId)
    const tonicConcertName = struct?.toniques?.[0]?.tonique ?? 'Do'
    const tonicConcertPC   = noteNameToPC(tonicConcertName)
    const transpoOffset    = TRANSPOSITIONS[transpoKey]?.offset ?? 0
    const tonicDisplayPC   = ((tonicConcertPC + transpoOffset) % 12 + 12) % 12
    liveParamsRef.current = {
      diapason, referentiel, clarityThreshold, gateLevel, transpoOffset,
      enharmonicScale: buildEnharmonicScale(NOTE_NAMES_FR[tonicDisplayPC]),
      tonikMidi: struct ? (tonicConcertPC + 60) : null,
      userTemperament,
    }
  }, [diapason, referentiel, clarityThreshold, gateLevel, structureId, structures, transpoKey, userTemperament])

  useEffect(() => {
    localStorage.setItem('accordeur_instrument_preference', instrument)
    setSampleMap(null)
    setSampleLoadPct(0)
    setSampleLoading(true)
    loadInstrumentSamples(instrument, p => setSampleLoadPct(p))
      .then(map => { setSampleMap(map); setSampleLoading(false) })
      .catch(() => setSampleLoading(false))
  }, [instrument])

  // Stopper version juste si le référentiel change
  useEffect(() => { stopVersionJusteRef.current?.() }, [referentiel])

  // Cleanup version juste au démontage
  useEffect(() => () => stopVersionJusteRef.current?.(), [])

  useEffect(() => { localStorage.setItem('acc_diapason', diapason) }, [diapason])
  useEffect(() => { localStorage.setItem('acc_transpo',  transpoKey) }, [transpoKey])
  useEffect(() => { localStorage.setItem('acc_ref',      referentiel) }, [referentiel])
  useEffect(() => { localStorage.setItem(USER_TEMP_KEY,    JSON.stringify(userTemperament)) }, [userTemperament])
  useEffect(() => { localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(userPresets)) }, [userPresets])
  useEffect(() => { localStorage.setItem('acc_seuil',    seuil) }, [seuil])
  useEffect(() => { localStorage.setItem('acc_silence',  silenceDurationMs) }, [silenceDurationMs])
  useEffect(() => { localStorage.setItem('acc_noteJump', noteJumpCents) }, [noteJumpCents])
  useEffect(() => { localStorage.setItem('acc_clarity',  clarityThreshold) }, [clarityThreshold])
  useEffect(() => { localStorage.setItem('acc_gate',     gateLevel) }, [gateLevel])

  useEffect(() => {
    demarrerLive()
    return () => arreterLive()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const demarrerEnregistrement = useCallback(async () => {
    setErreur(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false })
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
        const ctx2  = canvas.getContext('2d')
        const data  = new Uint8Array(analyser.fftSize)
        analyser.getByteTimeDomainData(data)
        let sum = 0
        for (let k = 0; k < data.length; k++) { const s = (data[k] - 128) / 128; sum += s * s }
        const rms  = Math.sqrt(sum / data.length)
        const W    = canvas.width, H = canvas.height
        ctx2.clearRect(0, 0, W, H)
        ctx2.fillStyle = C_SURFACE
        ctx2.fillRect(0, 0, W, H)
        const barW = Math.min(rms * VU_SCALE * W, W)
        const grad = ctx2.createLinearGradient(0, 0, W, 0)
        grad.addColorStop(0,   '#34d399')
        grad.addColorStop(0.6, '#fbbf24')
        grad.addColorStop(1,   '#f87171')
        ctx2.fillStyle = grad
        ctx2.fillRect(0, 0, barW, H)
        const gateX = Math.min(gateLevelRef.current * VU_SCALE * W, W - 1)
        ctx2.strokeStyle = '#f9fafb'
        ctx2.lineWidth   = 1.5
        ctx2.setLineDash([3, 3])
        ctx2.beginPath()
        ctx2.moveTo(gateX, 0)
        ctx2.lineTo(gateX, H)
        ctx2.stroke()
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
  }, [])

  const arreterEnregistrement = useCallback(async () => {
    setPhase('analyse')
    cancelAnimationFrame(animRef.current)
    const recorder = mediaRecorderRef.current
    const stream   = streamRef.current
    const { audioCtx } = analyserRef.current ?? {}
    await new Promise(resolve => { recorder.onstop = resolve; recorder.stop() })
    stream.getTracks().forEach(t => t.stop())
    audioCtx?.close()

    const blob       = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
    recordingBlobRef.current = blob
    setHasRecordingBlob(true)
    const arrayBuf   = await blob.arrayBuffer()
    const decodeCtx  = new AudioContext()
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
    const struct    = [...DEFAULT_STRUCTURES, ...structures].find(s => s.id === structureId)
    const tonikMidi = struct ? (noteNameToPC(struct.toniques[0]?.tonique ?? 'Do') + 60) : 60
    const segments  = segmenter(serieCalc, diapason, { silenceDurationMs, noteJumpCents })
    const notesAv   = calculerEcarts(segments, referentiel, tonikMidi, diapason, userTemperament)
    const courbeB   = courbebrute(serieCalc, referentiel, tonikMidi, diapason, userTemperament)

    audioBufferRef.current = audioBuffer
    serieRef.current = serieCalc
    spectreParNoteRef.current = computeSpectreParNote(audioBuffer, notesAv)
    setNotes(notesAv)
    setCourbe(courbeB)
    setScoreP(scorePedagogique(notesAv, seuil))
    setScoreQ(scoreQualite(notesAv))
    setDirty(false)
    setPhase('resultats')
  }, [structures, structureId, referentiel, diapason, seuil, silenceDurationMs, noteJumpCents, clarityThreshold, gateLevel])

  const demarrerLive = useCallback(async () => {
    setErreur(null)
    try {
      const stream   = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false })
      liveStreamRef.current = stream
      const audioCtx = new AudioContext()
      liveAudioCtxRef.current = audioCtx
      const source   = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 2048
      source.connect(analyser)
      liveAnalyserRef.current = analyser
      liveDetectorRef.current = PitchDetector.forFloat32Array(2048)

      const spectreAnalyser = audioCtx.createAnalyser()
      spectreAnalyser.fftSize = 4096
      source.connect(spectreAnalyser)
      spectreAnalyserRef.current = spectreAnalyser

      const buf = new Float32Array(2048)
      let lastUpdate = 0
      const loop = () => {
        liveRafRef.current = requestAnimationFrame(loop)
        const now = performance.now()
        if (now - lastUpdate < 100) return
        lastUpdate = now
        analyser.getFloatTimeDomainData(buf)
        const { diapason: d, referentiel: r, clarityThreshold: ct, gateLevel: gl, tonikMidi, transpoOffset: tOff, enharmonicScale: scale, userTemperament: uTemp } = liveParamsRef.current
        const rms = frameRMS(buf)
        if (rms < gl) return
        const emp = preEmphasis(buf)
        const [hz, clarity] = liveDetectorRef.current.findPitch(emp, audioCtx.sampleRate)
        if (clarity < ct || hz < HZ_MIN || hz > HZ_MAX) return
        const midi        = Math.round(hzToMidi(hz, d))
        const pcRaw = ((midi % 12) + 12) % 12
        if (generatorPcsRef.current?.size && generatorPcsRef.current.has(pcRaw)) return
        const midiDisplay = midi + (tOff ?? 0)
        const pc          = ((midiDisplay % 12) + 12) % 12
        const octave      = Math.floor(midiDisplay / 12) - 1
        const nom         = scale?.[pc] ?? midiToNoteName(midi).name
        const muCents = tonikMidi !== null && r === '5-limite'
          ? centsCinqLimite(hz, tonikMidi, d)
          : tonikMidi !== null && r === 'utilisateur'
            ? centsUtilisateur(hz, tonikMidi, d, uTemp)
            : centsTempere(hz, d)
        liveHzRef.current = hz
        setLiveNote({ nom, octave, muCents })
      }
      loop()
      setLiveActive(true)
    } catch (e) {
      setErreur('Microphone inaccessible : ' + e.message)
    }
  }, [])

  const arreterLive = useCallback(() => {
    cancelAnimationFrame(liveRafRef.current)
    liveStreamRef.current?.getTracks().forEach(t => t.stop())
    liveAudioCtxRef.current?.close()
    spectreAnalyserRef.current = null
    liveHzRef.current = null
    setLiveActive(false)
    setLiveNote(null)
  }, [])

  const basculerMode = useCallback((live) => {
    if (!live) arreterLive()
    setModeLive(live)
  }, [arreterLive])

  const chargerFichier = useCallback(async (file) => {
    if (!file) return
    setErreur(null)
    setPhase('analyse')
    try {
      const arrayBuf  = await file.arrayBuffer()
      const decodeCtx = new AudioContext()
      let audioBuffer
      try {
        audioBuffer = await decodeCtx.decodeAudioData(arrayBuf)
      } catch (e) {
        setErreur('Format audio non supporté : ' + e.message)
        setPhase('pret')
        decodeCtx.close()
        return
      }
      decodeCtx.close()

      const struct    = [...DEFAULT_STRUCTURES, ...structures].find(s => s.id === structureId)
      const tonikMidi = struct ? (noteNameToPC(struct.toniques[0]?.tonique ?? 'Do') + 60) : 60
      const serieCalc = analyserBuffer(audioBuffer, { clarityThreshold, rmsGate: gateLevel })
      const segments  = segmenter(serieCalc, diapason, { silenceDurationMs, noteJumpCents })
      const notesAv   = calculerEcarts(segments, referentiel, tonikMidi, diapason, userTemperament)
      const courbeB   = courbebrute(serieCalc, referentiel, tonikMidi, diapason, userTemperament)

      audioBufferRef.current = audioBuffer
      serieRef.current = serieCalc
      setNotes(notesAv)
      setCourbe(courbeB)
      setScoreP(scorePedagogique(notesAv, seuil))
      setScoreQ(scoreQualite(notesAv))
      setDirty(false)
      setPhase('resultats')
    } catch (e) {
      setErreur('Erreur lecture fichier : ' + e.message)
      setPhase('pret')
    }
  }, [structures, structureId, referentiel, diapason, seuil, silenceDurationMs, noteJumpCents, clarityThreshold, gateLevel])

  const sauvegarderResultats = useCallback(() => {
    const struct = structures.find(s => s.id === structureId)
    const session = {
      id: uuid(), date: new Date().toISOString(),
      structureId: structureId ?? null, structureNom: struct?.nom ?? '—',
      referentiel, diapason, seuilCents: seuil,
      scoreNotes: scoreP?.label ?? '—', scoreQualite: scoreQ ?? 0,
      notes: notes.map(n => ({
        nom: n.nom, octave: n.octave, debutMs: n.debutMs, finMs: n.finMs,
        muCents: parseFloat(n.muCents.toFixed(2)), sigmaCents: parseFloat(n.sigmaCents.toFixed(2)),
      })),
      courbeBreute: courbe.slice(0, 500),
    }
    sauvegarderSession(session)
    setSessions(lireSessions())
  }, [notes, courbe, scoreP, scoreQ, structureId, structures, referentiel, diapason, seuil])

  const ajouterStructure = useCallback(() => {
    if (!newStructNom.trim()) return
    const s = { id: uuid(), nom: newStructNom.trim(), toniques: newStructRows, createdAt: new Date().toISOString(), public: true }
    sauvegarderStructure(s)
    setStructures(lireStructures())
    setNewStructNom('')
    setNewStructRows([{ indexNote: 1, tonique: 'Do' }])
  }, [newStructNom, newStructRows])

  const supprimerStruct = useCallback(id => {
    supprimerStructure(id)
    setStructures(lireStructures())
    if (structureId === id) setStructureId(null)
  }, [structureId])

  const _tonicStruct      = structureId ? [...DEFAULT_STRUCTURES, ...structures].find(s => s.id === structureId) : null
  const _tonicConcertName = _tonicStruct?.toniques?.[0]?.tonique ?? 'Do'
  const _tonicConcertPC   = noteNameToPC(_tonicConcertName)
  const _transpoOffset    = TRANSPOSITIONS[transpoKey]?.offset ?? 0
  const _tonicDisplayPC   = ((_tonicConcertPC + _transpoOffset) % 12 + 12) % 12
  const _tonicDisplayName = NOTE_NAMES_FR[_tonicDisplayPC]
  const enharmonicScale   = buildEnharmonicScale(_tonicDisplayName)

  const couleurs = notes.map(n => couleurJustesse(n.muCents, seuil))
  const labelsX  = notes.map(n => {
    const midiDisp = n.midiCible + _transpoOffset
    const pc       = ((midiDisp % 12) + 12) % 12
    const oct      = Math.floor(midiDisp / 12) - 1
    return `${enharmonicScale[pc]}${oct}`
  })
  const dataBarres = notes.map((n, i) => ({ value: n.muCents, label: labelsX[i] }))
  const dataSigma  = notes.map((n, i) => ({ value: n.sigmaCents, label: labelsX[i] }))
  const dataCourbe = courbe.map(p => ({ value: p.cents }))

  const muMoyen    = notes.length ? (notes.reduce((a, n) => a + n.muCents, 0) / notes.length).toFixed(1) : null
  const sigmaMoyen = notes.length ? (notes.reduce((a, n) => a + n.sigmaCents, 0) / notes.length).toFixed(1) : null

  const transpoNom = (nom) => {
    const idx = noteNameToPC(nom)
    const offset = TRANSPOSITIONS[transpoKey]?.offset ?? 0
    if (offset === 0) return nom
    return NOTE_NAMES_FR[((idx + offset) % 12 + 12) % 12]
  }

  const _selectedStruct = structureId ? [...DEFAULT_STRUCTURES, ...structures].find(s => s.id === structureId) : null
  const urlStructure = _selectedStruct && !_selectedStruct.readOnly
    ? `${window.location.origin}/accordeur?s=${structureVersURL(_selectedStruct)}`
    : null

  const inputCls = "w-full rounded-lg px-2.5 py-1.5 text-sm text-app border border-app bg-app outline-none"

  return (
    <div className="bg-app min-h-dvh flex flex-col items-center px-4 py-5">
      <div className="w-full max-w-xl">

        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-5">
          <Link to="/" className="bg-surface border border-app rounded-lg px-3 py-1.5 text-xs font-bold no-underline text-app">
            ← Tessitura
          </Link>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold m-0" style={{ color: '#FF8B3D' }}>Accordeur</h2>
            <Link
              to="/accordeur/generateur"
              title="Générateur d'accord"
              className="flex items-center justify-center rounded-lg border border-app bg-surface no-underline"
              style={{ width: 32, height: 32, color: '#FF8B3D' }}
            >
              <svg width="18" height="20" viewBox="0 0 20 22" fill="none">
                {[3, 8, 13, 18].map(x => (
                  <line key={x} x1={x} y1="1" x2={x} y2="21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                ))}
                {[5, 10, 15, 20].map(y => (
                  <line key={y} x1="1" y1={y} x2="20" y2={y} stroke="currentColor" strokeWidth="1.5" />
                ))}
                <circle cx="3" cy="7.5" r="2.5" fill="currentColor" />
                <circle cx="8" cy="12.5" r="2.5" fill="currentColor" />
                <circle cx="13" cy="7.5" r="2.5" fill="currentColor" />
                <circle cx="18" cy="2.5" r="2.5" fill="currentColor" />
              </svg>
            </Link>
          </div>
          <button
            onClick={() => setShowReglages(v => !v)}
            title="Réglages"
            className="flex items-center justify-center rounded-lg border border-app bg-surface cursor-pointer transition-opacity"
            style={{ width: 32, height: 32, color: 'var(--text-muted)', background: showReglages ? 'var(--surface-2)' : undefined }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </div>

        {/* ── Drawer Réglages (overlay) ── */}
        {showReglages && (
          <>
            <div
              onClick={() => setShowReglages(false)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 40 }}
            />
            <div style={{
              position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 50,
              width: 'min(420px, 94vw)',
              background: 'var(--bg)', borderLeft: '1px solid var(--border-c)',
              overflowY: 'auto', padding: '20px 16px',
            }}>
              {/* Titre + fermer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>Réglages</span>
                <button
                  onClick={() => setShowReglages(false)}
                  className="bg-transparent border-none cursor-pointer text-app-muted text-xl"
                  style={{ lineHeight: 1 }}
                >✕</button>
              </div>

              {/* ── Suivi sessions ── */}
              <details open className="mb-4">
                <summary className="cursor-pointer text-xs font-semibold text-app-muted mb-2 list-none flex items-center gap-1">
                  Suivi des sessions
                </summary>
                <div className="mt-2">
                  {sessions.length === 0
                    ? <p className="text-app-muted text-xs">Aucune session sauvegardée.</p>
                    : (
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-xs">
                          <thead>
                            <tr className="text-app-muted border-b border-app">
                              {['Date', 'Structure', 'Notes', 'Qualité', 'Réf.', 'Seuil', ''].map(h => (
                                <th key={h} className="px-1 py-1 text-left font-semibold">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {[...sessions].reverse().map(s => (
                              <tr key={s.id} className="border-b border-app">
                                <td className="px-1 py-1.5 text-app-muted">{new Date(s.date).toLocaleDateString('fr')}</td>
                                <td className="px-1 py-1.5 text-app">{s.structureNom}</td>
                                <td className="px-1 py-1.5 text-success">{s.scoreNotes}</td>
                                <td className="px-1 py-1.5 text-pitch">{s.scoreQualite}%</td>
                                <td className="px-1 py-1.5 text-app-muted">{s.referentiel}</td>
                                <td className="px-1 py-1.5 text-app-muted">±{s.seuilCents}¢</td>
                                <td className="px-1 py-1.5">
                                  <button onClick={() => { supprimerSession(s.id); setSessions(lireSessions()) }}
                                    className="bg-transparent border-none text-red-400 cursor-pointer text-sm" style={{ minHeight: 'auto' }}>×</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                </div>
              </details>

              <hr style={{ border: 'none', borderTop: '1px solid var(--border-c)', margin: '16px 0' }} />

              {/* ── Réglages accord ── */}
              <details className="mb-4">
                <summary className="cursor-pointer text-xs font-semibold text-app-muted list-none mb-2">Réglages accord</summary>
                <div className="mt-2">
                  <div className="flex gap-2.5 items-end">
                    <label className="text-xs text-app-muted flex-none">
                      Diapason
                      <div className="flex items-center gap-1 mt-1">
                        <input type="number" min="400" max="480" step="0.1" value={diapason}
                          onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) setDiapason(v) }}
                          className="w-16 bg-app text-app border border-app rounded-md px-2 py-1.5 text-sm font-bold" />
                        <span className="text-app-muted text-xs">Hz</span>
                      </div>
                    </label>
                    <label className="text-xs text-app-muted flex-1">
                      Transposition
                      <select value={transpoKey} onChange={e => setTranspoKey(e.target.value)}
                        className="block mt-1 w-full bg-app text-app border border-app rounded-md px-2 py-1.5 text-xs">
                        {Object.entries(TRANSPOSITIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                    </label>
                    <label className="text-xs text-app-muted flex-none">
                      Seuil justesse
                      <div className="flex items-center gap-1 mt-1">
                        <input type="number" min="1" max="50" step="1" value={seuil}
                          onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v)) setSeuil(v) }}
                          className="w-12 bg-app text-app border border-app rounded-md px-2 py-1.5 text-sm font-bold" />
                        <span className="text-app-muted text-xs">¢</span>
                      </div>
                    </label>
                  </div>
                </div>
              </details>

              {/* ── Réglages segmentation ── */}
              <details className="mb-4">
                <summary className="cursor-pointer text-xs font-semibold text-app-muted list-none mb-2">Réglages segmentation</summary>
                <div className="mt-2">
                  <div className="flex gap-2.5 items-end mb-3">
                    {[
                      { label: 'Silence', val: silenceDurationMs, set: setSilenceDurationMs, min: 20, max: 300, step: 5, unit: 'ms', type: 'int' },
                      { label: 'Saut note', val: noteJumpCents, set: setNoteJumpCents, min: 20, max: 200, step: 5, unit: '¢', type: 'int' },
                      { label: 'Gate RMS', val: gateLevel, set: (v) => { setGateLevel(v); gateLevelRef.current = v }, min: 0, max: 0.15, step: 0.005, unit: '', type: 'float' },
                    ].map(({ label, val, set, min, max, step, unit, type }) => (
                      <label key={label} className="text-xs text-app-muted flex-1">
                        {label}
                        <div className="flex items-center gap-1 mt-1">
                          <input type="number" min={min} max={max} step={step} value={val}
                            onChange={e => { const v = type === 'int' ? parseInt(e.target.value) : parseFloat(e.target.value); if (!isNaN(v)) set(v) }}
                            className="w-full bg-app text-app border border-app rounded-md px-2 py-1.5 text-sm font-bold" />
                          {unit && <span className="text-app-muted text-xs whitespace-nowrap">{unit}</span>}
                        </div>
                      </label>
                    ))}
                  </div>
                  <label className="text-xs text-app-muted">
                    Seuil clarté
                    <div className="flex items-center gap-2 mt-1">
                      <input type="range" min="0.5" max="1.0" step="0.01" value={clarityThreshold}
                        onChange={e => setClarityThreshold(Number(e.target.value))}
                        className="flex-1" style={{ accentColor: '#FF8B3D' }} />
                      <span className="text-app font-bold min-w-9">{clarityThreshold.toFixed(2)}</span>
                    </div>
                    <div className="text-app-muted text-[10px] mt-0.5">Haut = moins de faux positifs</div>
                  </label>
                  {phase === 'resultats' && (
                    <div className="mt-2 text-[10px] text-app-muted">Modification active le bouton ↻ Recalculer sur la portée.</div>
                  )}
                </div>
              </details>

              <hr style={{ border: 'none', borderTop: '1px solid var(--border-c)', margin: '16px 0' }} />

              {/* ── Tempérament utilisateur ── */}
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', marginBottom: 12 }}>Tempérament</div>

                {/* Préréglages */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                  <select
                    onChange={e => {
                      const v = e.target.value
                      if (v === 'tempere') setUserTemperament(TEMPERAMENT_TEMPERE.slice())
                      else if (v === 'harmonique') setUserTemperament([...HARMONIQUE_OFFSETS])
                      else {
                        const p = userPresets.find(x => x.id === v)
                        if (p) setUserTemperament([...p.offsets])
                      }
                    }}
                    defaultValue=""
                    className="flex-1 bg-app text-app border border-app rounded-md px-2 py-1.5 text-xs"
                  >
                    <option value="" disabled>Charger un préréglage…</option>
                    <option value="tempere">Tempéré égal</option>
                    <option value="harmonique">Harmonique (5-limite)</option>
                    {userPresets.length > 0 && <option disabled>──────────</option>}
                    {userPresets.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
                  </select>
                </div>

                {/* 12 sliders */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', marginBottom: 14 }}>
                  {INTERVAL_NAMES.map((name, i) => (
                    <label key={i} style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span>{name}</span>
                        <span style={{ fontWeight: 700, color: userTemperament[i] === 0 ? 'var(--text-muted)' : '#FF8B3D', minWidth: 36, textAlign: 'right' }}>
                          {userTemperament[i] > 0 ? '+' : ''}{userTemperament[i].toFixed(1)}¢
                        </span>
                      </div>
                      <input
                        type="range" min="-50" max="50" step="0.5"
                        value={userTemperament[i]}
                        onChange={e => {
                          const v = parseFloat(e.target.value)
                          setUserTemperament(prev => { const next = [...prev]; next[i] = v; return next })
                        }}
                        style={{ width: '100%', accentColor: '#FF8B3D' }}
                      />
                    </label>
                  ))}
                </div>

                {/* Reset */}
                <button
                  onClick={() => setUserTemperament(TEMPERAMENT_TEMPERE.slice())}
                  className="text-xs text-app-muted bg-transparent border border-app rounded-md px-3 py-1.5 cursor-pointer mb-3"
                >Réinitialiser à 0</button>

                {/* Sauvegarder preset */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  <input
                    value={newPresetNom}
                    onChange={e => setNewPresetNom(e.target.value)}
                    placeholder="Nom du tempérament…"
                    className="flex-1 bg-app text-app border border-app rounded-md px-2 py-1.5 text-xs"
                  />
                  <button
                    disabled={!newPresetNom.trim()}
                    onClick={() => {
                      const p = { id: `tp-${Date.now()}`, nom: newPresetNom.trim(), offsets: [...userTemperament] }
                      setUserPresets(prev => [...prev, p])
                      setNewPresetNom('')
                    }}
                    className="bg-app text-app border border-app rounded-md px-3 py-1.5 text-xs cursor-pointer font-bold"
                    style={{ opacity: newPresetNom.trim() ? 1 : 0.4 }}
                  >Sauvegarder</button>
                </div>

                {/* Gérer presets */}
                {userPresets.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    {userPresets.map(p => (
                      <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 11 }}>
                        <span style={{ flex: 1, color: 'var(--text)' }}>{p.nom}</span>
                        <button
                          onClick={() => setUserTemperament([...p.offsets])}
                          className="bg-transparent border border-app rounded px-2 py-0.5 text-[10px] cursor-pointer text-app-muted"
                        >Charger</button>
                        <button
                          onClick={() => setUserPresets(prev => prev.filter(x => x.id !== p.id))}
                          className="bg-transparent border-none text-red-400 cursor-pointer text-sm"
                          style={{ minHeight: 'auto' }}
                        >×</button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Export / Import */}
                <div style={{ borderTop: '1px solid var(--border-c)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button
                    onClick={() => {
                      const encoded = btoa(JSON.stringify(userTemperament))
                      const url = `${window.location.origin}/accordeur?t=${encoded}`
                      navigator.clipboard.writeText(url)
                    }}
                    className="text-xs bg-app border border-app rounded-md px-3 py-1.5 cursor-pointer text-app-muted"
                  >Copier le lien de partage</button>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      value={importStr}
                      onChange={e => setImportStr(e.target.value)}
                      placeholder="Coller un lien ou code base64…"
                      className="flex-1 bg-app text-app border border-app rounded-md px-2 py-1.5 text-xs"
                    />
                    <button
                      onClick={() => {
                        try {
                          const raw = importStr.includes('?t=') ? importStr.split('?t=')[1].split('&')[0] : importStr.trim()
                          const offsets = JSON.parse(atob(raw))
                          if (Array.isArray(offsets) && offsets.length === 12) {
                            setUserTemperament(offsets)
                            setImportStr('')
                          }
                        } catch {}
                      }}
                      disabled={!importStr.trim()}
                      className="bg-app border border-app rounded-md px-3 py-1.5 text-xs cursor-pointer text-app-muted font-bold"
                      style={{ opacity: importStr.trim() ? 1 : 0.4 }}
                    >Importer</button>
                  </div>
                </div>
              </div>

            </div>
          </>
        )}

        {/* ── Zone enregistrement / Live ── */}
        <div className="bg-surface border border-app rounded-2xl p-6 mb-4 text-center">
          {/* Toggle Enregistrer / Live */}
          <div className="flex gap-1.5 mb-5">
            {[['rec', '● Enregistrer'], ['live', '♩ Live']].map(([v, label]) => (
              <button key={v}
                onClick={() => basculerMode(v === 'live')}
                className="flex-1 py-2 rounded-lg border-none font-bold text-sm cursor-pointer transition-colors"
                style={{
                  background: modeLive === (v === 'live') ? '#FF8B3D' : 'var(--surface-2)',
                  color:      modeLive === (v === 'live') ? '#fff' : 'var(--text-muted)',
                }}
              >{label}</button>
            ))}
            {(modeLive || phase === 'resultats') && (
              <button
                onClick={() => setShowSpectre(v => !v)}
                className="px-3 py-2 rounded-lg font-bold text-xs cursor-pointer border transition-colors"
                style={{
                  borderColor: showSpectre ? '#FF8B3D' : 'var(--border-c)',
                  background:  showSpectre ? 'rgba(255,139,61,0.12)' : 'var(--surface-2)',
                  color:       showSpectre ? '#FF8B3D' : 'var(--text-muted)',
                  whiteSpace: 'nowrap',
                }}
              >◈ Spectre</button>
            )}
          </div>

          {/* ── Live ── */}
          {modeLive && (() => {
            const liveCouleur = liveNote ? couleurJustesse(liveNote.muCents, seuil) : 'var(--text-muted)'
            const centsLabel  = liveNote ? `${liveNote.muCents >= 0 ? '+' : ''}${liveNote.muCents.toFixed(1)}¢` : '—'
            return (
              <>
                {!liveActive
                  ? <Btn onClick={demarrerLive} className="text-base px-9 py-3">▶ Démarrer</Btn>
                  : <Btn variant="secondary" onClick={arreterLive} className="text-sm">■ Arrêter</Btn>
                }
                <div className="mt-7 mb-2">
                  <div className="text-6xl font-black tracking-widest leading-none" style={{ color: liveCouleur }}>
                    {liveNote ? liveNote.nom : '—'}
                    <span className="text-2xl font-normal text-app-muted ml-1.5">
                      {liveNote ? liveNote.octave : ''}
                    </span>
                  </div>
                  <div className="text-2xl font-bold mt-1.5" style={{ color: liveCouleur }}>{centsLabel}</div>
                </div>
                <VuMetre cents={liveNote?.muCents ?? null} seuil={seuil} />
              </>
            )
          })()}

          {/* ── Enregistrement ── */}
          {!modeLive && phase === 'pret' && (
            <>
              <div className="text-app-muted text-sm mb-5">Prêt à enregistrer</div>
              <Btn onClick={demarrerEnregistrement} className="text-base px-10 py-3.5">● Enregistrer</Btn>
              <div className="mt-3.5 flex items-center justify-center gap-2">
                <span className="text-app-muted text-xs">ou</span>
                <label className="cursor-pointer text-xs text-app-muted font-semibold px-3.5 py-1.5 rounded-lg border border-app bg-app">
                  Charger un fichier audio
                  <input type="file" accept="audio/*" className="hidden" onChange={e => chargerFichier(e.target.files?.[0])} />
                </label>
              </div>
            </>
          )}

          {!modeLive && phase === 'enregistrement' && (
            <>
              <div className="text-red-400 font-bold text-sm mb-3">● Enregistrement en cours…</div>
              <canvas ref={vuRef} width={360} height={20} className="rounded-xl block mx-auto mb-5" />
              <Btn onClick={arreterEnregistrement} variant="secondary" className="text-base px-8 py-3">■ Arrêter</Btn>
            </>
          )}

          {!modeLive && phase === 'analyse' && (
            <div className="text-app-muted text-sm py-5">Analyse en cours…</div>
          )}

          {!modeLive && phase === 'resultats' && (
            <Btn variant="secondary" onClick={() => {
              stopVersionJusteRef.current?.()
              recordingBlobRef.current = null
              setHasRecordingBlob(false)
              setPhase('pret'); setNotes([]); setCourbe([])
              serieRef.current = []; audioBufferRef.current = null
            }} className="text-sm">
              ↺ Nouveau
            </Btn>
          )}

          {erreur && <div className="text-red-400 text-xs mt-3">{erreur}</div>}

          {/* ── Instrument + Réécouter + Version juste (mode enregistrement) ── */}
          {!modeLive && (
            <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border-c)' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Instrument</span>
                <select
                  value={instrument}
                  onChange={e => setInstrument(e.target.value)}
                  className="flex-1 bg-app text-app border border-app rounded-md px-2 py-1.5 text-xs"
                >
                  {Object.entries(INSTRUMENTS).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
              {sampleLoading && (
                <div style={{ height: 3, borderRadius: 2, background: 'var(--border-c)', overflow: 'hidden', marginBottom: 10 }}>
                  <div style={{ height: '100%', width: `${Math.round(sampleLoadPct * 100)}%`, background: '#FF8B3D', borderRadius: 2, transition: 'width 0.15s' }} />
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  disabled={!hasRecordingBlob}
                  onClick={() => {
                    if (!recordingBlobRef.current) return
                    reecouteAudioRef.current?.pause()
                    const url   = URL.createObjectURL(recordingBlobRef.current)
                    const audio = new Audio(url)
                    audio.play()
                    audio.onended = () => URL.revokeObjectURL(url)
                    reecouteAudioRef.current = audio
                  }}
                  className="flex-1 rounded-xl font-bold text-xs py-2 border border-app cursor-pointer transition-opacity"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', opacity: hasRecordingBlob ? 1 : 0.4 }}
                >▶ Réécouter</button>
                <button
                  disabled={!notes.length || sampleLoading}
                  onClick={() => {
                    if (versionJustePlaying) {
                      stopVersionJusteRef.current?.()
                      return
                    }
                    if (!notes.length) return
                    const struct    = [...DEFAULT_STRUCTURES, ...structures].find(x => x.id === structureId)
                    const tonikMidi = struct ? (noteNameToPC(struct.toniques[0]?.tonique ?? 'Do') + 60) : 60
                    const ctx = new AudioContext()
                    const isOsc = isOscillatorInstrument(instrument)
                    const srcs = isOsc
                      ? playPhraseOscillator(ctx, notes, referentiel, tonikMidi, diapason)
                      : (sampleMap ? playPhrase(ctx, notes, sampleMap, referentiel, tonikMidi, diapason) : [])
                    setVersionJustePlaying(true)
                    const totalMs = phraseDurationMs(notes)
                    const timer = setTimeout(() => {
                      try { ctx.close() } catch {}
                      setVersionJustePlaying(false)
                      stopVersionJusteRef.current = null
                    }, totalMs + 500)
                    stopVersionJusteRef.current = () => {
                      clearTimeout(timer)
                      srcs.forEach(s => { try { s.stop() } catch {} })
                      try { ctx.close() } catch {}
                      setVersionJustePlaying(false)
                      stopVersionJusteRef.current = null
                    }
                  }}
                  className="flex-1 rounded-xl font-bold text-xs py-2 border-none cursor-pointer transition-opacity"
                  style={{
                    background: versionJustePlaying ? '#7f1d1d' : '#FF8B3D',
                    color: '#fff',
                    opacity: (!notes.length || sampleLoading) ? 0.4 : 1,
                    cursor: (!notes.length || sampleLoading) ? 'not-allowed' : 'pointer',
                  }}
                >
                  {versionJustePlaying ? '■ Arrêter' : sampleLoading ? 'Chargement…' : '♩ Version juste'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Résultats ── */}
        {phase === 'resultats' && notes.length > 0 && (
          <>
            <div className="flex gap-1.5 mb-3">
              {[['portee', 'Portée'], ['tableau', 'Tableau']].map(([v, label]) => (
                <button key={v} onClick={() => setVue(v)}
                  className="px-4 py-1.5 rounded-lg border font-bold text-xs cursor-pointer"
                  style={{
                    background: vue === v ? '#FF8B3D' : 'var(--surface)',
                    color:      vue === v ? '#fff' : 'var(--text-muted)',
                    borderColor: vue === v ? '#FF8B3D' : 'var(--border-c)',
                  }}
                >{label}</button>
              ))}
              <span className="ml-auto text-app-muted text-xs self-center">
                μ <strong className="text-app">{muMoyen}¢</strong>
                &nbsp;&nbsp;σ <strong className="text-app">{sigmaMoyen}¢</strong>
              </span>
            </div>

            {vue === 'portee' && (
              <div className="relative bg-surface border border-app rounded-xl p-4 mb-4">
                <AccordeurStaff notes={notes} seuil={seuil} transpoKey={transpoKey} tonicName={_tonicDisplayName} containerWidth={524} height={180} notePx={window.innerWidth <= 540 ? 26 : 52} />
                {dirty && (
                  <div className="absolute inset-0 rounded-xl flex items-center justify-center" style={{ background: 'rgba(13,16,38,0.72)' }}>
                    <Btn onClick={recalculer} className="text-sm px-7 py-2.5">↻ Recalculer</Btn>
                  </div>
                )}
              </div>
            )}

            {vue === 'tableau' && (
              <div className="relative bg-surface border border-app rounded-xl p-4 mb-4">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="text-app-muted border-b border-app">
                      <th className="px-2 py-1 text-left font-semibold">Note</th>
                      <th className="px-2 py-1 text-right font-semibold">μ (¢)</th>
                      <th className="px-2 py-1 text-right font-semibold">σ (¢)</th>
                      <th className="px-2 py-1 text-left font-semibold">Écart</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notes.map((note, i) => {
                      const couleur  = couleurJustesse(note.muCents, seuil)
                      const barScale = Math.min(Math.abs(note.muCents) / 30, 1)
                      return (
                        <tr key={i} className="border-b border-app">
                          <td className="px-2 py-2 font-bold" style={{ color: couleur }}>
                            {labelsX[i]}
                          </td>
                          <td className="px-2 py-2 text-right font-bold" style={{ color: couleur }}>
                            {note.muCents >= 0 ? '+' : ''}{note.muCents.toFixed(1)}
                          </td>
                          <td className="px-2 py-2 text-right text-app-muted">
                            {note.sigmaCents.toFixed(1)}
                          </td>
                          <td className="px-2 py-2 w-28">
                            <div className="relative h-2 bg-app rounded">
                              <div style={{
                                position: 'absolute',
                                left:   note.muCents < 0 ? `${(0.5 - barScale / 2) * 100}%` : '50%',
                                width:  `${barScale * 50}%`,
                                height: '100%',
                                background: couleur, borderRadius: 4, opacity: 0.8,
                              }} />
                              <div className="absolute left-1/2 top-0 w-px h-full bg-app-muted" />
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {dirty && (
                  <div className="absolute inset-0 rounded-xl flex items-center justify-center" style={{ background: 'rgba(13,16,38,0.72)' }}>
                    <Btn onClick={recalculer} className="text-sm px-7 py-2.5">↻ Recalculer</Btn>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-surface border border-app rounded-xl p-4 text-center">
                <div className="text-xs text-app-muted mb-1">Notes justes</div>
                <div className="text-3xl font-black text-success">{scoreP?.label}</div>
                <div className="text-xs text-app-muted">seuil ±{seuil}¢</div>
              </div>
              <div className="bg-surface border border-app rounded-xl p-4 text-center">
                <div className="text-xs text-app-muted mb-1">Score qualité</div>
                <div className="text-3xl font-black text-pitch">{scoreQ}%</div>
                <div className="text-xs text-app-muted">précision + stabilité</div>
              </div>
            </div>

            {referentiel === '5-limite' && (
              <div className="rounded-xl p-3.5 mb-4 text-xs leading-snug border"
                style={{ background: '#0c1220', borderColor: '#1e3a5f', color: '#93c5fd' }}>
                <div className="font-bold mb-1.5" style={{ color: '#60a5fa' }}>Limitation du modèle d'intonation pure</div>
                En intonation juste 5-limite, certaines notes possèdent deux valeurs pures légitimes selon leur rôle harmonique — notamment <strong>La</strong> et <strong>Ré</strong>. L'écart entre ces deux valeurs est de 21,5 cents (comma syntonique 81:80).
                <br /><br />
                Cet outil utilise une gamme de référence 5-limite diatonique fixe. Il ne réalise pas d'analyse harmonique contextuelle note-par-note.
                <br /><br />
                <em>En pratique : si votre phrase contient un La dans un contexte de IIe degré, la référence affichée peut différer de l'intonation pure idéale de ~21 cents.</em>
              </div>
            )}

            <div className="flex gap-2 mb-3 flex-wrap">
              {[
                { key: 'courbe', label: 'Courbe brute', val: showCourbe, set: setShowCourbe },
                { key: 'barres', label: 'μ par note',   val: showBarres, set: setShowBarres },
                { key: 'sigma',  label: 'σ par note',   val: showSigma,  set: setShowSigma  },
              ].map(({ key, label, val, set }) => (
                <button key={key} onClick={() => set(v => !v)}
                  className="px-3 py-1.5 rounded-lg border-none text-xs font-bold cursor-pointer transition-colors"
                  style={{
                    background: val ? '#FF8B3D' : 'var(--surface-2)',
                    color:      val ? '#fff' : 'var(--text-muted)',
                  }}
                >{label}</button>
              ))}
            </div>

            {showCourbe && courbe.length > 0 && <div className="mb-3"><GrapheCents data={dataCourbe} couleurs={[C_ACCENT]} width={500} height={90} title="Écart continu (¢)" /></div>}
            {showBarres && <div className="mb-3"><GrapheCents data={dataBarres} couleurs={couleurs} labelX={labelsX} width={500} height={100} title="Écart moyen μ par note (¢)" /></div>}
            {showSigma  && <div className="mb-3"><GrapheCents data={dataSigma} couleurs={couleurs} labelX={labelsX} width={500} height={100} title="Déviation σ par note (¢)" /></div>}

            <div className="text-center pt-2">
              <Btn onClick={sauvegarderResultats}>Sauvegarder cette session</Btn>
            </div>
          </>
        )}

        {phase === 'resultats' && notes.length === 0 && (
          <div className="text-app-muted text-sm text-center py-5">
            Aucune note détectée. Enregistre un extrait plus long ou vérifie le microphone.
          </div>
        )}

        {/* ── Structures de toniques + Référentiel ── */}
        <div className="bg-surface border border-app rounded-xl p-4 mb-4">
          <div className="flex justify-between items-center mb-2.5">
            <span className="font-bold text-sm text-app">Structure de toniques</span>
            <Btn variant="ghost" onClick={() => setShowStructMgr(v => !v)}>
              {showStructMgr ? 'Fermer' : '+ Gérer'}
            </Btn>
          </div>

          <select
            value={structureId ?? ''}
            onChange={e => setStructureId(e.target.value || null)}
            className="w-full bg-app text-app border border-app rounded-md px-2.5 py-2 text-sm mb-3"
          >
            <option value="">— Aucune (tempéré simple) —</option>
            <optgroup label="Toniques simples">
              {DEFAULT_STRUCTURES.map(s => <option key={s.id} value={s.id}>{transpoNom(s.nom)}</option>)}
            </optgroup>
            {structures.length > 0 && (
              <optgroup label="Mes structures">
                {structures.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
              </optgroup>
            )}
          </select>

          <div className="flex gap-1.5">
            {REFERENTIELS.map(r => (
              <button key={r} onClick={() => setReferentiel(r)}
                className="flex-1 py-1.5 rounded-md border-none font-bold text-xs cursor-pointer transition-colors"
                style={{
                  background: referentiel === r ? '#FF8B3D' : 'var(--surface-2)',
                  color:      referentiel === r ? '#fff' : 'var(--text-muted)',
                }}
              >{r === 'tempere' ? 'Tempéré' : r === '5-limite' ? 'Harmonique' : 'Utilisateur'}</button>
            ))}
          </div>

          {urlStructure && (
            <div className="mt-2.5 flex gap-2 items-center">
              <input readOnly value={urlStructure}
                className="flex-1 bg-app text-app-muted border border-app rounded-md px-2 py-1 text-[10px]"
              />
              <Btn variant="secondary" className="py-1! px-2.5! text-xs" onClick={() => navigator.clipboard.writeText(urlStructure)}>
                Copier
              </Btn>
            </div>
          )}

          {showStructMgr && (
            <div className="mt-3.5 pt-3.5 border-t border-app">
              {structures.map(s => (
                <div key={s.id} className="flex justify-between items-center mb-1.5 text-xs">
                  <span style={{ color: structureId === s.id ? '#FF8B3D' : 'var(--text)' }}>{s.nom}</span>
                  <div className="flex gap-1.5">
                    <Btn variant="secondary" className="py-0.5! px-2! text-xs" onClick={() => setStructureId(s.id)}>Sélectionner</Btn>
                    <Btn variant="danger" className="py-0.5! px-2! text-xs" onClick={() => supprimerStruct(s.id)}>×</Btn>
                  </div>
                </div>
              ))}
              <div className="mt-3 bg-app rounded-lg p-3">
                <div className="text-xs text-app-muted mb-2 font-semibold">Nouvelle structure</div>
                <input
                  value={newStructNom}
                  onChange={e => setNewStructNom(e.target.value)}
                  placeholder="Nom (ex: Sonate K331)"
                  className={inputCls + ' mb-2'}
                />
                {newStructRows.map((row, i) => (
                  <div key={i} className="flex gap-1.5 mb-1.5 items-center">
                    <input
                      type="number" min="1" value={row.indexNote}
                      onChange={e => setNewStructRows(rows => rows.map((r, j) => j === i ? { ...r, indexNote: Number(e.target.value) } : r))}
                      className={inputCls}
                      style={{ width: 50 }}
                    />
                    <select
                      value={row.tonique}
                      onChange={e => setNewStructRows(rows => rows.map((r, j) => j === i ? { ...r, tonique: e.target.value } : r))}
                      className={inputCls + ' flex-1'}
                    >
                      {NOTE_NAMES_FR.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                    {newStructRows.length > 1 && (
                      <button onClick={() => setNewStructRows(rows => rows.filter((_, j) => j !== i))}
                        className="bg-transparent border-none text-red-400 cursor-pointer text-base"
                        style={{ minHeight: 'auto' }}>×</button>
                    )}
                  </div>
                ))}
                <div className="flex gap-2 mt-2">
                  <Btn variant="ghost" onClick={() => setNewStructRows(rows => [...rows, { indexNote: rows.length + 1, tonique: 'Do' }])}>+ Tonique</Btn>
                  <Btn variant="primary" className="py-2! px-4! text-xs" onClick={ajouterStructure} disabled={!newStructNom.trim()}>Créer</Btn>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Outils pédagogiques ── */}
        {/* Jeu de gamme — masqué pour le moment
        {[
          {
            id: 'gamme', titre: 'Jeu de gamme',
            icone: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="18" x2="3" y2="6"/><line x1="8" y1="18" x2="8" y2="9"/><line x1="13" y1="18" x2="13" y2="5"/><line x1="18" y1="18" x2="18" y2="11"/><line x1="21" y1="18" x2="1" y2="18"/></svg>,
            content: <JeuGamme transpoKey={transpoKey} referentiel={referentiel} diapason={diapason} seuil={seuil} silenceDurationMs={silenceDurationMs} noteJumpCents={noteJumpCents} clarityThreshold={clarityThreshold} gateLevel={gateLevel} />,
          },
        ].map(({ id, titre, icone, content }) => (
          <div key={id} className="mt-2 border border-app rounded-xl overflow-hidden">
            <button
              onClick={() => setOuvertPanel(p => p === id ? null : id)}
              className="w-full flex items-center gap-2.5 bg-surface border-none px-4 py-3 cursor-pointer text-app text-sm font-semibold text-left"
            >
              <span style={{ color: '#FF8B3D' }}>{icone}</span>
              <span className="flex-1">{titre}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5"
                style={{ transform: ouvertPanel === id ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            {ouvertPanel === id && (
              <div className="p-4 bg-app border-t border-app">{content}</div>
            )}
          </div>
        ))}
        */}

      </div>

      {showSpectre && (
        <SpectrePaneau
          mode={modeLive ? 'live' : 'static'}
          spectreAnalyserRef={spectreAnalyserRef}
          spectreParNote={spectreParNoteRef.current}
          notes={notes}
          sampleRate={liveAudioCtxRef.current?.sampleRate ?? 44100}
          fundamentalHz={modeLive ? liveHzRef.current : null}
          muCents={liveNote?.muCents ?? null}
          onClose={() => setShowSpectre(false)}
        />
      )}
    </div>
  )
}
