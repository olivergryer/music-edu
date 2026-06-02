// Logique pure de progression (XP, streak, trophées, compteurs par module).
// Sans React, sans Firebase — testable directement depuis Node.

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Streak {
  current: number
  longest: number
  lastDate: string | null
}

export interface DailyCounter {
  date: string | null
  count: number
}

export interface ProgressState {
  xp: number
  streak: Streak
  trophies: string[]
  modules: {
    rythme:    { seriesPlayed: number; exercisesPlayed: number; xpTotal: number }
    theorie:   { sessionsPlayed: number; xpTotal: number }
    accordeur: { sessionsPlayed: number; xpTotal: number }
  }
  dailyRythmeIndiv: DailyCounter
}

export interface AddSessionParams {
  module: 'rythme' | 'theorie' | 'accordeur'
  xpEarned: number
  medal: string
  meta?: { perfectSeries?: boolean; individual?: boolean }
}

export interface HistoryEntry {
  date: string
  module: AddSessionParams['module']
  xp: number
  medal: string
}

export interface ApplySessionResult {
  newState: ProgressState
  newTrophies: string[]
  rankedUp: boolean
  historyEntry: HistoryEntry
}

// ─── Rangs XP (cross-module) ──────────────────────────────────────────────────

export const RANKS = [
  { id: 'Apprenti',      xp: 0 },
  { id: 'Musicien',      xp: 2500 },
  { id: 'Instrumentiste',xp: 6000 },
  { id: 'Soliste',       xp: 12500 },
  { id: 'Concertiste',   xp: 45000 },
  { id: 'Virtuose',      xp: 80000 },
  { id: 'Maestro',       xp: 140000 },
]

export function getRank(xp: number) {
  return [...RANKS].reverse().find(l => xp >= l.xp) ?? RANKS[0]
}

export function getNextRank(xp: number) {
  return RANKS.find(l => l.xp > xp) ?? null
}

// ─── Trophées ─────────────────────────────────────────────────────────────────

export const TROPHIES = [
  {
    id: 'first_note',
    icon: '♩', label: 'Première note',
    hint: 'Jouer ton premier exercice ou ta première session',
    check: (s: ProgressState) =>
      s.modules.rythme.seriesPlayed >= 1 ||
      s.modules.rythme.exercisesPlayed >= 1 ||
      s.modules.theorie.sessionsPlayed >= 1 ||
      s.modules.accordeur.sessionsPlayed >= 1,
  },
  {
    id: 'first_series',
    icon: '🎵', label: 'Première série',
    hint: 'Terminer une série complète de 10 exercices de rythme',
    check: (s: ProgressState) => s.modules.rythme.seriesPlayed >= 1,
  },
  {
    id: 'portee',
    icon: '♫', label: 'Sur la portée',
    hint: 'Pratiquer 7 jours de suite sur Tessitura',
    check: (s: ProgressState) => s.streak.current >= 7,
  },
  {
    id: 'mesure',
    icon: '♬', label: 'Barre de mesure',
    hint: 'Pratiquer 30 jours de suite sur Tessitura',
    check: (s: ProgressState) => s.streak.current >= 30,
  },
  {
    id: 'clef_sol',
    icon: '🎼', label: 'Clé de Sol',
    hint: '10 séries de rythme ou 10 sessions de théorie',
    check: (s: ProgressState) => s.modules.rythme.seriesPlayed >= 10 || s.modules.theorie.sessionsPlayed >= 10,
  },
  {
    id: 'do_majeur',
    icon: '🎹', label: 'Do majeur',
    hint: 'Atteindre le rang Soliste',
    check: (s: ProgressState) => RANKS.findIndex(l => l.id === getRank(s.xp).id) >= 3,
  },
  {
    id: 'diapason',
    icon: '🎺', label: 'Diapason',
    hint: 'Atteindre le rang Maestro',
    check: (s: ProgressState) => RANKS.findIndex(l => l.id === getRank(s.xp).id) >= 6,
  },
  {
    id: 'concert',
    icon: '🎻', label: 'Concert',
    hint: 'Atteindre le rang Maestro',
    check: (s: ProgressState) => getRank(s.xp).id === 'Maestro',
  },
  {
    id: 'perfect_series',
    icon: '⭐', label: 'Série parfaite',
    hint: 'Réussir une série de 10 exercices sans faute',
    check: (_s: ProgressState, meta?: AddSessionParams['meta']) => meta?.perfectSeries === true,
  },
  {
    id: 'virtuose',
    icon: '🏆', label: 'Virtuose',
    hint: '50 séries de rythme terminées',
    check: (s: ProgressState) => s.modules.rythme.seriesPlayed >= 50,
  },
  {
    id: 'theoricien',
    icon: '📖', label: 'Théoricien',
    hint: '20 sessions de théorie terminées',
    check: (s: ProgressState) => s.modules.theorie.sessionsPlayed >= 20,
  },
  {
    id: 'duo',
    icon: '🎶', label: 'Duo',
    hint: 'Jouer au moins une série de rythme et une session de théorie',
    check: (s: ProgressState) => s.modules.rythme.seriesPlayed >= 1 && s.modules.theorie.sessionsPlayed >= 1,
  },
]

