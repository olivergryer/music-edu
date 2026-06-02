import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { collection, doc, getDoc, getDocs, orderBy, query } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../auth/AuthProvider'
import {
  applyDecayOnly,
  computeDaysIdle,
  localDateStr,
  mergeWithDefaults,
  DEFAULT_STATE,
  getRank, getNextRank, todayStr,
  TROPHIES,
  type ProgressState,
} from '../hooks/progressLogic'

interface HistoryEntry {
  date: string
  module: string
  xp: number
  medal: string
}

const MODULE_LABELS: Record<string, string> = { rythme: 'Rythme', theorie: 'Théorie', accordeur: 'Accordeur' }
const MODULE_COLORS: Record<string, string> = { rythme: '#4A6CF7', theorie: '#8B5CF6', accordeur: '#FF8B3D' }
const MODULE_ICONS:  Record<string, string> = { rythme: '🥁', theorie: '🎼', accordeur: '🎵' }

const cardCls = "bg-surface rounded-2xl p-5 mb-3 border border-app"
const labelCls = "text-xs font-bold text-app-muted uppercase tracking-widest mb-3 block"

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

  const today = todayStr()
  const daysIdle = computeDaysIdle(progress.streak.lastDate, today)
  const decayDelta = rawProgress.xp - progress.xp
  const recentTrophies = progress.trophies.slice(-3)

  // Vitesse XP/sem : somme xp des 14 derniers jours / 2
  const speedXpPerWeek = useMemo(() => {
    if (history.length === 0) return 0
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 14)
    const cutoffStr = localDateStr(cutoff)
    const sum = history.filter(h => h.date >= cutoffStr).reduce((s, h) => s + (h.xp ?? 0), 0)
    return Math.round(sum / 2)
  }, [history])

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

  const rank    = getRank(progress.xp)
  const nextLv  = getNextRank(progress.xp)
  const xpInRank = progress.xp - rank.xp
  const xpNeeded = nextLv ? nextLv.xp - rank.xp : 1
  const pct = Math.min(100, Math.round((xpInRank / xpNeeded) * 100))

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
          <>
            {/* Badges diagnostic */}
            <div className="flex flex-wrap gap-2 mb-5">
              {daysIdle > 0 && (
                <DiagBadge color="#FF8B3D">⏸ Inactif {daysIdle}j</DiagBadge>
              )}
              {decayDelta > 0 && (
                <DiagBadge color="#f87171">📉 Decay −{decayDelta} XP</DiagBadge>
              )}
              {speedXpPerWeek > 0 && (
                <DiagBadge color="#4A6CF7">⚡ {speedXpPerWeek} XP/sem</DiagBadge>
              )}
              {recentTrophies.length > 0 && (
                <DiagBadge color="#8B5CF6">
                  🏅 {recentTrophies.map(id => TROPHIES.find(t => t.id === id)?.icon ?? '?').join(' ')}
                </DiagBadge>
              )}
              {daysIdle === 0 && decayDelta === 0 && speedXpPerWeek === 0 && recentTrophies.length === 0 && (
                <span className="text-xs text-app-muted">Aucun signal récent.</span>
              )}
            </div>

            {/* Rang + XP */}
            <div className={cardCls}>
              <div className="flex justify-between items-center mb-3">
                <div>
                  <div className={labelCls}>Rang</div>
                  <div className="text-3xl font-black" style={{ color: '#8B5CF6' }}>{rank.id}</div>
                </div>
                <div className="text-right">
                  <div className={labelCls}>XP total</div>
                  <div className="text-2xl font-black text-app">{progress.xp} XP</div>
                </div>
              </div>
              <div className="h-2 bg-surface-2 rounded-full overflow-hidden mb-1.5">
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#8B5CF6,#4A6CF7)' }} />
              </div>
              <div className="flex justify-between text-xs text-app-muted">
                <span>{xpInRank} / {xpNeeded} XP</span>
                <span>{nextLv ? `Prochain : ${nextLv.id}` : 'Rang maximum'}</span>
              </div>
            </div>

            {/* Streak */}
            <div className={cardCls + ' flex gap-4'}>
              <div className="flex-1 text-center">
                <div className="text-3xl font-black mb-1" style={{ color: progress.streak.current > 0 ? '#FF8B3D' : 'var(--text-muted)' }}>
                  {progress.streak.current}
                </div>
                <div className="text-xs text-app-muted">jours consécutifs</div>
              </div>
              <div className="w-px bg-[var(--border-c)]" />
              <div className="flex-1 text-center">
                <div className="text-3xl font-black text-app-muted mb-1">{progress.streak.longest}</div>
                <div className="text-xs text-app-muted">record</div>
              </div>
            </div>

            {/* Stats modules */}
            <div className={cardCls}>
              <span className={labelCls}>Activité par module</span>
              <div className="flex gap-2.5">
                {([
                  { key: 'rythme',    label: 'Rythme',    stat: `${progress.modules.rythme.seriesPlayed} séries · ${progress.modules.rythme.exercisesPlayed ?? 0} exos`, xpTotal: progress.modules.rythme.xpTotal },
                  { key: 'theorie',   label: 'Théorie',   stat: `${progress.modules.theorie.sessionsPlayed} sessions`,  xpTotal: progress.modules.theorie.xpTotal },
                  { key: 'accordeur', label: 'Accordeur', stat: `${progress.modules.accordeur.sessionsPlayed} sessions`, xpTotal: progress.modules.accordeur.xpTotal },
                ] as const).map(m => (
                  <div key={m.key} className="flex-1 bg-surface-2 rounded-xl p-2.5">
                    <div className="text-xs font-bold mb-1" style={{ color: MODULE_COLORS[m.key] }}>{m.label}</div>
                    <div className="text-base font-black text-app">{m.xpTotal}</div>
                    <div className="text-[10px] text-app-muted">XP · {m.stat}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Courbe XP cumulé */}
            <div className={cardCls}>
              <span className={labelCls}>Évolution XP cumulé</span>
              <XpCumulativeChart history={history} />
            </div>

            {/* Heatmap calendrier */}
            <div className={cardCls}>
              <span className={labelCls}>Activité (12 dernières semaines)</span>
              <ActivityHeatmap history={history} today={today} />
            </div>

            {/* Trophées */}
            <div className={cardCls}>
              <div className="flex justify-between items-center mb-3">
                <span className={labelCls} style={{ margin: 0 }}>Trophées</span>
                <span className="text-xs text-app-muted">{progress.trophies.length} / {TROPHIES.length}</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {TROPHIES.map(t => {
                  const unlocked = progress.trophies.includes(t.id)
                  return (
                    <div key={t.id} className="rounded-xl py-2.5 px-1 text-center border border-app transition-opacity"
                      style={{ background: unlocked ? '#8B5CF610' : 'var(--surface-2)', borderColor: unlocked ? '#8B5CF6' : 'var(--border-c)', opacity: unlocked ? 1 : 0.35 }}>
                      <div className="text-xl mb-1">{t.icon}</div>
                      <div className="text-[9px] font-bold leading-tight" style={{ color: unlocked ? '#8B5CF6' : 'var(--text-muted)' }}>
                        {t.label}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Historique complet */}
            <div className={cardCls}>
              <div className="flex justify-between items-center mb-3">
                <span className={labelCls} style={{ margin: 0 }}>Historique des sessions</span>
                <span className="text-xs text-app-muted">{history.length}</span>
              </div>
              {history.length === 0 ? (
                <p className="text-sm text-app-muted text-center py-3">Aucune session enregistrée.</p>
              ) : history.map((h, i) => (
                <div key={i} className="flex justify-between items-center py-2"
                  style={{ borderBottom: i < history.length - 1 ? '1px solid var(--border-c)' : 'none' }}>
                  <div className="flex gap-2 items-center">
                    <span className="text-base">{h.medal}</span>
                    <span className="text-xs text-app-muted">{MODULE_ICONS[h.module] ?? ''} {MODULE_LABELS[h.module] ?? h.module}</span>
                  </div>
                  <div className="flex gap-2.5 items-center">
                    <span className="text-xs font-bold" style={{ color: MODULE_COLORS[h.module] ?? '#4A6CF7' }}>+{h.xp} XP</span>
                    <span className="text-[10px] text-app-muted">{h.date}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

      </div>
    </div>
  )
}

// ─── Badge diagnostic ─────────────────────────────────────────────────────────

function DiagBadge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="text-xs font-bold rounded-full px-3 py-1.5 border"
      style={{ background: `${color}15`, borderColor: color, color }}>
      {children}
    </span>
  )
}

// ─── Courbe XP cumulé ─────────────────────────────────────────────────────────

function XpCumulativeChart({ history }: { history: HistoryEntry[] }) {
  // Tri ascendant par date puis cumul.
  const points = useMemo(() => {
    const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date))
    let cum = 0
    return sorted.map(h => { cum += h.xp ?? 0; return { date: h.date, cum } })
  }, [history])

  if (points.length < 2) {
    return <p className="text-xs text-app-muted text-center py-4">Pas encore assez de données.</p>
  }

  const W = 320, H = 120, PAD_X = 30, PAD_Y = 14
  const maxXp = points[points.length - 1].cum
  const innerW = W - PAD_X * 2
  const innerH = H - PAD_Y * 2

  const xs = points.map((_, i) => PAD_X + (i / (points.length - 1)) * innerW)
  const ys = points.map(p => PAD_Y + innerH - (p.cum / maxXp) * innerH)
  const polyline = xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
      {/* Grille horizontale */}
      <line x1={PAD_X} y1={PAD_Y} x2={W - PAD_X} y2={PAD_Y} stroke="var(--border-c)" strokeDasharray="2,3" />
      <line x1={PAD_X} y1={H - PAD_Y} x2={W - PAD_X} y2={H - PAD_Y} stroke="var(--border-c)" />
      {/* Polyline */}
      <polyline points={polyline} fill="none" stroke="#8B5CF6" strokeWidth="2" />
      {/* Points */}
      {points.map((p, i) => (
        <circle key={i} cx={xs[i]} cy={ys[i]} r="2.5" fill="#8B5CF6">
          <title>{p.date} · {p.cum} XP</title>
        </circle>
      ))}
      {/* Labels Y */}
      <text x="2" y={PAD_Y + 4} fontSize="9" fill="var(--text-muted)">{maxXp}</text>
      <text x="2" y={H - PAD_Y + 4} fontSize="9" fill="var(--text-muted)">0</text>
      {/* Labels X */}
      <text x={PAD_X} y={H - 2} fontSize="9" fill="var(--text-muted)" textAnchor="start">{points[0].date.slice(5)}</text>
      <text x={W - PAD_X} y={H - 2} fontSize="9" fill="var(--text-muted)" textAnchor="end">{points[points.length-1].date.slice(5)}</text>
    </svg>
  )
}

// ─── Heatmap calendrier ───────────────────────────────────────────────────────

function ActivityHeatmap({ history, today }: { history: HistoryEntry[]; today: string }) {
  // XP par date (somme).
  const dailyXp = useMemo(() => {
    const m = new Map<string, number>()
    for (const h of history) m.set(h.date, (m.get(h.date) ?? 0) + (h.xp ?? 0))
    return m
  }, [history])

  const WEEKS = 12
  const DAYS_PER_WEEK = 7
  const CELL = 13
  const GAP = 3

  // Construction : aligner sur lundi. Trouver le lundi de la semaine actuelle, puis remonter 11 semaines.
  const [ty, tm, td] = today.split('-').map(Number)
  const todayDate = new Date(ty, tm - 1, td)
  const weekdayMonFirst = (todayDate.getDay() + 6) % 7 // 0=Lundi ... 6=Dimanche
  const startMonday = new Date(todayDate)
  startMonday.setDate(todayDate.getDate() - weekdayMonFirst - (WEEKS - 1) * 7)

  const cells: { date: string; xp: number; col: number; row: number }[] = []
  for (let col = 0; col < WEEKS; col++) {
    for (let row = 0; row < DAYS_PER_WEEK; row++) {
      const d = new Date(startMonday)
      d.setDate(startMonday.getDate() + col * 7 + row)
      const dateStr = localDateStr(d)
      const isFuture = dateStr > today
      cells.push({ date: dateStr, xp: isFuture ? -1 : (dailyXp.get(dateStr) ?? 0), col, row })
    }
  }

  function cellColor(xp: number): string {
    if (xp < 0) return 'transparent'
    if (xp === 0) return 'var(--surface-2)'
    if (xp < 100) return '#8B5CF640'
    if (xp < 500) return '#8B5CF680'
    if (xp < 2000) return '#8B5CF6C0'
    return '#8B5CF6'
  }

  const W = WEEKS * (CELL + GAP) - GAP + 20
  const H = DAYS_PER_WEEK * (CELL + GAP) - GAP + 20
  const DAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
        {/* Labels jours */}
        {DAY_LABELS.map((d, i) => (
          <text key={i} x="2" y={i * (CELL + GAP) + CELL - 2} fontSize="8" fill="var(--text-muted)">{d}</text>
        ))}
        {/* Cellules */}
        {cells.map((c, i) => (
          <rect key={i}
            x={20 + c.col * (CELL + GAP)}
            y={c.row * (CELL + GAP)}
            width={CELL} height={CELL} rx="2"
            fill={cellColor(c.xp)}>
            <title>{c.date}{c.xp > 0 ? ` · ${c.xp} XP` : c.xp === 0 ? ' · aucune activité' : ''}</title>
          </rect>
        ))}
      </svg>
      {/* Légende */}
      <div className="flex items-center gap-1.5 mt-2 text-[10px] text-app-muted">
        <span>Moins</span>
        {[0, 50, 250, 1000, 3000].map(v => (
          <span key={v} style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: cellColor(v) }} />
        ))}
        <span>Plus</span>
      </div>
    </div>
  )
}
