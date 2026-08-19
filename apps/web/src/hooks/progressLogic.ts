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
    harmonie:  { sessionsPlayed: number; xpTotal: number }
  }
  dailyRythmeIndiv: DailyCounter
  dailyTheorieSerie: DailyCounter
  highestRankIdx: number  // plus haut rang jamais atteint (index dans RANKS)
}

export interface AddSessionParams {
  module: 'rythme' | 'theorie' | 'accordeur' | 'notes' | 'harmonie'
  xpEarned: number
  medal: string
  meta?: {
    perfectSeries?: boolean
    individual?: boolean
    serieTheorie?: boolean
    /** Théorie : niveau reçu au Code de la route musicale — débloque son trophée. */
    codeReussi?: string
  }
  /** Détails affichés dans l'historique du tableau de bord. Tous facultatifs. */
  details?: SessionDetails
}

/**
 * Ce qu'une session raconte, au-delà de son XP.
 *
 * Tous les champs sont FACULTATIFS, et pour deux raisons distinctes : chaque
 * module n'en renseigne qu'une partie, et surtout les sessions enregistrées
 * AVANT l'ajout de ce bloc n'en ont aucun. L'affichage doit donc rester correct
 * quand tout est absent — c'est le cas de tout l'historique existant.
 */
export interface SessionDetails {
  /** Niveau de cycle travaillé (C1/1 … C3). */
  level?: string
  /** Nombre d'items joués : exercices, questions… */
  items?: number
  /** Théorie : « Toutes » ou la sélection de catégories. */
  category?: string
  /** Théorie, Code de la route : score brut, ex. « 37/40 ». */
  score?: string
  /** Théorie, Code de la route : reçu ou non. */
  passed?: boolean
  /** Mode de jeu, quand le module en distingue plusieurs. */
  mode?: string
}

export interface HistoryEntry extends SessionDetails {
  date: string
  module: AddSessionParams['module']
  xp: number
  medal: string
  /** Exercice isolé (par opposition à une série) — utile au regroupement. */
  individual?: boolean
  /** Cette session a validé la journée pour le streak (liseré doré du calendrier). */
  streakValidated?: boolean
}

export interface ApplySessionResult {
  newState: ProgressState
  newTrophies: string[]
  rankedUp: boolean
  /** Cette session vient de valider la journée pour le streak. */
  streakValidated: boolean
  /** Nouveau rang atteint, uniquement si `rankedUp`. */
  newRankId: string | null
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

/**
 * Niveaux de cycle du module Théorie — source de vérité, importée par
 * `TheoriePage`. Elle vit ici parce que les trophées du Code de la route en
 * dérivent : garder deux listes séparées ferait diverger les identifiants de
 * trophées, qui eux sont persistés et donc intouchables.
 */
export const NIVEAUX_THEORIE = [
  'C1/1', 'C1/2', 'C1/3', 'C1/4', 'C2/1', 'C2/2', 'C2/3', 'C2/4', 'C3',
] as const

/** Identifiant de trophée d'un niveau de Code de la route. STABLE : ne pas renommer. */
export function idTropheeCode(niveau: string): string {
  return `code_${niveau.replace('/', '_')}`
}

// Un trophée par niveau reçu au Code de la route musicale. L'icône marque le
// cycle — neuf fois le même pictogramme rendrait la grille illisible, alors que
// le libellé porte déjà le niveau exact.
const TROPHEES_CODE = NIVEAUX_THEORIE.map(niveau => ({
  id: idTropheeCode(niveau),
  icon: niveau.startsWith('C1') ? '🚦' : niveau.startsWith('C2') ? '🛣️' : '🏁',
  label: `Code ${niveau}`,
  hint: `Être reçu au Code de la route musicale au niveau ${niveau}`,
  check: (_s: ProgressState, meta?: AddSessionParams['meta']) => meta?.codeReussi === niveau,
}))

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
  ...TROPHEES_CODE,
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
    harmonie:  { sessionsPlayed: 0, xpTotal: 0 },
  },
  dailyRythmeIndiv: { date: null, count: 0 },
  dailyTheorieSerie: { date: null, count: 0 },
  highestRankIdx: 0,
}