// ─── État par défaut + fusion ─────────────────────────────────────────────────

export const DEFAULT_STATE: ProgressState = {
  xp: 0,
  streak: { current: 0, longest: 0, lastDate: null },
  trophies: [],
  modules: {
    rythme:    { seriesPlayed: 0, exercisesPlayed: 0, xpTotal: 0 },
    theorie:   { sessionsPlayed: 0, xpTotal: 0 },
    accordeur: { sessionsPlayed: 0, xpTotal: 0 },
  },
  dailyRythmeIndiv: { date: null, count: 0 },
}

export function mergeWithDefaults(data: Record<string, unknown>): ProgressState {
  const d = data as Partial<ProgressState> & { modules?: Record<string, unknown> }
  return {
    ...DEFAULT_STATE,
    ...d,
    streak: { ...DEFAULT_STATE.streak, ...(d.streak ?? {}) },
    dailyRythmeIndiv: { ...DEFAULT_STATE.dailyRythmeIndiv, ...(d.dailyRythmeIndiv ?? {}) },
    modules: {
      rythme:    { ...DEFAULT_STATE.modules.rythme,    ...(d.modules?.['rythme']    ?? {}) },
      theorie:   { ...DEFAULT_STATE.modules.theorie,   ...(d.modules?.['theorie']   ?? {}) },
      accordeur: { ...DEFAULT_STATE.modules.accordeur, ...(d.modules?.['accordeur'] ?? {}) },
    },
  }
}

// ─── Dates ────────────────────────────────────────────────────────────────────

export function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayStr() {
  return localDateStr()
}

function previousDayStr(today: string): string {
  const [y, m, d] = today.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() - 1)
  return localDateStr(dt)
}

export function updateStreak(streak: Streak, today: string): Streak {
  if (streak.lastDate === today) return streak
  const yesterday = previousDayStr(today)
  const next = streak.lastDate === yesterday ? streak.current + 1 : 1
  const longest = Math.max(streak.longest, next)
  return { current: next, longest, lastDate: today }
}

// ─── Trophées débloqués pour cette session ────────────────────────────────────

export function checkNewTrophies(state: ProgressState, meta: AddSessionParams['meta'], alreadyUnlocked: string[]): string[] {
  return TROPHIES
    .filter(t => !alreadyUnlocked.includes(t.id) && t.check(state, meta))
    .map(t => t.id)
}

// ─── applySession — cœur métier (pure) ────────────────────────────────────────

export function applySession(
  prev: ProgressState,
  params: AddSessionParams,
  today: string,
): ApplySessionResult {
  const { module, xpEarned, medal, meta = {} } = params
  const rankBefore = getRank(prev.xp).id
  const newXp = prev.xp + xpEarned
  const rankAfter = getRank(newXp).id

  const isRythmeIndiv = module === 'rythme' && meta.individual === true

  let newDailyRythmeIndiv = prev.dailyRythmeIndiv
  let countsForStreak = !isRythmeIndiv
  if (isRythmeIndiv) {
    const sameDay = prev.dailyRythmeIndiv.date === today
    const count = sameDay ? prev.dailyRythmeIndiv.count + 1 : 1
    newDailyRythmeIndiv = { date: today, count }
    countsForStreak = sameDay && prev.dailyRythmeIndiv.count < 10 && count >= 10
  }

  const newStreak = countsForStreak ? updateStreak(prev.streak, today) : prev.streak

  let moduleUpdate: ProgressState['modules']
  if (module === 'rythme') {
    moduleUpdate = {
      ...prev.modules,
      rythme: {
        seriesPlayed:    prev.modules.rythme.seriesPlayed    + (isRythmeIndiv ? 0 : 1),
        exercisesPlayed: prev.modules.rythme.exercisesPlayed + (isRythmeIndiv ? 1 : 0),
        xpTotal:         prev.modules.rythme.xpTotal         + xpEarned,
      },
    }
  } else if (module === 'theorie') {
    moduleUpdate = {
      ...prev.modules,
      theorie: { sessionsPlayed: prev.modules.theorie.sessionsPlayed + 1, xpTotal: prev.modules.theorie.xpTotal + xpEarned },
    }
  } else {
    moduleUpdate = {
      ...prev.modules,
      accordeur: { sessionsPlayed: prev.modules.accordeur.sessionsPlayed + 1, xpTotal: prev.modules.accordeur.xpTotal + xpEarned },
    }
  }

  const newStateBeforeTrophies: ProgressState = {
    ...prev,
    xp: newXp,
    streak: newStreak,
    modules: moduleUpdate,
    dailyRythmeIndiv: newDailyRythmeIndiv,
  }

  const newTrophyIds = checkNewTrophies(newStateBeforeTrophies, meta, prev.trophies)
  const newState: ProgressState = {
    ...newStateBeforeTrophies,
    trophies: [...prev.trophies, ...newTrophyIds],
  }

  const historyEntry: HistoryEntry = {
    date: today,
    module,
    xp: xpEarned,
    medal,
  }

  return {
    newState,
    newTrophies: newTrophyIds,
    rankedUp: rankAfter !== rankBefore,
    historyEntry,
  }
}
