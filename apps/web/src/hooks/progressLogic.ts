// Logique pure de progression (XP, streak, trophées, compteurs par module).
// Sans React, sans Firebase — testable directement depuis Node.

// Import de TYPE uniquement (effacé à la compilation) : la liste des trophées
// doit référencer une icône qui existe, sinon la faute de frappe ne se voit qu'à
// l'écran. Aucun code de composant n'est tiré ici.
import type { TropheeIconId } from '../components/TropheeIcon'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Streak {
  current: number
  longest: number
  lastDate: string | null
  /**
   * Rattrapage du jour de reprise. Mémorisé dès la première session de ce jour :
   * la validation de la journée remet `current` à 1 et écrase `lastDate`, la
   * série rompue serait sinon perdue. `null` hors rattrapage (jamais `undefined`,
   * que Firestore rejette).
   */
  repair?: StreakRepair | null
}

export interface StreakRepair {
  /** Jour de reprise : le seul jour où la réparation est possible. */
  date: string
  /** Série rompue, telle qu'elle était au dernier jour validé. */
  previous: number
  /** Jours manqués entre le dernier jour validé et la reprise (1 à 3). */
  missed: number
  /** Points à atteindre le jour de reprise. */
  target: number
  done: boolean
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
  /** Points du jour, tous modules confondus (voir POINTS_JOURNEE). */
  dailyPoints: DailyCounter
  highestRankIdx: number  // plus haut rang jamais atteint (index dans RANKS)
  /**
   * Plus haut total d'XP jamais atteint, decay compris. Sert au classement
   * « XP ever » des tableaux de bord : `xp` seul ne dit rien du travail fourni
   * par un élève devenu inactif, puisque le decay l'a rogné.
   * Pour un compte antérieur à ce champ, `mergeWithDefaults` l'initialise à son
   * XP du moment : l'historique d'avant est définitivement perdu.
   */
  xpPeak: number
  /** Version du recalcul rétroactif de la série déjà appliqué (0 = jamais). */
  serieRecalculee: number
}

