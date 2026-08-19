import { useMemo, useState } from 'react'
import {
  computeDaysIdle,
  localDateStr,
  getRank, getNextRank, rankLabel, displayStreak,
  RANKS, TROPHIES,
  type ProgressState,
} from '../hooks/progressLogic'
import { MODULES, MODULE_IDS, moduleLabel, moduleColor, type ModuleId } from '../lib/modules'
import { groupHistory, joursValidantStreak, iconeMedaille, type GroupedEntry } from '../hooks/historyGrouping'
import type { HistoryEntry as HistoryEntryBase } from '../hooks/progressLogic'

// Le tableau de bord lit l'historique tel qu'il sort de Firestore : le module y
// est une chaîne libre, pas encore validée contre le registre (données legacy).
export type HistoryEntry = Omit<HistoryEntryBase, 'module'> & { module: string }

// Libellés/couleurs dérivés du registre unique (lib/modules.ts).
export const MODULE_LABELS: Record<string, string> = Object.fromEntries(MODULE_IDS.map(id => [id, MODULES[id].label]))
export const MODULE_COLORS: Record<string, string> = Object.fromEntries(MODULE_IDS.map(id => [id, MODULES[id].color]))
// Icônes : conservées localement (emojis, hors registre). Une par module et
// toutes distinctes — Théorie et Notes partageaient 🎼, indiscernables dans
// l'historique où les deux se côtoient ligne à ligne.
export const MODULE_ICONS:  Record<string, string> = {
  rythme: '🥁', theorie: '🎼', notes: '🎵', harmonie: '🎹', accordeur: '🎺',
}

// Stat legacy affichée par module (le doc gamification global stocke des compteurs
// de forme hétérogène). Fallback « — » pour un module sans compteur legacy (ex. Notes
// tant qu'il n'écrit pas la couche progress/{moduleId}). Itérable sur MODULE_IDS.
function legacyModuleStat(id: ModuleId, mods: ProgressState['modules']): { xpTotal: number; stat: string } {
  const m = (mods as Record<string, { xpTotal?: number; seriesPlayed?: number; exercisesPlayed?: number; sessionsPlayed?: number }>)[id]
  if (!m) return { xpTotal: 0, stat: '—' }
  if (m.seriesPlayed !== undefined) return { xpTotal: m.xpTotal ?? 0, stat: `${m.seriesPlayed} séries · ${m.exercisesPlayed ?? 0} exos` }
  if (m.sessionsPlayed !== undefined) return { xpTotal: m.xpTotal ?? 0, stat: `${m.sessionsPlayed} sessions` }
  return { xpTotal: m.xpTotal ?? 0, stat: '—' }
}

const cardCls = "bg-surface rounded-2xl p-5 mb-3 border border-app"
const labelCls = "text-xs font-bold text-app-muted uppercase tracking-widest mb-3 block"

interface Props {
  /** État de progression décayé (affichage). */
  progress: ProgressState
  /** État brut non-décayé — pour calculer le delta de decay. */
  rawProgress: ProgressState
  /** Historique complet des sessions (tri quelconque, trié en interne pour les graphes). */
  history: HistoryEntry[]
  /** Date du jour (YYYY-MM-DD). */
  today: string
}

