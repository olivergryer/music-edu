import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { collection, query, orderBy, limit, getDocs, doc, getDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { db, auth } from '../lib/firebase'
import { useAuth } from '../auth/AuthProvider'
import useProgressFirebase, { TROPHIES, getNextRank } from '../hooks/useProgressFirebase'

interface HistoryEntry {
  date: string
  module: string
  xp: number
  medal: string
}

const MODULE_LABELS: Record<string, string> = {
  rythme: 'Rythme',
  theorie: 'Théorie',
  accordeur: 'Accordeur',
}

const MODULE_COLORS: Record<string, string> = {
  rythme: '#4A6CF7',
  theorie: '#8B5CF6',
  accordeur: '#FF8B3D',
}

const cardCls = "bg-surface rounded-2xl p-5 mb-3 border border-app"
const labelCls = "text-xs font-bold text-app-muted uppercase tracking-widest mb-3 block"

export default function DashboardEleve() {
  const { user, profile } = useAuth()
  const { xp, rank, nextRank, streak, trophies, modules } = useProgressFirebase()
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [hoveredTrophy, setHoveredTrophy] = useState<string | null>(null)
  const [teacherInput, setTeacherInput] = useState('')
  const [teacherMsg, setTeacherMsg] = useState('')
  const [teacherLoading, setTeacherLoading] = useState(false)

  const nextLv = getNextRank(xp)
  const xpInRank = xp - rank.xp
  const xpNeeded = nextLv ? nextLv.xp - rank.xp : 1
  const pct = Math.min(100, Math.round((xpInRank / xpNeeded) * 100))

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

  return (
    <div className="bg-app min-h-dvh flex flex-col items-center px-4 py-3 pb-10">
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

        {/* Rang + XP */}
        <div className={cardCls}>
          <div className="flex justify-between items-center mb-3">
            <div>
              <div className={labelCls}>Rang</div>
              <div className="text-3xl font-black" style={{ color: '#8B5CF6' }}>{rank.id}</div>
            </div>
            <div className="text-right">
              <div className={labelCls}>XP total</div>
              <div className="text-2xl font-black text-app">{xp} XP</div>
            </div>
          </div>
          <div className="h-2 bg-surface-2 rounded-full overflow-hidden mb-1.5">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#8B5CF6,#4A6CF7)' }}
            />
          </div>
          <div className="flex justify-between text-xs text-app-muted">
            <span>{xpInRank} / {xpNeeded} XP</span>
            <span>{nextLv ? `Prochain : ${nextLv.id}` : 'Rang maximum'}</span>
          </div>
        </div>

        {/* Streak */}
        <div className={cardCls + ' flex gap-4'}>
          <div className="flex-1 text-center">
            <div className="text-3xl font-black mb-1" style={{ color: streak.current > 0 ? '#FF8B3D' : 'var(--text-muted)' }}>
              {streak.current}
            </div>
            <div className="text-xs text-app-muted">jours consécutifs</div>
          </div>
          <div className="w-px bg-[var(--border-c)]" />
          <div className="flex-1 text-center">
            <div className="text-3xl font-black text-app-muted mb-1">{streak.longest}</div>
            <div className="text-xs text-app-muted">record</div>
          </div>
        </div>

        {/* Stats modules */}
        <div className={cardCls}>
          <span className={labelCls}>Activité</span>
          <div className="flex gap-2.5">
            {([
              { key: 'rythme',    label: 'Rythme',    stat: `${modules.rythme.seriesPlayed} séries · ${modules.rythme.exercisesPlayed ?? 0} exos`, xpTotal: modules.rythme.xpTotal },
              { key: 'theorie',   label: 'Théorie',   stat: `${modules.theorie.sessionsPlayed} sessions`,  xpTotal: modules.theorie.xpTotal },
              { key: 'accordeur', label: 'Accordeur', stat: `${modules.accordeur.sessionsPlayed} sessions`, xpTotal: modules.accordeur.xpTotal },
            ] as const).map(m => (
              <div key={m.key} className="flex-1 bg-surface-2 rounded-xl p-2.5">
                <div className="text-xs font-bold mb-1" style={{ color: MODULE_COLORS[m.key] }}>{m.label}</div>
                <div className="text-base font-black text-app">{m.xpTotal}</div>
                <div className="text-[10px] text-app-muted">XP · {m.stat}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Trophées */}
        <div className={cardCls}>
          <div className="flex justify-between items-center mb-3">
            <span className={labelCls} style={{ margin: 0 }}>Trophées</span>
            <span className="text-xs text-app-muted">{trophies.length} / {TROPHIES.length}</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {TROPHIES.map(t => {
              const unlocked = trophies.includes(t.id)
              return (
                <div
                  key={t.id}
                  className="relative"
                  onMouseEnter={() => setHoveredTrophy(t.id)}
                  onMouseLeave={() => setHoveredTrophy(null)}
                >
                  <div
                    className="rounded-xl py-2.5 px-1 text-center border border-app transition-opacity"
                    style={{
                      background: unlocked ? '#8B5CF610' : 'var(--surface-2)',
                      borderColor: unlocked ? '#8B5CF6' : 'var(--border-c)',
                      opacity: unlocked ? 1 : 0.35,
                    }}
                  >
                    <div className="text-xl mb-1">{t.icon}</div>
                    <div className="text-[9px] font-bold leading-tight" style={{ color: unlocked ? '#8B5CF6' : 'var(--text-muted)' }}>
                      {t.label}
                    </div>
                  </div>
                  {hoveredTrophy === t.id && (
                    <div className="absolute bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2 bg-surface border border-app rounded-lg px-2 py-1.5 text-[10px] text-app whitespace-nowrap z-10 pointer-events-none shadow-sm leading-snug">
                      {t.hint}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Professeurs liés */}
        <div className={cardCls}>
          <span className={labelCls}>Mon professeur</span>
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

        {/* Historique */}
        <div className={cardCls}>
          <span className={labelCls}>Historique des sessions</span>
          {history.length === 0 ? (
            <p className="text-sm text-app-muted text-center py-3">Aucune session enregistrée.</p>
          ) : history.map((h, i) => (
            <div
              key={i}
              className="flex justify-between items-center py-2"
              style={{ borderBottom: i < history.length - 1 ? '1px solid var(--border-c)' : 'none' }}
            >
              <div className="flex gap-2 items-center">
                <span className="text-base">{h.medal}</span>
                <span className="text-xs text-app-muted">{MODULE_LABELS[h.module] ?? h.module}</span>
              </div>
              <div className="flex gap-2.5 items-center">
                <span className="text-xs font-bold" style={{ color: MODULE_COLORS[h.module] ?? '#4A6CF7' }}>+{h.xp} XP</span>
                <span className="text-[10px] text-app-muted">{h.date}</span>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
