// ─── Tests : validation de la journée (streak) ────────────────────────────────
// node --test "src/**/*.test.ts"
//
// Couvre la règle « un exercice Rythme isolé ne vaut pas une session » et le
// signal `streakValidated` qui pilote la célébration.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  applySession,
  rythmeIndivDuJour,
  resteAvantStreak,
  RYTHME_INDIV_POUR_STREAK,
  DEFAULT_STATE,
  type ProgressState,
} from './progressLogic.ts'

const AUJOURD_HUI = '2026-08-16'
const HIER = '2026-08-15'

function etat(patch: Partial<ProgressState> = {}): ProgressState {
  return { ...DEFAULT_STATE, ...patch }
}

// ── rythmeIndivDuJour ────────────────────────────────────────────────────────

test('rythmeIndivDuJour : compte du jour conservé', () => {
  const s = etat({ dailyRythmeIndiv: { date: AUJOURD_HUI, count: 4 } })
  assert.equal(rythmeIndivDuJour(s, AUJOURD_HUI), 4)
})

test('rythmeIndivDuJour : compte de la veille ignoré', () => {
  // Le compteur n'est jamais remis à zéro en base : c'est la lecture qui doit
  // le neutraliser, sinon la jauge repartirait d'hier.
  const s = etat({ dailyRythmeIndiv: { date: HIER, count: 9 } })
  assert.equal(rythmeIndivDuJour(s, AUJOURD_HUI), 0)
})

// ── resteAvantStreak ─────────────────────────────────────────────────────────

test('resteAvantStreak : seuil complet quand rien n’a été fait', () => {
  assert.equal(resteAvantStreak(etat(), AUJOURD_HUI), RYTHME_INDIV_POUR_STREAK)
})

test('resteAvantStreak : décompte au fil des exercices', () => {
  const s = etat({ dailyRythmeIndiv: { date: AUJOURD_HUI, count: 7 } })
  assert.equal(resteAvantStreak(s, AUJOURD_HUI), RYTHME_INDIV_POUR_STREAK - 7)
})

test('resteAvantStreak : nul si la journée est déjà validée autrement', () => {
  // Une série de 10 ou une session de Théorie valide la journée : la jauge des
  // exercices isolés n'a plus lieu d'être.
  const s = etat({ streak: { current: 3, longest: 5, lastDate: AUJOURD_HUI } })
  assert.equal(resteAvantStreak(s, AUJOURD_HUI), 0)
})

test('resteAvantStreak : jamais négatif', () => {
  const s = etat({ dailyRythmeIndiv: { date: AUJOURD_HUI, count: 40 } })
  assert.ok(resteAvantStreak(s, AUJOURD_HUI) >= 0)
})

// ── streakValidated ──────────────────────────────────────────────────────────

test('streakValidated : une session non-Rythme-isolée valide immédiatement', () => {
  const r = applySession(etat(), { module: 'theorie', xpEarned: 100, medal: '🥇' }, AUJOURD_HUI)
  assert.equal(r.streakValidated, true)
  assert.equal(r.newState.streak.lastDate, AUJOURD_HUI)
})

test('streakValidated : faux si la journée était DÉJÀ validée', () => {
  // Le piège : `countsForStreak` vaut true à chaque session hors Rythme-isolé.
  // Sans le test sur l'état précédent, on célébrerait à chaque exercice du jour.
  const s = etat({ streak: { current: 2, longest: 4, lastDate: AUJOURD_HUI } })
  const r = applySession(s, { module: 'notes', xpEarned: 50, medal: '🥈' }, AUJOURD_HUI)
  assert.equal(r.streakValidated, false)
})

test('streakValidated : un exercice Rythme isolé seul ne valide pas', () => {
  const r = applySession(
    etat(),
    { module: 'rythme', xpEarned: 10, medal: '🥉', meta: { individual: true } },
    AUJOURD_HUI,
  )
  assert.equal(r.streakValidated, false)
})

test('streakValidated : vrai au franchissement du seuil d’exercices isolés', () => {
  const s = etat({
    dailyRythmeIndiv: { date: AUJOURD_HUI, count: RYTHME_INDIV_POUR_STREAK - 1 },
  })
  const r = applySession(
    s,
    { module: 'rythme', xpEarned: 10, medal: '🥉', meta: { individual: true } },
    AUJOURD_HUI,
  )
  assert.equal(r.streakValidated, true)
  assert.equal(r.newState.dailyRythmeIndiv.count, RYTHME_INDIV_POUR_STREAK)
})

test('streakValidated : faux au-delà du seuil (pas de rappel à chaque exercice)', () => {
  const s = etat({
    dailyRythmeIndiv: { date: AUJOURD_HUI, count: RYTHME_INDIV_POUR_STREAK + 3 },
    streak: { current: 1, longest: 1, lastDate: AUJOURD_HUI },
  })
  const r = applySession(
    s,
    { module: 'rythme', xpEarned: 10, medal: '🥉', meta: { individual: true } },
    AUJOURD_HUI,
  )
  assert.equal(r.streakValidated, false)
})

test('newRankId : renseigné seulement en cas de montée', () => {
  const sansMontee = applySession(etat(), { module: 'notes', xpEarned: 5, medal: '🎯' }, AUJOURD_HUI)
  assert.equal(sansMontee.rankedUp, false)
  assert.equal(sansMontee.newRankId, null)

  const avecMontee = applySession(etat(), { module: 'notes', xpEarned: 3000, medal: '🥇' }, AUJOURD_HUI)
  assert.equal(avecMontee.rankedUp, true)
  assert.equal(typeof avecMontee.newRankId, 'string')
})