export interface AddSessionParams {
  module: 'rythme' | 'theorie' | 'accordeur' | 'notes' | 'harmonie'
  xpEarned: number
  medal: string
  meta?: {
    perfectSeries?: boolean
    individual?: boolean
    serieTheorie?: boolean
    /** Notes : session terminée sans aucune erreur — débloque « Lecture parfaite ». */
    sansFaute?: boolean
    /** Théorie : niveau reçu au Code de la route musicale — débloque son trophée. */
    codeReussi?: string
    /**
     * Rythme : série quittée avant la fin, avec le nombre d'exercices joués.
     * Ne compte pas comme série terminée (trophées de séries).
     */
    serieInterrompue?: number
    /** Force les points du jour de la session (voir `pointsSession`). */
    points?: number
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
  /** Cette session a atteint l'objectif de rattrapage : série rompue rétablie. */
  streakRepaired?: boolean
  /** Points du jour rapportés (absent des entrées antérieures au barème en points). */
  points?: number
}

export interface ApplySessionResult {
  newState: ProgressState
  newTrophies: string[]
  rankedUp: boolean
  /** Cette session vient de valider la journée pour le streak. */
  streakValidated: boolean
  /** Cette session vient de réparer une série rompue. */
  streakRepaired: boolean
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

// Un trophée par niveau reçu au Code de la route musicale. L'icône est une portée
// en perspective, et le nombre de repères au loin marque le cycle — neuf fois le
// même pictogramme rendrait la grille illisible, alors que le libellé porte déjà
// le niveau exact.
const TROPHEES_CODE: Trophee[] = NIVEAUX_THEORIE.map(niveau => ({
  id: idTropheeCode(niveau),
  icon: niveau.startsWith('C1') ? 'perspective-1' : niveau.startsWith('C2') ? 'perspective-2' : 'perspective-3',
  label: `Code ${niveau}`,
  hint: `Être reçu au Code de la route musicale au niveau ${niveau}`,
  groupe: 'code',
  check: (_s: ProgressState, meta?: AddSessionParams['meta']) => meta?.codeReussi === niveau,
}))

export interface Trophee {
  /** Clé technique PERSISTÉE dans Firestore — ne jamais renommer. */
  id: string
  icon: TropheeIconId
  label: string
  hint: string
  /**
   * Regroupement d'affichage. `'code'` sort le trophée de la grille principale
   * vers la sous-section « Code de la route » : neuf trophées pour une seule
   * activité d'un seul module noyaient la grille.
   */
  groupe?: 'code'
  check: (s: ProgressState, meta?: AddSessionParams['meta']) => boolean
}

/** Nombre de modules dans lesquels au moins une activité a été jouée. */
function modulesJoues(s: ProgressState): number {
  const m = s.modules
  return [
    m.rythme.seriesPlayed + m.rythme.exercisesPlayed,
    m.theorie.sessionsPlayed,
    m.accordeur.sessionsPlayed,
    m.notes.sessionsPlayed,
    m.harmonie.sessionsPlayed,
  ].filter(n => n >= 1).length
}

export const TROPHIES: Trophee[] = [
  // ── Transverses ────────────────────────────────────────────────────────────
  {
    id: 'first_note',
    icon: 'note', label: 'Première note',
    hint: 'Jouer ton premier exercice ou ta première session, dans n’importe quel module',
    // Ce test omettait Notes et Harmonie : un élève qui ne pratiquait que ces
    // deux modules ne débloquait JAMAIS son premier trophée.
    check: (s: ProgressState) => modulesJoues(s) >= 1,
  },
  {
    id: 'duo',
    icon: 'duo', label: 'Duo',
    hint: 'Pratiquer deux modules différents',
    // Idem : la condition était « rythme ET théorie », donc inatteignable pour
    // qui travaillait Notes + Harmonie.
    check: (s: ProgressState) => modulesJoues(s) >= 2,
  },
  {
    id: 'portee',
    icon: 'portee-flamme', label: 'Sur la portée',
    hint: 'Pratiquer 7 jours de suite sur Tessitura',
    check: (s: ProgressState) => s.streak.current >= 7,
  },
  {
    id: 'mesure',
    icon: 'barre-mesure', label: 'Barre de mesure',
    hint: 'Pratiquer 30 jours de suite sur Tessitura',
    check: (s: ProgressState) => s.streak.current >= 30,
  },
  {
    id: 'do_majeur',
    icon: 'accord', label: 'Do majeur',
    hint: 'Atteindre le rang Soliste',
    check: (s: ProgressState) => getRankIdx(s.xp) >= 3,
  },
  {
    id: 'diapason',
    icon: 'diapason', label: 'Diapason',
    // `diapason` et `concert` testaient tous deux « rang Maestro » : deux
    // trophées pour un seul fait. `diapason` reprend le palier Virtuose, qui
    // était manifestement son intention (il précède `concert` dans la liste).
    // Personne ne le perd : tout détenteur avait Maestro, donc Virtuose aussi.
    hint: 'Atteindre le rang Virtuose',
    check: (s: ProgressState) => getRankIdx(s.xp) >= 5,
  },
  {
    id: 'concert',
    icon: 'pupitre', label: 'Concert',
    hint: 'Atteindre le rang Maestro',
    check: (s: ProgressState) => getRankIdx(s.xp) >= 6,
  },

  // ── Rythme ─────────────────────────────────────────────────────────────────
  {
    id: 'first_series',
    icon: 'serie-dix', label: 'Première série',
    hint: 'Terminer une série complète de 10 exercices de rythme',
    check: (s: ProgressState) => s.modules.rythme.seriesPlayed >= 1,
  },
  {
    id: 'perfect_series',
    icon: 'etoile', label: 'Série parfaite',
    hint: 'Réussir une série de 10 exercices de rythme sans faute',
    check: (_s: ProgressState, meta?: AddSessionParams['meta']) => meta?.perfectSeries === true,
  },
  {
    id: 'clef_sol',
    icon: 'clef-sol', label: 'Clé de Sol',
    // Critère resserré sur le seul Rythme : la variante « ou 10 sessions de
    // théorie » en faisait un trophée sans module, impossible à situer dans la
    // grille. Les comptes qui l'avaient obtenu par la théorie le gardent.
    hint: '10 séries de rythme terminées',
    check: (s: ProgressState) => s.modules.rythme.seriesPlayed >= 10,
  },
  {
    id: 'virtuose',
    // Renommé : « Virtuose » est un RANG (80 000 XP). Un trophée homonyme
    // brouillait la distinction Rang / Niveau / trophée. L'id reste intact.
    icon: 'metronome', label: 'Métronome humain',
    hint: '50 séries de rythme terminées',
    check: (s: ProgressState) => s.modules.rythme.seriesPlayed >= 50,
  },

  // ── Théorie ────────────────────────────────────────────────────────────────
  {
    id: 'theoricien',
    icon: 'livre', label: 'Théoricien.ne',
    hint: '20 sessions de théorie terminées',
    check: (s: ProgressState) => s.modules.theorie.sessionsPlayed >= 20,
  },

  // ── Notes ──────────────────────────────────────────────────────────────────
  {
    id: 'notes_premiere',
    icon: 'dechiffrage', label: 'Premier déchiffrage',
    hint: 'Terminer une session de lecture de notes',
    check: (s: ProgressState) => s.modules.notes.sessionsPlayed >= 1,
  },
  {
    id: 'notes_sans_faute',
    icon: 'lecture-parfaite', label: 'Lecture parfaite',
    hint: 'Terminer une session de notes sans aucune erreur',
    check: (_s: ProgressState, meta?: AddSessionParams['meta']) => meta?.sansFaute === true,
  },
  {
    id: 'notes_dix',
    icon: 'clef-fa', label: 'Clé de Fa',
    hint: '10 sessions de lecture de notes',
    check: (s: ProgressState) => s.modules.notes.sessionsPlayed >= 10,
  },
  {
    id: 'notes_cinquante',
    icon: 'oeil', label: 'Lecteur.rice à vue',
    hint: '50 sessions de lecture de notes',
    check: (s: ProgressState) => s.modules.notes.sessionsPlayed >= 50,
  },

  // ── Accordeur / Harmonie ───────────────────────────────────────────────────
  // Modules destinés aux plus avancés : un seul palier chacun, l'entrée étant
  // déjà couverte par « Première note » et « Duo ».
  {
    id: 'accordeur_dix',
    icon: 'accordeur', label: 'Juste ton',
    hint: '10 sessions d’accordeur',
    check: (s: ProgressState) => s.modules.accordeur.sessionsPlayed >= 10,
  },
  {
    id: 'harmonie_dix',
    icon: 'harmonie', label: 'Oreille harmonique',
    hint: '10 sessions d’harmonie',
    check: (s: ProgressState) => s.modules.harmonie.sessionsPlayed >= 10,
  },

  ...TROPHEES_CODE,
]

// ─── État par défaut + fusion ─────────────────────────────────────────────────

export const DEFAULT_STATE: ProgressState = {
  xp: 0,
  streak: { current: 0, longest: 0, lastDate: null, repair: null },
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
  dailyPoints: { date: null, count: 0 },
  highestRankIdx: 0,
  xpPeak: 0,
  serieRecalculee: 0,
}

export function mergeWithDefaults(data: Record<string, unknown>): ProgressState {
  // `expireAt` est une métadonnée de conservation (TTL), pas de la progression.
  // Sans ce retrait, le `...d` ci-dessous la ferait entrer dans l'état, d'où elle
  // ressortirait à la prochaine écriture — et, chez un invité, jusque dans le
  // localStorage.
  const { expireAt: _expireAt, ...reste } = data
  const d = reste as Partial<ProgressState> & { modules?: Record<string, unknown> }
  return {
    ...DEFAULT_STATE,
    ...d,
    streak: { ...DEFAULT_STATE.streak, ...(d.streak ?? {}) },
    dailyRythmeIndiv: { ...DEFAULT_STATE.dailyRythmeIndiv, ...(d.dailyRythmeIndiv ?? {}) },
    dailyTheorieSerie: { ...DEFAULT_STATE.dailyTheorieSerie, ...(d.dailyTheorieSerie ?? {}) },
    dailyPoints: { ...DEFAULT_STATE.dailyPoints, ...(d.dailyPoints ?? {}) },
    highestRankIdx: d.highestRankIdx ?? DEFAULT_STATE.highestRankIdx,
    // Compte antérieur au champ : on démarre son pic à l'XP courant plutôt qu'à
    // zéro, sinon il resterait classé dernier jusqu'à sa prochaine session.
    xpPeak: d.xpPeak ?? d.xp ?? DEFAULT_STATE.xpPeak,
    serieRecalculee: d.serieRecalculee ?? DEFAULT_STATE.serieRecalculee,
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

// ─── Session en attente (série Rythme en cours) ───────────────────────────────
// Une série de 10 n'est enregistrée qu'à la fin. Pour qu'une série interrompue
// compte quand même, son état est sauvegardé ici après chaque exercice :
//   - quitter la série dans l'app l'enregistre aussitôt (RythmApp) ;
//   - une fermeture brutale (onglet, app tuée) est rattrapée au prochain
//     chargement de la progression (useProgressFirebase).
// Pas d'enregistrement sur `pagehide` : l'écriture Firestore n'y aboutit pas de
// façon fiable, et la session serait retirée d'ici avant d'être sauvée.
export const SESSION_EN_ATTENTE_KEY = 'session-en-attente-v1'

export interface SessionEnAttente {
  date: string
  params: AddSessionParams
}

export function ecrireSessionEnAttente(session: SessionEnAttente): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(SESSION_EN_ATTENTE_KEY, JSON.stringify(session))
  } catch { /* stockage indisponible : la série ne comptera qu'une fois terminée */ }
}

/** Abandonne la session en attente (série terminée normalement). */
export function effacerSessionEnAttente(): void {
  if (typeof localStorage === 'undefined') return
  try { localStorage.removeItem(SESSION_EN_ATTENTE_KEY) } catch { /* ignore */ }
}

/**
 * Lit ET retire la session en attente. Le retrait immédiat garantit qu'elle
 * n'est enregistrée qu'une fois, même si plusieurs instances du hook la voient.
 */
export function prendreSessionEnAttente(): SessionEnAttente | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(SESSION_EN_ATTENTE_KEY)
    if (!raw) return null
    localStorage.removeItem(SESSION_EN_ATTENTE_KEY)
    return JSON.parse(raw) as SessionEnAttente
  } catch {
    return null
  }
}

