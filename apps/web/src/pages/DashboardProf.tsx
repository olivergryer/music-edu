import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { db, auth } from '../lib/firebase'
import { useAuth } from '../auth/AuthProvider'
import { getLevel } from '../hooks/useProgressFirebase'

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

const MODULE_LABELS: Record<string, string> = {
  rythme: '🥁',
  theorie: '🎼',
  accordeur: '🎵',
}

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
    <div style={{
      minHeight: '100dvh', background: '#030712', color: '#f9fafb',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '12px 14px 40px', fontFamily: "'Inter','Segoe UI',sans-serif",
    }}>
      <div style={{ width: '100%', maxWidth: 600 }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <Link to="/" style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8, color: '#c084fc', fontWeight: 700, fontSize: 12, padding: '4px 10px', textDecoration: 'none' }}>
            ← Tessitura
          </Link>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#9ca3af' }}>
              {profile?.displayName} · <span style={{ color: '#fbbf24' }}>Professeur</span>
            </span>
            <button onClick={() => signOut(auth)} style={{ background: 'none', border: '1px solid #1f2937', borderRadius: 6, color: '#6b7280', fontSize: 11, padding: '3px 8px', cursor: 'pointer' }}>
              Déconnexion
            </button>
          </div>
        </div>

        {/* Code prof */}
        {profile?.teacherCode && (
          <div style={{ background: '#0a0f1a', borderRadius: 16, padding: '14px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
            <div>
              <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Votre code</div>
              <div style={{ fontSize: 26, fontWeight: 900, color: '#fbbf24', letterSpacing: 4 }}>{profile.teacherCode}</div>
            </div>
            <div style={{ fontSize: 12, color: '#4b5563', flex: 1 }}>Partagez ce code à vos élèves pour qu'ils vous rejoignent.</div>
          </div>
        )}

        <h1 style={{ fontSize: 20, fontWeight: 900, color: '#f9fafb', margin: '0 0 16px' }}>
          Mes élèves {!loading && `(${eleves.length})`}
        </h1>

        {loading && <p style={{ color: '#4b5563', textAlign: 'center', marginTop: 40 }}>Chargement…</p>}

        {!loading && eleves.length === 0 && (
          <div style={{ background: '#0a0f1a', borderRadius: 16, padding: '24px', textAlign: 'center', color: '#4b5563' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🎓</div>
            <p style={{ fontSize: 14, margin: 0 }}>Aucun élève encore. Partagez votre code prof !</p>
          </div>
        )}

        {eleves.map(e => {
          const prog = e.progress ?? DEFAULT_PROGRESS
          const lvl = getLevel(prog.xp)
          return (
            <div key={e.uid} style={{ background: '#0a0f1a', borderRadius: 16, padding: '16px 18px', marginBottom: 12 }}>
              {/* Nom + niveau */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{e.displayName}</div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: '#c084fc', fontWeight: 700 }}>{lvl.id}</span>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>⭐ {prog.xp}</span>
                  <span style={{ fontSize: 12, color: prog.streak.current > 0 ? '#f97316' : '#374151' }}>🔥 {prog.streak.current}</span>
                </div>
              </div>

              {/* Stats modules */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                {(['rythme', 'theorie', 'accordeur'] as const).map(k => (
                  <div key={k} style={{ flex: 1, background: '#111827', borderRadius: 8, padding: '6px 8px', textAlign: 'center' }}>
                    <div style={{ fontSize: 14 }}>{MODULE_LABELS[k]}</div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{k === 'rythme' ? prog.modules.rythme.seriesPlayed : k === 'theorie' ? prog.modules.theorie.sessionsPlayed : prog.modules.accordeur.sessionsPlayed}</div>
                    <div style={{ fontSize: 9, color: '#6b7280' }}>{k === 'rythme' ? 'séries' : 'sessions'}</div>
                  </div>
                ))}
              </div>

              {/* Dernière session */}
              {e.lastSession ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#111827', borderRadius: 8, padding: '6px 10px' }}>
                  <span style={{ fontSize: 14 }}>{e.lastSession.medal}</span>
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>{MODULE_LABELS[e.lastSession.module] ?? ''} {e.lastSession.module}</span>
                  <span style={{ fontSize: 11, color: '#c084fc', fontWeight: 700, marginLeft: 'auto' }}>+{e.lastSession.xp} XP</span>
                  <span style={{ fontSize: 10, color: '#374151' }}>{e.lastSession.date}</span>
                </div>
              ) : (
                <div style={{ fontSize: 11, color: '#374151', fontStyle: 'italic' }}>Aucune session enregistrée.</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
