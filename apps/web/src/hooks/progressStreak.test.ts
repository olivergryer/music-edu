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
  theorieSeriesDuJour,
  resteAvantStreakTheorie,
  THEORIE_SERIES_POUR_STREAK,
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
  // Une série Rythme de 10 ou un Code de la route Théorie valide la journée :
  // la jauge des exercices isolés n'a plus lieu d'être.
  const s = etat({ streak: { current: 3, longest: 5, lastDate: AUJOURD_HUI } })
  assert.equal(resteAvantStreak(s, AUJOURD_HUI), 0)
})

test('resteAvantStreak : jamais négatif', () => {
  const s = etat({ dailyRythmeIndiv: { date: AUJOURD_HUI, count: 40 } })
  assert.ok(resteAvantStreak(s, AUJOURD_HUI) >= 0)
})

// ── streakValidated ──────────────────────────────────────────────────────────

test('streakValidated : une session pleine valide immédiatement', () => {
  // Sans `serieTheorie`, une session Théorie est un Code de la route (40 questions).
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

// ── Séries d'entraînement Théorie ────────────────────────────────────────────

test('theorieSeriesDuJour : compte du jour conservé, compte de la veille ignoré', () => {
  assert.equal(theorieSeriesDuJour(etat({ dailyTheorieSerie: { date: AUJOURD_HUI, count: 1 } }), AUJOURD_HUI), 1)
  assert.equal(theorieSeriesDuJour(etat({ dailyTheorieSerie: { date: HIER, count: 5 } }), AUJOURD_HUI), 0)
})

test('resteAvantStreakTheorie : décompte, plancher à 0, nul si journée validée', () => {
  assert.equal(resteAvantStreakTheorie(etat(), AUJOURD_HUI), THEORIE_SERIES_POUR_STREAK)
  const uneFaite = etat({ dailyTheorieSerie: { date: AUJOURD_HUI, count: 1 } })
  assert.equal(resteAvantStreakTheorie(uneFaite, AUJOURD_HUI), THEORIE_SERIES_POUR_STREAK - 1)
  const audela = etat({ dailyTheorieSerie: { date: AUJOURD_HUI, count: 9 } })
  assert.equal(resteAvantStreakTheorie(audela, AUJOURD_HUI), 0)
  const dejaValidee = etat({ streak: { current: 3, longest: 5, lastDate: AUJOURD_HUI } })
  assert.equal(resteAvantStreakTheorie(dejaValidee, AUJOURD_HUI), 0)
})

test('streakValidated : une seule série Théorie ne valide pas la journée', () => {
  const r = applySession(
    etat(),
    { module: 'theorie', xpEarned: 50, medal: '🥈', meta: { serieTheorie: true } },
    AUJOURD_HUI,
  )
  assert.equal(r.streakValidated, false)
  assert.equal(r.newState.dailyTheorieSerie.count, 1)
  assert.equal(r.newState.streak.lastDate, null)
})

test('streakValidated : vrai à la 2ᵉ série Théorie du jour', () => {
  const s = etat({ dailyTheorieSerie: { date: AUJOURD_HUI, count: THEORIE_SERIES_POUR_STREAK - 1 } })
  const r = applySession(
    s,
    { module: 'theorie', xpEarned: 50, medal: '🥈', meta: { serieTheorie: true } },
    AUJOURD_HUI,
  )
  assert.equal(r.streakValidated, true)
  assert.equal(r.newState.dailyTheorieSerie.count, THEORIE_SERIES_POUR_STREAK)
})

test('streakValidated : faux au-delà du seuil de séries Théorie', () => {
  // Sans ce garde-fou, chaque série suivante de la journée relancerait la célébration.
  const s = etat({
    dailyTheorieSerie: { date: AUJOURD_HUI, count: THEORIE_SERIES_POUR_STREAK + 2 },
    streak: { current: 1, longest: 1, lastDate: AUJOURD_HUI },
  })
  const r = applySession(
    s,
    { module: 'theorie', xpEarned: 50, medal: '🥈', meta: { serieTheorie: true } },
    AUJOURD_HUI,
  )
  assert.equal(r.streakValidated, false)
})

test('streakValidated : le compteur Théorie de la veille ne compte pas pour aujourd’hui', () => {
  // Une série hier + une série aujourd'hui ne doivent PAS valider : le compteur
  // repart de 1, il faut bien 2 séries dans la même journée.
  const s = etat({ dailyTheorieSerie: { date: HIER, count: 1 } })
  const r = applySession(
    s,
    { module: 'theorie', xpEarned: 50, medal: '🥈', meta: { serieTheorie: true } },
    AUJOURD_HUI,
  )
  assert.equal(r.streakValidated, false)
  assert.equal(r.newState.dailyTheorieSerie.count, 1)
})

test('streakValidated : le Code de la route valide même après une série d’entraînement', () => {
  const s = etat({ dailyTheorieSerie: { date: AUJOURD_HUI, count: 1 } })
  const r = applySession(s, { module: 'theorie', xpEarned: 400, medal: '🥇' }, AUJOURD_HUI)
  assert.equal(r.streakValidated, true)
})

test('newRankId : renseigné seulement en cas de montée', () => {
  const sansMontee = applySession(etat(), { module: 'notes', xpEarned: 5, medal: '🎯' }, AUJOURD_HUI)
  assert.equal(sansMontee.rankedUp, false)
  assert.equal(sansMontee.newRankId, null)

  const avecMontee = applySession(etat(), { module: 'notes', xpEarned: 3000, medal: '🥇' }, AUJOURD_HUI)
  assert.equal(avecMontee.rankedUp, true)
  assert.equal(typeof avecMontee.newRankId, 'string')
})
