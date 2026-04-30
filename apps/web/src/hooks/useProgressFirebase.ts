import { useState, useEffect, useCallback, useRef } from 'react'
import { doc, getDoc, setDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../auth/AuthProvider'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Streak {
  current: number
  longest: number
  lastDate: string | null
}

interface ProgressState {
  xp: number
  streak: Streak
  trophies: string[]
  modules: {
    rythme:    { seriesPlayed: number; xpTotal: number }
    theorie:   { sessionsPlayed: number; xpTotal: number }
    accordeur: { sessionsPlayed: number; xpTotal: number }
  }
}

interface AddSessionParams {
  module: 'rythme' | 'theorie' | 'accordeur'
  xpEarned: number
  medal: string
  meta?: { perfectSeries?: boolean }
}

interface AddSessionResult {
  newTrophies: string[]
  leveledUp: boolean
}

// ─── Niveaux XP ───────────────────────────────────────────────────────────────

export const XP_LEVELS = [
  { id: 'C1/1', xp: 0 },
  { id: 'C1/2', xp: 500 },
  { id: 'C1/3', xp: 1200 },
  { id: 'C1/4', xp: 2500 },
  { id: 'C2/1', xp: 4500 },
  { id: 'C2/2', xp: 7500 },
  { id: 'C2/3', xp: 11500 },
  { id: 'C2/4', xp: 17000 },
  { id: 'C3',   xp: 25000 },
]

export function getLevel(xp: number) {
  return [...XP_LEVELS].reverse().find(l => xp >= l.xp) ?? XP_LEVELS[0]
}

export function getNextLevel(xp: number) {
  return XP_LEVELS.find(l => l.xp > xp) ?? null
}

// ─── Trophées ─────────────────────────────────────────────────────────────────

