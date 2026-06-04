import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { db, auth } from '../lib/firebase'
import { useAuth } from '../auth/AuthProvider'
import { getRank } from '../hooks/useProgressFirebase'
import { usePwaInstall } from '../hooks/usePwaInstall'
import PwaInstallTutorial from '../components/PwaInstallTutorial'
import PwaInAppBrowserOverlay from '../components/PwaInAppBrowserOverlay'

interface EleveProgress {
  xp: number
  streak: { current: number; longest: number; lastDate: string | null }
  modules: {
    rythme: { seriesPlayed: number; xpTotal: number }
    theorie: { sessionsPlayed: number; xpTotal: number }
    accordeur: { sessionsPlayed: number; xpTotal: number }
  }
}

interface LastSession {
  date: string
  module: string
  xp: number
  medal: string
}

interface EleveData {
  uid: string
  displayName: string
  progress: EleveProgress | null
  lastSession: LastSession | null
}

const MODULE_ICONS: Record<string, string> = { rythme: '🥁', theorie: '🎼', accordeur: '🎵' }
const MODULE_COLORS: Record<string, string> = { rythme: '#4A6CF7', theorie: '#8B5CF6', accordeur: '#FF8B3D' }

const DEFAULT_PROGRESS: EleveProgress = {
  xp: 0,
  streak: { current: 0, longest: 0, lastDate: null },
  modules: {
    rythme: { seriesPlayed: 0, xpTotal: 0 },
    theorie: { sessionsPlayed: 0, xpTotal: 0 },
    accordeur: { sessionsPlayed: 0, xpTotal: 0 },
  },
}