// Vue dashboard partagée : utilisée par l'élève (sa propre fiche) ET par le prof
// (fiche d'un élève lié). Toute modification ici se répercute sur les deux vues.
export default function StudentDashboardView({ progress, rawProgress, history, today }: Props) {
  const [showRankInfo, setShowRankInfo] = useState(false)
  const [hoveredTrophy, setHoveredTrophy] = useState<string | null>(null)

  const rank    = getRank(progress.xp)
  const nextLv  = getNextRank(progress.xp)
  const xpInRank = progress.xp - rank.xp
  const xpNeeded = nextLv ? nextLv.xp - rank.xp : 1
  const pct = Math.min(100, Math.round((xpInRank / xpNeeded) * 100))
  const liveStreak = displayStreak(progress.streak, today)
  const currentRankId = rank.id

  const daysIdle = computeDaysIdle(progress.streak.lastDate, today)
  const decayDelta = rawProgress.xp - progress.xp
  const recentTrophies = progress.trophies.slice(-3)

  const grouped = useMemo(() => groupHistory(history), [history])

  // Vitesse XP/sem : somme xp des 14 derniers jours / 2.
  const speedXpPerWeek = useMemo(() => {
    if (history.length === 0) return 0
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 14)
    const cutoffStr = localDateStr(cutoff)
    const sum = history.filter(h => h.date >= cutoffStr).reduce((s, h) => s + (h.xp ?? 0), 0)
    return Math.round(sum / 2)
  }, [history])

  return (
    <>
      {/* Popup détail des rangs */}
      {showRankInfo && (
        <>
          <div onClick={() => setShowRankInfo(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 310 }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            zIndex: 311, width: 'min(360px, 92vw)', maxHeight: '88vh', overflowY: 'auto',
            background: 'var(--surface)', border: '1.5px solid #8B5CF6', borderRadius: 20,
            padding: '22px 20px 18px',
          }}>
            <div style={{ fontSize: 17, fontWeight: 900, color: 'var(--text)', marginBottom: 4, textAlign: 'center' }}>
              Les rangs
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, textAlign: 'center', lineHeight: 1.4 }}>
              XP cumulés sur tous les modules
            </div>
            <div className="flex flex-col gap-1.5">
              {RANKS.map(r => {
                const isCurrent = r.id === currentRankId
                const reached = progress.xp >= r.xp
                return (
                  <div key={r.id} className="flex justify-between items-center rounded-xl px-3 py-2" style={{
                    background: isCurrent ? '#8B5CF618' : 'var(--surface-2)',
                    border: isCurrent ? '1.5px solid #8B5CF6' : '1px solid var(--border-c)',
                    opacity: reached ? 1 : 0.5,
                  }}>
                    <span className="text-sm font-black" style={{ color: isCurrent ? '#8B5CF6' : 'var(--text)' }}>
                      {rankLabel(r)}
                      {isCurrent && <span className="text-[10px] font-bold ml-2" style={{ color: '#8B5CF6' }}>· toi</span>}
                    </span>
                    <span className="text-xs font-bold text-app-muted">{r.xp.toLocaleString('fr-FR')} XP</span>
                  </div>
                )
              })}
            </div>
            <button onClick={() => setShowRankInfo(false)}
              className="w-full mt-4 py-2.5 rounded-2xl font-bold text-sm"
              style={{ border: '1px solid var(--border-c)', background: 'var(--surface-2)', color: 'var(--text)' }}>
              Fermer
            </button>
          </div>
        </>
      )}

      {/* Badges diagnostic */}
      <div className="flex flex-wrap gap-2 mb-5">
        {daysIdle > 0 && <DiagBadge color="#FF8B3D">⏸ Inactif {daysIdle}j</DiagBadge>}
        {decayDelta > 0 && <DiagBadge color="#f87171">📉 Decay −{decayDelta} XP</DiagBadge>}
        {speedXpPerWeek > 0 && <DiagBadge color="#4A6CF7">⚡ {speedXpPerWeek} XP/sem</DiagBadge>}
        {recentTrophies.length > 0 && (
          <DiagBadge color="#8B5CF6">
            🏅 {recentTrophies.map(id => TROPHIES.find(t => t.id === id)?.icon ?? '?').join(' ')}
          </DiagBadge>
        )}
        {daysIdle === 0 && decayDelta === 0 && speedXpPerWeek === 0 && recentTrophies.length === 0 && (
          <span className="text-xs text-app-muted">Aucun signal récent.</span>
        )}
      </div>

      {/* Rang + XP (cliquable → popup détail) */}
      <button
        type="button"
        onClick={() => setShowRankInfo(true)}
        className={cardCls + ' w-full text-left block cursor-pointer transition-colors hover:bg-surface-2'}
      >
        <div className="flex justify-between items-center mb-3">
          <div>
            <div className={labelCls + ' flex items-center gap-1.5'}>
              Rang
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
            </div>
            <div className="text-3xl font-black" style={{ color: '#8B5CF6' }}>{rankLabel(rank)}</div>
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
          <span>{nextLv ? `Prochain : ${rankLabel(nextLv)}` : 'Rang maximum'}</span>
        </div>
      </button>

      {/* Streak */}
      <div className={cardCls + ' flex gap-4'}>
        <div className="flex-1 text-center">
          <div className="text-3xl font-black mb-1" style={{ color: liveStreak > 0 ? '#FF8B3D' : 'var(--text-muted)' }}>
            {liveStreak}
          </div>
          <div className="text-xs text-app-muted">jours consécutifs</div>
        </div>
        <div className="w-px bg-[var(--border-c)]" />
        <div className="flex-1 text-center">
          <div className="text-3xl font-black text-app-muted mb-1">{progress.streak.longest}</div>
          <div className="text-xs text-app-muted">record</div>
        </div>
      </div>

      {/* Stats modules — déroulant horizontal : à cinq modules et plus, une ligne
          de cartes équiréparties devient illisible sur mobile. Chaque carte garde
          donc une largeur fixe et on fait défiler ; la barre de défilement globale
          (index.css) signale ce qui dépasse. */}
      <div className={cardCls}>
        <span className={labelCls}>Activité par module</span>
        <div className="flex gap-2.5 overflow-x-auto pb-2" style={{ scrollSnapType: 'x proximity' }}>
          {MODULE_IDS.map(id => {
            const { xpTotal, stat } = legacyModuleStat(id, progress.modules)
            return (
              <div key={id} className="bg-surface-2 rounded-xl p-2.5 shrink-0"
                style={{ width: 108, scrollSnapAlign: 'start' }}>
                <div className="text-xs font-bold mb-1" style={{ color: moduleColor(id) }}>{moduleLabel(id)}</div>
                <div className="text-base font-black text-app">{xpTotal}</div>
                <div className="text-[10px] text-app-muted">XP · {stat}</div>
              </div>
            )
          })}
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
          {TROPHIES.map((t, i) => {
            const unlocked = progress.trophies.includes(t.id)
            const col = i % 4
            // Ancrage du tooltip selon la colonne : bord gauche (col 0), bord droit
            // (col 3), centré sinon — évite le débordement hors écran.
            const tipPos = col === 0 ? 'left-0' : col === 3 ? 'right-0' : 'left-1/2 -translate-x-1/2'
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
                  <div className={`absolute bottom-[calc(100%+6px)] ${tipPos} w-max max-w-[150px] bg-surface border border-app rounded-lg px-2 py-1.5 text-[10px] text-app whitespace-normal z-10 pointer-events-none shadow-sm leading-snug`}>
                    {t.hint}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Historique — sessions consécutives d'un même module fusionnées. Le
          compteur affiche donc « N lignes sur M sessions » : sans ça, un
          historique qui rétrécit sans explication inquiète plus qu'il n'aide. */}
      <div className={cardCls}>
        <div className="flex justify-between items-center mb-3">
          <span className={labelCls} style={{ margin: 0 }}>Historique des sessions</span>
          <span className="text-xs text-app-muted">
            {grouped.length < history.length ? `${grouped.length} · ${history.length} sessions` : history.length}
          </span>
        </div>
        {grouped.length === 0 ? (
          <p className="text-sm text-app-muted text-center py-3">Aucune session enregistrée.</p>
        ) : grouped.map((g, i) => (
          <LigneHistorique key={`${g.date}-${g.module}-${i}`} groupe={g} dernier={i === grouped.length - 1} />
        ))}
      </div>
    </>
  )
}