/**
 * Paramètres à enregistrer pour une session rattrapée. Jouée un autre jour, elle
 * garde son XP mais ne rapporte aucun point : ils valideraient la mauvaise journée.
 */
export function parametresRattrapes(session: SessionEnAttente, today: string): AddSessionParams {
  if (session.date === today) return session.params
  return { ...session.params, meta: { ...session.params.meta, points: 0 } }
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
    repair: primaryStreak.repair ?? null,
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
    dailyPoints:       laterCounter(account.dailyPoints,       guest.dailyPoints),
    highestRankIdx: Math.max(account.highestRankIdx, guest.highestRankIdx, getRankIdx(xp)),
    xpPeak: Math.max(account.xpPeak, guest.xpPeak, xp),
    serieRecalculee: account.serieRecalculee,
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
  return { ...streak, current: next, longest, lastDate: today }
}

// ─── Points du jour et validation de la journée ───────────────────────────────
// Une journée se valide à POINTS_JOURNEE points, cumulables entre modules :
//   - exercice Rythme isolé           : 1 point  (il en faut 10)
//   - série d'entraînement Théorie    : 5 points (il en faut 2)
//   - toute autre session (série Rythme, Code de la route, Notes, Harmonie,
//     Accordeur)                      : 10 points (valide d'un coup)
// C'est l'ancien barème (10 exercices isolés, 2 séries Théorie), rendu
// cumulable. Les points continuent de s'accumuler au-delà de 10 : la jauge
// affiche alors un multiplicateur, et c'est ce volume qui sert au rattrapage.
export const POINTS_JOURNEE = 10