export default function DashboardProf() {
  const { user, profile } = useAuth()
  const [eleves, setEleves] = useState<EleveData[]>([])
  const [loading, setLoading] = useState(true)
  const pwa = usePwaInstall()
  const [showPwaTuto, setShowPwaTuto] = useState(false)
  const [showInApp, setShowInApp] = useState(false)

  useEffect(() => {
    if (pwa.shouldShowInAppWarning()) setShowInApp(true)
    else if (pwa.shouldShowDashboard()) {
      pwa.markDashboardShown()
      setShowPwaTuto(true)
    }
  }, [pwa])

  useEffect(() => {
    if (!user) return
    async function chargerEleves() {
      const snap = await getDocs(query(collection(db, 'users'), where('profIds', 'array-contains', user!.uid)))
      const results: EleveData[] = await Promise.all(
        snap.docs.map(async d => {
          const uid = d.id
          const displayName = (d.data().displayName as string) ?? '—'
          const [progSnap, histSnap] = await Promise.all([
            getDocs(collection(db, 'users', uid, 'progress')),
            getDocs(query(collection(db, 'users', uid, 'history'), orderBy('createdAt', 'desc'), limit(1))),
          ])
          const progress = progSnap.empty ? DEFAULT_PROGRESS : (progSnap.docs[0].data() as EleveProgress)
          const lastSession = histSnap.empty ? null : (histSnap.docs[0].data() as LastSession)
          return { uid, displayName, progress, lastSession }
        })
      )
      setEleves(results)
      setLoading(false)
    }
    chargerEleves()
  }, [user])

  return (
    <div className="bg-app min-h-dvh flex flex-col items-center px-4 py-3 pb-10">
      {showInApp && <PwaInAppBrowserOverlay pwa={pwa} onClose={() => setShowInApp(false)} />}
      {showPwaTuto && !showInApp && <PwaInstallTutorial pwa={pwa} context="dashboard" onClose={() => setShowPwaTuto(false)} />}
      <div className="w-full max-w-2xl">

        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <Link to="/" className="bg-surface border border-app rounded-lg px-3 py-1.5 text-xs font-bold no-underline text-app hover:bg-surface-2 transition-colors">
            ← Tessitura
          </Link>
          <div className="flex gap-2 items-center">
            <span className="text-xs text-app-muted">
              {profile?.displayName} · <span style={{ color: '#FF8B3D' }}>Professeur</span>
            </span>
            <button
              onClick={() => signOut(auth)}
              className="border border-app rounded-lg text-xs text-app-muted px-2.5 py-1 bg-transparent"
              style={{ minHeight: 28 }}
            >
              Déconnexion
            </button>
          </div>
        </div>

        {/* Code prof */}
        {profile?.teacherCode && (
          <div className="bg-surface border border-app rounded-2xl px-5 py-4 mb-5 flex items-center gap-4">
            <div>
              <div className="text-xs font-bold text-app-muted uppercase tracking-widest mb-1">Votre code</div>
              <div className="text-2xl font-black tracking-widest" style={{ color: '#FF8B3D' }}>{profile.teacherCode}</div>
            </div>
            <div className="text-xs text-app-muted flex-1">Partagez ce code à vos élèves pour qu'ils vous rejoignent.</div>
          </div>
        )}

        <h1 className="text-xl font-black text-app mb-4">
          Mes élèves {!loading && `(${eleves.length})`}
        </h1>

        {loading && <p className="text-app-muted text-center mt-10">Chargement…</p>}

        {!loading && eleves.length === 0 && (
          <div className="bg-surface border border-app rounded-2xl p-6 text-center text-app-muted">
            <div className="text-3xl mb-2">🎓</div>
            <p className="text-sm m-0">Aucun élève encore. Partagez votre code prof !</p>
          </div>
        )}

        {eleves.map(e => {
          const prog = e.progress ?? DEFAULT_PROGRESS
          const rank = getRank(prog.xp)
          return (
            <Link key={e.uid} to={`/dashboard/prof/eleve/${e.uid}`}
              className="block bg-surface border border-app rounded-2xl px-5 py-4 mb-3 no-underline text-app hover:bg-surface-2 transition-colors cursor-pointer">
              <div className="flex justify-between items-center mb-3">
                <div className="text-base font-bold text-app">{e.displayName}</div>
                <div className="flex gap-2.5 items-center">
                  <span className="text-xs font-bold" style={{ color: '#8B5CF6' }}>{rank.id}</span>
                  <span className="text-xs text-app-muted">{prog.xp} XP</span>
                  <span className="text-xs" style={{ color: prog.streak.current > 0 ? '#FF8B3D' : 'var(--text-muted)' }}>
                    {prog.streak.current}j
                  </span>
                </div>
              </div>

              <div className="flex gap-2 mb-2.5">
                {(['rythme', 'theorie', 'accordeur'] as const).map(k => (
                  <div key={k} className="flex-1 bg-surface-2 rounded-lg p-2 text-center">
                    <div className="text-sm">{MODULE_ICONS[k]}</div>
                    <div className="text-sm font-bold text-app">
                      {k === 'rythme' ? prog.modules.rythme.seriesPlayed : k === 'theorie' ? prog.modules.theorie.sessionsPlayed : prog.modules.accordeur.sessionsPlayed}
                    </div>
                    <div className="text-[9px] text-app-muted">{k === 'rythme' ? 'séries' : 'sessions'}</div>
                  </div>
                ))}
              </div>

              {e.lastSession ? (
                <div className="flex items-center gap-2 bg-surface-2 rounded-lg px-2.5 py-1.5">
                  <span className="text-sm">{e.lastSession.medal}</span>
                  <span className="text-xs text-app-muted">{MODULE_ICONS[e.lastSession.module] ?? ''} {e.lastSession.module}</span>
                  <span className="text-xs font-bold ml-auto" style={{ color: MODULE_COLORS[e.lastSession.module] ?? '#4A6CF7' }}>
                    +{e.lastSession.xp} XP
                  </span>
                  <span className="text-[10px] text-app-muted">{e.lastSession.date}</span>
                </div>
              ) : (
                <div className="text-xs text-app-muted italic">Aucune session enregistrée.</div>
              )}
            </Link>
          )
        })}

      </div>
    </div>
  )
}