// ─── Ligne d'historique ───────────────────────────────────────────────────────

// Nom de l'unité comptée, par module. Théorie pose des questions, les autres
// font faire des exercices — dire « 40 exercices » d'un Code de la route serait
// faux.
const UNITE: Record<string, [string, string]> = {
  theorie: ['question', 'questions'],
}
function uniteDe(module: string, n: number): string {
  const [sing, plur] = UNITE[module] ?? ['exercice', 'exercices']
  return n > 1 ? plur : sing
}

function LigneHistorique({ groupe, dernier }: { groupe: GroupedEntry; dernier: boolean }) {
  const { module, xp, count, items, levels, medal, date, single } = groupe
  const couleur = MODULE_COLORS[module] ?? '#4A6CF7'

  // Ce que la ligne raconte, du plus parlant au moins parlant. `items` prime sur
  // `count` : quinze exercices isolés font quinze sessions, mais c'est bien
  // « 15 exercices » qui a du sens. À défaut — historique ancien, sans compteur —
  // on annonce des sessions plutôt qu'un « 0 exercice » mensonger.
  const morceaux: string[] = []
  if (single?.mode) morceaux.push(single.mode)
  if (items !== null && items > 0) morceaux.push(`${items} ${uniteDe(module, items)}`)
  else if (count > 1) morceaux.push(`${count} sessions`)
  if (levels.length > 0) morceaux.push(levels.slice(0, 3).join(', ') + (levels.length > 3 ? '…' : ''))
  if (single?.category && single.category !== 'Toutes') morceaux.push(single.category)
  if (single?.score) morceaux.push(single.score)

  return (
    <div className="flex justify-between items-start gap-2 py-2"
      style={{ borderBottom: dernier ? 'none' : '1px solid var(--border-c)' }}>
      <div className="flex gap-2 items-start min-w-0">
        <span className="text-base leading-tight">{iconeMedaille(medal)}</span>
        <div className="min-w-0">
          <div className="text-xs text-app-muted flex items-center gap-1.5 flex-wrap">
            <span>{MODULE_ICONS[module] ?? ''} {MODULE_LABELS[module] ?? module}</span>
            {count > 1 && items !== null && (
              <span className="text-[10px] text-app-muted opacity-70">· {count} sessions</span>
            )}
            {single?.passed === true && (
              <span className="text-[10px] font-bold" style={{ color: '#22C55E' }}>✓ Reçu</span>
            )}
            {single?.passed === false && (
              <span className="text-[10px] font-bold" style={{ color: '#f87171' }}>✗ Échoué</span>
            )}
          </div>
          {morceaux.length > 0 && (
            <div className="text-[10px] text-app-muted leading-snug">{morceaux.join(' · ')}</div>
          )}
        </div>
      </div>
      <div className="flex gap-2.5 items-center shrink-0">
        <span className="text-xs font-bold" style={{ color: couleur }}>+{xp} XP</span>
        <span className="text-[10px] text-app-muted">{date}</span>
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
      <line x1={PAD_X} y1={PAD_Y} x2={W - PAD_X} y2={PAD_Y} stroke="var(--border-c)" strokeDasharray="2,3" />
      <line x1={PAD_X} y1={H - PAD_Y} x2={W - PAD_X} y2={H - PAD_Y} stroke="var(--border-c)" />
      <polyline points={polyline} fill="none" stroke="#8B5CF6" strokeWidth="2" />
      {points.map((p, i) => (
        <circle key={i} cx={xs[i]} cy={ys[i]} r="2.5" fill="#8B5CF6">
          <title>{p.date} · {p.cum} XP</title>
        </circle>
      ))}
      <text x="2" y={PAD_Y + 4} fontSize="9" fill="var(--text-muted)">{maxXp}</text>
      <text x="2" y={H - PAD_Y + 4} fontSize="9" fill="var(--text-muted)">0</text>
      <text x={PAD_X} y={H - 2} fontSize="9" fill="var(--text-muted)" textAnchor="start">{points[0].date.slice(5)}</text>
      <text x={W - PAD_X} y={H - 2} fontSize="9" fill="var(--text-muted)" textAnchor="end">{points[points.length-1].date.slice(5)}</text>
    </svg>
  )
}