/** Points rapportés par une session, selon son module et sa nature. */
export function pointsSession(module: AddSessionParams['module'], meta: AddSessionParams['meta'] = {}): number {
  if (typeof meta.points === 'number') return meta.points
  if (typeof meta.serieInterrompue === 'number') return meta.serieInterrompue
  if (module === 'rythme' && meta.individual === true) return 1
  if (module === 'theorie' && meta.serieTheorie === true) return POINTS_JOURNEE / 2
  return POINTS_JOURNEE
}

/**
 * Points accumulés aujourd'hui. Repli pour les états antérieurs au compteur de
 * points (`dailyPoints.date` jamais renseigné) : on reconstitue depuis les
 * anciens compteurs, pour que le jour du déploiement ne reparte pas de zéro.
 */
export function pointsDuJour(state: ProgressState, today: string): number {
  if (state.dailyPoints.date !== null) {
    return state.dailyPoints.date === today ? state.dailyPoints.count : 0
  }
  const indiv   = state.dailyRythmeIndiv.date  === today ? state.dailyRythmeIndiv.count  : 0
  const theorie = state.dailyTheorieSerie.date === today ? state.dailyTheorieSerie.count : 0
  const ancien  = indiv + theorie * (POINTS_JOURNEE / 2)
  return state.streak.lastDate === today ? Math.max(ancien, POINTS_JOURNEE) : ancien
}

