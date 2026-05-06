import { useState, useRef, useEffect, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PitchDetector } from 'pitchy'
import AccordeurStaff from './AccordeurStaff'
import SpectrePaneau from './SpectrePaneau'
import GenerateurAccord from './GenerateurAccord'
import JeuGamme from './JeuGamme'
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
  hzToMidi, midiToNoteName, centsTempere, centsCinqLimite,
  buildEnharmonicScale, noteNameToPC,
} from './accordeurUtils'

// ─── Constantes UI ─────────────────────────────────────────────────────────────
const DIAPASON_DEFAULT        = 442
const SEUIL_DEFAULT           = 10
const SILENCE_MS_DEFAULT      = 40
const NOTE_JUMP_CENTS_DEFAULT = 30
const REFERENTIELS            = ['tempere', '5-limite']
const COL_BG             = '#030712'
const COL_SURFACE        = '#0a0f1a'
const COL_ACCENT         = '#c084fc'
const COL_ACCENT2        = '#7c3aed'
const COL_BORDER         = '#1f2937'
const COL_TEXT           = '#f9fafb'
const COL_MUTED          = '#4b5563'
const COL_MUTED2         = '#6b7280'

// ─── Petit composant bouton ────────────────────────────────────────────────────
function Btn({ children, onClick, disabled, variant = 'primary', style = {} }) {
  const base = {
    border: 'none', borderRadius: 10, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: "'Inter','Segoe UI',sans-serif", transition: 'opacity 0.15s',
    opacity: disabled ? 0.4 : 1, fontSize: 14, padding: '12px 20px',
    ...style,
  }
  const variants = {
    primary:   { background: COL_ACCENT2, color: '#fff' },
    secondary: { background: COL_SURFACE, color: COL_ACCENT, border: `1px solid ${COL_BORDER}` },
    danger:    { background: '#7f1d1d', color: '#fca5a5' },
    ghost:     { background: 'transparent', color: COL_MUTED2, fontSize: 12 },
  }
  return <button style={{ ...base, ...variants[variant] }} onClick={onClick} disabled={disabled}>{children}</button>
}

const COL_TRITONE = '#f59e0b'

