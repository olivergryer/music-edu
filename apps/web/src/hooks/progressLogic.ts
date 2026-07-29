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
    notes:     { sessionsPlayed: number; xpTotal: number }
  }
  dailyRythmeIndiv: DailyCounter
  highestRankIdx: number  // plus haut rang jamais atteint (index dans RANKS)
}

export interface AddSessionParams {
  module: 'rythme' | 'theorie' | 'accordeur' | 'notes'
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

// `id` = clé technique STABLE (trophées, highestRankIdx stocké) — ne jamais renommer.
// `label` = affichage (écriture inclusive sur les rangs genrés uniquement).
export const RANKS = [
  { id: 'Apprenti',       xp: 0,      label: 'Apprenti.e' },
  { id: 'Instrumentiste', xp: 2500 },
  { id: 'Musicien',       xp: 6000,   label: 'Musicien.ne' },
  { id: 'Soliste',        xp: 12500 },
  { id: 'Concertiste',    xp: 45000 },
  { id: 'Virtuose',       xp: 80000 },
  { id: 'Maestro',        xp: 140000, label: 'Maestro.a' },
]

// Libellé d'affichage d'un rang (inclusif si défini, sinon épicène = id).
export function rankLabel(rank: { id: string; label?: string }): string {
  return rank.label ?? rank.id
}

export function getRank(xp: number) {
  return [...RANKS].reverse().find(l => xp >= l.xp) ?? RANKS[0]
}

export function getNextRank(xp: number) {
  return RANKS.find(l => l.xp > xp) ?? null
}

export function getRankIdx(xp: number): number {
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (xp >= RANKS[i].xp) return i
  }
  return 0
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
    notes:     { sessionsPlayed: 0, xpTotal: 0 },
  },
  dailyRythmeIndiv: { date: null, count: 0 },
  highestRankIdx: 0,
}