/**
 * Position de la jauge : au-delà d'une journée, le curseur repart de zéro et le
 * multiplicateur compte les journées pleines (15 → 5 et ×1, 25 → 5 et ×2).
 * Pile sur un multiple, la barre reste pleine plutôt que vide.
 */
export function curseurJauge(points: number, journee: number = POINTS_JOURNEE): { curseur: number; multiplicateur: number } {
  const multiplicateur = Math.floor(points / journee)
  const reste = points % journee
  return { curseur: multiplicateur > 0 && reste === 0 ? journee : reste, multiplicateur }
}

// ─── Rattrapage de série ──────────────────────────────────────────────────────
// Une série rompue depuis 1, 2 ou 3 jours peut être réparée le jour de la
// reprise, à condition d'y faire 3×, 8× ou 15× le volume d'une journée. Les
// jours manqués comptent alors dans la série : 12 jours, 2 jours manqués,
// réparée le 3ᵉ → 15. Au-delà de 3 jours manqués, plus de réparation.
export const MULTIPLES_RATTRAPAGE = [3, 8, 15] as const

/**
 * Rattrapage en jeu aujourd'hui, ou `null`. Une fois mémorisé dans
 * `streak.repair` (dès la première session du jour), c'est lui qui fait foi :
 * après validation de la journée, `lastDate` vaut aujourd'hui et l'écart qui
 * le justifiait a disparu.
 */
