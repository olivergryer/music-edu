import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { collection, query, where, getDocs, getDoc, doc, orderBy, limit } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { db, auth } from '../lib/firebase'
import { useAuth } from '../auth/AuthProvider'
import { usePwaInstall } from '../hooks/usePwaInstall'
import PwaInstallTutorial from '../components/PwaInstallTutorial'
import PwaInAppBrowserOverlay from '../components/PwaInAppBrowserOverlay'
import { estAdmin, estCompteTest } from '../lib/admin'
import AdminComptes from './AdminComptes'
import CarteEleve, { DEFAULT_PROGRESS, type EleveData, type EleveProgress, type LastSession } from './CarteEleve'

export default function DashboardProf() {
  const { user, profile } = useAuth()
  const [eleves, setEleves] = useState<EleveData[]>([])
  const [afficherTests, setAfficherTests] = useState(false)
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
          const [progDoc, histSnap] = await Promise.all([
            // Doc de gamification globale, PAS les docs progress/{moduleId} per-module.
            getDoc(doc(db, 'users', uid, 'progress', 'data')),
            getDocs(query(collection(db, 'users', uid, 'history'), orderBy('createdAt', 'desc'), limit(1))),
          ])
          const progress = progDoc.exists() ? (progDoc.data() as EleveProgress) : DEFAULT_PROGRESS
          const lastSession = histSnap.empty ? null : (histSnap.docs[0].data() as LastSession)
          return { uid, displayName, progress, lastSession }
        })
      )
      setEleves(results)
      setLoading(false)
    }
    chargerEleves()
  }, [user])

  // Les comptes du protocole de test sont rattachés au même code prof que de
  // vrais élèves : sans ce tri, ils noieraient la liste de travail. Le filtrage
  // est fait à l'affichage et non au chargement — basculer la case ne doit pas
  // relancer une centaine de lectures Firestore.
  const nbTests = eleves.filter(e => estCompteTest(e.uid)).length
  const elevesVisibles = afficherTests ? eleves : eleves.filter(e => !estCompteTest(e.uid))

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
          Mes élèves {!loading && `(${elevesVisibles.length})`}
        </h1>

        {!loading && nbTests > 0 && (
          <label className="flex items-center gap-2 text-xs text-app-muted mb-3 cursor-pointer">
            <input
              type="checkbox"
              checked={afficherTests}
              onChange={e => setAfficherTests(e.target.checked)}
              style={{ accentColor: '#FF8B3D', width: 15, height: 15 }}
            />
            Afficher les {nbTests} comptes du protocole de test
          </label>
        )}

        {loading && <p className="text-app-muted text-center mt-10">Chargement…</p>}

        {!loading && elevesVisibles.length === 0 && (
          <div className="bg-surface border border-app rounded-2xl p-6 text-center text-app-muted">
            <div className="text-3xl mb-2">🎓</div>
            <p className="text-sm m-0">Aucun élève encore. Partagez votre code prof !</p>
          </div>
        )}

        {elevesVisibles.map(e => (
          <CarteEleve
            key={e.uid}
            eleve={e}
            attenue={estCompteTest(e.uid)}
            badges={estCompteTest(e.uid)
              ? <span className="text-[10px] text-app-muted">test</span>
              : undefined}
          />
        ))}

        {/* Supervision — visible des seuls comptes administrateurs, et placée
            APRÈS les élèves rattachés : c'est eux l'écran de travail quotidien. */}
        {user && estAdmin(user.uid) && <AdminComptes uidProf={user.uid} />}

      </div>
    </div>
  )
}
