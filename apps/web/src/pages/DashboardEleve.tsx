import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { collection, query, orderBy, getDocs, doc, getDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { db, auth } from '../lib/firebase'
import { useAuth } from '../auth/AuthProvider'
import useProgressFirebase from '../hooks/useProgressFirebase'
import { usePwaInstall } from '../hooks/usePwaInstall'
import { todayStr } from '../hooks/progressLogic'
import PwaInstallTutorial from '../components/PwaInstallTutorial'
import PwaInAppBrowserOverlay from '../components/PwaInAppBrowserOverlay'
import StudentDashboardView, { type HistoryEntry } from '../components/StudentDashboardView'

export default function DashboardEleve() {
  const { user, profile } = useAuth()
  const { data, rawData } = useProgressFirebase()
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [teacherInput, setTeacherInput] = useState('')
  const [teacherMsg, setTeacherMsg] = useState('')
  const [teacherLoading, setTeacherLoading] = useState(false)
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

  const profCodes: string[] = (profile as unknown as { profCodes?: string[] })?.profCodes ?? []
  const profNames: Record<string, string> = (profile as unknown as { profNames?: Record<string, string> })?.profNames ?? {}

  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'users', user.uid, 'history'), orderBy('createdAt', 'desc'))
    getDocs(q).then(snap => setHistory(snap.docs.map(d => d.data() as HistoryEntry)))
  }, [user])

  async function rejoindreProf(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !teacherInput.trim()) return
    setTeacherLoading(true)
    setTeacherMsg('')
    try {
      const code = teacherInput.trim().toUpperCase()
      const codeSnap = await getDoc(doc(db, 'teacherCodes', code))
      if (!codeSnap.exists()) {
        setTeacherMsg('Code introuvable.')
      } else {
        const profUid = codeSnap.data().uid as string
        const profDisplayName = (codeSnap.data().displayName as string) ?? code
        await updateDoc(doc(db, 'users', user.uid), {
          profIds: arrayUnion(profUid),
          profCodes: arrayUnion(code),
          [`profNames.${code}`]: profDisplayName,
        })
        setTeacherMsg('Professeur ajouté !')
        setTeacherInput('')
      }
    } catch {
      setTeacherMsg('Erreur réseau.')
    } finally {
      setTeacherLoading(false)
    }
  }

  async function quitterProf(code: string) {
    if (!user) return
    const codeSnap = await getDoc(doc(db, 'teacherCodes', code))
    if (!codeSnap.exists()) return
    const profUid = codeSnap.data().uid as string
    await updateDoc(doc(db, 'users', user.uid), {
      profIds: arrayRemove(profUid),
      profCodes: arrayRemove(code),
    })
  }

  return (
    <div className="bg-app min-h-dvh flex flex-col items-center px-4 py-3 pb-10">
      {showInApp && <PwaInAppBrowserOverlay pwa={pwa} onClose={() => setShowInApp(false)} />}
      {showPwaTuto && !showInApp && <PwaInstallTutorial pwa={pwa} context="dashboard" onClose={() => setShowPwaTuto(false)} />}
      <div className="w-full max-w-xl">

        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <Link to="/" className="bg-surface border border-app rounded-lg px-3 py-1.5 text-xs font-bold no-underline text-app transition-colors hover:bg-surface-2">
            ← Tessitura
          </Link>
          <div className="flex gap-2 items-center">
            <span className="text-xs text-app-muted">{profile?.displayName}</span>
            <button
              onClick={() => signOut(auth)}
              className="bg-surface border border-app rounded-lg px-2.5 py-1 text-xs text-app-muted"
            >
              Déconnexion
            </button>
          </div>
        </div>

        <h1 className="text-xl font-black text-app mb-5">Tableau de bord</h1>

        {/* Vue unifiée (identique à la fiche prof) */}
        <StudentDashboardView
          progress={data}
          rawProgress={rawData}
          history={history}
          today={todayStr()}
        />

        {/* Professeurs liés (spécifique élève) */}
        <div className="bg-surface rounded-2xl p-5 mb-3 border border-app">
          <span className="text-xs font-bold text-app-muted uppercase tracking-widest mb-3 block">Mon professeur</span>
          {profCodes.length > 0 && (
            <div className="flex flex-col gap-2 mb-3">
              {profCodes.map(code => (
                <div key={code} className="flex justify-between items-center bg-surface-2 rounded-lg px-3 py-2">
                  <span className="text-sm font-bold" style={{ color: '#FF8B3D' }}>{profNames[code] ?? code}</span>
                  <button
                    onClick={() => quitterProf(code)}
                    className="border border-app rounded bg-transparent text-xs text-app-muted px-2 py-1"
                    style={{ minHeight: 28 }}
                  >
                    Quitter
                  </button>
                </div>
              ))}
            </div>
          )}
          {profCodes.length === 0 && (
            <p className="text-xs text-app-muted mb-3">Aucun professeur lié.</p>
          )}
          <form onSubmit={rejoindreProf} className="flex gap-2">
            <input
              className="flex-1 bg-(--input-bg) border border-app rounded-lg px-3 py-2 text-sm text-app outline-none focus:border-rhythm tracking-widest uppercase"
              placeholder="Code prof (ex. BACH-42)"
              value={teacherInput}
              onChange={e => setTeacherInput(e.target.value)}
            />
            <button
              type="submit"
              disabled={teacherLoading}
              className="rounded-lg px-3.5 py-2 font-bold text-sm text-white border-none disabled:opacity-50"
              style={{ background: '#4A6CF7' }}
            >
              {teacherLoading ? '…' : 'Rejoindre'}
            </button>
          </form>
          {teacherMsg && (
            <p className="mt-2 text-sm m-0" style={{ color: teacherMsg === 'Professeur ajouté !' ? '#22C55E' : '#f87171' }}>
              {teacherMsg}
            </p>
          )}
        </div>

      </div>
    </div>
  )
}