export function rattrapageDuJour(streak: Streak, today: string): StreakRepair | null {
  if (streak.repair?.date === today) return streak.repair
  if (!streak.lastDate || streak.current < 1) return null
  const missed = dateDiff(streak.lastDate, today) - 1
  if (missed < 1 || missed > MULTIPLES_RATTRAPAGE.length) return null
  return {
    date: today,
    previous: streak.current,
    missed,
    target: POINTS_JOURNEE * MULTIPLES_RATTRAPAGE[missed - 1],
    done: false,
  }
}

/** Objectif de points du jour : celui du rattrapage s'il est en cours, sinon une journée. */
export function objectifDuJour(streak: Streak, today: string): number {
  const r = rattrapageDuJour(streak, today)
  return r && !r.done ? r.target : POINTS_JOURNEE
}

/**
 * Fait évoluer la série quand les points du jour passent de `avant` à `apres`.
 * Partagée par `applySession` et par le recalcul rétroactif : une seule règle.
 */
function avancerSerie(streak: Streak, avant: number, apres: number, today: string): { streak: Streak; repaired: boolean } {
  const repair = rattrapageDuJour(streak, today)
  let next = streak
  if (avant < POINTS_JOURNEE && apres >= POINTS_JOURNEE) next = updateStreak(next, today)
  if (repair && !repair.done && avant < repair.target && apres >= repair.target) {
    const current = repair.previous + repair.missed + 1
    return {
      streak: { current, longest: Math.max(next.longest, current), lastDate: today, repair: { ...repair, done: true } },
      repaired: true,
    }
  }
  return { streak: { ...next, repair }, repaired: false }
}

// ─── Recalcul rétroactif de la série ──────────────────────────────────────────
// Appliqué une fois par compte (voir `serieRecalculee`) : l'historique est rejoué
// jour par jour avec la règle de rattrapage, comme si elle avait toujours existé.

/** Version du recalcul : l'incrémenter relance le recalcul chez tous les comptes. */
export const VERSION_RECALCUL_SERIE = 1

/** Champs de l'historique utiles au rejeu. */
export interface EntreeSerie {
  date: string
  module: AddSessionParams['module']
  individual?: boolean
  mode?: string
  points?: number
}

/**
 * Points d'une entrée d'historique. L'historique ne garde pas `serieTheorie` :
 * la série d'entraînement se reconnaît à son `mode`. Les entrées Théorie
 * antérieures à ce champ comptent comme des sessions complètes.
 */
export function pointsEntreeHistorique(e: EntreeSerie): number {
  if (typeof e.points === 'number') return e.points
  if (e.module === 'theorie' && e.mode === 'Entraînement') return POINTS_JOURNEE / 2
  return pointsSession(e.module, { individual: e.individual === true })
}

/** Rejoue l'historique jusqu'à `today` inclus. */
export function rejouerSerie(entries: EntreeSerie[], today: string): { streak: Streak; pointsAujourdhui: number } {
  const parJour = new Map<string, number>()
  for (const e of entries) {
    if (!e.date || e.date > today) continue
    parJour.set(e.date, (parJour.get(e.date) ?? 0) + pointsEntreeHistorique(e))
  }
  let streak: Streak = DEFAULT_STATE.streak
  for (const jour of [...parJour.keys()].sort()) {
    streak = avancerSerie(streak, 0, parJour.get(jour) ?? 0, jour).streak
  }
  return { streak, pointsAujourdhui: parJour.get(today) ?? 0 }
}

const TROPHEES_SERIE = ['portee', 'mesure']

/**
 * Fusionne le rejeu dans l'état stocké. Garde-fou : la série ne baisse JAMAIS.
 * Une progression invité fusionnée à l'inscription n'a pas d'historique, le
 * rejeu l'ignorerait. On ne retient donc le rejeu que s'il aboutit au même
 * dernier jour validé, et seulement s'il fait mieux.
 * Les trophées de série débloqués ainsi sont attribués sans célébration.
 */
