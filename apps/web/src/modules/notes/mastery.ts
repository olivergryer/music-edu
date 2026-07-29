// ─── Maîtrise, classification d'essai, déverrouillage de phase (spec §7, §8) ───

import type { Attempt, AttemptFlag, Mastery, NoteMastery, NotesSessionConfig, Phase } from './types.ts'

const RECENT_CAP = 10   // taille des fenêtres « récentes » par item

// ── classifyAttempt ────────────────────────────────────────────────────────────
// `guess` = RT sous plancher ET faux → devinette, pas erreur de lecture (§8).
// `slow`  = RT au-delà du plafond configuré.
// `firstOfLine` = position dans la ligne (fourni par l'appelant, non dérivable du RT).
export function classifyAttempt(
  rtMs: number,
  correct: boolean,
  config: Pick<NotesSessionConfig, 'guessFloorMs' | 'slowCeilingMs'>,
  opts: { isFirstOfLine?: boolean } = {},
): AttemptFlag[] {
  const flags: AttemptFlag[] = []
  if (rtMs < config.guessFloorMs && !correct) flags.push('guess')
  if (rtMs > config.slowCeilingMs) flags.push('slow')
  if (opts.isFirstOfLine) flags.push('firstOfLine')
  return flags
}

// ── updateMastery ──────────────────────────────────────────────────────────────
// Renvoie une NOUVELLE Mastery (immuable). Les essais marqués `guess` ne comptent
// PAS dans la maîtrise (§8) mais rafraîchissent la récence (l'item a été montré).
export function updateMastery(mastery: Mastery, attempt: Attempt, turn: number): Mastery {
  const prev: NoteMastery = mastery[attempt.itemId] ?? {
    attempts: 0, correct: 0, recent: [], rtSamples: [], lastPlayedTurn: turn,
  }
  const isGuess = attempt.flags.includes('guess')

  const next: NoteMastery = {
    ...prev,
    lastPlayedTurn: turn,
    recent: [...prev.recent],
    rtSamples: [...prev.rtSamples],
  }

  if (!isGuess) {
    next.attempts = prev.attempts + 1
    next.correct = prev.correct + (attempt.correct ? 1 : 0)
    next.recent = [...prev.recent, attempt.correct].slice(-RECENT_CAP)
    next.rtSamples = [...prev.rtSamples, attempt.rtMs].slice(-RECENT_CAP)
  }

  return { ...mastery, [attempt.itemId]: next }
}

// ── Déverrouillage / régression de phase (§7, §8) ──────────────────────────────

export interface PhaseEval {
  recentAccuracies: number[]  // exactitude par session (hors guess), plus récente en dernier
  ambitusAtTarget: boolean    // ambitus cible atteint (critère P1→P2)
  currentErrorRate: number    // taux d'erreur de la fenêtre courante
  guessInLast10: number       // nb de `guess` sur les 10 derniers items (surcharge)
}

const PHASE_ORDER: Phase[] = ['P0', 'P1', 'P2']
const P0_UNLOCK_ACC = 0.95    // ≥95 % sur 2 sessions consécutives
const P2_MAX_ERR = 0.10       // <10 % d'erreurs
const GUESS_REGRESS = 3       // ≥3 guess / 10 → surcharge

function prevPhase(p: Phase): Phase {
  return PHASE_ORDER[Math.max(0, PHASE_ORDER.indexOf(p) - 1)]
}
function nextPhaseId(p: Phase): Phase {
  return PHASE_ORDER[Math.min(PHASE_ORDER.length - 1, PHASE_ORDER.indexOf(p) + 1)]
}

// Critère de déverrouillage AVANT, mesuré (jamais déclaré).
export function shouldUnlock(phase: Phase, ev: PhaseEval): boolean {
  if (phase === 'P0') {
    const a = ev.recentAccuracies
    return a.length >= 2 && a.slice(-2).every(x => x >= P0_UNLOCK_ACC)
  }
  if (phase === 'P1') {
    return ev.ambitusAtTarget && ev.currentErrorRate < P2_MAX_ERR
  }
  return false // pas de phase au-delà de P2
}

// Critère de régression : surcharge (guess) ou critère non tenu. Sans message punitif.
export function shouldRegress(phase: Phase, ev: PhaseEval): boolean {
  if (phase === 'P0') return false
  if (ev.guessInLast10 >= GUESS_REGRESS) return true
  if (phase === 'P2') return ev.currentErrorRate >= P2_MAX_ERR
  return false
}

// Phase résultante après évaluation (régression prioritaire sur déverrouillage).
export function nextPhase(phase: Phase, ev: PhaseEval): Phase {
  if (shouldRegress(phase, ev)) return prevPhase(phase)
  if (shouldUnlock(phase, ev)) return nextPhaseId(phase)
  return phase
}
