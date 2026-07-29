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
import { READING_PROFILES } from './profiles.ts'
import { beginnerInstruments, getInstrument } from './instruments.ts'
import { buildPool, resolveAmbitusStep } from './pool.ts'
import { selectNextItem, generateLine, DEFAULT_LINE_WEIGHTS } from './selection.ts'
import { classifyAttempt, updateMastery } from './mastery.ts'
import { computeSessionSummary } from './summary.ts'
import { flagsToBitmask } from './encode.ts'
import { noteNameOf, degreeOfName } from './diatonic.ts'
import { mulberry32, type Rng } from './rng.ts'
import {
  DEFAULT_CONFIG,
  type Attempt, type Mastery, type NoteItem, type NoteName,
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
  const [coloriser, setColoriser] = useState(() => LS.get('notes_couleur', '0') === '1')
  const [sonOn, setSonOn] = useState(() => LS.get('notes_son', '1') === '1')
  const [hoverName, setHoverName] = useState<NoteName | null>(null)

  useEffect(() => { LS.set('notes_instrument', instrumentId) }, [instrumentId])
  useEffect(() => { LS.set('notes_phase', phase) }, [phase])
  useEffect(() => { LS.set('notes_couleur', coloriser ? '1' : '0') }, [coloriser])
  useEffect(() => { LS.set('notes_son', sonOn ? '1' : '0') }, [sonOn])

  // État de jeu
  const [sequence, setSequence] = useState<NoteItem[]>([])
  const [cursorIndex, setCursorIndex] = useState(0)
  const [results, setResults] = useState<CellResult[]>([])
  const [correction, setCorrection] = useState<NoteName | null>(null) // bonne réponse après erreur (non bloquant)
  const [itemsDone, setItemsDone] = useState(0)
  const [elapsedS, setElapsedS] = useState(0)
  const [summary, setSummary] = useState<NotesSummary | null>(null)

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
  const linesDoneRef = useRef(0)
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
    const profile = READING_PROFILES[inst.primaryProfile]
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
    linesDoneRef.current = 0
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
      const line = generateLine(pool, DEFAULT_LINE_WEIGHTS, rngRef.current, LINE_LEN)
      seqRef.current = line
      setSequence(line)
      setResults(Array(LINE_LEN).fill(null))
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
    const isFirstOfLine = config.phase === 'P2' && idx === 0
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
      if (cursorRef.current < seqRef.current.length - 1) {
        cursorRef.current += 1
        setCursorIndex(cursorRef.current)
        return
      }
      linesDoneRef.current += 1
      if (linesDoneRef.current >= TARGET_LINES) { void endSession(config); return }
      loadNext(config, poolRef.current)
    } else {
      if (done >= TARGET_ISOLATED) { void endSession(config); return }
      loadNext(config, poolRef.current)
    }
  }

  // ── Fin de session : EXACTEMENT 2 écritures Firestore + XP globale ──────────────
  async function endSession(config: NotesSessionConfig) {
    const s = computeSessionSummary(attemptsRef.current)
    const durationMs = Math.round(performance.now() - startMsRef.current)
    const t = mp.progress.totals
    const persistSummary = {
      score: Math.round(s.accuracy * 100),
      itemCount: s.itemCount, accuracy: s.accuracy, medianRtMs: s.medianRtMs,
      debitNotesMin: s.debitNotesMin, cvIntervalles: s.cvIntervalles, // §13.8 : persisté
    }
    try {
      await mp.commitSession({
        summary: persistSummary,
        progressPatch: {
          totals: { sessions: t.sessions + 1, items: t.items + s.itemCount, timeMs: t.timeMs + durationMs },
          levels: { [config.phase]: { best: s.accuracy, attempts: (mp.progress.levels[config.phase]?.attempts ?? 0) + 1, lastAt: Date.now() } },
          payload: { lastPhase: config.phase, coloriser: config.coloriser, etayage: config.etayage },
        },
      })
    } catch (e) { console.warn('Notes commit', e) }

    const medal = s.accuracy >= 0.9 ? 'or' : s.accuracy >= 0.75 ? 'argent' : 'bronze'
    const xpEarned = Math.max(5, Math.round(s.accuracy * s.itemCount * 3))
    try { await addSession({ module: 'notes', xpEarned, medal }) } catch { /* offline ok */ }

    setSummary(s)
    setScreen('summary')
  }

  // ── Rendu ──────────────────────────────────────────────────────────────────────
  const target = phase === 'P2' ? TARGET_LINES * LINE_LEN : TARGET_ISOLATED

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
          phase={phase} setPhase={setPhase}
          coloriser={coloriser} setColoriser={setColoriser}
          sonOn={sonOn} setSonOn={setSonOn}
          onStart={start}
        />
      )}

      {screen === 'play' && (
        <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Contenu visuel — transparent aux pointeurs : la roue capte sur tout l'écran. */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', padding: '0 12px', pointerEvents: 'none', zIndex: 1 }}>
            <div className="flex items-center justify-between" style={{ fontSize: 13, color: 'var(--text-muted)', padding: '4px 2px' }}>
              <span>{PHASE_LABEL[phase]}</span>
              <span>{Math.min(itemsDone, target)} / {target}</span>
              {phase !== 'P0' && <span>{elapsedS}s</span>}
            </div>
            {/* Au-dessus de la portée : nom sélectionné pendant le drag (violet), sinon
                la bonne réponse après une erreur (rouge) — évite de regarder la roue. */}
            <div style={{ minHeight: 52, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {hoverName ? (
                <span style={{ fontSize: 40, fontWeight: 900, lineHeight: 1, fontFamily: "'Poppins', sans-serif", color: '#c084fc' }}>
                  {NOTE_LABELS[hoverName]}
                </span>
              ) : correction ? (
                <span style={{ fontSize: 22, fontWeight: 800, lineHeight: 1, fontFamily: "'Poppins', sans-serif", color: '#f87171' }}>
                  C’était {NOTE_LABELS[correction]}
                </span>
              ) : (
                <span style={{ fontSize: 40, color: 'transparent' }}>·</span>
              )}
            </div>
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
          summary={summary} phase={phase}
          onReplay={() => { setScreen('setup') }}
          onHome={() => navigate('/')}
        />
      )}
    </div>
  )
}

// ── Écran de configuration ────────────────────────────────────────────────────
function SetupScreen({ instrumentId, setInstrumentId, phase, setPhase, coloriser, setColoriser, sonOn, setSonOn, onStart }: {
  instrumentId: string; setInstrumentId: (v: string) => void
  phase: Phase; setPhase: (p: Phase) => void
  coloriser: boolean; setColoriser: (v: boolean) => void
  sonOn: boolean; setSonOn: (v: boolean) => void
  onStart: () => void
}) {
  const label = "text-xs font-bold text-app-muted uppercase tracking-widest"
  const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: 16, padding: 16 }
  return (
    <div className="flex flex-col px-4 pb-8" style={{ gap: 14 }}>
      <div style={card}>
        <div className={label} style={{ marginBottom: 8 }}>Instrument</div>
        <select value={instrumentId} onChange={e => setInstrumentId(e.target.value)}
          style={{ width: '100%', minHeight: 44, borderRadius: 10, padding: '0 12px', background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border-c)' }}>
          {beginnerInstruments().map(i => <option key={i.id} value={i.id}>{i.label}</option>)}
        </select>
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
function SummaryScreen({ summary, phase, onReplay, onHome }: {
  summary: NotesSummary; phase: Phase; onReplay: () => void; onHome: () => void
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
          Bilan — {PHASE_LABEL[phase]}
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