export function mergeWithDefaults(data: Record<string, unknown>): ProgressState {
  const d = data as Partial<ProgressState> & { modules?: Record<string, unknown> }
  return {
    ...DEFAULT_STATE,
    ...d,
    streak: { ...DEFAULT_STATE.streak, ...(d.streak ?? {}) },
    dailyRythmeIndiv: { ...DEFAULT_STATE.dailyRythmeIndiv, ...(d.dailyRythmeIndiv ?? {}) },
    dailyTheorieSerie: { ...DEFAULT_STATE.dailyTheorieSerie, ...(d.dailyTheorieSerie ?? {}) },
    highestRankIdx: d.highestRankIdx ?? DEFAULT_STATE.highestRankIdx,
    modules: {
      rythme:    { ...DEFAULT_STATE.modules.rythme,    ...(d.modules?.['rythme']    ?? {}) },
      theorie:   { ...DEFAULT_STATE.modules.theorie,   ...(d.modules?.['theorie']   ?? {}) },
      accordeur: { ...DEFAULT_STATE.modules.accordeur, ...(d.modules?.['accordeur'] ?? {}) },
      notes:     { ...DEFAULT_STATE.modules.notes,     ...(d.modules?.['notes']     ?? {}) },
      harmonie:  { ...DEFAULT_STATE.modules.harmonie,  ...(d.modules?.['harmonie']  ?? {}) },
    },
  }
}

// ─── Progression invité (non connecté) — persistée en localStorage ─────────────
// Un invité accumule sa progression localement (XP, streak, série de 10, trophées)
// pour l'inciter à créer un compte : à l'inscription, `mergeGuestInto` reverse le
// tout dans le compte neuf (voir RegisterPage). Le chemin connecté n'est pas concerné.
export const GUEST_PROGRESS_KEY = 'guest-progress-v1'

export function readGuestProgress(): ProgressState | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(GUEST_PROGRESS_KEY)
    return raw ? mergeWithDefaults(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

export function writeGuestProgress(state: ProgressState): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(GUEST_PROGRESS_KEY, JSON.stringify(state))
  } catch { /* quota / mode privé : progression invité best-effort */ }
}

export function clearGuestProgress(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(GUEST_PROGRESS_KEY)
  } catch { /* ignore */ }
}

