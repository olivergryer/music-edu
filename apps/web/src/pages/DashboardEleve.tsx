import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { collection, query, orderBy, limit, getDocs, doc, getDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { db, auth } from '../lib/firebase'
import { useAuth } from '../auth/AuthProvider'
import useProgressFirebase, { TROPHIES, getNextLevel } from '../hooks/useProgressFirebase'

interface HistoryEntry {
  date: string
  module: string
  xp: number
  medal: string
}

const MODULE_LABELS: Record<string, string> = {
  rythme: '🥁 Rythme',
  theorie: '🎼 Théorie',
  accordeur: '🎵 Accordeur',
}

export default function DashboardEleve() {
  const { user, profile } = useAuth()
  const { xp, level, nextLevel, streak, trophies, modules } = useProgressFirebase()
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [teacherInput, setTeacherInput] = useState('')
  const [teacherMsg, setTeacherMsg] = useState('')
  const [teacherLoading, setTeacherLoading] = useState(false)

  const nextLv = getNextLevel(xp)
  const xpInLevel = xp - level.xp
  const xpNeeded = nextLv ? nextLv.xp - level.xp : 1
  const pct = Math.min(100, Math.round((xpInLevel / xpNeeded) * 100))

  const profCodes: string[] = (profile as unknown as { profCodes?: string[] })?.profCodes ?? []
  const profNames: Record<string, string> = (profile as unknown as { profNames?: Record<string, string> })?.profNames ?? {}

  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'users', user.uid, 'history'), orderBy('createdAt', 'desc'), limit(20))
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

  const btnStyle = {
    background: '#111827', border: '1px solid #1f2937', borderRadius: 8,
    color: '#c084fc', fontWeight: 700, fontSize: 12, padding: '4px 10px',
    cursor: 'pointer', textDecoration: 'none' as const,
  }

  return (
    <div style={{
      minHeight: '100dvh', background: '#030712', color: '#f9fafb',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '12px 14px 40px', fontFamily: "'Poppins','Inter','Segoe UI',sans-serif",
    }}>
      <div style={{ width: '100%', maxWidth: 540 }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <Link to="/" style={btnStyle}>← Tessitura</Link>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#9ca3af' }}>{profile?.displayName}</span>
            <button onClick={() => signOut(auth)} style={{ ...btnStyle, color: '#6b7280' }}>Déconnexion</button>
          </div>
        </div>

        <h1 style={{ fontSize: 20, fontWeight: 900, margin: '0 0 20px', fontFamily: "'Righteous','Inter',sans-serif" }}>Tableau de bord</h1>

        {/* Niveau + XP */}
        <div style={{ background: '#0a0f1a', borderRadius: 16, padding: '20px 18px', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Niveau</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#c084fc' }}>{level.id}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>XP total</div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>⭐ {xp}</div>
            </div>
          </div>
          <div style={{ height: 8, background: '#1f2937', borderRadius: 99, overflow: 'hidden', marginBottom: 6 }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#7c3aed,#c084fc)', borderRadius: 99, transition: 'width 0.3s' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#4b5563' }}>
            <span>{xpInLevel} / {xpNeeded} XP</span>
            <span>{nextLv ? `Prochain : ${nextLv.id}` : '🏆 Niveau maximum'}</span>
          </div>
        </div>

        {/* Streak */}
        <div style={{ background: '#0a0f1a', borderRadius: 16, padding: '16px 18px', marginBottom: 14, display: 'flex', gap: 16 }}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: streak.current > 0 ? '#f97316' : '#374151' }}>🔥 {streak.current}</div>
            <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>jours consécutifs</div>
          </div>
          <div style={{ width: 1, background: '#1f2937' }} />
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#6b7280' }}>{streak.longest}</div>
            <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>record</div>
          </div>
        </div>

        {/* Stats modules */}
        <div style={{ background: '#0a0f1a', borderRadius: 16, padding: '16px 18px', marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Activité</div>
          <div style={{ display: 'flex', gap: 10 }}>
            {([
              { key: 'rythme', icon: '🥁', label: 'Rythme', stat: `${modules.rythme.seriesPlayed} séries`, xpTotal: modules.rythme.xpTotal },
              { key: 'theorie', icon: '🎼', label: 'Théorie', stat: `${modules.theorie.sessionsPlayed} sessions`, xpTotal: modules.theorie.xpTotal },
              { key: 'accordeur', icon: '🎵', label: 'Accordeur', stat: `${modules.accordeur.sessionsPlayed} sessions`, xpTotal: modules.accordeur.xpTotal },
            ] as const).map(m => (
              <div key={m.key} style={{ flex: 1, background: '#111827', borderRadius: 12, padding: '10px 8px' }}>
                <div style={{ fontSize: 11, color: '#c084fc', fontWeight: 700, marginBottom: 4 }}>{m.icon} {m.label}</div>
                <div style={{ fontSize: 16, fontWeight: 900 }}>{m.xpTotal}</div>
                <div style={{ fontSize: 9, color: '#6b7280' }}>XP · {m.stat}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Trophées */}
        <div style={{ background: '#0a0f1a', borderRadius: 16, padding: '16px 18px', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 }}>Trophées</div>
            <div style={{ fontSize: 10, color: '#6b7280' }}>{trophies.length} / {TROPHIES.length}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {TROPHIES.map(t => {
              const unlocked = trophies.includes(t.id)
              return (
                <div key={t.id} style={{
                  background: unlocked ? '#1a0d3a' : '#0f172a',
                  border: `1px solid ${unlocked ? '#7c3aed' : '#1f2937'}`,
                  borderRadius: 12, padding: '10px 4px', textAlign: 'center',
                  opacity: unlocked ? 1 : 0.35,
                }}>
                  <div style={{ fontSize: 20, marginBottom: 4 }}>{t.icon}</div>
                  <div style={{ fontSize: 9, color: unlocked ? '#c084fc' : '#4b5563', fontWeight: 700, lineHeight: 1.3 }}>{t.label}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Professeurs liés */}
        <div style={{ background: '#0a0f1a', borderRadius: 16, padding: '16px 18px', marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
            Mon professeur
          </div>
          {profCodes.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              {profCodes.map(code => (
                <div key={code} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#111827', borderRadius: 8, padding: '8px 12px' }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#fbbf24' }}>{profNames[code] ?? code}</span>
                  <button
                    onClick={() => quitterProf(code)}
                    style={{ background: 'none', border: '1px solid #374151', borderRadius: 6, color: '#6b7280', fontSize: 11, padding: '2px 8px', cursor: 'pointer' }}
                  >
                    Quitter
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 12, color: '#374151', margin: '0 0 12px' }}>Aucun professeur lié.</p>
          )}
          <form onSubmit={rejoindreProf} style={{ display: 'flex', gap: 8 }}>
            <input
              style={{ flex: 1, background: '#111827', border: '1px solid #1f2937', borderRadius: 8, padding: '8px 12px', color: '#f9fafb', fontSize: 14, outline: 'none', textTransform: 'uppercase', letterSpacing: 2 }}
              placeholder="Code prof (ex. BACH-42)"
              value={teacherInput}
              onChange={e => setTeacherInput(e.target.value)}
            />
            <button
              type="submit"
              disabled={teacherLoading}
              style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
            >
              {teacherLoading ? '…' : 'Rejoindre'}
            </button>
          </form>
          {teacherMsg && (
            <p style={{ margin: '8px 0 0', fontSize: 13, color: teacherMsg === 'Professeur ajouté !' ? '#34d399' : '#f87171' }}>{teacherMsg}</p>
          )}
        </div>

        {/* Historique */}
        <div style={{ background: '#0a0f1a', borderRadius: 16, padding: '16px 18px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
            Historique des sessions
          </div>
          {history.length === 0 ? (
            <p style={{ fontSize: 13, color: '#374151', textAlign: 'center', padding: '12px 0' }}>Aucune session enregistrée.</p>
          ) : history.map((h, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: i < history.length - 1 ? '1px solid #0f172a' : 'none' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 16 }}>{h.medal}</span>
                <span style={{ fontSize: 11, color: '#9ca3af' }}>{MODULE_LABELS[h.module] ?? h.module}</span>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: '#c084fc', fontWeight: 700 }}>+{h.xp} XP</span>
                <span style={{ fontSize: 10, color: '#374151' }}>{h.date}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
