import { useState, useRef, useEffect, useCallback } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { addDoc, collection, getDocs, query, orderBy, deleteDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../auth/AuthProvider'
import { IS_DEV } from '../isDev'
import {
  EXERCISES, runSweepForExercise, deriveSuggestedProfiles,
  writeProfilesOverride, clearProfilesOverride, readProfilesOverride,
  PARAM_KEYS,
} from '../calibrationUtils'
import CalibrationStrip from '../components/CalibrationStrip'

const INSTRUMENT_OPTIONS = [
  'clarinette', 'flûte traversière', 'hautbois', 'saxophone alto',
  'saxophone ténor', 'basson', 'trompette', 'cor', 'trombone',
  'tuba', 'violon', 'alto', 'violoncelle', 'voix', 'autre',
]

const PARAM_LABEL = {
  clarityThreshold:  'Clarté',
  gateLevel:         'Gate RMS',
  silenceDurationMs: 'Silence (ms)',
  noteJumpCents:     'Saut note (¢)',
  minNoteDurationMs: 'Durée min (ms)',
}

const PARAM_FMT = {
  clarityThreshold:  v => v.toFixed(3),
  gateLevel:         v => v.toFixed(4),
  silenceDurationMs: v => String(v),
  noteJumpCents:     v => String(v),
  minNoteDurationMs: v => String(v),
}

const ORANGE = '#FF8B3D'

function Btn({ children, onClick, disabled, variant = 'primary', className = '', style = {} }) {
  const variants = {
    primary:   { background: ORANGE,        color: '#fff', border: 'none' },
    secondary: { background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border-c)' },
    danger:    { background: 'transparent', color: '#f87171', border: '1px solid #f87171' },
    ghost:     { background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border-c)' },
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg font-bold text-xs px-3 py-2 cursor-pointer transition-opacity ${className}`}
      style={{ opacity: disabled ? 0.4 : 1, ...variants[variant], ...style }}
    >{children}</button>
  )
}

export default function CalibrationPage() {
  if (!IS_DEV) return <Navigate to="/accordeur" replace />
  return <CalibrationPageInner />
}

function CalibrationPageInner() {
  const { user } = useAuth()
  const [tab, setTab] = useState('nouvelle')   // 'nouvelle' | 'passees'

  // ─── Session courante ──────────────────────────────────────────────────────
  const [sessionName, setSessionName] = useState('')
  const [instrument,  setInstrument]  = useState('clarinette')
  const [exResults,   setExResults]   = useState({})   // exId → { status, audioBuffer, blobUrl, sweepResult }
  const [recordingEx, setRecordingEx] = useState(null) // exId in recording, null sinon
  const [suggested,   setSuggested]   = useState(null)
  const [savingState, setSavingState] = useState('idle') // 'idle' | 'saving' | 'saved' | 'error'

  const recorderRef = useRef(null)
  const streamRef   = useRef(null)
  const chunksRef   = useRef([])

  // ─── Sessions passées ──────────────────────────────────────────────────────
  const [pastSessions, setPastSessions] = useState([])
  const [pastLoading,  setPastLoading]  = useState(false)
  const [openSession,  setOpenSession]  = useState(null)

  const loadPastSessions = useCallback(async () => {
    if (!user) return
    setPastLoading(true)
    try {
      const q = query(collection(db, 'users', user.uid, 'calibrations'), orderBy('createdAt', 'desc'))
      const snap = await getDocs(q)
      setPastSessions(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) {
      console.error('Calibration: load failed', e)
    } finally {
      setPastLoading(false)
    }
  }, [user])

  useEffect(() => { if (tab === 'passees') loadPastSessions() }, [tab, loadPastSessions])

  // ─── Override actif ? ──────────────────────────────────────────────────────
  const [overrideActive, setOverrideActive] = useState(() => !!readProfilesOverride())

  // ─── Enregistrement ────────────────────────────────────────────────────────
  const startRecord = useCallback(async (exId) => {
    if (recordingEx) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        video: false,
      })
      streamRef.current = stream
      chunksRef.current = []
      const recorder = new MediaRecorder(stream)
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.start()
      recorderRef.current = recorder
      setRecordingEx(exId)
    } catch (e) {
      alert('Micro inaccessible : ' + e.message)
    }
  }, [recordingEx])

  const stopRecord = useCallback(async () => {
    const exId = recordingEx
    const recorder = recorderRef.current
    if (!recorder || !exId) return
    const blob = await new Promise(resolve => {
      recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' }))
      recorder.stop()
    })
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    recorderRef.current = null

    let audioBuffer
    const decodeCtx = new AudioContext()
    try {
      audioBuffer = await decodeCtx.decodeAudioData(await blob.arrayBuffer())
    } catch (e) {
      alert('Décodage audio échoué : ' + e.message)
      decodeCtx.close()
      setRecordingEx(null)
      return
    }
    decodeCtx.close()

    // Libère l'ancien blobUrl si présent
    setExResults(prev => {
      const old = prev[exId]?.blobUrl
      if (old) { try { URL.revokeObjectURL(old) } catch {} }
      return {
        ...prev,
        [exId]: {
          status: 'recorded',
          audioBuffer,
          blobUrl: URL.createObjectURL(blob),
          sweepResult: null,
        },
      }
    })
    setRecordingEx(null)
    setSuggested(null)
  }, [recordingEx])

  // ─── Analyse (sweep) ──────────────────────────────────────────────────────
  const analyzeEx = useCallback(async (exId) => {
    const ex = EXERCISES.find(e => e.id === exId)
    const cur = exResults[exId]
    if (!ex || !cur?.audioBuffer) return
    setExResults(prev => ({ ...prev, [exId]: { ...prev[exId], status: 'analyzing' } }))
    // Yield au navigateur pour que l'état "analyzing" s'affiche avant le sweep bloquant.
    await new Promise(r => setTimeout(r, 30))
    const sweepResult = runSweepForExercise(cur.audioBuffer, ex)
    setExResults(prev => ({ ...prev, [exId]: { ...prev[exId], status: 'analyzed', sweepResult } }))
    setSuggested(null)
  }, [exResults])

  // ─── Compilation profils + sauvegarde Firestore ───────────────────────────
  const allAnalyzed = EXERCISES.every(e => exResults[e.id]?.status === 'analyzed')

  const compileAndSave = useCallback(async () => {
    if (!allAnalyzed || !user) return
    const resultsMap = new Map()
    EXERCISES.forEach(e => resultsMap.set(e.id, exResults[e.id].sweepResult))
    const profiles = deriveSuggestedProfiles(resultsMap)
    setSuggested(profiles)
    setSavingState('saving')
    try {
      await addDoc(collection(db, 'users', user.uid, 'calibrations'), {
        nom: sessionName.trim() || `Séance ${new Date().toLocaleDateString('fr-FR')}`,
        instrument,
        createdAt: serverTimestamp(),
        exercises: EXERCISES.map(e => ({
          id: e.id,
          ...exResults[e.id].sweepResult,
        })),
        suggestedProfiles: profiles,
      })
      setSavingState('saved')
    } catch (e) {
      console.error('Calibration save failed', e)
      setSavingState('error')
    }
  }, [allAnalyzed, user, exResults, sessionName, instrument])

  // ─── Application des profils ──────────────────────────────────────────────
  const applyProfiles = useCallback((profiles) => {
    writeProfilesOverride(profiles)
    setOverrideActive(true)
  }, [])

  const removeOverride = useCallback(() => {
    clearProfilesOverride()
    setOverrideActive(false)
  }, [])

  // ─── Cleanup blobs au démontage ───────────────────────────────────────────
  useEffect(() => () => {
    Object.values(exResults).forEach(r => { if (r?.blobUrl) try { URL.revokeObjectURL(r.blobUrl) } catch {} })
    streamRef.current?.getTracks().forEach(t => t.stop())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── Suppression session passée ───────────────────────────────────────────
  const deletePastSession = useCallback(async (id) => {
    if (!user) return
    if (!confirm('Supprimer cette session ?')) return
    await deleteDoc(doc(db, 'users', user.uid, 'calibrations', id))
    setPastSessions(prev => prev.filter(s => s.id !== id))
    if (openSession?.id === id) setOpenSession(null)
  }, [user, openSession])

  // ─── Rendu ─────────────────────────────────────────────────────────────────
  return (
    <div className="bg-app min-h-dvh flex flex-col items-center px-4 py-5">
      <div className="w-full max-w-xl">

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <Link to="/accordeur" className="bg-surface border border-app rounded-lg px-3 py-1.5 text-xs font-bold no-underline text-app">
            ← Accordeur
          </Link>
          <h2 className="text-lg font-bold m-0" style={{ color: ORANGE }}>Calibration interne</h2>
          <span style={{
            background: 'rgba(255,139,61,0.15)',
            color: ORANGE,
            border: `1px solid ${ORANGE}`,
            borderRadius: 999,
            padding: '2px 8px',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.3,
          }}>DEV</span>
        </div>

        {/* Override actif ? */}
        {overrideActive && (
          <div className="mb-3 rounded-lg px-3 py-2 flex items-center justify-between"
            style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid #7c3aed' }}>
            <span className="text-xs" style={{ color: '#c084fc' }}>
              Profils calibrés actifs (override localStorage)
            </span>
            <button onClick={removeOverride} className="text-xs font-bold cursor-pointer"
              style={{ background: 'transparent', border: 'none', color: '#c084fc', textDecoration: 'underline' }}>
              Retirer
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1.5 mb-4">
          {[['nouvelle', 'Nouvelle session'], ['passees', 'Sessions passées']].map(([v, label]) => (
            <button key={v} onClick={() => setTab(v)}
              className="flex-1 py-2 rounded-lg border-none font-bold text-sm cursor-pointer"
              style={{
                background: tab === v ? ORANGE : 'var(--surface-2)',
                color:      tab === v ? '#fff' : 'var(--text-muted)',
              }}
            >{label}</button>
          ))}
        </div>

        {!user && (
          <div className="bg-surface border border-app rounded-xl p-4 text-center text-app-muted text-sm">
            Connexion requise pour stocker les sessions.
            <div className="mt-2"><Link to="/login" className="text-sm font-bold no-underline" style={{ color: ORANGE }}>Se connecter →</Link></div>
          </div>
        )}

        {/* Onglet Nouvelle session */}
        {tab === 'nouvelle' && user && (
          <>
            {/* Identité */}
            <div className="bg-surface border border-app rounded-xl p-4 mb-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs text-app-muted">
                  Nom de la séance
                  <input value={sessionName} onChange={e => setSessionName(e.target.value)}
                    placeholder={`Calibration ${new Date().toLocaleDateString('fr-FR')}`}
                    className="block mt-1 w-full bg-app text-app border border-app rounded-md px-2 py-1.5 text-sm" />
                </label>
                <label className="text-xs text-app-muted">
                  Instrument
                  <select value={instrument} onChange={e => setInstrument(e.target.value)}
                    className="block mt-1 w-full bg-app text-app border border-app rounded-md px-2 py-1.5 text-sm">
                    {INSTRUMENT_OPTIONS.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </label>
              </div>
            </div>

            {/* Liste exercices */}
            {EXERCISES.map((ex, i) => {
              const r = exResults[ex.id] || { status: 'pending' }
              const isRecording = recordingEx === ex.id
              return (
                <div key={ex.id} className="bg-surface border border-app rounded-xl p-4 mb-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="text-sm font-bold text-app">{i + 1}. {ex.label}</div>
                      <div className="text-xs text-app-muted mt-1" style={{ lineHeight: 1.4 }}>{ex.instructions}</div>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>

                  {/* Boutons */}
                  <div className="flex gap-1.5 flex-wrap">
                    {!isRecording && r.status === 'pending' && (
                      <Btn onClick={() => startRecord(ex.id)} disabled={!!recordingEx}>● Enregistrer</Btn>
                    )}
                    {!isRecording && (r.status === 'recorded' || r.status === 'analyzed' || r.status === 'analyzing') && (
                      <>
                        <Btn variant="secondary" onClick={() => startRecord(ex.id)} disabled={!!recordingEx}>↻ Refaire</Btn>
                        {r.blobUrl && (
                          <Btn variant="secondary" onClick={() => new Audio(r.blobUrl).play().catch(() => {})}>▶ Réécouter</Btn>
                        )}
                        {r.status === 'recorded' && (
                          <Btn onClick={() => analyzeEx(ex.id)}>Analyser</Btn>
                        )}
                        {r.status === 'analyzing' && (
                          <Btn disabled>Analyse en cours…</Btn>
                        )}
                        {r.status === 'analyzed' && (
                          <Btn variant="ghost" onClick={() => analyzeEx(ex.id)}>↻ Réanalyser</Btn>
                        )}
                      </>
                    )}
                    {isRecording && (
                      <Btn variant="danger" onClick={stopRecord}>■ Arrêter</Btn>
                    )}
                  </div>

                  {/* Strips résultats */}
                  {r.status === 'analyzed' && r.sweepResult && (
                    <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border-c)' }}>
                      <div className="text-xs text-app-muted mb-2">
                        Avec paramètres centraux : <strong className="text-app">{r.sweepResult.detectedCountFinal} notes</strong> détectées
                        {' '}(attendu {ex.expectedNames.length})
                      </div>
                      {PARAM_KEYS.map(k => (
                        <CalibrationStrip
                          key={k}
                          label={PARAM_LABEL[k]}
                          sweep={r.sweepResult.sweep[k]}
                          range={r.sweepResult.acceptableRanges[k]}
                          formatVal={PARAM_FMT[k]}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Compile button */}
            <div className="bg-surface border border-app rounded-xl p-4 mb-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="text-xs text-app-muted">
                  {allAnalyzed
                    ? 'Tous les exercices analysés. Compile et sauvegarde la session.'
                    : `Progression : ${EXERCISES.filter(e => exResults[e.id]?.status === 'analyzed').length}/${EXERCISES.length} analysés`}
                </div>
                <Btn onClick={compileAndSave} disabled={!allAnalyzed || savingState === 'saving'}>
                  {savingState === 'saving' ? 'Sauvegarde…' : 'Compiler & sauvegarder'}
                </Btn>
              </div>
              {savingState === 'saved' && <div className="text-xs" style={{ color: '#34d399' }}>✓ Session sauvegardée</div>}
              {savingState === 'error' && <div className="text-xs" style={{ color: '#f87171' }}>Erreur de sauvegarde (voir console)</div>}
            </div>

            {/* Profils suggérés */}
            {suggested && (
              <SuggestedProfilesPanel profiles={suggested} onApply={applyProfiles} />
            )}
          </>
        )}

        {/* Onglet Sessions passées */}
        {tab === 'passees' && user && (
          <>
            {pastLoading && <div className="text-center text-app-muted text-sm py-4">Chargement…</div>}
            {!pastLoading && pastSessions.length === 0 && (
              <div className="bg-surface border border-app rounded-xl p-4 text-center text-app-muted text-sm">
                Aucune session enregistrée.
              </div>
            )}
            {!openSession && pastSessions.map(s => (
              <div key={s.id} className="bg-surface border border-app rounded-xl p-3 mb-2 flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-bold text-app">{s.nom || '—'}</div>
                  <div className="text-xs text-app-muted">
                    {s.instrument} · {s.createdAt?.toDate?.().toLocaleDateString?.('fr-FR') || '—'}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <Btn variant="secondary" onClick={() => setOpenSession(s)}>Ouvrir</Btn>
                  <Btn variant="danger" onClick={() => deletePastSession(s.id)}>Supprimer</Btn>
                </div>
              </div>
            ))}
            {openSession && (
              <PastSessionDetail
                session={openSession}
                onClose={() => setOpenSession(null)}
                onApply={applyProfiles}
              />
            )}
          </>
        )}

      </div>
    </div>
  )
}

function StatusBadge({ status }) {
  const map = {
    pending:   { label: 'En attente',    color: 'var(--text-muted)', bg: 'var(--surface-2)' },
    recording: { label: 'Enregistrement…', color: '#fff',           bg: '#dc2626' },
    recorded:  { label: 'Enregistré',     color: '#34d399',          bg: 'rgba(52,211,153,0.12)' },
    analyzing: { label: 'Analyse…',       color: '#fbbf24',          bg: 'rgba(251,191,36,0.12)' },
    analyzed:  { label: 'Analysé',        color: '#34d399',          bg: 'rgba(52,211,153,0.12)' },
  }
  const v = map[status] || map.pending
  return (
    <span style={{
      background: v.bg, color: v.color, border: `1px solid ${v.color}`,
      borderRadius: 999, padding: '2px 8px', fontSize: 10, fontWeight: 700,
      whiteSpace: 'nowrap', flexShrink: 0,
    }}>{v.label}</span>
  )
}

function SuggestedProfilesPanel({ profiles, onApply }) {
  return (
    <div className="bg-surface border rounded-xl p-4 mb-3" style={{ borderColor: ORANGE }}>
      <div className="text-sm font-bold mb-3" style={{ color: ORANGE }}>Profils suggérés</div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {['legato', 'detache', 'rapide'].map(profile => {
          const p = profiles[profile]
          return (
            <div key={profile} style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border-c)',
              borderRadius: 8,
              padding: '8px 10px',
              fontSize: 10,
              color: 'var(--text-muted)',
            }}>
              <div className="text-xs font-bold mb-1 text-app">{profile === 'detache' ? 'Détaché' : profile === 'rapide' ? 'Rapide' : 'Legato'}</div>
              <div>clarté : <strong className="text-app">{p.clarityThreshold.toFixed(3)}</strong></div>
              <div>gate : <strong className="text-app">{p.gateLevel.toFixed(4)}</strong></div>
              <div>silence : <strong className="text-app">{p.silenceDurationMs} ms</strong></div>
              <div>saut : <strong className="text-app">{p.noteJumpCents} ¢</strong></div>
              <div>durée min : <strong className="text-app">{p.minNoteDurationMs} ms</strong></div>
              {p.conflicts?.length > 0 && (
                <div className="mt-1" style={{ color: '#f87171' }}>
                  conflits : {p.conflicts.join(', ')}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <Btn onClick={() => onApply(profiles)}>Appliquer ces profils</Btn>
    </div>
  )
}

function PastSessionDetail({ session, onClose, onApply }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button onClick={onClose} className="text-xs font-bold cursor-pointer"
          style={{ background: 'transparent', border: 'none', color: ORANGE, textDecoration: 'underline' }}>
          ← Retour
        </button>
        <div className="text-sm font-bold text-app">{session.nom}</div>
        <span className="text-xs text-app-muted">{session.instrument}</span>
      </div>

      {session.suggestedProfiles && (
        <SuggestedProfilesPanel profiles={session.suggestedProfiles} onApply={onApply} />
      )}

      {(session.exercises || []).map(ex => {
        const exDef = EXERCISES.find(e => e.id === ex.id)
        return (
          <div key={ex.id} className="bg-surface border border-app rounded-xl p-3 mb-2">
            <div className="text-sm font-bold text-app mb-1">{exDef?.label || ex.id}</div>
            <div className="text-xs text-app-muted mb-2">
              Avec paramètres centraux : <strong className="text-app">{ex.detectedCountFinal}</strong> notes
              {exDef && <> (attendu {exDef.expectedNames.length})</>}
            </div>
            {PARAM_KEYS.map(k => (
              <CalibrationStrip
                key={k}
                label={PARAM_LABEL[k]}
                sweep={ex.sweep?.[k] || []}
                range={ex.acceptableRanges?.[k] || null}
                formatVal={PARAM_FMT[k]}
              />
            ))}
          </div>
        )
      })}
    </div>
  )
}
