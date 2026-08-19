// ─── Module Notes — orchestrateur (spec §2, §4, §7) ───────────────────────────
//
// Machine d'états IDLE → ITEM_READY → AWAITING → FEEDBACK → SESSION_SUMMARY.
// Règle absolue : AUCUN son avant la réponse (§2) — `beep` n'est appelé que dans
// handleAnswer, jamais au chargement d'un item. RT horodaté depuis la PEINTURE
// (rAF après commit du rendu), jamais depuis setState (§4, §13.5). Feedback
// immédiat non bloquant : le curseur avance toujours, pas de rejeu (§13.2).

import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import useProgressFirebase from '../../hooks/useProgressFirebase'
import { useModuleProgress } from '../../hooks/useModuleProgress'
import { ThemeToggleInline } from '../../ThemeContext'
import ConsigneOverlayRaw, { consigneSeen } from '../../ConsigneOverlay'

// ConsigneOverlay est en JSX (props non typées) : cast pour l'interop TS.
const ConsigneOverlay = ConsigneOverlayRaw as unknown as React.ComponentType<Record<string, unknown>>

import NotesStaff, { type CellResult } from './NotesStaff.tsx'
import RadialWheel, { NOTE_LABELS, type WheelMode } from './RadialWheel.tsx'
import { profileForClef, CLEF_LABELS, type ReadingProfile } from './profiles.ts'
import { beginnerInstruments, getInstrument, instrumentClefs } from './instruments.ts'
import { buildPool, resolveAmbitusStep } from './pool.ts'
import { selectNextItem, generateLine, DEFAULT_LINE_WEIGHTS } from './selection.ts'
import { classifyAttempt, updateMastery } from './mastery.ts'
import { computeSessionSummary } from './summary.ts'
import { flagsToBitmask } from './encode.ts'
import { noteNameOf, degreeOfName, degreeOf, octaveOf, diatonic } from './diatonic.ts'
import { isStringInstrument, stringPool, stringDefaultRange } from './strings.ts'
import { IS_DEV } from '../../isDev'
import { mulberry32, type Rng } from './rng.ts'
import { busMaitre } from '../../lib/busMaitre'
import {
  aggregatePerNote, mergePerNote, mergeContext, contextKey, noteMasteryLevel,
  type PerNoteMap, type PerContextMap, type MasteryLevel,
} from './progressStats.ts'
import {
  DEFAULT_CONFIG, NOTE_NAMES,
  type Attempt, type Clef, type Mastery, type NoteItem, type NoteName,
  type NotesSessionConfig, type NotesSummary, type Phase,
} from './types.ts'

const TARGET_ISOLATED = 16   // items en P0/P1
const TARGET_LINES = 3       // lignes de 8 en P2
const LINE_LEN = 8
const FLOOR_WEIGHT = 0.15

// Persistance des préférences entre sessions (spec point 5).
const LS = {
  get(k: string, d: string): string { try { return localStorage.getItem(k) ?? d } catch { return d } },
  set(k: string, v: string) { try { localStorage.setItem(k, v) } catch { /* ignore */ } },
}

const PHASE_LABEL: Record<Phase, string> = { P0: 'Repères', P1: 'Extension', P2: 'Fluidité' }
const PHASE_DESC: Record<Phase, string> = {
  P0: 'Notes repères, sans chrono, noms visibles sur la roue.',
  P1: 'Ambitus élargi, chrono affiché, noms estompés.',
  P2: 'Lignes de 8 au curseur, débit mesuré, noms masqués.',
}

// Étape d'ambitus jouée selon la phase (identique à start()).
function ambitusStepFor(profile: ReadingProfile, phase: Phase): number {
  const last = profile.ambitusSequence.length - 1
  return phase === 'P0' ? 0 : phase === 'P1' ? Math.min(1, last) : last
}

// Cordes sélectionnables uniquement en Dev (local + preview).
function stringEnabled(id: string): boolean {
  return IS_DEV && isStringInstrument(id)
}

// Niveaux de la progression cordes (Repères → Extension +1/+2/+3 → Fluidité).
const STRING_LEVELS: { phase: Phase; step: number; label: string; desc: string }[] = [
  { phase: 'P0', step: 0, label: 'Cordes à vide', desc: 'Les 4 cordes à vide, colorées par corde.' },
  { phase: 'P1', step: 1, label: 'Cordes + 1 doigt', desc: 'Cordes à vide + 1er doigt.' },
  { phase: 'P1', step: 2, label: 'Cordes + 2 doigts', desc: 'Jusqu’au 2e doigt.' },
  { phase: 'P1', step: 3, label: 'Cordes + 3 doigts', desc: 'Jusqu’au 3e doigt.' },
  { phase: 'P2', step: 3, label: 'Fluidité', desc: 'Lignes au curseur.' },
]

// ── Instrument « Personnalisé » (runtime, non listé dans INSTRUMENTS) ──────────
const CUSTOM_ID = 'custom'
const ALL_CLEFS: Clef[] = ['treble', 'bass', 'alto', 'tenor']

type ClefRange = { low: number; high: number }

// Plages par défaut (index diatonique, octave FR : do3 = do central).
// Calibration fournie : Sol G2→C5, Fa C1→E3, Ut3 C2→E4, Ut4 Fa1→C4.
const DEFAULT_CLEF_RANGES: Record<Clef, ClefRange> = {
  treble: { low: diatonic(2, 4), high: diatonic(5, 0) }, // sol2 → do5
  bass:   { low: diatonic(1, 0), high: diatonic(3, 2) }, // do1 → mi3
  alto:   { low: diatonic(2, 0), high: diatonic(4, 2) }, // do2 → mi4
  tenor:  { low: diatonic(1, 3), high: diatonic(4, 0) }, // fa1 → do4
}

interface CustomCfg { clefs: Clef[]; ranges: Record<Clef, ClefRange> }

