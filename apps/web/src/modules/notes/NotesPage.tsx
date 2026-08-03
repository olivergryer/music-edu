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
import RadialWheel, { NOTE_LABELS } from './RadialWheel.tsx'
import { profileForClef, CLEF_LABELS, type ReadingProfile } from './profiles.ts'
import { beginnerInstruments, getInstrument, instrumentClefs } from './instruments.ts'
import { buildPool, resolveAmbitusStep } from './pool.ts'
import { selectNextItem, generateLine, DEFAULT_LINE_WEIGHTS } from './selection.ts'
import { classifyAttempt, updateMastery } from './mastery.ts'
import { computeSessionSummary } from './summary.ts'
import { flagsToBitmask } from './encode.ts'
import { noteNameOf, degreeOfName, octaveOf } from './diatonic.ts'
import { mulberry32, type Rng } from './rng.ts'
import {
  aggregatePerNote, mergePerNote, mergeContext, contextKey, noteMasteryLevel,
  type PerNoteMap, type PerContextMap, type MasteryLevel,
} from './progressStats.ts'
import {
  DEFAULT_CONFIG,
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

const MASTERY_COLOR: Record<MasteryLevel, string> = {
  strong: '#34d399', mid: '#fbbf24', weak: '#f87171', unknown: 'var(--surface-2)',
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
  const [instrumentId, setInstrumentId] = useState(() => {
    const v = LS.get('notes_instrument', '')
    return getInstrument(v)?.beginnerFriendly ? v : beginnerInstruments()[0].id
  })
  const [phase, setPhase] = useState<Phase>(() => {
    const v = LS.get('notes_phase', 'P0')
    return (['P0', 'P1', 'P2'] as string[]).includes(v) ? (v as Phase) : 'P0'
  })
  const [clef, setClef] = useState<Clef>(() => {
    const inst = getInstrument(LS.get('notes_instrument', '')) ?? beginnerInstruments()[0]
    const clefs = instrumentClefs(inst)
    const v = LS.get('notes_clef', '') as Clef
    return clefs.includes(v) ? v : clefs[0]
  })
  const [coloriser, setColoriser] = useState(() => LS.get('notes_couleur', '0') === '1')
  const [sonOn, setSonOn] = useState(() => LS.get('notes_son', '1') === '1')
  const [hoverName, setHoverName] = useState<NoteName | null>(null)

  useEffect(() => { LS.set('notes_instrument', instrumentId) }, [instrumentId])
  useEffect(() => { LS.set('notes_phase', phase) }, [phase])
  useEffect(() => { LS.set('notes_clef', clef) }, [clef])
  useEffect(() => { LS.set('notes_couleur', coloriser ? '1' : '0') }, [coloriser])
  useEffect(() => { LS.set('notes_son', sonOn ? '1' : '0') }, [sonOn])

  // Réaligne la clef quand l'instrument change (si la clef courante n'est plus dispo).
  useEffect(() => {
    const inst = getInstrument(instrumentId)
    if (!inst) return
    const clefs = instrumentClefs(inst)
    if (!clefs.includes(clef)) setClef(clefs[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instrumentId])

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
  function beep(freq: number) {
    if (!sonOn) return
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ac = audioRef.current ?? new Ctx()
      audioRef.current = ac
      const o = ac.createOscillator(), g = ac.createGain()
      o.type = 'sine'; o.frequency.value = freq
      o.connect(g); g.connect(ac.destination)
      g.gain.setValueAtTime(0.0001, ac.currentTime)
      g.gain.exponentialRampToValueAtTime(0.18, ac.currentTime + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.18)
      o.start(); o.stop(ac.currentTime + 0.2)
    } catch { /* audio best-effort */ }
  }

  // ── Démarrage d'une session ────────────────────────────────────────────────────
  function start() {
    const inst = getInstrument(instrumentId)!
    const profile = profileForClef(inst.primaryProfile, clef) // clef sélectionnée
    const lastStep = profile.ambitusSequence.length - 1
    const step = phase === 'P0' ? 0 : phase === 'P1' ? Math.min(1, lastStep) : lastStep
    const pool = buildPool(profile, phase, step)
    const ambitus = phase === 'P0'
      ? { low: Math.min(...profile.landmarks), high: Math.max(...profile.landmarks) }
      : profile.ambitusSequence[resolveAmbitusStep(profile, phase, step)]

    const config: NotesSessionConfig = {
      clef: profile.clef, phase, ambitus,
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
    beep(correct ? 660 : 196)          // APRÈS la réponse uniquement (§2)

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
      if (done >= TARGET_ISOLATED) { void endSession(config); return }
      loadNext(config, poolRef.current)
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

    const medal = s.accuracy >= 0.9 ? 'or' : s.accuracy >= 0.75 ? 'argent' : 'bronze'
    const xpEarned = Math.max(5, Math.round(s.accuracy * s.itemCount * 3))
    try { await addSession({ module: 'notes', xpEarned, medal }) } catch { /* offline ok */ }

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
  const availableClefs = instrumentClefs(getInstrument(instrumentId) ?? beginnerInstruments()[0])

  return (
    <div className="bg-app min-h-dvh flex flex-col" style={{ maxWidth: 540, margin: '0 auto', width: '100%' }}>
      {showConsigne && (
        <ConsigneOverlay
          storageKey="notes"
          icon="🎼"
          title="Lecture de notes"
          lines={[
            'Une note s’affiche sur la portée : donne son nom.',
            'Pose le pouce en bas de l’écran, fais glisser vers le nom, relâche.',
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
          clef={clef} setClef={setClef} availableClefs={availableClefs}
          phase={phase} setPhase={setPhase}
          coloriser={coloriser} setColoriser={setColoriser}
          sonOn={sonOn} setSonOn={setSonOn}
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
          {/* Portée — position FIXE (top constant). */}
          <div style={{ position: 'absolute', top: 104, left: 12, right: 12, pointerEvents: 'none', zIndex: 1 }}>
            <NotesStaff
              items={sequence} clef={configRef.current?.clef ?? 'treble'}
              cursorIndex={cursorIndex} results={results} coloriser={coloriser}
            />
          </div>
          {/* Roue plein écran, au-dessus (sans cadre), toujours accessible. */}
          <div style={{ position: 'absolute', inset: 0, zIndex: 2 }}>
            <RadialWheel
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
          summary={summary} phase={phase} clef={clef}
          perNote={summaryData?.perNote ?? {}} items={summaryData?.items ?? []}
          onReplay={() => { setScreen('setup') }}
          onHome={() => navigate('/')}
        />
      )}
    </div>
  )
}

// ── Écran de configuration ────────────────────────────────────────────────────
function SetupScreen({ instrumentId, setInstrumentId, clef, setClef, availableClefs, phase, setPhase, coloriser, setColoriser, sonOn, setSonOn, perNote, perContext, onStart }: {
  instrumentId: string; setInstrumentId: (v: string) => void
  clef: Clef; setClef: (c: Clef) => void; availableClefs: Clef[]
  phase: Phase; setPhase: (p: Phase) => void
  coloriser: boolean; setColoriser: (v: boolean) => void
  sonOn: boolean; setSonOn: (v: boolean) => void
  perNote: PerNoteMap; perContext: PerContextMap
  onStart: () => void
}) {
  const label = "text-xs font-bold text-app-muted uppercase tracking-widest"
  const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: 16, padding: 16 }

  const inst = getInstrument(instrumentId)
  const profile = inst ? profileForClef(inst.primaryProfile, clef) : null
  const heatItems = profile ? buildPool(profile, phase, ambitusStepFor(profile, phase)) : []

  return (
    <div className="flex flex-col px-4 pb-8" style={{ gap: 14 }}>
      <div style={card}>
        <div className={label} style={{ marginBottom: 8 }}>Instrument</div>
        <select value={instrumentId} onChange={e => setInstrumentId(e.target.value)}
          style={{ width: '100%', minHeight: 44, borderRadius: 10, padding: '0 12px', background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border-c)' }}>
          {beginnerInstruments().map(i => <option key={i.id} value={i.id}>{i.label}</option>)}
        </select>
      </div>

      {/* Sélecteur de clef (clefs de l'instrument, ordre pédagogique). */}
      <div style={card}>
        <div className={label} style={{ marginBottom: 8 }}>Clef</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {availableClefs.map(c => (
            <button key={c} onClick={() => setClef(c)}
              style={{
                flex: '1 1 auto', minWidth: 64, minHeight: 44, borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer',
                border: `1.5px solid ${clef === c ? '#c084fc' : 'var(--border-c)'}`,
                background: clef === c ? 'rgba(192,132,252,0.15)' : 'var(--surface-2)',
                color: clef === c ? '#c084fc' : 'var(--text)',
              }}>
              {CLEF_LABELS[c]}
            </button>
          ))}
        </div>
      </div>

      <div style={card}>
        <div className={label} style={{ marginBottom: 8 }}>Phase</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(['P0', 'P1', 'P2'] as Phase[]).map(p => (
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

      <div style={{ ...card, display: 'flex', gap: 10 }}>
        <ToggleChip on={sonOn} onClick={() => setSonOn(!sonOn)} label="Son de confirmation" />
        <ToggleChip on={coloriser} onClick={() => setColoriser(!coloriser)} label="Couleur des notes" />
      </div>

      {/* Progression détaillée : par (instrument × clef × phase) + heatmap par note. */}
      <div style={card}>
        <div className={label} style={{ marginBottom: 10 }}>Ta progression — {inst?.label} · {CLEF_LABELS[clef]}</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {(['P0', 'P1', 'P2'] as Phase[]).map(p => {
            const ctx = perContext[contextKey(instrumentId, clef, p)]
            return (
              <div key={p} style={{ flex: 1, textAlign: 'center', background: 'var(--surface-2)', borderRadius: 10, padding: '8px 4px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{PHASE_LABEL[p]}</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text)' }}>{ctx ? `${Math.round(ctx.bestAccuracy * 100)}%` : '—'}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{ctx ? `${ctx.sessions} session${ctx.sessions > 1 ? 's' : ''}` : ''}</div>
              </div>
            )
          })}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Notes de la phase {PHASE_LABEL[phase]} (vert = acquis, orange = fragile, rouge = à revoir) :</div>
        <NoteHeatmap items={heatItems} perNote={perNote} />
      </div>

      <button onClick={onStart}
        style={{ width: '100%', padding: '14px 0', borderRadius: 14, border: 'none', color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', background: 'linear-gradient(135deg,#7c3aed,#c084fc)' }}>
        Commencer
      </button>
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
      {items.length > 0 && (
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