// ─── Heatmap calendrier ───────────────────────────────────────────────────────

// Liseré doré d'une journée qui valide le streak. Choisi dans la palette
// existante (warning), pas un or pur : il doit se lire sur le violet des cases
// bien remplies comme sur le fond des cases vides.
const OR_STREAK = '#fbbf24'

function ActivityHeatmap({ history, today }: { history: HistoryEntry[]; today: string }) {
  const dailyXp = useMemo(() => {
    const m = new Map<string, number>()
    for (const h of history) m.set(h.date, (m.get(h.date) ?? 0) + (h.xp ?? 0))
    return m
  }, [history])

  // Ne concerne QUE les sessions écrites depuis l'ajout du champ : les journées
  // validées auparavant n'ont pas la donnée et resteront sans liseré. Rien ne
  // permet de la reconstituer — la règle des dix Rythme isolés dépend d'un
  // drapeau qui n'était pas enregistré.
  const joursStreak = useMemo(() => joursValidantStreak(history), [history])

  const WEEKS = 12
  const DAYS_PER_WEEK = 7
  const CELL = 13
  const GAP = 3

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
        {DAY_LABELS.map((d, i) => (
          <text key={i} x="2" y={i * (CELL + GAP) + CELL - 2} fontSize="8" fill="var(--text-muted)">{d}</text>
        ))}
        {cells.map((c, i) => {
          const valide = joursStreak.has(c.date)
          return (
            <rect key={i}
              x={20 + c.col * (CELL + GAP)}
              y={c.row * (CELL + GAP)}
              width={CELL} height={CELL} rx="2"
              fill={cellColor(c.xp)}
              stroke={valide ? OR_STREAK : 'none'}
              strokeWidth={valide ? 1.5 : 0}>
              <title>
                {c.date}
                {c.xp > 0 ? ` · ${c.xp} XP` : c.xp === 0 ? ' · aucune activité' : ''}
                {valide ? ' · journée validée' : ''}
              </title>
            </rect>
          )
        })}
      </svg>
      <div className="flex items-center gap-1.5 mt-2 text-[10px] text-app-muted flex-wrap">
        <span>Moins</span>
        {[0, 50, 250, 1000, 3000].map(v => (
          <span key={v} style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: cellColor(v) }} />
        ))}
        <span>Plus</span>
        <span className="ml-2 flex items-center gap-1">
          <span style={{
            display: 'inline-block', width: 10, height: 10, borderRadius: 2,
            background: 'var(--surface-2)', border: `1.5px solid ${OR_STREAK}`,
          }} />
          Journée validée
        </span>
      </div>
    </div>
  )
}