export function mergeWithDefaults(data: Record<string, unknown>): ProgressState {
  const d = data as Partial<ProgressState> & { modules?: Record<string, unknown> }
  return {
    ...DEFAULT_STATE,
    ...d,
    streak: { ...DEFAULT_STATE.streak, ...(d.streak ?? {}) },
    dailyRythmeIndiv: { ...DEFAULT_STATE.dailyRythmeIndiv, ...(d.dailyRythmeIndiv ?? {}) },
    highestRankIdx: d.highestRankIdx ?? DEFAULT_STATE.highestRankIdx,
    modules: {
      rythme:    { ...DEFAULT_STATE.modules.rythme,    ...(d.modules?.['rythme']    ?? {}) },
      theorie:   { ...DEFAULT_STATE.modules.theorie,   ...(d.modules?.['theorie']   ?? {}) },
      accordeur: { ...DEFAULT_STATE.modules.accordeur, ...(d.modules?.['accordeur'] ?? {}) },
      notes:     { ...DEFAULT_STATE.modules.notes,     ...(d.modules?.['notes']     ?? {}) },
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

// Série « vivante » pour l'affichage : `current` n'est remis à 1 qu'au PROCHAIN jeu.
// Tant que l'utilisateur n'a pas rejoué, `current` reste périmé. Cette fonction
// renvoie 0 dès qu'un jour a été sauté (lastDate ni aujourd'hui ni hier).
export function displayStreak(streak: Streak, today: string): number {
  if (!streak.lastDate) return 0
  if (streak.lastDate === today) return streak.current
  if (streak.lastDate === previousDayStr(today)) return streak.current
  return 0
}

function dateDiff(d1: string, d2: string): number {
  const [y1, m1, dd1] = d1.split('-').map(Number)
  const [y2, m2, dd2] = d2.split('-').map(Number)
  const t1 = new Date(y1, m1 - 1, dd1).getTime()
  const t2 = new Date(y2, m2 - 1, dd2).getTime()
  return Math.round((t2 - t1) / 86_400_000)
}

// Nombre de jours d'inactivité réelle : 0 si lastDate=null, ou si lastDate=today/yesterday.
export function computeDaysIdle(lastDate: string | null, today: string): number {
  if (!lastDate) return 0
  const gap = dateDiff(lastDate, today)
  return Math.max(0, gap - 1)
}

// ─── Décroissance XP ──────────────────────────────────────────────────────────
//
// Règle :
//   - Jours 1-7 d'inactivité    : -2%/jour (composé)
//   - Jours 8-14                : -5%/jour (composé)
//   - Jour 15 et plus           : -10%/jour (composé)
//   - Au 7ᵉ jour d'inactivité, si le rang n'a pas baissé naturellement → chute forcée d'1 rang
//     (XP ramené à RANKS[initialRankIdx].xp - 1, juste sous le seuil du rang initial).

export function applyDecay(xp: number, daysIdle: number): number {
  if (daysIdle <= 0) return xp
  const initialRankIdx = getRankIdx(xp)

  let factor = 1
  if (daysIdle >= 1)  factor *= Math.pow(0.98, Math.min(daysIdle, 7))
  if (daysIdle >= 8)  factor *= Math.pow(0.95, Math.min(daysIdle - 7, 7))
  if (daysIdle >= 15) factor *= Math.pow(0.9,  daysIdle - 14)

  let decayedXp = Math.round(xp * factor)

  // Plancher rang : au-delà de 7 jours d'inactivité, force la chute d'1 rang si pas déjà tombé.
  if (daysIdle >= 7 && initialRankIdx > 0) {
    const newRankIdx = getRankIdx(decayedXp)
    if (newRankIdx >= initialRankIdx) {
      decayedXp = Math.max(0, RANKS[initialRankIdx].xp - 1)
    }
  }

  return Math.max(0, decayedXp)
}

// ─── Boost de récupération ────────────────────────────────────────────────────
//
// Tant que le XP courant est sous le seuil du rang (peak - 1), chaque XP gagné compte double.
// Sans effet si peak ≤ 1 (Apprenti ou Instrumentiste) car le rang n-1 cible est Apprenti (seuil 0).

export function xpMultiplier(state: ProgressState): number {
  const peakIdx = state.highestRankIdx
  if (peakIdx <= 1) return 1
  const targetThreshold = RANKS[peakIdx - 1].xp
  return state.xp < targetThreshold ? 2 : 1
}

// ─── Decay-only (pour affichage dashboard, sans persister) ────────────────────

export function applyDecayOnly(prev: ProgressState, today: string): ProgressState {
  const daysIdle = computeDaysIdle(prev.streak.lastDate, today)
  if (daysIdle <= 0) return prev
  const decayedXp = applyDecay(prev.xp, daysIdle)
  if (decayedXp === prev.xp) return prev
  return { ...prev, xp: decayedXp }
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

  // 1. Decay sur l'XP existant (en fonction de l'inactivité depuis lastDate).
  const daysIdle = computeDaysIdle(prev.streak.lastDate, today)
  const decayedXp = applyDecay(prev.xp, daysIdle)
  const stateAfterDecay: ProgressState = { ...prev, xp: decayedXp }

  // 2. Multiplicateur de récupération (2× si en-dessous de peak-1).
  const multiplier = xpMultiplier(stateAfterDecay)
  const xpGained = xpEarned * multiplier

  const rankBefore = getRank(decayedXp).id
  const newXp = decayedXp + xpGained
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

  // Les compteurs xpTotal par module reflètent l'XP réellement créditée (boost inclus).
  let moduleUpdate: ProgressState['modules']
  if (module === 'rythme') {
    moduleUpdate = {
      ...prev.modules,
      rythme: {
        seriesPlayed:    prev.modules.rythme.seriesPlayed    + (isRythmeIndiv ? 0 : 1),
        exercisesPlayed: prev.modules.rythme.exercisesPlayed + (isRythmeIndiv ? 1 : 0),
        xpTotal:         prev.modules.rythme.xpTotal         + xpGained,
      },
    }
  } else if (module === 'theorie') {
    moduleUpdate = {
      ...prev.modules,
      theorie: { sessionsPlayed: prev.modules.theorie.sessionsPlayed + 1, xpTotal: prev.modules.theorie.xpTotal + xpGained },
    }
  } else if (module === 'notes') {
    moduleUpdate = {
      ...prev.modules,
      notes: { sessionsPlayed: prev.modules.notes.sessionsPlayed + 1, xpTotal: prev.modules.notes.xpTotal + xpGained },
    }
  } else {
    moduleUpdate = {
      ...prev.modules,
      accordeur: { sessionsPlayed: prev.modules.accordeur.sessionsPlayed + 1, xpTotal: prev.modules.accordeur.xpTotal + xpGained },
    }
  }

  // highestRankIdx : on garde le max entre l'ancien et le rang atteint après cette session.
  const newRankIdx = getRankIdx(newXp)
  const newHighestRankIdx = Math.max(prev.highestRankIdx, newRankIdx)

  const newStateBeforeTrophies: ProgressState = {
    ...prev,
    xp: newXp,
    streak: newStreak,
    modules: moduleUpdate,
    dailyRythmeIndiv: newDailyRythmeIndiv,
    highestRankIdx: newHighestRankIdx,
  }

  const newTrophyIds = checkNewTrophies(newStateBeforeTrophies, meta, prev.trophies)
  const newState: ProgressState = {
    ...newStateBeforeTrophies,
    trophies: [...prev.trophies, ...newTrophyIds],
  }

  const historyEntry: HistoryEntry = {
    date: today,
    module,
    xp: xpGained,
    medal,
  }

  return {
    newState,
    newTrophies: newTrophyIds,
    rankedUp: rankAfter !== rankBefore,
    historyEntry,
  }
}
