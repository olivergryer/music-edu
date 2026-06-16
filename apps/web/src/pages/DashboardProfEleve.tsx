import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { collection, doc, getDoc, getDocs, orderBy, query } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../auth/AuthProvider'
import {
  applyDecayOnly,
  mergeWithDefaults,
  DEFAULT_STATE,
  todayStr,
  type ProgressState,
} from '../hooks/progressLogic'
import StudentDashboardView, { type HistoryEntry } from '../components/StudentDashboardView'

export default function DashboardProfEleve() {
  const { uid } = useParams<{ uid: string }>()
  const navigate = useNavigate()
  const { user, profile } = useAuth()

  const [displayName, setDisplayName] = useState<string>('—')
  const [rawProgress, setRawProgress] = useState<ProgressState>(DEFAULT_STATE)
  const [progress, setProgress] = useState<ProgressState>(DEFAULT_STATE)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)

  useEffect(() => {
    if (!user || !uid) return
    if (profile?.role !== 'prof') { setForbidden(true); return }

    async function load() {
      const userSnap = await getDoc(doc(db, 'users', uid!))
      if (!userSnap.exists()) { setForbidden(true); return }
      const data = userSnap.data() as { displayName?: string; profIds?: string[] }
      if (!data.profIds?.includes(user!.uid)) { setForbidden(true); return }
      setDisplayName(data.displayName ?? '—')

      const [progSnap, histSnap] = await Promise.all([
        getDoc(doc(db, 'users', uid!, 'progress', 'data')),
        getDocs(query(collection(db, 'users', uid!, 'history'), orderBy('createdAt', 'desc'))),
      ])
      const raw = progSnap.exists() ? mergeWithDefaults(progSnap.data()) : DEFAULT_STATE
      setRawProgress(raw)
      setProgress(applyDecayOnly(raw, todayStr()))
      setHistory(histSnap.docs.map(d => d.data() as HistoryEntry))
      setLoading(false)
    }
    load()
  }, [user, uid, profile])

  if (forbidden) {
    return (
      <div className="bg-app min-h-dvh flex items-center justify-center p-4">
        <div className="bg-surface border border-app rounded-2xl p-6 max-w-md text-center">
          <div className="text-3xl mb-2">🚫</div>
          <p className="text-sm text-app mb-3">Accès refusé. Cet élève n'est pas lié à votre compte prof.</p>
          <button onClick={() => navigate('/dashboard/prof')} className="rounded-lg px-3 py-1.5 text-xs font-bold text-white border-none" style={{ background: '#FF8B3D' }}>
            ← Retour dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-app min-h-dvh flex flex-col items-center px-4 py-3 pb-10">
      <div className="w-full max-w-xl">

        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <Link to="/dashboard/prof" className="bg-surface border border-app rounded-lg px-3 py-1.5 text-xs font-bold no-underline text-app hover:bg-surface-2 transition-colors">
            ← Mes élèves
          </Link>
        </div>

        <h1 className="text-xl font-black text-app mb-1">{displayName}</h1>
        <p className="text-xs text-app-muted mb-4">Fiche détaillée</p>

        {loading && <p className="text-app-muted text-center mt-10">Chargement…</p>}

        {!loading && (
          <StudentDashboardView
            progress={progress}
            rawProgress={rawProgress}
            history={history}
            today={todayStr()}
          />
        )}

      </div>
    </div>
  )
}