// ─── Graphe canvas centré sur 0 ────────────────────────────────────────────────
function GrapheCents({ data, labelX, couleurs, tritoneMask, width = 460, height = 90, title }) {
  const ref = useRef(null)
  const [tooltip, setTooltip] = useState(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !data?.length) return
    const ctx2 = canvas.getContext('2d')
    const W = width, H = height
    ctx2.clearRect(0, 0, W, H)

    // Fond
    ctx2.fillStyle = COL_SURFACE
    ctx2.fillRect(0, 0, W, H)

    // Ligne 0
    ctx2.strokeStyle = '#374151'
    ctx2.lineWidth   = 1
    ctx2.setLineDash([4, 4])
    ctx2.beginPath()
    ctx2.moveTo(0, H / 2)
    ctx2.lineTo(W, H / 2)
    ctx2.stroke()
    ctx2.setLineDash([])

    // Déterminer plage
    const maxAbs = Math.max(30, ...data.map(d => Math.abs(d.value)))
    const scale  = (H / 2 - 8) / maxAbs

    if (Array.isArray(data[0]?.value)) {
      // Mode courbe continue
      ctx2.strokeStyle = couleurs?.[0] ?? COL_ACCENT
      ctx2.lineWidth   = 1.5
      ctx2.beginPath()
      data.forEach((pt, i) => {
        const x = (i / (data.length - 1)) * W
        const y = H / 2 - pt.value * scale
        i === 0 ? ctx2.moveTo(x, y) : ctx2.lineTo(x, y)
      })
      ctx2.stroke()
    } else {
      // Mode barres par note
      const barW = Math.max(8, W / data.length - 4)
      data.forEach((pt, i) => {
        const x      = (i + 0.5) * (W / data.length)
        const barH   = Math.abs(pt.value) * scale
        const y      = pt.value >= 0 ? H / 2 - barH : H / 2
        ctx2.fillStyle = couleurs?.[i] ?? COL_ACCENT
        ctx2.beginPath()
        ctx2.roundRect?.(x - barW / 2, y, barW, barH || 1, 3) ?? ctx2.rect(x - barW / 2, y, barW, barH || 1)
        ctx2.fill()

        // Marqueur triton
        if (tritoneMask?.[i]) {
          ctx2.fillStyle = COL_TRITONE
          ctx2.font      = 'bold 11px Inter,sans-serif'
          ctx2.textAlign = 'center'
          const markerY  = pt.value >= 0 ? H / 2 - barH - 10 : H / 2 + barH + 12
          ctx2.fillText('?', x, Math.max(12, Math.min(H - 4, markerY)))
        }

        // Label note
        if (labelX?.[i]) {
          ctx2.fillStyle = COL_MUTED2
          ctx2.font      = '9px Inter,sans-serif'
          ctx2.textAlign = 'center'
          ctx2.fillText(labelX[i], x, H - 2)
        }
      })
    }

    // Titre
    if (title) {
      ctx2.fillStyle = COL_MUTED
      ctx2.font      = '9px Inter,sans-serif'
      ctx2.textAlign = 'left'
      ctx2.fillText(title, 4, 10)
    }

    // Graduations ±10, ±20, ±30¢
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
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <canvas
        ref={ref} width={width} height={height}
        style={{ borderRadius: 8, display: 'block' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
      />
      {tooltip && (
        <div style={{
          position: 'absolute', left: tooltip.x + 10, top: Math.max(0, tooltip.y - 38),
          background: '#1f2937', color: '#f9fafb', fontSize: 10, padding: '5px 8px',
          borderRadius: 6, pointerEvents: 'none', maxWidth: 210, zIndex: 10,
          border: '1px solid #374151', lineHeight: 1.4,
        }}>
          Intervalle ambigu en intonation pure — deux valeurs possibles (±9.8 ¢)
        </div>
      )}
    </div>
  )
}

// ─── Composant principal ───────────────────────────────────────────────────────
export default function AccordeurPage() {
  const [searchParams] = useSearchParams()

  // ── Paramètres ──────────────────────────────────────────────────────────────
  const [diapason,    setDiapason]    = useState(() => { const v = parseFloat(localStorage.getItem('acc_diapason')); return isNaN(v) ? DIAPASON_DEFAULT : v })
  const [transpoKey,  setTranspoKey]  = useState(() => localStorage.getItem('acc_transpo') || 'C')
  const [referentiel, setReferentiel] = useState(() => localStorage.getItem('acc_ref') || '5-limite')
  const [seuil,       setSeuil]       = useState(() => { const v = parseInt(localStorage.getItem('acc_seuil')); return isNaN(v) ? SEUIL_DEFAULT : v })
  const [structureId, setStructureId] = useState(null)

  // ── Seuils segmentation ──────────────────────────────────────────────────────
  const [silenceDurationMs, setSilenceDurationMs] = useState(() => { const v = parseInt(localStorage.getItem('acc_silence')); return isNaN(v) ? SILENCE_MS_DEFAULT : v })
  const [noteJumpCents,     setNoteJumpCents]     = useState(() => { const v = parseInt(localStorage.getItem('acc_noteJump')); return isNaN(v) ? NOTE_JUMP_CENTS_DEFAULT : v })
  const [clarityThreshold,  setClarityThreshold]  = useState(() => { const v = parseFloat(localStorage.getItem('acc_clarity')); return isNaN(v) ? 0.82 : v })
  const [gateLevel,         setGateLevel]         = useState(() => { const v = parseFloat(localStorage.getItem('acc_gate')); return isNaN(v) ? 0.02 : v })
  const gateLevelRef = useRef(0.02)

  // ── Mode live ─────────────────────────────────────────────────────────────────
  const [modeLive,    setModeLive]   = useState(true)
  const [liveNote,    setLiveNote]   = useState(null)   // { nom, octave, muCents } | null
  const [liveActive,  setLiveActive] = useState(false)
  const liveStreamRef   = useRef(null)
  const liveAudioCtxRef = useRef(null)
  const liveAnalyserRef = useRef(null)
  const liveRafRef      = useRef(null)
  const liveDetectorRef = useRef(null)
  const liveParamsRef   = useRef({})

  // ── Outils pédagogiques ───────────────────────────────────────────────────────
  const [ouvertPanel,     setOuvertPanel]     = useState(null) // 'accord' | 'gamme' | null
  const generatorPcsRef = useRef(new Set())

  // ── Spectre FFT ───────────────────────────────────────────────────────────────
  const [showSpectre,    setShowSpectre]    = useState(false)
  const spectreAnalyserRef = useRef(null)   // 2e AnalyserNode live (fftSize=4096)
  const spectreParNoteRef  = useRef(null)   // Float32Array[] post-recording, un par note
  const liveHzRef          = useRef(null)   // Hz courant pour marqueurs harmoniques

  // ── Pipeline ─────────────────────────────────────────────────────────────────
  // phase : 'pret' | 'enregistrement' | 'analyse' | 'resultats'
  const [phase,  setPhase]  = useState('pret')
  const serieRef        = useRef([])
  const audioBufferRef  = useRef(null)   // AudioBuffer brut pour re-lancer YIN
  const [notes,  setNotes]  = useState([])
  const [courbe, setCourbe] = useState([])
  const [scoreP, setScoreP] = useState(null)
  const [scoreQ, setScoreQ] = useState(null)
  const [erreur, setErreur] = useState(null)

  // ── Vue résultats ─────────────────────────────────────────────────────────────
  const [dirty,      setDirty]      = useState(false)     // réglages modifiés, recalcul en attente
  const [vue,        setVue]        = useState('portee')  // 'portee' | 'tableau'
  const [showCourbe, setShowCourbe] = useState(true)
  const [showBarres, setShowBarres] = useState(true)
  const [showSigma,  setShowSigma]  = useState(true)

  // ── Structures ────────────────────────────────────────────────────────────────
  const [structures,    setStructures]    = useState(() => lireStructures())
  const [showStructMgr, setShowStructMgr] = useState(false)
  const [newStructNom,  setNewStructNom]  = useState('')
  const [newStructRows, setNewStructRows] = useState([{ indexNote: 1, tonique: 'Do' }])

  // ── Sessions ──────────────────────────────────────────────────────────────────
  const [sessions,     setSessions]    = useState(() => lireSessions())
  const [showSessions, setShowSessions] = useState(false)

  // ── Audio refs ────────────────────────────────────────────────────────────────
  const mediaRecorderRef = useRef(null)
  const chunksRef        = useRef([])
  const streamRef        = useRef(null)
  const vuRef            = useRef(null)   // canvas vumètre
  const animRef          = useRef(null)
  const analyserRef      = useRef(null)

  // ── URL param ?s= ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const s = searchParams.get('s')
    if (!s) return
    const struct = urlVersStructure(s)
    sauvegarderStructure(struct)
    setStructures(lireStructures())
    setStructureId(struct.id)
  }, [])

  // ── Recalcul : déclenché manuellement via bouton ──────────────────────────────
  const recalculer = useCallback(() => {
    if (!audioBufferRef.current) return
    const s = analyserBuffer(audioBufferRef.current, { clarityThreshold, rmsGate: gateLevel })
    serieRef.current = s
    const struct    = [...DEFAULT_STRUCTURES, ...structures].find(x => x.id === structureId)
    const tonikMidi = struct
      ? (noteNameToPC(struct.toniques[0]?.tonique ?? 'Do') + 60)
      : 60
    const segs      = segmenter(s, diapason, { silenceDurationMs, noteJumpCents })
    const notesCalc = calculerEcarts(segs, referentiel, tonikMidi, diapason)
    const courbeB   = courbebrute(s, referentiel, tonikMidi, diapason)
    setNotes(notesCalc)
    setCourbe(courbeB)
    setScoreP(scorePedagogique(notesCalc, seuil))
    setScoreQ(scoreQualite(notesCalc))
    setDirty(false)
  }, [clarityThreshold, gateLevel, referentiel, seuil, silenceDurationMs, noteJumpCents, diapason, structureId, structures])

  // ── Marque dirty quand réglages changent après chargement audio ───────────────
  useEffect(() => {
    if (!audioBufferRef.current) return
    setDirty(true)
  }, [clarityThreshold, gateLevel, referentiel, seuil, silenceDurationMs, noteJumpCents, diapason, structureId, structures])

  // ── Sync params live (accessibles dans la RAF loop via ref) ──────────────────
  useEffect(() => {
    const struct = [...DEFAULT_STRUCTURES, ...structures].find(x => x.id === structureId)
    const tonicConcertName = struct?.toniques?.[0]?.tonique ?? 'Do'
    const tonicConcertPC   = noteNameToPC(tonicConcertName)
    const transpoOffset    = TRANSPOSITIONS[transpoKey]?.offset ?? 0
    const tonicDisplayPC   = ((tonicConcertPC + transpoOffset) % 12 + 12) % 12
    liveParamsRef.current = {
      diapason,
      referentiel,
      clarityThreshold,
      gateLevel,
      transpoOffset,
      enharmonicScale: buildEnharmonicScale(NOTE_NAMES_FR[tonicDisplayPC]),
      tonikMidi: struct ? (tonicConcertPC + 60) : null,
    }
  }, [diapason, referentiel, clarityThreshold, gateLevel, structureId, structures, transpoKey])

  // ── Persist réglages localStorage ───────────────────────────────────────────
  useEffect(() => { localStorage.setItem('acc_diapason', diapason) }, [diapason])
  useEffect(() => { localStorage.setItem('acc_transpo',  transpoKey) }, [transpoKey])
  useEffect(() => { localStorage.setItem('acc_ref',      referentiel) }, [referentiel])
  useEffect(() => { localStorage.setItem('acc_seuil',    seuil) }, [seuil])
  useEffect(() => { localStorage.setItem('acc_silence',  silenceDurationMs) }, [silenceDurationMs])
  useEffect(() => { localStorage.setItem('acc_noteJump', noteJumpCents) }, [noteJumpCents])
  useEffect(() => { localStorage.setItem('acc_clarity',  clarityThreshold) }, [clarityThreshold])
  useEffect(() => { localStorage.setItem('acc_gate',     gateLevel) }, [gateLevel])

  // ── Autostart live au montage ─────────────────────────────────────────────────
  useEffect(() => { demarrerLive() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Enregistrement ──────────────────────────────────────────────────────────

  const demarrerEnregistrement = useCallback(async () => {
    setErreur(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      streamRef.current = stream

      // Vumètre
      const audioCtx  = new AudioContext()
      const source    = audioCtx.createMediaStreamSource(stream)
      const analyser  = audioCtx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = { analyser, audioCtx }

      const VU_SCALE = 5  // rms=0.2 remplit la barre
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
        ctx2.fillStyle = COL_SURFACE
        ctx2.fillRect(0, 0, W, H)
        const barW = Math.min(rms * VU_SCALE * W, W)
        const grad = ctx2.createLinearGradient(0, 0, W, 0)
        grad.addColorStop(0,   '#34d399')
        grad.addColorStop(0.6, '#fbbf24')
        grad.addColorStop(1,   '#f87171')
        ctx2.fillStyle = grad
        ctx2.fillRect(0, 0, barW, H)
        // Ligne gate
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

      // MediaRecorder
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

    await new Promise(resolve => {
      recorder.onstop = resolve
      recorder.stop()
    })
    stream.getTracks().forEach(t => t.stop())
    audioCtx?.close()

    const blob       = new Blob(chunksRef.current, { type: 'audio/webm' })
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
    const tonikMidi = struct
      ? (noteNameToPC(struct.toniques[0]?.tonique ?? 'Do') + 60)
      : 60

    const segments = segmenter(serieCalc, diapason, { silenceDurationMs, noteJumpCents })
    const notesAv  = calculerEcarts(segments, referentiel, tonikMidi, diapason)
    const courbeB  = courbebrute(serieCalc, referentiel, tonikMidi, diapason)

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

  // ─── Mode live ───────────────────────────────────────────────────────────────

  const demarrerLive = useCallback(async () => {
    setErreur(null)
    try {
      const stream   = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
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
        if (now - lastUpdate < 250) return
        lastUpdate = now
        analyser.getFloatTimeDomainData(buf)
        const { diapason: d, referentiel: r, clarityThreshold: ct, gateLevel: gl, tonikMidi, transpoOffset: tOff, enharmonicScale: scale } = liveParamsRef.current
        const rms = frameRMS(buf)
        if (rms < gl) return
        const emp = preEmphasis(buf)
        const [hz, clarity] = liveDetectorRef.current.findPitch(emp, audioCtx.sampleRate)
        if (clarity < ct || hz < HZ_MIN || hz > HZ_MAX) return
        const midi        = Math.round(hzToMidi(hz, d))
        // Ignore notes played by the chord generator
        const pcRaw = ((midi % 12) + 12) % 12
        if (generatorPcsRef.current?.size && generatorPcsRef.current.has(pcRaw)) return
        const midiDisplay = midi + (tOff ?? 0)
        const pc          = ((midiDisplay % 12) + 12) % 12
        const octave      = Math.floor(midiDisplay / 12) - 1
        const nom         = scale?.[pc] ?? midiToNoteName(midi).name
        const muCents = (r === '5-limite' && tonikMidi !== null)
          ? centsCinqLimite(hz, tonikMidi, d)
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

  // ─── Analyse depuis fichier audio ────────────────────────────────────────────

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
      const tonikMidi = struct
        ? (noteNameToPC(struct.toniques[0]?.tonique ?? 'Do') + 60)
        : 60

      const serieCalc = analyserBuffer(audioBuffer, { clarityThreshold, rmsGate: gateLevel })
      const segments  = segmenter(serieCalc, diapason, { silenceDurationMs, noteJumpCents })
      const notesAv   = calculerEcarts(segments, referentiel, tonikMidi, diapason)
      const courbeB   = courbebrute(serieCalc, referentiel, tonikMidi, diapason)

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

  // ─── Sauvegarde session ───────────────────────────────────────────────────────

  const sauvegarderResultats = useCallback(() => {
    const struct = structures.find(s => s.id === structureId)
    const session = {
      id:           uuid(),
      date:         new Date().toISOString(),
      structureId:  structureId ?? null,
      structureNom: struct?.nom ?? '—',
      referentiel,
      diapason,
      seuilCents:   seuil,
      scoreNotes:   scoreP?.label ?? '—',
      scoreQualite: scoreQ ?? 0,
      notes:        notes.map(n => ({
        nom:        n.nom,
        octave:     n.octave,
        debutMs:    n.debutMs,
        finMs:      n.finMs,
        muCents:    parseFloat(n.muCents.toFixed(2)),
        sigmaCents: parseFloat(n.sigmaCents.toFixed(2)),
      })),
      courbeBreute: courbe.slice(0, 500),   // limite taille localStorage
    }
    sauvegarderSession(session)
    setSessions(lireSessions())
  }, [notes, courbe, scoreP, scoreQ, structureId, structures, referentiel, diapason, seuil])

  // ─── Gestion structures ───────────────────────────────────────────────────────

  const ajouterStructure = useCallback(() => {
    if (!newStructNom.trim()) return
    const s = {
      id:        uuid(),
      nom:       newStructNom.trim(),
      toniques:  newStructRows,
      createdAt: new Date().toISOString(),
      public:    true,
    }
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

  // ─── Gamme enharmonique d'affichage (tonique transposée) ─────────────────────

  const _tonicStruct      = structureId ? [...DEFAULT_STRUCTURES, ...structures].find(s => s.id === structureId) : null
  const _tonicConcertName = _tonicStruct?.toniques?.[0]?.tonique ?? 'Do'
  const _tonicConcertPC   = noteNameToPC(_tonicConcertName)
  const _transpoOffset    = TRANSPOSITIONS[transpoKey]?.offset ?? 0
  const _tonicDisplayPC   = ((_tonicConcertPC + _transpoOffset) % 12 + 12) % 12
  const _tonicDisplayName = NOTE_NAMES_FR[_tonicDisplayPC]
  const enharmonicScale   = buildEnharmonicScale(_tonicDisplayName)

  // ─── Données graphes ──────────────────────────────────────────────────────────

  const couleurs     = notes.map(n => n.isTritone ? COL_TRITONE : couleurJustesse(n.muCents, seuil))
  const tritoneMask  = notes.map(n => !!n.isTritone)
  const labelsX   = notes.map(n => {
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

  // ─── Helper : transpose un nom de note concert selon transpoKey ──────────────
  const transpoNom = (nom) => {
    const idx = noteNameToPC(nom)
    const offset = TRANSPOSITIONS[transpoKey]?.offset ?? 0
    if (offset === 0) return nom
    return NOTE_NAMES_FR[((idx + offset) % 12 + 12) % 12]
  }

  // ─── URL partage structure ────────────────────────────────────────────────────

  const _selectedStruct = structureId
    ? [...DEFAULT_STRUCTURES, ...structures].find(s => s.id === structureId)
    : null
  const urlStructure = _selectedStruct && !_selectedStruct.readOnly
    ? `${window.location.origin}/accordeur?s=${structureVersURL(_selectedStruct)}`
    : null

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{
      minHeight: '100dvh', background: COL_BG, color: COL_TEXT,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '20px 16px', fontFamily: "'Inter','Segoe UI',sans-serif",
    }}>
      <div style={{ width: '100%', maxWidth: 540 }}>

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <Link to="/" style={{
            background: '#111827', border: '1px solid #1f2937', borderRadius: 8,
            color: COL_ACCENT, fontWeight: 700, fontSize: 12, padding: '4px 10px',
            cursor: 'pointer', textDecoration: 'none',
          }}>← Tessitura</Link>
          <h2 style={{ color: COL_ACCENT, margin: 0, fontSize: 20 }}>Accordeur</h2>
          <Btn variant="ghost" onClick={() => setShowSessions(v => !v)}>
            {showSessions ? 'Fermer suivi' : 'Suivi ▾'}
          </Btn>
        </div>

        {/* ── Tableau sessions ────────────────────────────────────────────────── */}
        {showSessions && (
          <div style={{ background: COL_SURFACE, borderRadius: 12, padding: 16, marginBottom: 20, border: `1px solid ${COL_BORDER}` }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Suivi des sessions</div>
            {sessions.length === 0
              ? <p style={{ color: COL_MUTED, fontSize: 12 }}>Aucune session sauvegardée.</p>
              : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ color: COL_MUTED, borderBottom: `1px solid ${COL_BORDER}` }}>
                        {['Date', 'Structure', 'Notes', 'Qualité', 'Réf.', 'Seuil', ''].map(h => (
                          <th key={h} style={{ padding: '4px 6px', textAlign: 'left', fontWeight: 600 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...sessions].reverse().map(s => (
                        <tr key={s.id} style={{ borderBottom: `1px solid ${COL_BORDER}` }}>
                          <td style={{ padding: '6px 6px', color: COL_MUTED2 }}>{new Date(s.date).toLocaleDateString('fr')}</td>
                          <td style={{ padding: '6px 6px' }}>{s.structureNom}</td>
                          <td style={{ padding: '6px 6px', color: '#34d399' }}>{s.scoreNotes}</td>
                          <td style={{ padding: '6px 6px', color: COL_ACCENT }}>{s.scoreQualite}%</td>
                          <td style={{ padding: '6px 6px', color: COL_MUTED }}>{s.referentiel}</td>
                          <td style={{ padding: '6px 6px', color: COL_MUTED }}>±{s.seuilCents}¢</td>
                          <td style={{ padding: '6px 6px' }}>
                            <button
                              onClick={() => { supprimerSession(s.id); setSessions(lireSessions()) }}
                              style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 14 }}
                            >×</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </div>
        )}

        {/* ── Zone enregistrement / Live ───────────────────────────────────────── */}
        <div style={{ background: COL_SURFACE, borderRadius: 16, padding: 24, marginBottom: 16, border: `1px solid ${COL_BORDER}`, textAlign: 'center' }}>
          {/* Toggle Enregistrer / Live */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
            {[['rec', '● Enregistrer'], ['live', '♩ Live']].map(([v, label]) => (
              <button key={v} onClick={() => basculerMode(v === 'live')}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 8, border: 'none',
                  fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                  background: modeLive === (v === 'live') ? COL_ACCENT2 : COL_BG,
                  color:      modeLive === (v === 'live') ? '#fff' : COL_MUTED,
                }}
              >{label}</button>
            ))}
            {(modeLive || phase === 'resultats') && (
              <button
                onClick={() => setShowSpectre(v => !v)}
                style={{
                  padding: '8px 12px', borderRadius: 8,
                  border: `1px solid ${showSpectre ? COL_ACCENT : COL_BORDER}`,
                  background: showSpectre ? 'rgba(192,132,252,0.12)' : COL_BG,
                  color: showSpectre ? COL_ACCENT : COL_MUTED2,
                  fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                }}
              >◈ Spectre</button>
            )}
          </div>
          {/* ── Accordeur live ───────────────────────────────────────────────── */}
          {modeLive && (() => {
            const liveDisplay = liveNote  // nom/octave déjà transposés + enharmoniques
            const liveCouleur = liveNote ? couleurJustesse(liveNote.muCents, seuil) : COL_MUTED
            const needlePct   = liveNote ? Math.max(0, Math.min(100, 50 + (liveNote.muCents / 50) * 50)) : 50
            const centsLabel  = liveNote
              ? `${liveNote.muCents >= 0 ? '+' : ''}${liveNote.muCents.toFixed(1)}¢`
              : '—'
            return (
              <>
                {!liveActive
                  ? <Btn onClick={demarrerLive} style={{ fontSize: 15, padding: '12px 36px' }}>▶ Démarrer</Btn>
                  : <Btn variant="secondary" onClick={arreterLive} style={{ fontSize: 13 }}>■ Arrêter</Btn>
                }
                <div style={{ marginTop: 28, marginBottom: 8 }}>
                  <div style={{ fontSize: 56, fontWeight: 900, letterSpacing: 2, color: liveCouleur, lineHeight: 1 }}>
                    {liveDisplay ? `${liveDisplay.nom}` : '—'}
                    <span style={{ fontSize: 24, fontWeight: 400, color: COL_MUTED, marginLeft: 6 }}>
                      {liveDisplay ? liveDisplay.octave : ''}
                    </span>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: liveCouleur, marginTop: 6 }}>
                    {centsLabel}
                  </div>
                </div>
                {/* Needle */}
                <div style={{ margin: '16px 0 4px', position: 'relative', height: 12, background: COL_BG, borderRadius: 6 }}>
                  <div style={{ position: 'absolute', left: '50%', top: -4, bottom: -4, width: 1, background: COL_MUTED, transform: 'translateX(-50%)' }} />
                  <div style={{
                    position: 'absolute', top: 0, bottom: 0,
                    left: `${needlePct}%`, width: 4, borderRadius: 2,
                    background: liveCouleur,
                    transform: 'translateX(-50%)',
                    transition: 'left 0.08s ease, background 0.15s',
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: COL_MUTED, padding: '0 2px' }}>
                  <span>-50¢</span><span>0</span><span>+50¢</span>
                </div>
              </>
            )
          })()}

          {/* ── Mode enregistrement ──────────────────────────────────────────── */}
          {!modeLive && phase === 'pret' && (
            <>
              <div style={{ color: COL_MUTED, fontSize: 13, marginBottom: 20 }}>
                Prêt à enregistrer
              </div>
              <Btn onClick={demarrerEnregistrement} style={{ fontSize: 16, padding: '14px 40px' }}>
                ● Enregistrer
              </Btn>
              <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <span style={{ color: COL_MUTED, fontSize: 11 }}>ou</span>
                <label style={{
                  cursor: 'pointer', fontSize: 12, color: COL_MUTED2, fontWeight: 600,
                  padding: '6px 14px', borderRadius: 8, border: `1px solid ${COL_BORDER}`,
                  background: COL_BG,
                }}>
                  Charger un fichier audio
                  <input
                    type="file" accept="audio/*" style={{ display: 'none' }}
                    onChange={e => chargerFichier(e.target.files?.[0])}
                  />
                </label>
              </div>
            </>
          )}

          {!modeLive && phase === 'enregistrement' && (
            <>
              <div style={{ color: '#f87171', fontWeight: 700, fontSize: 13, marginBottom: 12 }}>
                ● Enregistrement en cours…
              </div>
              <canvas ref={vuRef} width={360} height={20}
                style={{ borderRadius: 10, marginBottom: 20, display: 'block', margin: '0 auto 20px' }} />
              <Btn onClick={arreterEnregistrement} variant="secondary" style={{ fontSize: 15, padding: '12px 32px' }}>
                ■ Arrêter
              </Btn>
            </>
          )}

          {!modeLive && phase === 'analyse' && (
            <div style={{ color: COL_MUTED, fontSize: 14, padding: '20px 0' }}>
              Analyse en cours…
            </div>
          )}

          {!modeLive && phase === 'resultats' && (
            <Btn variant="secondary" onClick={() => { setPhase('pret'); setNotes([]); setCourbe([]); serieRef.current = []; audioBufferRef.current = null }} style={{ fontSize: 13 }}>
              ↺ Nouveau
            </Btn>
          )}

          {erreur && <div style={{ color: '#f87171', fontSize: 12, marginTop: 12 }}>{erreur}</div>}
        </div>

        {/* ── Résultats ────────────────────────────────────────────────────────── */}
        {phase === 'resultats' && notes.length > 0 && (
          <>
            {/* Toggle Portée / Tableau */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              {[['portee', 'Portée'], ['tableau', 'Tableau']].map(([v, label]) => (
                <button key={v} onClick={() => setVue(v)}
                  style={{
                    padding: '7px 16px', borderRadius: 8, border: 'none', fontWeight: 700,
                    fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                    background: vue === v ? COL_ACCENT2 : COL_SURFACE,
                    color:      vue === v ? '#fff' : COL_MUTED,
                    border:     `1px solid ${vue === v ? COL_ACCENT2 : COL_BORDER}`,
                  }}
                >{label}</button>
              ))}
              <span style={{ marginLeft: 'auto', color: COL_MUTED, fontSize: 11, alignSelf: 'center' }}>
                μ <strong style={{ color: COL_TEXT }}>{muMoyen}¢</strong>
                &nbsp;&nbsp;σ <strong style={{ color: COL_TEXT }}>{sigmaMoyen}¢</strong>
              </span>
            </div>

            {vue === 'portee' && (
              <div style={{ position: 'relative', background: COL_SURFACE, borderRadius: 12, padding: '16px 8px', marginBottom: 16, border: `1px solid ${COL_BORDER}` }}>
                <AccordeurStaff notes={notes} seuil={seuil} transpoKey={transpoKey} tonicName={_tonicDisplayName} containerWidth={524} height={180} notePx={window.innerWidth <= 540 ? 26 : 52} />
                {dirty && (
                  <div style={{ position: 'absolute', inset: 0, borderRadius: 12, background: 'rgba(3,7,18,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Btn onClick={recalculer} style={{ fontSize: 13, padding: '10px 28px' }}>↻ Recalculer</Btn>
                  </div>
                )}
              </div>
            )}

            {vue === 'tableau' && (
              <div style={{ position: 'relative', background: COL_SURFACE, borderRadius: 12, padding: 16, marginBottom: 16, border: `1px solid ${COL_BORDER}` }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ color: COL_MUTED, borderBottom: `1px solid ${COL_BORDER}` }}>
                      <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 600 }}>Note</th>
                      <th style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600 }}>μ (¢)</th>
                      <th style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600 }}>σ (¢)</th>
                      <th style={{ padding: '4px 8px', textAlign: 'left', fontWeight: 600 }}>Écart</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notes.map((note, i) => {
                      const couleur  = note.isTritone ? COL_TRITONE : couleurJustesse(note.muCents, seuil)
                      const barScale = Math.min(Math.abs(note.muCents) / 30, 1)
                      const label    = labelsX[i]
                      return (
                        <tr key={i} style={{ borderBottom: `1px solid ${COL_BORDER}` }}>
                          <td style={{ padding: '8px 8px', fontWeight: 700, color: couleur }}>
                            {label}
                            {note.isTritone && (
                              <span title="Intervalle ambigu en intonation pure — deux valeurs possibles (±9.8 ¢)"
                                style={{ marginLeft: 4, fontSize: 10, background: COL_TRITONE, color: '#000',
                                  borderRadius: 3, padding: '1px 4px', fontWeight: 700, cursor: 'help' }}>
                                ~
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '8px 8px', textAlign: 'right', color: couleur, fontWeight: 700 }}>
                            {note.isTritone ? '—' : `${note.muCents >= 0 ? '+' : ''}${note.muCents.toFixed(1)}`}
                          </td>
                          <td style={{ padding: '8px 8px', textAlign: 'right', color: COL_MUTED2 }}>
                            {note.isTritone ? '—' : note.sigmaCents.toFixed(1)}
                          </td>
                          <td style={{ padding: '8px 8px', width: 120 }}>
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
                {dirty && (
                  <div style={{ position: 'absolute', inset: 0, borderRadius: 12, background: 'rgba(3,7,18,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Btn onClick={recalculer} style={{ fontSize: 13, padding: '10px 28px' }}>↻ Recalculer</Btn>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div style={{ background: COL_SURFACE, borderRadius: 12, padding: 16, border: `1px solid ${COL_BORDER}`, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: COL_MUTED, marginBottom: 4 }}>Notes justes</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#34d399' }}>{scoreP?.label}</div>
                <div style={{ fontSize: 10, color: COL_MUTED }}>seuil ±{seuil}¢</div>
              </div>
              <div style={{ background: COL_SURFACE, borderRadius: 12, padding: 16, border: `1px solid ${COL_BORDER}`, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: COL_MUTED, marginBottom: 4 }}>Score qualité</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: COL_ACCENT }}>{scoreQ}%</div>
                <div style={{ fontSize: 10, color: COL_MUTED }}>précision + stabilité</div>
              </div>
            </div>

            {referentiel === '5-limite' && (
              <div style={{
                background: '#0c1220', border: '1px solid #1e3a5f', borderRadius: 10,
                padding: '12px 14px', marginBottom: 16, fontSize: 11, color: '#93c5fd', lineHeight: 1.55,
              }}>
                <div style={{ fontWeight: 700, marginBottom: 6, color: '#60a5fa' }}>
                  Limitation du modèle d'intonation pure
                </div>
                En intonation juste 5-limite, certaines notes possèdent deux valeurs pures légitimes selon leur rôle harmonique — notamment <strong>La</strong> et <strong>Ré</strong>. L'écart entre ces deux valeurs est de 21,5 cents (comma syntonique 81:80).
                <br /><br />
                Cet outil utilise une gamme de référence 5-limite diatonique fixe. Il ne réalise pas d'analyse harmonique contextuelle note-par-note. La correction appliquée à ces notes est donc une valeur de référence cohérente, pas nécessairement la valeur pure absolue pour chaque contexte harmonique.
                <br /><br />
                <em>En pratique : si votre phrase contient un La dans un contexte de IIe degré (accord de Ré mineur), la référence affichée peut différer de l'intonation pure idéale de ~21 cents. Cette limitation est inhérente à tout système d'intonation fixe sans analyse harmonique complète.</em>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              {[
                { key: 'courbe', label: 'Courbe brute', val: showCourbe, set: setShowCourbe },
                { key: 'barres', label: 'μ par note',   val: showBarres, set: setShowBarres },
                { key: 'sigma',  label: 'σ par note',   val: showSigma,  set: setShowSigma  },
              ].map(({ key, label, val, set }) => (
                <button key={key} onClick={() => set(v => !v)}
                  style={{
                    padding: '6px 12px', borderRadius: 8, border: 'none', fontSize: 11, fontWeight: 700,
                    cursor: 'pointer', fontFamily: 'inherit',
                    background: val ? COL_ACCENT2 : COL_BG,
                    color:      val ? '#fff' : COL_MUTED,
                  }}
                >{label}</button>
              ))}
            </div>

            {showCourbe && courbe.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <GrapheCents data={dataCourbe} couleurs={[COL_ACCENT]} width={500} height={90} title="Écart continu (¢)" />
              </div>
            )}
            {showBarres && (
              <div style={{ marginBottom: 12 }}>
                <GrapheCents data={dataBarres} couleurs={couleurs} tritoneMask={tritoneMask} labelX={labelsX} width={500} height={100} title="Écart moyen μ par note (¢)" />
              </div>
            )}
            {showSigma && (
              <div style={{ marginBottom: 12 }}>
                <GrapheCents data={dataSigma} couleurs={couleurs} tritoneMask={tritoneMask} labelX={labelsX} width={500} height={100} title="Déviation σ par note (¢)" />
              </div>
            )}

            <div style={{ textAlign: 'center', paddingTop: 8 }}>
              <Btn onClick={sauvegarderResultats}>Sauvegarder cette session</Btn>
            </div>
          </>
        )}

        {phase === 'resultats' && notes.length === 0 && (
          <div style={{ color: COL_MUTED, fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
            Aucune note détectée. Enregistre un extrait plus long ou vérifie le microphone.
          </div>
        )}

        {/* ── Structures de toniques + Référentiel ─────────────────────────────── */}
        <div style={{ background: COL_SURFACE, borderRadius: 12, padding: 16, marginBottom: 16, border: `1px solid ${COL_BORDER}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>Structure de toniques</span>
            <Btn variant="ghost" onClick={() => setShowStructMgr(v => !v)}>
              {showStructMgr ? 'Fermer' : '+ Gérer'}
            </Btn>
          </div>

          <select
            value={structureId ?? ''}
            onChange={e => setStructureId(e.target.value || null)}
            style={{ width: '100%', background: COL_BG, color: COL_TEXT, border: `1px solid ${COL_BORDER}`, borderRadius: 6, padding: '8px 10px', fontSize: 13, marginBottom: 12 }}
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

          {/* Référentiel */}
          <div style={{ display: 'flex', gap: 6 }}>
            {REFERENTIELS.map(r => (
              <button key={r} onClick={() => setReferentiel(r)}
                style={{
                  flex: 1, padding: '6px 0', borderRadius: 7, border: 'none', fontWeight: 700,
                  fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                  background: referentiel === r ? COL_ACCENT2 : COL_BG,
                  color:      referentiel === r ? '#fff' : COL_MUTED,
                }}
              >{r === 'tempere' ? 'Tempéré' : 'Harmonique'}</button>
            ))}
          </div>

          {urlStructure && (
            <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
              <input readOnly value={urlStructure}
                style={{ flex: 1, background: COL_BG, color: COL_MUTED2, border: `1px solid ${COL_BORDER}`, borderRadius: 6, padding: '4px 8px', fontSize: 10 }}
              />
              <Btn variant="secondary" style={{ padding: '4px 10px', fontSize: 11 }}
                onClick={() => navigator.clipboard.writeText(urlStructure)}>
                Copier
              </Btn>
            </div>
          )}

          {showStructMgr && (
            <div style={{ marginTop: 14, borderTop: `1px solid ${COL_BORDER}`, paddingTop: 14 }}>
              {structures.map(s => (
                <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, fontSize: 12 }}>
                  <span style={{ color: structureId === s.id ? COL_ACCENT : COL_TEXT }}>{s.nom}</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Btn variant="secondary" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => setStructureId(s.id)}>Sélectionner</Btn>
                    <Btn variant="danger" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => supprimerStruct(s.id)}>×</Btn>
                  </div>
                </div>
              ))}
              <div style={{ marginTop: 12, background: COL_BG, borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 11, color: COL_MUTED, marginBottom: 8, fontWeight: 600 }}>Nouvelle structure</div>
                <input
                  value={newStructNom}
                  onChange={e => setNewStructNom(e.target.value)}
                  placeholder="Nom (ex: Sonate K331)"
                  style={{ width: '100%', background: COL_SURFACE, color: COL_TEXT, border: `1px solid ${COL_BORDER}`, borderRadius: 6, padding: '6px 10px', fontSize: 12, boxSizing: 'border-box', marginBottom: 8 }}
                />
                {newStructRows.map((row, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                    <input
                      type="number" min="1" value={row.indexNote}
                      onChange={e => setNewStructRows(rows => rows.map((r, j) => j === i ? { ...r, indexNote: Number(e.target.value) } : r))}
                      style={{ width: 50, background: COL_SURFACE, color: COL_TEXT, border: `1px solid ${COL_BORDER}`, borderRadius: 6, padding: '4px 6px', fontSize: 12 }}
                    />
                    <select
                      value={row.tonique}
                      onChange={e => setNewStructRows(rows => rows.map((r, j) => j === i ? { ...r, tonique: e.target.value } : r))}
                      style={{ flex: 1, background: COL_SURFACE, color: COL_TEXT, border: `1px solid ${COL_BORDER}`, borderRadius: 6, padding: '4px 6px', fontSize: 12 }}
                    >
                      {NOTE_NAMES_FR.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                    {newStructRows.length > 1 && (
                      <button onClick={() => setNewStructRows(rows => rows.filter((_, j) => j !== i))}
                        style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 16 }}>×</button>
                    )}
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <Btn variant="ghost" onClick={() => setNewStructRows(rows => [...rows, { indexNote: rows.length + 1, tonique: 'Do' }])}>
                    + Tonique
                  </Btn>
                  <Btn variant="primary" style={{ padding: '8px 16px', fontSize: 12 }} onClick={ajouterStructure} disabled={!newStructNom.trim()}>
                    Créer
                  </Btn>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Réglages accord ──────────────────────────────────────────────────── */}
        <details style={{ marginBottom: 16 }}>
          <summary style={{
            background: COL_SURFACE, borderRadius: 10, padding: '10px 14px',
            border: `1px solid ${COL_BORDER}`, cursor: 'pointer',
            fontSize: 11, color: COL_MUTED, fontWeight: 600, listStyle: 'none',
          }}>
            🎵 Réglages accord
          </summary>
          <div style={{ background: COL_SURFACE, borderRadius: '0 0 10px 10px', padding: '12px 14px 14px', border: `1px solid ${COL_BORDER}`, borderTop: 'none' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <label style={{ fontSize: 11, color: COL_MUTED, flex: '0 0 auto' }}>
                Diapason
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                  <input
                    type="number" min="400" max="480" step="0.1" value={diapason}
                    onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) setDiapason(v) }}
                    style={{ width: 68, background: COL_BG, color: COL_TEXT, border: `1px solid ${COL_BORDER}`, borderRadius: 6, padding: '6px 8px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}
                  />
                  <span style={{ color: COL_MUTED2, fontSize: 11 }}>Hz</span>
                </div>
              </label>
              <label style={{ fontSize: 11, color: COL_MUTED, flex: '1 1 auto' }}>
                Transposition
                <select
                  value={transpoKey}
                  onChange={e => setTranspoKey(e.target.value)}
                  style={{ display: 'block', marginTop: 4, width: '100%', background: COL_BG, color: COL_TEXT, border: `1px solid ${COL_BORDER}`, borderRadius: 6, padding: '6px 8px', fontSize: 12 }}
                >
                  {Object.entries(TRANSPOSITIONS).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: 11, color: COL_MUTED, flex: '0 0 auto' }}>
                Seuil justesse
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                  <input
                    type="number" min="1" max="50" step="1" value={seuil}
                    onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v)) setSeuil(v) }}
                    style={{ width: 48, background: COL_BG, color: COL_TEXT, border: `1px solid ${COL_BORDER}`, borderRadius: 6, padding: '6px 8px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}
                  />
                  <span style={{ color: COL_MUTED2, fontSize: 11 }}>¢</span>
                </div>
              </label>
            </div>
          </div>
        </details>

        {/* ── Réglages segmentation ────────────────────────────────────────────── */}
        <details style={{ marginBottom: 16 }}>
          <summary style={{
            background: COL_SURFACE, borderRadius: 10, padding: '10px 14px',
            border: `1px solid ${COL_BORDER}`, cursor: 'pointer',
            fontSize: 11, color: COL_MUTED, fontWeight: 600, listStyle: 'none',
          }}>
            ⚙ Réglages segmentation
          </summary>
          <div style={{ background: COL_SURFACE, borderRadius: '0 0 10px 10px', padding: '12px 14px 14px', border: `1px solid ${COL_BORDER}`, borderTop: 'none' }}>
            {/* Ligne 1 : champs numériques */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: COL_MUTED, flex: 1 }}>
                Silence
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                  <input
                    type="number" min="20" max="300" step="5" value={silenceDurationMs}
                    onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v)) setSilenceDurationMs(v) }}
                    style={{ width: '100%', background: COL_BG, color: COL_TEXT, border: `1px solid ${COL_BORDER}`, borderRadius: 6, padding: '6px 8px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}
                  />
                  <span style={{ color: COL_MUTED2, fontSize: 11, whiteSpace: 'nowrap' }}>ms</span>
                </div>
              </label>
              <label style={{ fontSize: 11, color: COL_MUTED, flex: 1 }}>
                Saut note
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                  <input
                    type="number" min="20" max="200" step="5" value={noteJumpCents}
                    onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v)) setNoteJumpCents(v) }}
                    style={{ width: '100%', background: COL_BG, color: COL_TEXT, border: `1px solid ${COL_BORDER}`, borderRadius: 6, padding: '6px 8px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}
                  />
                  <span style={{ color: COL_MUTED2, fontSize: 11, whiteSpace: 'nowrap' }}>¢</span>
                </div>
              </label>
              <label style={{ fontSize: 11, color: COL_MUTED, flex: 1 }}>
                Gate RMS
                <div style={{ marginTop: 4 }}>
                  <input
                    type="number" min="0" max="0.15" step="0.005" value={gateLevel}
                    onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) { setGateLevel(v); gateLevelRef.current = v } }}
                    style={{ width: '100%', background: COL_BG, color: COL_TEXT, border: `1px solid ${COL_BORDER}`, borderRadius: 6, padding: '6px 8px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit' }}
                  />
                </div>
              </label>
            </div>
            {/* Ligne 2 : seuil clarté slider */}
            <label style={{ fontSize: 11, color: COL_MUTED }}>
              Seuil clarté
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <input
                  type="range" min="0.5" max="1.0" step="0.01" value={clarityThreshold}
                  onChange={e => setClarityThreshold(Number(e.target.value))}
                  style={{ flex: 1, accentColor: COL_ACCENT }}
                />
                <span style={{ color: COL_TEXT, fontWeight: 700, minWidth: 36 }}>{clarityThreshold.toFixed(2)}</span>
              </div>
              <div style={{ color: COL_MUTED2, fontSize: 10, marginTop: 2 }}>
                Haut = moins de faux positifs
              </div>
            </label>
            {phase === 'resultats' && (
              <div style={{ marginTop: 8, fontSize: 10, color: COL_MUTED2 }}>
                Modification active le bouton ↻ Recalculer sur la portée.
              </div>
            )}
          </div>
        </details>

        {/* ── Outils pédagogiques ─────────────────────────────────────────────── */}
        {[
          {
            id: 'accord',
            titre: 'Générateur d\'accord',
            icone: (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3"/><circle cx="5" cy="7" r="2"/><circle cx="19" cy="7" r="2"/><circle cx="5" cy="17" r="2"/><circle cx="19" cy="17" r="2"/>
                <line x1="7" y1="7" x2="10" y2="11"/><line x1="17" y1="7" x2="14" y2="11"/><line x1="7" y1="17" x2="10" y2="13"/><line x1="17" y1="17" x2="14" y2="13"/>
              </svg>
            ),
            content: (
              <GenerateurAccord
                transpoKey={transpoKey}
                referentiel={referentiel}
                diapason={diapason}
                seuil={seuil}
                liveNote={liveNote}
                onGeneratorPcsChange={pcs => { generatorPcsRef.current = pcs }}
              />
            ),
          },
          {
            id: 'gamme',
            titre: 'Jeu de gamme',
            icone: (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="18" x2="3" y2="6"/><line x1="8" y1="18" x2="8" y2="9"/><line x1="13" y1="18" x2="13" y2="5"/><line x1="18" y1="18" x2="18" y2="11"/><line x1="21" y1="18" x2="1" y2="18"/>
              </svg>
            ),
            content: (
              <JeuGamme
                transpoKey={transpoKey}
                referentiel={referentiel}
                diapason={diapason}
                seuil={seuil}
                silenceDurationMs={silenceDurationMs}
                noteJumpCents={noteJumpCents}
                clarityThreshold={clarityThreshold}
                gateLevel={gateLevel}
              />
            ),
          },
        ].map(({ id, titre, icone, content }) => (
          <div key={id} style={{ marginTop: 8, border: `1px solid ${COL_BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
            <button
              onClick={() => setOuvertPanel(p => p === id ? null : id)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                background: COL_SURFACE, border: 'none', padding: '12px 16px',
                cursor: 'pointer', color: COL_TEXT,
                fontFamily: "'Inter','Segoe UI',sans-serif", fontSize: 13, fontWeight: 600,
                textAlign: 'left',
              }}
            >
              <span style={{ color: COL_ACCENT }}>{icone}</span>
              <span style={{ flex: 1 }}>{titre}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={COL_MUTED2} strokeWidth="2.5"
                style={{ transform: ouvertPanel === id ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            {ouvertPanel === id && (
              <div style={{ padding: '16px', background: COL_BG, borderTop: `1px solid ${COL_BORDER}` }}>
                {content}
              </div>
            )}
          </div>
        ))}

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
