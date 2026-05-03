import { useState, useCallback } from "react";

const STORAGE_KEY = "tess_progress";

export const XP_LEVELS = [
  { id: "Apprenti",      xp: 0 },
  { id: "Musicien",      xp: 500 },
  { id: "Instrumentiste",xp: 1200 },
  { id: "Soliste",       xp: 2500 },
  { id: "Concertiste",   xp: 4500 },
  { id: "Virtuose",      xp: 8000 },
  { id: "Maestro",       xp: 14000 },
];

export function getLevel(xp) {
  return [...XP_LEVELS].reverse().find(l => xp >= l.xp) ?? XP_LEVELS[0];
}

export function getNextLevel(xp) {
  return XP_LEVELS.find(l => l.xp > xp) ?? null;
}

export const TROPHIES = [
  {
    id: "first_note",
    icon: "♩", label: "Première note",
    check: s => s.modules.rythme.seriesPlayed >= 1 || s.modules.theorie.sessionsPlayed >= 1,
  },
  {
    id: "first_series",
    icon: "🎵", label: "Première série",
    check: s => s.modules.rythme.seriesPlayed >= 1,
  },
  {
    id: "portee",
    icon: "♫", label: "Sur la portée",
    check: s => s.streak.current >= 7,
  },
  {
    id: "mesure",
    icon: "♬", label: "Barre de mesure",
    check: s => s.streak.current >= 30,
  },
  {
    id: "clef_sol",
    icon: "🎼", label: "Clé de Sol",
    check: s => s.modules.rythme.seriesPlayed >= 10 || s.modules.theorie.sessionsPlayed >= 10,
  },
  {
    id: "do_majeur",
    icon: "🎹", label: "Do majeur",
    check: s => XP_LEVELS.findIndex(l => l.id === getLevel(s.xp).id) >= 3,
  },
  {
    id: "diapason",
    icon: "🎺", label: "Diapason",
    check: s => XP_LEVELS.findIndex(l => l.id === getLevel(s.xp).id) >= 6,
  },
  {
    id: "concert",
    icon: "🎻", label: "Concert",
    check: s => getLevel(s.xp).id === "Maestro",
  },
  {
    id: "perfect_series",
    icon: "⭐", label: "Série parfaite",
    check: (_s, meta) => meta?.perfectSeries === true,
  },
  {
    id: "virtuose",
    icon: "🏆", label: "Virtuose",
    check: s => s.modules.rythme.seriesPlayed >= 50,
  },
  {
    id: "theoricien",
    icon: "📖", label: "Théoricien",
    check: s => s.modules.theorie.sessionsPlayed >= 20,
  },
  {
    id: "duo",
    icon: "🎶", label: "Duo",
    check: s => s.modules.rythme.seriesPlayed >= 1 && s.modules.theorie.sessionsPlayed >= 1,
  },
];

const DEFAULT_STATE = {
  xp: 0,
  streak: { current: 0, longest: 0, lastDate: null },
  trophies: [],
  modules: {
    rythme:  { seriesPlayed: 0, xpTotal: 0 },
    theorie: { sessionsPlayed: 0, xpTotal: 0 },
  },
  history: [],
};

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    // Merge pour garantir toutes les clés (upgrade safe)
    return {
      ...DEFAULT_STATE,
      ...parsed,
      streak: { ...DEFAULT_STATE.streak, ...parsed.streak },
      modules: {
        rythme:  { ...DEFAULT_STATE.modules.rythme,  ...parsed.modules?.rythme },
        theorie: { ...DEFAULT_STATE.modules.theorie, ...parsed.modules?.theorie },
      },
    };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

function save(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

function todayStr() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function updateStreak(streak) {
  const today = todayStr();
  if (streak.lastDate === today) return streak;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const next = streak.lastDate === yesterday ? streak.current + 1 : 1;
  const longest = Math.max(streak.longest, next);
  return { current: next, longest, lastDate: today };
}

function checkNewTrophies(state, meta, alreadyUnlocked) {
  return TROPHIES
    .filter(t => !alreadyUnlocked.includes(t.id) && t.check(state, meta))
    .map(t => t.id);
}

export default function useProgress() {
  const [data, setData] = useState(load);

  const addSession = useCallback(({ module, xpEarned, medal, meta = {} }) => {
    // Calcul synchrone sur la valeur courante (pas de closure stale possible
    // car on relit localStorage pour être safe en double-appel StrictMode)
    const prev = load();

    const levelBefore = getLevel(prev.xp).id;
    const newStreak   = updateStreak(prev.streak);
    const newXp       = prev.xp + xpEarned;
    const levelAfter  = getLevel(newXp).id;

    const moduleKey    = module === "rythme" ? "rythme" : "theorie";
    const moduleUpdate = moduleKey === "rythme"
      ? { seriesPlayed: prev.modules.rythme.seriesPlayed + 1, xpTotal: prev.modules.rythme.xpTotal + xpEarned }
      : { sessionsPlayed: prev.modules.theorie.sessionsPlayed + 1, xpTotal: prev.modules.theorie.xpTotal + xpEarned };

    const newEntry  = { date: todayStr(), module, xp: xpEarned, medal };
    const newHistory = [newEntry, ...prev.history].slice(0, 60);

    const updated = {
      ...prev,
      xp: newXp,
      streak: newStreak,
      modules: { ...prev.modules, [moduleKey]: moduleUpdate },
      history: newHistory,
    };

    const newTrophyIds = checkNewTrophies(updated, meta, prev.trophies);
    updated.trophies   = [...prev.trophies, ...newTrophyIds];

    save(updated);
    setData(updated);

    return { newTrophies: newTrophyIds, leveledUp: levelAfter !== levelBefore };
  }, []);

  const level     = getLevel(data.xp);
  const nextLevel = getNextLevel(data.xp);

  return {
    xp: data.xp,
    level,
    nextLevel,
    streak: data.streak,
    trophies: data.trophies,
    modules: data.modules,
    history: data.history,
    addSession,
  };
}