export function appliquerRecalculSerie(
  state: ProgressState,
  entries: EntreeSerie[],
  today: string,
): { state: ProgressState; nouveauxTrophees: string[] } {
  const { streak: rejoue, pointsAujourdhui } = rejouerSerie(entries, today)
  const actuel = state.streak
  const memeFin = rejoue.lastDate === actuel.lastDate
  const current = memeFin ? Math.max(actuel.current, rejoue.current) : actuel.current
  const streak: Streak = {
    current,
    longest: Math.max(actuel.longest, rejoue.longest, current),
    lastDate: actuel.lastDate,
    repair: actuel.repair ?? (memeFin ? rejoue.repair : null),
  }

  const dejaAujourdhui = pointsDuJour(state, today)
  const dailyPoints: DailyCounter = pointsAujourdhui > dejaAujourdhui
    ? { date: today, count: pointsAujourdhui }
    : state.dailyPoints

  // Évalués sur la meilleure série atteinte : un trophée gagné par le passé
  // reste mérité même si la série actuelle est plus courte.
  const pourTrophees: ProgressState = { ...state, streak: { ...streak, current: streak.longest } }
  const nouveauxTrophees = checkNewTrophies(pourTrophees, {}, state.trophies)
    .filter(id => TROPHEES_SERIE.includes(id))

  return {
    state: {
      ...state,
      streak,
      dailyPoints,
      trophies: [...state.trophies, ...nouveauxTrophees],
      serieRecalculee: VERSION_RECALCUL_SERIE,
    },
    nouveauxTrophees,
  }
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

  // Points du jour → validation de la journée et rattrapage éventuel.
  const isRythmeIndiv = module === 'rythme' && meta.individual === true
  const serieInterrompue = module === 'rythme' && typeof meta.serieInterrompue === 'number'
  const pointsAvant = pointsDuJour(prev, today)
  const pointsGagnes = pointsSession(module, meta)
  const pointsApres = pointsAvant + pointsGagnes
  const newDailyPoints: DailyCounter = { date: today, count: pointsApres }
  const { streak: newStreak, repaired: streakRepaired } = avancerSerie(prev.streak, pointsAvant, pointsApres, today)

  // Les compteurs xpTotal par module reflètent l'XP réellement créditée (boost inclus).
  let moduleUpdate: ProgressState['modules']
  if (module === 'rythme') {
    moduleUpdate = {
      ...prev.modules,
      rythme: {
        seriesPlayed:    prev.modules.rythme.seriesPlayed    + (isRythmeIndiv || serieInterrompue ? 0 : 1),
        exercisesPlayed: prev.modules.rythme.exercisesPlayed + (isRythmeIndiv ? 1 : serieInterrompue ? meta.serieInterrompue ?? 0 : 0),
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
  // Pic d'XP : jamais révisé à la baisse, le decay ne l'atteint pas.
  const newXpPeak = Math.max(prev.xpPeak ?? 0, newXp)

  const newStateBeforeTrophies: ProgressState = {
    ...prev,
    xp: newXp,
    streak: newStreak,
    modules: moduleUpdate,
    dailyPoints: newDailyPoints,
    highestRankIdx: newHighestRankIdx,
    xpPeak: newXpPeak,
  }

  const newTrophyIds = checkNewTrophies(newStateBeforeTrophies, meta, prev.trophies)
  const newState: ProgressState = {
    ...newStateBeforeTrophies,
    trophies: [...prev.trophies, ...newTrophyIds],
  }

  const rankedUp = rankAfter !== rankBefore

  // Bascule réelle, et non « session comptée » : une fois la journée validée,
  // les sessions suivantes du jour ne doivent pas la célébrer de nouveau.
  const streakValidated = prev.streak.lastDate !== today && newStreak.lastDate === today

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
    streakRepaired: streakRepaired ? true : undefined,
    points: pointsGagnes,
    ...params.details,
  })

  return {
    newState,
    newTrophies: newTrophyIds,
    rankedUp,
    streakValidated,
    streakRepaired,
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