export const TROPHIES = [
  {
    id: 'first_note',
    icon: '♩', label: 'Première note',
    check: (s: ProgressState) => s.modules.rythme.seriesPlayed >= 1 || s.modules.theorie.sessionsPlayed >= 1,
  },
  {
    id: 'first_series',
    icon: '🎵', label: 'Première série',
    check: (s: ProgressState) => s.modules.rythme.seriesPlayed >= 1,
  },
  {
    id: 'portee',
    icon: '♫', label: 'Sur la portée',
    check: (s: ProgressState) => s.streak.current >= 7,
  },
  {
    id: 'mesure',
    icon: '♬', label: 'Barre de mesure',
    check: (s: ProgressState) => s.streak.current >= 30,
  },
  {
    id: 'clef_sol',
    icon: '🎼', label: 'Clé de Sol',
    check: (s: ProgressState) => s.modules.rythme.seriesPlayed >= 10 || s.modules.theorie.sessionsPlayed >= 10,
  },
  {
    id: 'do_majeur',
    icon: '🎹', label: 'Do majeur',
    check: (s: ProgressState) => XP_LEVELS.findIndex(l => l.id === getLevel(s.xp).id) >= 3,
  },
  {
    id: 'diapason',
    icon: '🎺', label: 'Diapason',
    check: (s: ProgressState) => XP_LEVELS.findIndex(l => l.id === getLevel(s.xp).id) >= 6,
  },
  {
    id: 'concert',
    icon: '🎻', label: 'Concert',
    check: (s: ProgressState) => getLevel(s.xp).id === 'C3',
  },
  {
    id: 'perfect_series',
    icon: '⭐', label: 'Série parfaite',
    check: (_s: ProgressState, meta?: AddSessionParams['meta']) => meta?.perfectSeries === true,
  },
  {
    id: 'virtuose',
    icon: '🏆', label: 'Virtuose',
    check: (s: ProgressState) => s.modules.rythme.seriesPlayed >= 50,
  },
  {
    id: 'theoricien',
    icon: '📖', label: 'Théoricien',
    check: (s: ProgressState) => s.modules.theorie.sessionsPlayed >= 20,
  },
  {
    id: 'duo',
    icon: '🎶', label: 'Duo',
    check: (s: ProgressState) => s.modules.rythme.seriesPlayed >= 1 && s.modules.theorie.sessionsPlayed >= 1,
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DEFAULT_STATE: ProgressState = {
  xp: 0,
  streak: { current: 0, longest: 0, lastDate: null },
  trophies: [],
  modules: {
    rythme:    { seriesPlayed: 0, xpTotal: 0 },
    theorie:   { sessionsPlayed: 0, xpTotal: 0 },
    accordeur: { sessionsPlayed: 0, xpTotal: 0 },
  },
}

function mergeWithDefaults(data: Record<string, unknown>): ProgressState {
  const d = data as Partial<ProgressState> & { modules?: Record<string, unknown> }
  return {
    ...DEFAULT_STATE,
    ...d,
    streak: { ...DEFAULT_STATE.streak, ...(d.streak ?? {}) },
    modules: {
      rythme:    { ...DEFAULT_STATE.modules.rythme,    ...(d.modules?.['rythme']    ?? {}) },
      theorie:   { ...DEFAULT_STATE.modules.theorie,   ...(d.modules?.['theorie']   ?? {}) },
      accordeur: { ...DEFAULT_STATE.modules.accordeur, ...(d.modules?.['accordeur'] ?? {}) },
    },
  }
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function updateStreak(streak: Streak): Streak {
  const today = todayStr()
  if (streak.lastDate === today) return streak
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const next = streak.lastDate === yesterday ? streak.current + 1 : 1
  const longest = Math.max(streak.longest, next)
  return { current: next, longest, lastDate: today }
}

function checkNewTrophies(state: ProgressState, meta: AddSessionParams['meta'], alreadyUnlocked: string[]) {
  return TROPHIES
    .filter(t => !alreadyUnlocked.includes(t.id) && t.check(state, meta))
    .map(t => t.id)
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export default function useProgressFirebase() {
  const { user } = useAuth()
  const [data, setData] = useState<ProgressState>(DEFAULT_STATE)
  const [loaded, setLoaded] = useState(false)
  const dataRef = useRef(data)

  useEffect(() => { dataRef.current = data }, [data])

  useEffect(() => {
    if (!user) {
      setData(DEFAULT_STATE)
      setLoaded(false)
      return
    }
    getDoc(doc(db, 'users', user.uid, 'progress', 'data')).then(snap => {
      setData(snap.exists() ? mergeWithDefaults(snap.data()) : DEFAULT_STATE)
      setLoaded(true)
    })
  }, [user])

  const addSession = useCallback(async ({ module, xpEarned, medal, meta = {} }: AddSessionParams): Promise<AddSessionResult> => {
    if (!user || !loaded) return { newTrophies: [], leveledUp: false }

    const prev = dataRef.current
    const levelBefore = getLevel(prev.xp).id
    const newStreak   = updateStreak(prev.streak)
    const newXp       = prev.xp + xpEarned
    const levelAfter  = getLevel(newXp).id

    let moduleUpdate: ProgressState['modules']
    if (module === 'rythme') {
      moduleUpdate = {
        ...prev.modules,
        rythme: { seriesPlayed: prev.modules.rythme.seriesPlayed + 1, xpTotal: prev.modules.rythme.xpTotal + xpEarned },
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

    const updated: ProgressState = {
      ...prev,
      xp: newXp,
      streak: newStreak,
      modules: moduleUpdate,
    }

    const newTrophyIds = checkNewTrophies(updated, meta, prev.trophies)
    updated.trophies = [...prev.trophies, ...newTrophyIds]

    setData(updated)

    await setDoc(doc(db, 'users', user.uid, 'progress', 'data'), updated)
    await addDoc(collection(db, 'users', user.uid, 'history'), {
      date: todayStr(),
      module,
      xp: xpEarned,
      medal,
      createdAt: serverTimestamp(),
    })

    return { newTrophies: newTrophyIds, leveledUp: levelAfter !== levelBefore }
  }, [user, loaded])

  return {
    xp: data.xp,
    level: getLevel(data.xp),
    nextLevel: getNextLevel(data.xp),
    streak: data.streak,
    trophies: data.trophies,
    modules: data.modules,
    loaded,
    addSession,
  }
}