function loadCustom(): CustomCfg {
  try {
    const raw = JSON.parse(localStorage.getItem('notes_custom') || '')
    if (raw && Array.isArray(raw.clefs)) {
      const clefs = raw.clefs.filter((c: Clef) => ALL_CLEFS.includes(c))
      const ranges: Record<Clef, ClefRange> = { ...DEFAULT_CLEF_RANGES }
      if (raw.ranges) for (const c of ALL_CLEFS) {
        const r = raw.ranges[c]
        if (r && typeof r.low === 'number' && typeof r.high === 'number') ranges[c] = { low: r.low, high: r.high }
      }
      if (clefs.length) return { clefs, ranges }
    }
  } catch { /* défaut ci-dessous */ }
  return { clefs: ['treble'], ranges: { ...DEFAULT_CLEF_RANGES } }
}

// Profil de lecture synthétisé depuis une plage perso (spec : repères auto +
// plage complète). P0 = grave/médium/aigu ; P1/P2 = toute la plage.
function customProfile(clef: Clef, range: ClefRange): ReadingProfile {
  const lo = Math.min(range.low, range.high), hi = Math.max(range.low, range.high)
  const mid = Math.round((lo + hi) / 2)
  const landmarks = [...new Set([lo, mid, hi])]
  return { id: 'custom', clef, landmarks, ambitusSequence: [{ low: lo, high: hi }] }
}

// ── Config clefs + tessiture pour les instruments à cordes (comme Perso) ──────
const STRING_IDS = ['violon', 'alto', 'violoncelle', 'contrebasse']

function stringDefaultCfg(id: string): CustomCfg {
  const inst = getInstrument(id)!
  const clefs = instrumentClefs(inst)
  const ranges = {} as Record<Clef, ClefRange>
  for (const c of ALL_CLEFS) ranges[c] = stringDefaultRange(id, c)
  return { clefs, ranges }
}

function loadStringCfgs(): Record<string, CustomCfg> {
  const out: Record<string, CustomCfg> = {}
  for (const id of STRING_IDS) out[id] = stringDefaultCfg(id)
  try {
    const raw = JSON.parse(localStorage.getItem('notes_stringcfg') || '')
    if (raw) for (const id of STRING_IDS) {
      const r = raw[id]
      if (r && Array.isArray(r.clefs)) {
        const avail = instrumentClefs(getInstrument(id)!)
        const clefs = r.clefs.filter((c: Clef) => avail.includes(c))
        const ranges = { ...out[id].ranges }
        if (r.ranges) for (const c of ALL_CLEFS) {
          const rr = r.ranges[c]
          if (rr && typeof rr.low === 'number' && typeof rr.high === 'number') ranges[c] = { low: rr.low, high: rr.high }
        }
        if (clefs.length) out[id] = { clefs, ranges }
      }
    }
  } catch { /* défauts */ }
  return out
}

const MASTERY_COLOR: Record<MasteryLevel, string> = {
  strong: '#34d399', mid: '#fbbf24', weak: '#f87171', unknown: 'var(--surface-2)',
}

// Fréquence réelle d'une note écrite (diatonique, sans altération = Do majeur).
const SEMITONE_OF_DEGREE = [0, 2, 4, 5, 7, 9, 11] // do,re,mi,fa,sol,la,si
function freqOfDiatonic(idx: number): number {
  const midi = 12 * (octaveOf(idx) + 2) + SEMITONE_OF_DEGREE[degreeOf(idx)] // do3(21) → 60
  return 440 * Math.pow(2, (midi - 69) / 12)
}

function noteChipLabel(idx: number): string {
  return `${NOTE_LABELS[noteNameOf(idx)]}${octaveOf(idx)}`
}

// Heatmap des notes : une puce par note, colorée par niveau de maîtrise cumulé.
function NoteHeatmap({ items, perNote }: { items: NoteItem[]; perNote: PerNoteMap }) {
  if (!items.length) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {items.map(it => {
        const lvl = noteMasteryLevel(perNote[it.id])
        const solid = lvl !== 'unknown'
        const c = MASTERY_COLOR[lvl]
        return (
          <span key={it.id} style={{
            fontSize: 12, fontWeight: 700, padding: '4px 8px', borderRadius: 8,
            background: solid ? c : 'var(--surface-2)',
            color: solid ? '#0a0f1a' : 'var(--text-muted)',
            border: `1px solid ${solid ? c : 'var(--border-c)'}`,
          }}>{noteChipLabel(it.diatonicIndex)}</span>
        )
      })}
    </div>
  )
}