// Fusionne une progression invité dans un état de compte (typiquement neuf à
// l'inscription). XP additionnés, trophées en union, série la plus récente conservée,
// compteurs de module sommés. Fonction pure — testable, sans effet de bord.
export function mergeGuestInto(account: ProgressState, guest: ProgressState): ProgressState {
  const xp = account.xp + guest.xp
  const trophies = Array.from(new Set([...account.trophies, ...guest.trophies]))

  // Streak : on garde la série rattachée à la date la plus récente ; longest = max.
  const guestNewer = (guest.streak.lastDate ?? '') >= (account.streak.lastDate ?? '')
  const primaryStreak = guestNewer ? guest.streak : account.streak
  const streak: Streak = {
    current: primaryStreak.current,
    longest: Math.max(account.streak.longest, guest.streak.longest),
    lastDate: primaryStreak.lastDate,
  }

  // Compteur journalier : celui de la date la plus récente (l'autre est périmé).
  const laterCounter = (a: DailyCounter, b: DailyCounter): DailyCounter =>
    (b.date ?? '') >= (a.date ?? '') ? b : a

  const modules: ProgressState['modules'] = {
    rythme: {
      seriesPlayed:    account.modules.rythme.seriesPlayed    + guest.modules.rythme.seriesPlayed,
      exercisesPlayed: account.modules.rythme.exercisesPlayed + guest.modules.rythme.exercisesPlayed,
      xpTotal:         account.modules.rythme.xpTotal         + guest.modules.rythme.xpTotal,
    },
    theorie:   { sessionsPlayed: account.modules.theorie.sessionsPlayed   + guest.modules.theorie.sessionsPlayed,   xpTotal: account.modules.theorie.xpTotal   + guest.modules.theorie.xpTotal },
    accordeur: { sessionsPlayed: account.modules.accordeur.sessionsPlayed + guest.modules.accordeur.sessionsPlayed, xpTotal: account.modules.accordeur.xpTotal + guest.modules.accordeur.xpTotal },
    notes:     { sessionsPlayed: account.modules.notes.sessionsPlayed     + guest.modules.notes.sessionsPlayed,     xpTotal: account.modules.notes.xpTotal     + guest.modules.notes.xpTotal },
    harmonie:  { sessionsPlayed: account.modules.harmonie.sessionsPlayed  + guest.modules.harmonie.sessionsPlayed,  xpTotal: account.modules.harmonie.xpTotal  + guest.modules.harmonie.xpTotal },
  }

  return {
    xp,
    streak,
    trophies,
    modules,
    dailyRythmeIndiv:  laterCounter(account.dailyRythmeIndiv,  guest.dailyRythmeIndiv),
    dailyTheorieSerie: laterCounter(account.dailyTheorieSerie, guest.dailyTheorieSerie),
    highestRankIdx: Math.max(account.highestRankIdx, guest.highestRankIdx, getRankIdx(xp)),
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

// ─── Exercices Rythme isolés et validation de la journée ──────────────────────
// Un exercice Rythme joué SEUL ne vaut pas une session complète : il en faut
// RYTHME_INDIV_POUR_STREAK dans la même journée pour valider le streak. Toute
// autre session (série Rythme, Théorie, Notes, Harmonie, Accordeur) le valide
// immédiatement.
export const RYTHME_INDIV_POUR_STREAK = 10

/** Nombre d'exercices Rythme isolés déjà faits aujourd'hui (0 si le compteur date d'hier). */
export function rythmeIndivDuJour(state: ProgressState, today: string): number {
  return state.dailyRythmeIndiv.date === today ? state.dailyRythmeIndiv.count : 0
}

/**
 * Reste à faire aujourd'hui pour valider la journée via des exercices Rythme
 * isolés. Vaut 0 dès que la journée est validée — par ce biais ou par une autre
 * activité, d'où le test sur `lastDate`.
 */
export function resteAvantStreak(state: ProgressState, today: string): number {
  if (state.streak.lastDate === today) return 0
  const faits = rythmeIndivDuJour(state, today)
  return Math.max(0, RYTHME_INDIV_POUR_STREAK - faits)
}

// ─── Séries d'entraînement Théorie et validation de la journée ────────────────
// Même logique que les exercices Rythme isolés : une série d'entraînement de 10
// questions ne vaut pas une session complète, il en faut
// THEORIE_SERIES_POUR_STREAK dans la même journée. Le Code de la route musicale
// (40 questions) reste une session pleine et valide immédiatement.
export const THEORIE_SERIES_POUR_STREAK = 2

/** Nombre de séries d'entraînement Théorie déjà faites aujourd'hui (0 si le compteur date d'hier). */
export function theorieSeriesDuJour(state: ProgressState, today: string): number {
  return state.dailyTheorieSerie.date === today ? state.dailyTheorieSerie.count : 0
}

/**
 * Reste à faire aujourd'hui pour valider la journée via des séries d'entraînement
 * Théorie. Vaut 0 dès que la journée est validée — par ce biais ou autrement.
 */
export function resteAvantStreakTheorie(state: ProgressState, today: string): number {
  if (state.streak.lastDate === today) return 0
  const faits = theorieSeriesDuJour(state, today)
  return Math.max(0, THEORIE_SERIES_POUR_STREAK - faits)
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

  // Deux activités « partielles » ne valident pas la journée à elles seules : il
  // en faut un certain nombre dans la journée. Toute autre session la valide
  // immédiatement.
  const isRythmeIndiv  = module === 'rythme'  && meta.individual   === true
  const isTheorieSerie = module === 'theorie' && meta.serieTheorie === true

  let newDailyRythmeIndiv  = prev.dailyRythmeIndiv
  let newDailyTheorieSerie = prev.dailyTheorieSerie
  let countsForStreak = !isRythmeIndiv && !isTheorieSerie

  if (isRythmeIndiv) {
    const sameDay = prev.dailyRythmeIndiv.date === today
    const count = sameDay ? prev.dailyRythmeIndiv.count + 1 : 1
    newDailyRythmeIndiv = { date: today, count }
    countsForStreak = sameDay
      && prev.dailyRythmeIndiv.count < RYTHME_INDIV_POUR_STREAK
      && count >= RYTHME_INDIV_POUR_STREAK
  }

  if (isTheorieSerie) {
    const sameDay = prev.dailyTheorieSerie.date === today
    const count = sameDay ? prev.dailyTheorieSerie.count + 1 : 1
    newDailyTheorieSerie = { date: today, count }
    countsForStreak = sameDay
      && prev.dailyTheorieSerie.count < THEORIE_SERIES_POUR_STREAK
      && count >= THEORIE_SERIES_POUR_STREAK
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
  } else if (module === 'harmonie') {
    moduleUpdate = {
      ...prev.modules,
      harmonie: { sessionsPlayed: prev.modules.harmonie.sessionsPlayed + 1, xpTotal: prev.modules.harmonie.xpTotal + xpGained },
    }
  } else if (module === 'accordeur') {
    moduleUpdate = {
      ...prev.modules,
      accordeur: { sessionsPlayed: prev.modules.accordeur.sessionsPlayed + 1, xpTotal: prev.modules.accordeur.xpTotal + xpGained },
    }
  } else {
    // Garde d'exhaustivité. Cette chaîne se terminait par un `else` qui créditait
    // l'accordeur : tout nouveau module ajouté à l'union sans sa branche y voyait
    // son XP atterrir SILENCIEUSEMENT. Désormais l'omission est une erreur de
    // compilation.
    const jamais: never = module
    throw new Error(`addSession : module non géré (${String(jamais)})`)
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
    dailyTheorieSerie: newDailyTheorieSerie,
    highestRankIdx: newHighestRankIdx,
  }

  const newTrophyIds = checkNewTrophies(newStateBeforeTrophies, meta, prev.trophies)
  const newState: ProgressState = {
    ...newStateBeforeTrophies,
    trophies: [...prev.trophies, ...newTrophyIds],
  }

  const rankedUp = rankAfter !== rankBefore

  // `countsForStreak` était calculé puis oublié. Il ne suffit pas : il vaut
  // `true` à CHAQUE session hors Rythme-isolé, y compris quand la journée est
  // déjà validée depuis ce matin. Il faut donc vérifier que la bascule a bien
  // lieu maintenant — sinon on célébrerait à chaque exercice de la journée.
  const streakValidated =
    countsForStreak && prev.streak.lastDate !== today && newStreak.lastDate === today

  // Firestore REJETTE les champs `undefined` : l'entrée ne porte donc que les
  // clés réellement renseignées. `sansIndefinis` s'en charge — ne pas étaler
  // `...details` directement ici.
  const historyEntry: HistoryEntry = sansIndefinis({
    date: today,
    module,
    xp: xpGained,
    medal,
    individual: meta.individual === true ? true : undefined,
    streakValidated: streakValidated ? true : undefined,
    ...params.details,
  })

  return {
    newState,
    newTrophies: newTrophyIds,
    rankedUp,
    streakValidated,
    newRankId: rankedUp ? rankAfter : null,
    historyEntry,
  }
}

/**
 * Retire les clés à `undefined`. Indispensable avant tout `addDoc` : Firestore
 * lève sur un champ `undefined` (contrairement à `null`), et l'écriture de
 * l'historique se ferait alors silencieusement rejeter.
 */
function sansIndefinis<T extends Record<string, unknown>>(obj: T): T {
  const out = {} as T
  for (const [cle, valeur] of Object.entries(obj)) {
    if (valeur !== undefined) out[cle as keyof T] = valeur as T[keyof T]
  }
  return out
}