export default function NotesPage() {
  const navigate = useNavigate()
  const { addSession } = useProgressFirebase()
  const mp = useModuleProgress('notes')

  const [showConsigne, setShowConsigne] = useState(() => !consigneSeen('notes'))
  const [screen, setScreen] = useState<'setup' | 'play' | 'summary'>('setup')

  // Réglages de session — persistés entre sessions (instrument / niveau / son / couleur).
  // « Personnalisé » (+ cordes en Dev) sélectionnable ; les autres restent grisés.
  const [instrumentId, setInstrumentId] = useState<string>(() => {
    const v = LS.get('notes_instrument', '')
    return v === CUSTOM_ID || stringEnabled(v) ? v : CUSTOM_ID
  })
  useEffect(() => { LS.set('notes_instrument', instrumentId) }, [instrumentId])
  const [phase, setPhase] = useState<Phase>(() => {
    const v = LS.get('notes_phase', 'P0')
    return (['P0', 'P1', 'P2'] as string[]).includes(v) ? (v as Phase) : 'P0'
  })
  const [customCfg, setCustomCfg] = useState<CustomCfg>(loadCustom)
  const [stringCfgs, setStringCfgs] = useState<Record<string, CustomCfg>>(loadStringCfgs)
  const [coloriser, setColoriser] = useState(() => LS.get('notes_couleur', '0') === '1')
  const [sonOn, setSonOn] = useState(() => LS.get('notes_son', '1') === '1')
  const [wheelMode, setWheelMode] = useState<WheelMode>(() => (LS.get('notes_wheelmode', 'fixed') === 'drag' ? 'drag' : 'fixed'))
  const [stringStep, setStringStep] = useState<number>(1) // sous-phase Extension cordes (1..3)
  const [sessionClef, setSessionClef] = useState<Clef>('treble') // clef tirée au sort pour la session
  const [hoverName, setHoverName] = useState<NoteName | null>(null)

  useEffect(() => { LS.set('notes_phase', phase) }, [phase])
  useEffect(() => { LS.set('notes_couleur', coloriser ? '1' : '0') }, [coloriser])
  useEffect(() => { LS.set('notes_son', sonOn ? '1' : '0') }, [sonOn])
  useEffect(() => { LS.set('notes_wheelmode', wheelMode) }, [wheelMode])
  useEffect(() => { LS.set('notes_custom', JSON.stringify(customCfg)) }, [customCfg])
  useEffect(() => { LS.set('notes_stringcfg', JSON.stringify(stringCfgs)) }, [stringCfgs])

  // Config active (clefs + tessitures) selon l'instrument : Perso ou profil corde.
  const isCustomInst = instrumentId === CUSTOM_ID
  const isStrInst = stringEnabled(instrumentId)
  const activeCfg: CustomCfg | null = isCustomInst ? customCfg : (isStrInst ? stringCfgs[instrumentId] : null)
  const setActiveCfg = (next: CustomCfg) => {
    if (isCustomInst) setCustomCfg(next)
    else if (isStrInst) setStringCfgs({ ...stringCfgs, [instrumentId]: next })
  }
  const selectableClefs: Clef[] = isCustomInst ? ALL_CLEFS : (isStrInst ? instrumentClefs(getInstrument(instrumentId)!) : [])
  const selectedClefs: Clef[] = activeCfg?.clefs ?? []

  // État de jeu
  const [sequence, setSequence] = useState<NoteItem[]>([])
  const [cursorIndex, setCursorIndex] = useState(0)
  const [results, setResults] = useState<CellResult[]>([])
  const [correction, setCorrection] = useState<NoteName | null>(null) // bonne réponse après erreur (non bloquant)
  const [itemsDone, setItemsDone] = useState(0)
  const [elapsedS, setElapsedS] = useState(0)
  const [summary, setSummary] = useState<NotesSummary | null>(null)
  const [summaryData, setSummaryData] = useState<{ perNote: PerNoteMap; items: NoteItem[] } | null>(null)

  // Refs (hors cycle de rendu) — source de vérité de la boucle, robuste aux réponses rapides.
  const configRef = useRef<NotesSessionConfig | null>(null)
  const poolRef = useRef<NoteItem[]>([])
  const seqRef = useRef<NoteItem[]>([])
  const cursorRef = useRef(0)
  const masteryRef = useRef<Mastery>({})
  const turnRef = useRef(0)
  const attemptsRef = useRef<Attempt[]>([])
  const prevIdRef = useRef<string | undefined>(undefined)
  const paintTsRef = useRef(0)
  const rngRef = useRef<Rng>(mulberry32((Date.now() & 0xffffffff) >>> 0))
  const startMsRef = useRef(0)
  const correctionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const audioRef = useRef<AudioContext | null>(null)

  // Nettoyage
  useEffect(() => () => { if (correctionTimer.current) clearTimeout(correctionTimer.current) }, [])

  // ── RT depuis la PEINTURE : horodatage dans un rAF après commit du rendu ───────
  useEffect(() => {
    if (screen !== 'play' || sequence.length === 0) return
    const id = requestAnimationFrame(() => { paintTsRef.current = performance.now() })
    return () => cancelAnimationFrame(id)
  }, [screen, sequence, cursorIndex])

  // Chrono (uniquement hors P0 — §7)
  useEffect(() => {
    if (screen !== 'play' || phase === 'P0') return
    const t = setInterval(() => setElapsedS(Math.round((performance.now() - startMsRef.current) / 1000)), 1000)
    return () => clearInterval(t)
  }, [screen, phase])

  // Son de CONFIRMATION — jamais avant la réponse (§2). Court, désactivable.
  function audioCtx(): AudioContext | null {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      audioRef.current = audioRef.current ?? new Ctx()
      return audioRef.current
    } catch { return null }
  }
  function playTone(freq: number, when = 0, dur = 0.22) {
    if (!sonOn) return
    const ac = audioCtx(); if (!ac) return
    const t0 = ac.currentTime + when
    const o = ac.createOscillator(), g = ac.createGain()
    o.type = 'sine'; o.frequency.value = freq
    o.connect(g); g.connect(busMaitre(ac))
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(0.2, t0 + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    o.start(t0); o.stop(t0 + dur + 0.02)
  }
  // Note « piano » synthétisée (additive + enveloppe percussive) — homogène sur tous
  // les registres, sans fichier audio.
  function playPiano(freq: number, when = 0) {
    if (!sonOn) return
    const ac = audioCtx(); if (!ac) return
    const t0 = ac.currentTime + when
    const dur = 0.85
    const master = ac.createGain()
    master.connect(busMaitre(ac))
    master.gain.setValueAtTime(0.0001, t0)
    master.gain.exponentialRampToValueAtTime(0.26, t0 + 0.006) // attaque rapide
    master.gain.exponentialRampToValueAtTime(0.0001, t0 + dur) // décroissance
    const partials: [number, number][] = [[1, 1], [2, 0.5], [3, 0.28], [4, 0.13], [5, 0.06]]
    for (const [mult, amp] of partials) {
      const o = ac.createOscillator(), g = ac.createGain()
      o.type = 'sine'; o.frequency.value = freq * mult
      g.gain.value = amp
      o.connect(g); g.connect(master)
      o.start(t0); o.stop(t0 + dur + 0.02)
    }
  }
  // Correct → la note écrite au PIANO. Clefs graves (Fa/Ut3/Ut4) montées d'1 octave
  // pour rester audibles sur HP de smartphone. Faux → double bip grave neutre.
  function playFeedbackSound(correct: boolean, diatonicIndex: number, clef: Clef) {
    if (correct) {
      const octaveUp = clef === 'treble' ? 1 : 2
      playPiano(freqOfDiatonic(diatonicIndex) * octaveUp)
    } else {
      playTone(220, 0, 0.09); playTone(220, 0.12, 0.09)
    }
  }

  // ── Démarrage d'une session ────────────────────────────────────────────────────
  function start() {
    // La clef travaillée est TIRÉE AU SORT parmi les clefs à travailler.
    const clefs: Clef[] = selectedClefs.length ? selectedClefs : ['treble']
    const clef = clefs[Math.floor(Math.random() * clefs.length)]
    setSessionClef(clef)

    let pool: NoteItem[]
    let ambitus: { low: number; high: number } | undefined
    if (isStrInst) {
      // Progression cordes (Dev) : cordes à vide → +1/+2/+3 doigts → fluidité,
      // filtrée par la tessiture de la clef tirée (n'affiche que le lisible).
      const range = stringCfgs[instrumentId]?.ranges[clef] ?? stringDefaultRange(instrumentId, clef)
      pool = stringPool(instrumentId, clef, phase, stringStep, range)
      if (pool.length === 0) pool = stringPool(instrumentId, clef, phase, stringStep) // garde-fou
    } else {
      const inst = getInstrument(instrumentId)
      const profile = instrumentId === CUSTOM_ID
        ? customProfile(clef, customCfg.ranges[clef] ?? DEFAULT_CLEF_RANGES[clef])
        : profileForClef(inst!.primaryProfile, clef)
      const lastStep = profile.ambitusSequence.length - 1
      const step = phase === 'P0' ? 0 : phase === 'P1' ? Math.min(1, lastStep) : lastStep
      pool = buildPool(profile, phase, step)
      ambitus = phase === 'P0'
        ? { low: Math.min(...profile.landmarks), high: Math.max(...profile.landmarks) }
        : profile.ambitusSequence[resolveAmbitusStep(profile, phase, step)]
    }
    if (!ambitus) {
      const idxs = pool.map(p => p.diatonicIndex)
      ambitus = { low: Math.min(...idxs), high: Math.max(...idxs) }
    }

    const config: NotesSessionConfig = {
      clef, phase, ambitus,
      coloriser, etayage: phase === 'P0' ? 'visible' : phase === 'P1' ? 'estompe' : 'masque',
      guessFloorMs: DEFAULT_CONFIG.guessFloorMs, sonConfirmation: sonOn,
      rtTargetMs: DEFAULT_CONFIG.rtTargetMs, slowCeilingMs: DEFAULT_CONFIG.slowCeilingMs,
    }

    configRef.current = config
    poolRef.current = pool
    masteryRef.current = {}
    turnRef.current = 0
    attemptsRef.current = []
    prevIdRef.current = undefined
    startMsRef.current = performance.now()
    setItemsDone(0); setElapsedS(0); setSummary(null)

    mp.startSession(config as unknown as Record<string, unknown>)
    setScreen('play')
    loadNext(config, pool)
  }

  // Charge le prochain item isolé (P0/P1) ou la prochaine ligne (P2).
  function loadNext(config: NotesSessionConfig, pool: NoteItem[]) {
    cursorRef.current = 0
    setCursorIndex(0)
    if (config.phase === 'P2') {
      // Séquence P2 continue : TARGET_LINES phrases de 8 (chacune tonalement cohérente,
      // début/fin stables) concaténées et rendues EN UNE PASSE → défilement continu
      // sur les 24 notes, aucun re-render VexFlow de toute la session (§13.4).
      const full: NoteItem[] = []
      for (let l = 0; l < TARGET_LINES; l++) {
        full.push(...generateLine(pool, DEFAULT_LINE_WEIGHTS, rngRef.current, LINE_LEN))
      }
      seqRef.current = full
      setSequence(full)
      setResults(Array(full.length).fill(null))
    } else {
      const item = selectNextItem(pool, masteryRef.current, rngRef.current, {
        rtTargetMs: config.rtTargetMs, floorWeight: FLOOR_WEIGHT,
        turn: turnRef.current, previousItemId: prevIdRef.current,
      })
      prevIdRef.current = item.id
      seqRef.current = [item]
      setSequence([item])
      setResults([null])
    }
  }

  // ── Réponse (pointerup de la roue) — jamais bloquante, enchaînable (spec §13.2) ──
  function handleAnswer(name: NoteName | null) {
    const config = configRef.current
    if (!config) return
    if (name == null) return // annulation zone morte
    const idx = cursorRef.current
    const current = seqRef.current[idx]
    if (!current) return

    const rtMs = performance.now() - paintTsRef.current
    const correct = name === noteNameOf(current.diatonicIndex)
    const isFirstOfLine = config.phase === 'P2' && idx % LINE_LEN === 0
    const flags = classifyAttempt(rtMs, correct, config, { isFirstOfLine })

    const attempt: Attempt = {
      itemId: current.id, clef: current.clef, diatonicIndex: current.diatonicIndex,
      answered: name, correct, rtMs, flags, atMs: Date.now(),
    }
    attemptsRef.current.push(attempt)
    mp.recordItem({
      index: attemptsRef.current.length - 1,
      expected: current.diatonicIndex,
      answered: degreeOfName(name),
      rtMs: Math.round(rtMs),
      flags: flagsToBitmask(flags),
    })
    masteryRef.current = updateMastery(masteryRef.current, attempt, turnRef.current++)

    setResults(prev => { const n = [...prev]; n[idx] = correct ? 'correct' : 'wrong'; return n })
    playFeedbackSound(correct, current.diatonicIndex, config.clef) // APRÈS la réponse uniquement (§2)

    // Correction non bloquante : la bonne réponse s'affiche brièvement au-dessus de
    // la portée, sans figer l'entrée ni la roue (on peut enchaîner).
    if (!correct) {
      setCorrection(noteNameOf(current.diatonicIndex))
      if (correctionTimer.current) clearTimeout(correctionTimer.current)
      correctionTimer.current = setTimeout(() => setCorrection(null), 1100)
    }

    advance(config) // avance immédiatement (aucun délai)
  }

  // Avance TOUJOURS, sans délai (jamais de rejeu immédiat — §13.2).
  function advance(config: NotesSessionConfig) {
    const done = attemptsRef.current.length
    setItemsDone(done)

    if (config.phase === 'P2') {
      // Défilement continu : on avance le curseur sur la séquence complète (24 notes).
      if (cursorRef.current < seqRef.current.length - 1) {
        cursorRef.current += 1
        setCursorIndex(cursorRef.current)
        return
      }
      void endSession(config)
    } else {
      // Repères/Extension : déroulement. On APPEND la note suivante (sélection
      // adaptative), curseur centré ; le passé reste visible (défile hors cadre),
      // aucune note future n'est affichée.
      if (done >= TARGET_ISOLATED) { void endSession(config); return }
      const item = selectNextItem(poolRef.current, masteryRef.current, rngRef.current, {
        rtTargetMs: config.rtTargetMs, floorWeight: FLOOR_WEIGHT,
        turn: turnRef.current, previousItemId: prevIdRef.current,
      })
      prevIdRef.current = item.id
      seqRef.current = [...seqRef.current, item]
      cursorRef.current = seqRef.current.length - 1
      setSequence(seqRef.current)
      setResults(prev => [...prev, null])
      setCursorIndex(cursorRef.current)
    }
  }

  // ── Fin de session : EXACTEMENT 2 écritures Firestore + XP globale ──────────────
  async function endSession(config: NotesSessionConfig) {
    const attempts = attemptsRef.current
    const s = computeSessionSummary(attempts)
    const durationMs = Math.round(performance.now() - startMsRef.current)
    const t = mp.progress.totals
    const persistSummary = {
      score: Math.round(s.accuracy * 100),
      itemCount: s.itemCount, accuracy: s.accuracy, medianRtMs: s.medianRtMs,
      debitNotesMin: s.debitNotesMin, cvIntervalles: s.cvIntervalles, // §13.8 : persisté
    }

    // Progression détaillée (fusion en mémoire → 1 seule écriture) : heatmap par note
    // + stats par (instrument × clef × phase).
    const prevPayload = (mp.progress.payload ?? {}) as { perNote?: PerNoteMap; perContext?: PerContextMap }
    const nonGuess = attempts.filter(a => !a.flags.includes('guess'))
    const sessCorrect = nonGuess.filter(a => a.correct).length
    const sessSumRt = nonGuess.reduce((sum, a) => sum + a.rtMs, 0)
    const perNote = mergePerNote(prevPayload.perNote ?? {}, aggregatePerNote(attempts))
    const ctxK = contextKey(instrumentId, config.clef, config.phase)
    const perContext: PerContextMap = {
      ...(prevPayload.perContext ?? {}),
      [ctxK]: mergeContext(prevPayload.perContext?.[ctxK], nonGuess.length, sessCorrect, sessSumRt, s.accuracy),
    }

    try {
      await mp.commitSession({
        summary: persistSummary,
        progressPatch: {
          totals: { sessions: t.sessions + 1, items: t.items + s.itemCount, timeMs: t.timeMs + durationMs },
          levels: { [config.phase]: { best: s.accuracy, attempts: (mp.progress.levels[config.phase]?.attempts ?? 0) + 1, lastAt: Date.now() } },
          payload: { lastPhase: config.phase, coloriser: config.coloriser, etayage: config.etayage, perNote, perContext },
        },
      })
    } catch (e) { console.warn('Notes commit', e) }

    // Barème calé sur les autres modules : 1 session Notes = 1 « exercice » ≈ ¼ d'une
    // série (10 questions ≈ 500 XP) → ~125 XP au max, pondéré par la réussite.
    const medal = s.accuracy >= 0.9 ? 'or' : s.accuracy >= 0.75 ? 'argent' : 'bronze'
    const xpEarned = Math.max(5, Math.round(125 * s.accuracy))
    try {
      await addSession({
        module: 'notes', xpEarned, medal,
        details: { level: PHASE_LABEL[config.phase], items: attempts.length, mode: CLEF_LABELS[config.clef] },
      })
    } catch { /* offline ok */ }

    // Notes travaillées cette session (dédoublonnées) pour la heatmap du bilan.
    const practiced = new Map<string, NoteItem>()
    for (const a of attempts) practiced.set(a.itemId, { id: a.itemId, clef: a.clef, diatonicIndex: a.diatonicIndex })
    setSummaryData({ perNote, items: [...practiced.values()].sort((x, y) => x.diatonicIndex - y.diatonicIndex) })
    setSummary(s)
    setScreen('summary')
  }

  // ── Rendu ──────────────────────────────────────────────────────────────────────
  const target = phase === 'P2' ? TARGET_LINES * LINE_LEN : TARGET_ISOLATED
  const payload = (mp.progress.payload ?? {}) as { perNote?: PerNoteMap; perContext?: PerContextMap }
  const availableClefs = selectedClefs

  return (
    <div className="bg-app min-h-dvh flex flex-col" style={{ maxWidth: 540, margin: '0 auto', width: '100%' }}>
      {showConsigne && (
        <ConsigneOverlay
          storageKey="notes"
          icon="🎼"
          title="Lecture de notes"
          lines={[
            'Une note s’affiche sur la portée : donne son nom.',
            'Appuie ou glisse vers le nom de la note.',
            'Pas de son avant ta réponse : c’est à toi de lire.',
          ]}
          warning={{ tone: 'sound', text: 'Un petit son confirme ta réponse (désactivable dans les réglages).' }}
          onStart={() => setShowConsigne(false)}
          onClose={() => setShowConsigne(false)}
        />
      )}

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={() => (screen === 'play' ? setScreen('setup') : navigate('/'))}
          aria-label="Retour"
          style={{ background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: 10, width: 40, height: 40, color: 'var(--text)', cursor: 'pointer' }}>
          ←
        </button>
        <h1 style={{ fontFamily: "'Righteous', sans-serif", fontSize: 22, color: 'var(--text)', margin: 0 }}>Notes</h1>
        <div style={{ marginLeft: 'auto' }}><ThemeToggleInline /></div>
      </div>

      {screen === 'setup' && (
        <SetupScreen
          instrumentId={instrumentId} setInstrumentId={setInstrumentId}
          availableClefs={availableClefs}
          activeCfg={activeCfg} setActiveCfg={setActiveCfg} selectableClefs={selectableClefs}
          phase={phase} setPhase={setPhase}
          stringStep={stringStep} setStringStep={setStringStep}
          coloriser={coloriser} setColoriser={setColoriser}
          sonOn={sonOn} setSonOn={setSonOn}
          wheelMode={wheelMode} setWheelMode={setWheelMode}
          perNote={payload.perNote ?? {}} perContext={payload.perContext ?? {}}
          onStart={start}
        />
      )}

      {screen === 'play' && (
        <div style={{ position: 'relative', flex: 1 }}>
          {/* Chaque bloc est positionné en ABSOLU à un top fixe : la portée ne bouge
              JAMAIS, quel que soit le contenu du label (survol/correction) ou la roue. */}
          <div style={{ position: 'absolute', top: 6, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-muted)', pointerEvents: 'none', zIndex: 1 }}>
            <span>{PHASE_LABEL[phase]}</span>
            <span>{Math.min(itemsDone, target)} / {target}</span>
            {phase !== 'P0' && <span>{elapsedS}s</span>}
          </div>
          {/* Label (hauteur fixe) — n'influence pas la position de la portée. */}
          <div style={{ position: 'absolute', top: 40, left: 0, right: 0, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 1 }}>
            {hoverName ? (
              <span style={{ fontSize: 40, fontWeight: 900, lineHeight: 1, fontFamily: "'Poppins', sans-serif", color: '#c084fc' }}>
                {NOTE_LABELS[hoverName]}
              </span>
            ) : correction ? (
              <span style={{ fontSize: 22, fontWeight: 800, lineHeight: 1, fontFamily: "'Poppins', sans-serif", color: '#f87171' }}>
                C’était {NOTE_LABELS[correction]}
              </span>
            ) : null}
          </div>
          {/* Portée — position FIXE (top constant), remontée pour dégager la roue. */}
          <div style={{ position: 'absolute', top: 96, left: 12, right: 12, pointerEvents: 'none', zIndex: 1 }}>
            <NotesStaff
              items={sequence} clef={configRef.current?.clef ?? 'treble'}
              cursorIndex={cursorIndex} results={results} coloriser={coloriser}
              stringColorId={stringEnabled(instrumentId) ? instrumentId : undefined}
            />
          </div>
          {/* Roue plein écran, au-dessus (sans cadre), toujours accessible.
              En mode fixe, le cadran est centré SOUS la portée (fixedTop). */}
          <div style={{ position: 'absolute', inset: 0, zIndex: 2 }}>
            <RadialWheel
              mode={wheelMode}
              fixedTop={372}
              etayage={configRef.current?.etayage ?? 'visible'}
              onSelect={handleAnswer}
              onHover={setHoverName}
              onGestureStart={() => setCorrection(null)}
            />
          </div>
        </div>
      )}

      {screen === 'summary' && summary && (
        <SummaryScreen
          summary={summary} phase={phase} clef={sessionClef}
          perNote={summaryData?.perNote ?? {}} items={summaryData?.items ?? []}
          onReplay={() => { setScreen('setup') }}
          onHome={() => navigate('/')}
        />
      )}
    </div>
  )
}

// ── Écran de configuration ────────────────────────────────────────────────────
function SetupScreen({ instrumentId, setInstrumentId, availableClefs, activeCfg, setActiveCfg, selectableClefs, phase, setPhase, stringStep, setStringStep, coloriser, setColoriser, sonOn, setSonOn, wheelMode, setWheelMode, perNote, perContext, onStart }: {
  instrumentId: string; setInstrumentId: (v: string) => void
  availableClefs: Clef[]
  activeCfg: CustomCfg | null; setActiveCfg: (c: CustomCfg) => void; selectableClefs: Clef[]
  phase: Phase; setPhase: (p: Phase) => void
  stringStep: number; setStringStep: (s: number) => void
  coloriser: boolean; setColoriser: (v: boolean) => void
  sonOn: boolean; setSonOn: (v: boolean) => void
  wheelMode: WheelMode; setWheelMode: (m: WheelMode) => void
  perNote: PerNoteMap; perContext: PerContextMap
  onStart: () => void
}) {
  const label = "text-xs font-bold text-app-muted uppercase tracking-widest"
  const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: 16, padding: 16 }

  const isCustom = instrumentId === CUSTOM_ID
  const isStr = stringEnabled(instrumentId)
  const inst = getInstrument(instrumentId)
  const instLabel = isCustom ? 'Personnalisé' : (inst?.label ?? '')
  // Pool d'une clef pour la heatmap de progression (cordes / perso / instrument).
  const poolForClef = (c: Clef): NoteItem[] => {
    if (isStr) return stringPool(instrumentId, c, phase, stringStep, activeCfg?.ranges[c])
    const p = isCustom
      ? customProfile(c, activeCfg?.ranges[c] ?? DEFAULT_CLEF_RANGES[c])
      : (inst ? profileForClef(inst.primaryProfile, c) : null)
    return p ? buildPool(p, phase, ambitusStepFor(p, phase)) : []
  }

  return (
    <div className="flex flex-col px-4 pb-8" style={{ gap: 14 }}>
      <div style={card}>
        <div className={label} style={{ marginBottom: 8 }}>Instrument</div>
        <select value={instrumentId} onChange={e => setInstrumentId(e.target.value)}
          style={{ width: '100%', minHeight: 44, borderRadius: 10, padding: '0 12px', background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border-c)' }}>
          <option value={CUSTOM_ID}>Personnalisé</option>
          {beginnerInstruments().map(i => {
            const on = stringEnabled(i.id) // cordes activées en Dev seulement
            return <option key={i.id} value={i.id} disabled={!on}>{i.label}{on ? ' (dev)' : ' (bientôt)'}</option>
          })}
        </select>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
          {IS_DEV ? 'Dev : cordes activées (cordes à vide → doigts).' : 'Seul le mode Personnalisé est disponible pour l’instant.'}
        </div>
      </div>

      {/* Clefs à travailler + une tessiture PAR clef (Perso ET profils cordes).
          Les clefs non pertinentes pour l'instrument sont grisées. */}
      {activeCfg && (
        <div style={card}>
          <div className={label} style={{ marginBottom: 8 }}>Clefs à travailler</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {ALL_CLEFS.map(c => {
              const selectable = selectableClefs.includes(c)
              const on = activeCfg.clefs.includes(c)
              return (
                <button key={c} disabled={!selectable}
                  onClick={() => {
                    if (!selectable) return
                    const next = on ? activeCfg.clefs.filter(x => x !== c) : [...activeCfg.clefs, c]
                    if (next.length) setActiveCfg({ ...activeCfg, clefs: next }) // au moins 1 clef
                  }}
                  style={{
                    flex: '1 1 auto', minWidth: 64, minHeight: 44, borderRadius: 10, fontSize: 14, fontWeight: 700,
                    cursor: selectable ? 'pointer' : 'not-allowed', opacity: selectable ? 1 : 0.4,
                    border: `1.5px solid ${on ? '#c084fc' : 'var(--border-c)'}`,
                    background: on ? 'rgba(192,132,252,0.15)' : 'var(--surface-2)',
                    color: on ? '#c084fc' : 'var(--text)',
                  }}>
                  {CLEF_LABELS[c]}
                </button>
              )
            })}
          </div>
          {/* Une ligne de tessiture par clef sélectionnée (étiquette clef en tête). */}
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {activeCfg.clefs.map(c => {
              const r = activeCfg.ranges[c] ?? DEFAULT_CLEF_RANGES[c]
              const setRange = (patch: Partial<ClefRange>) =>
                setActiveCfg({ ...activeCfg, ranges: { ...activeCfg.ranges, [c]: { ...r, ...patch } } })
              return (
                <div key={c} style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
                  <div style={{ minWidth: 42, fontWeight: 800, color: '#c084fc', paddingBottom: 8 }}>{CLEF_LABELS[c]}</div>
                  <BoundPicker label="Grave" value={r.low} onChange={v => setRange({ low: v })} />
                  <BoundPicker label="Aiguë" value={r.high} onChange={v => setRange({ high: v })} />
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div style={card}>
        <div className={label} style={{ marginBottom: 8 }}>Niveau</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {isStr
            ? STRING_LEVELS.map(lvl => {
                const active = phase === lvl.phase && (lvl.phase !== 'P1' || stringStep === lvl.step)
                return (
                  <button key={lvl.label} onClick={() => { setPhase(lvl.phase); if (lvl.phase === 'P1') setStringStep(lvl.step) }}
                    style={{
                      textAlign: 'left', padding: '10px 12px', borderRadius: 12, cursor: 'pointer',
                      border: `1.5px solid ${active ? '#c084fc' : 'var(--border-c)'}`,
                      background: active ? 'rgba(192,132,252,0.15)' : 'var(--surface-2)',
                    }}>
                    <div style={{ fontWeight: 800, color: active ? '#c084fc' : 'var(--text)' }}>{lvl.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{lvl.desc}</div>
                  </button>
                )
              })
            : (['P0', 'P1', 'P2'] as Phase[]).map(p => (
                <button key={p} onClick={() => setPhase(p)}
                  style={{
                    textAlign: 'left', padding: '10px 12px', borderRadius: 12, cursor: 'pointer',
                    border: `1.5px solid ${phase === p ? '#c084fc' : 'var(--border-c)'}`,
                    background: phase === p ? 'rgba(192,132,252,0.15)' : 'var(--surface-2)',
                  }}>
                  <div style={{ fontWeight: 800, color: phase === p ? '#c084fc' : 'var(--text)' }}>{PHASE_LABEL[p]}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{PHASE_DESC[p]}</div>
                </button>
              ))}
        </div>
      </div>

      {/* Mode de saisie de la roue. */}
      <div style={card}>
        <div className={label} style={{ marginBottom: 8 }}>Roue de saisie</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {([['drag', 'Glisser'], ['fixed', 'Fixe']] as [WheelMode, string][]).map(([m, lbl]) => (
            <button key={m} onClick={() => setWheelMode(m)}
              style={{
                flex: 1, minHeight: 44, borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer',
                border: `1.5px solid ${wheelMode === m ? '#c084fc' : 'var(--border-c)'}`,
                background: wheelMode === m ? 'rgba(192,132,252,0.15)' : 'var(--surface-2)',
                color: wheelMode === m ? '#c084fc' : 'var(--text)',
              }}>
              {lbl}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
          {wheelMode === 'drag'
            ? 'Pose le doigt n’importe où et glisse vers le nom.'
            : 'Cadran fixe, noms toujours visibles : clic simple sur le bon nom.'}
        </div>
      </div>

      <div style={{ ...card, display: 'flex', gap: 10 }}>
        <ToggleChip on={sonOn} onClick={() => setSonOn(!sonOn)} label="Son de confirmation" />
        <ToggleChip on={coloriser} onClick={() => setColoriser(!coloriser)} label="Couleur des notes" />
      </div>

      {/* Encart « Ta progression » DÉSACTIVÉ pour l'instant (peu pertinent / non
          optimisé). Réactiver en repassant la condition `false` à `true`. */}
      {false && (
      <div style={card}>
        <div className={label} style={{ marginBottom: 10 }}>Ta progression — {instLabel}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {availableClefs.map(c => (
            <div key={c}>
              <div style={{ fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>Clef de {CLEF_LABELS[c]}</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                {(['P0', 'P1', 'P2'] as Phase[]).map(p => {
                  const ctx = perContext[contextKey(instrumentId, c, p)]
                  return (
                    <div key={p} style={{ flex: 1, textAlign: 'center', background: 'var(--surface-2)', borderRadius: 10, padding: '8px 4px' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{PHASE_LABEL[p]}</div>
                      <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text)' }}>{ctx ? `${Math.round(ctx.bestAccuracy * 100)}%` : '—'}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{ctx ? `${ctx.sessions} sess.` : ''}</div>
                    </div>
                  )
                })}
              </div>
              <NoteHeatmap items={poolForClef(c)} perNote={perNote} />
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
          Vert = acquis, orange = fragile, rouge = à revoir · notes de la phase {PHASE_LABEL[phase]}.
        </div>
      </div>
      )}

      <button onClick={onStart}
        style={{ width: '100%', padding: '14px 0', borderRadius: 14, border: 'none', color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', background: 'linear-gradient(135deg,#7c3aed,#c084fc)' }}>
        Commencer
      </button>
    </div>
  )
}

// Sélecteur d'une borne de tessiture : nom de note + octave → DiatonicIndex.
function BoundPicker({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const deg = degreeOf(value), oct = octaveOf(value)
  const sel: React.CSSProperties = { minHeight: 40, borderRadius: 8, padding: '0 8px', background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border-c)' }
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <select value={deg} onChange={e => onChange(diatonic(oct, Number(e.target.value)))} style={{ ...sel, flex: 1 }}>
          {NOTE_NAMES.map((n, i) => <option key={n} value={i}>{NOTE_LABELS[n]}</option>)}
        </select>
        <select value={oct} onChange={e => onChange(diatonic(Number(e.target.value), deg))} style={sel}>
          {[1, 2, 3, 4, 5, 6].map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    </div>
  )
}

function ToggleChip({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick}
      style={{
        flex: 1, minHeight: 44, borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
        border: `1px solid ${on ? '#7c3aed' : 'var(--border-c)'}`,
        background: on ? 'rgba(124,58,237,0.18)' : 'var(--surface-2)',
        color: on ? '#c084fc' : 'var(--text-muted)',
      }}>
      {label} {on ? '✓' : ''}
    </button>
  )
}

// ── Écran de résumé ────────────────────────────────────────────────────────────
function SummaryScreen({ summary, phase, clef, perNote, items, onReplay, onHome }: {
  summary: NotesSummary; phase: Phase; clef: Clef
  perNote: PerNoteMap; items: NoteItem[]
  onReplay: () => void; onHome: () => void
}) {
  const stat = (v: string, l: string) => (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--text)' }}>{v}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{l}</div>
    </div>
  )
  return (
    <div className="flex flex-col px-4 pb-8" style={{ gap: 16 }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: 16, padding: 20 }}>
        <div style={{ textAlign: 'center', fontFamily: "'Righteous', sans-serif", fontSize: 22, color: 'var(--text)', marginBottom: 16 }}>
          Bilan — {PHASE_LABEL[phase]} · {CLEF_LABELS[clef]}
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {stat(`${Math.round(summary.accuracy * 100)}%`, 'exactitude')}
          {stat(`${summary.itemCount}`, 'notes')}
          {stat(`${Math.round(summary.medianRtMs)}ms`, 'RT médian')}
        </div>
        {phase !== 'P0' && (
          <div style={{ display: 'flex', gap: 8 }}>
            {stat(`${summary.debitNotesMin.toFixed(1)}`, 'notes/min')}
            {stat(summary.cvIntervalles.toFixed(2), 'régularité (CV)')}
          </div>
        )}
      </div>
      {/* Heatmap du bilan DÉSACTIVÉE pour l'instant (peu pertinente à la correction).
          Réactiver en repassant `false` à `true`. */}
      {false && items.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: 16, padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
            Maîtrise des notes travaillées
          </div>
          <NoteHeatmap items={items} perNote={perNote} />
        </div>
      )}
      <button onClick={onReplay}
        style={{ width: '100%', padding: '14px 0', borderRadius: 14, border: 'none', color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', background: 'linear-gradient(135deg,#7c3aed,#c084fc)' }}>
        Rejouer
      </button>
      <button onClick={onHome}
        style={{ width: '100%', padding: '12px 0', borderRadius: 14, cursor: 'pointer', background: 'var(--surface)', border: '1px solid var(--border-c)', color: 'var(--text)', fontWeight: 700 }}>
        Retour à l'accueil
      </button>
      <Link to="/feedback" style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>Un retour&nbsp;?</Link>
    </div>
  )
}
