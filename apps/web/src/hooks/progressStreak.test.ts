// ─── Tests : validation de la journée (streak) ────────────────────────────────
// node --test "src/**/*.test.ts"
//
// Couvre les points du jour (10 points valident la journée, cumulables entre
// modules), la jauge (curseur + multiplicateur), le rattrapage de série à 1, 2
// et 3 jours manqués, le signal `streakValidated` qui pilote la célébration, et
// le recalcul rétroactif depuis l'historique.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  applySession,
  pointsSession,
  pointsDuJour,
  curseurJauge,
  rattrapageDuJour,
  objectifDuJour,
  rejouerSerie,
  appliquerRecalculSerie,
  parametresRattrapes,
  POINTS_JOURNEE,
  VERSION_RECALCUL_SERIE,
  DEFAULT_STATE,
  type AddSessionParams,
  type EntreeSerie,
  type ProgressState,
  type Streak,
} from './progressLogic.ts'

const AUJOURD_HUI = '2026-08-16'
const HIER = '2026-08-15'

function etat(patch: Partial<ProgressState> = {}): ProgressState {
  return { ...DEFAULT_STATE, ...patch }
}

function serie(current: number, lastDate: string | null, longest = current): Streak {
  return { current, longest, lastDate, repair: null }
}

const EXO_RYTHME: AddSessionParams = { module: 'rythme', xpEarned: 10, medal: '🥉', meta: { individual: true } }
const SERIE_THEORIE: AddSessionParams = { module: 'theorie', xpEarned: 50, medal: '🥈', meta: { serieTheorie: true } }
const SESSION_PLEINE: AddSessionParams = { module: 'notes', xpEarned: 50, medal: '🥈' }

/** Enchaîne plusieurs sessions le même jour. */
function jouer(s: ProgressState, sessions: AddSessionParams[], jour = AUJOURD_HUI) {
  let r = applySession(s, sessions[0], jour)
  for (const p of sessions.slice(1)) r = applySession(r.newState, p, jour)
  return r
}

// ── Barème ───────────────────────────────────────────────────────────────────

test('pointsSession : 1 par exercice Rythme isolé, 5 par série Théorie, 10 sinon', () => {
  assert.equal(pointsSession('rythme', { individual: true }), 1)
  assert.equal(pointsSession('rythme', {}), POINTS_JOURNEE)
  assert.equal(pointsSession('theorie', { serieTheorie: true }), POINTS_JOURNEE / 2)
  assert.equal(pointsSession('theorie', {}), POINTS_JOURNEE)
  assert.equal(pointsSession('harmonie'), POINTS_JOURNEE)
})

test('pointsDuJour : compteur de la veille ignoré', () => {
  assert.equal(pointsDuJour(etat({ dailyPoints: { date: AUJOURD_HUI, count: 7 } }), AUJOURD_HUI), 7)
  assert.equal(pointsDuJour(etat({ dailyPoints: { date: HIER, count: 9 } }), AUJOURD_HUI), 0)
})

test('pointsDuJour : repli sur les anciens compteurs le jour du déploiement', () => {
  const s = etat({
    dailyRythmeIndiv: { date: AUJOURD_HUI, count: 3 },
    dailyTheorieSerie: { date: AUJOURD_HUI, count: 1 },
  })
  assert.equal(pointsDuJour(s, AUJOURD_HUI), 8)
  const dejaValidee = etat({ streak: serie(4, AUJOURD_HUI) })
  assert.equal(pointsDuJour(dejaValidee, AUJOURD_HUI), POINTS_JOURNEE)
})

// ── Série Rythme interrompue ─────────────────────────────────────────────────

const SERIE_7_SUR_10: AddSessionParams = {
  module: 'rythme', xpEarned: 420, medal: '🥈', meta: { serieInterrompue: 7 },
}

test('série interrompue : 1 point par exercice joué, XP créditée', () => {
  const r = applySession(etat(), SERIE_7_SUR_10, AUJOURD_HUI)
  assert.equal(r.newState.dailyPoints.count, 7)
  assert.equal(r.newState.xp, 420)
  assert.equal(r.historyEntry.points, 7)
})

test('série interrompue : ne compte pas comme série terminée', () => {
  const r = applySession(etat(), SERIE_7_SUR_10, AUJOURD_HUI)
  assert.equal(r.newState.modules.rythme.seriesPlayed, 0)
  assert.equal(r.newState.modules.rythme.exercisesPlayed, 7)
  assert.ok(!r.newTrophies.includes('first_series'))
})

test('série interrompue + 3 exercices isolés valident la journée', () => {
  const r = jouer(etat(), [SERIE_7_SUR_10, EXO_RYTHME, EXO_RYTHME, EXO_RYTHME])
  assert.equal(r.newState.streak.lastDate, AUJOURD_HUI)
})

test('session rattrapée : points gardés le jour même, perdus un autre jour', () => {
  const memeJour = parametresRattrapes({ date: AUJOURD_HUI, params: SERIE_7_SUR_10 }, AUJOURD_HUI)
  assert.equal(pointsSession(memeJour.module, memeJour.meta), 7)
  const veille = parametresRattrapes({ date: HIER, params: SERIE_7_SUR_10 }, AUJOURD_HUI)
  assert.equal(pointsSession(veille.module, veille.meta), 0)
  assert.equal(applySession(etat(), veille, AUJOURD_HUI).newState.xp, 420)
})

test('rejouerSerie : le champ `points` de l’historique prime sur le barème', () => {
  const entries = [e('2026-08-10', 'rythme', { points: 6 }), e('2026-08-10', 'rythme', { points: 4 })]
  assert.equal(rejouerSerie(entries, AUJOURD_HUI).streak.lastDate, '2026-08-10')
})

// ── Jauge ────────────────────────────────────────────────────────────────────

test('curseurJauge : repart de zéro au-delà de 10 avec un multiplicateur', () => {
  assert.deepEqual(curseurJauge(0), { curseur: 0, multiplicateur: 0 })
  assert.deepEqual(curseurJauge(7), { curseur: 7, multiplicateur: 0 })
  assert.deepEqual(curseurJauge(10), { curseur: 10, multiplicateur: 1 })
  assert.deepEqual(curseurJauge(15), { curseur: 5, multiplicateur: 1 })
  assert.deepEqual(curseurJauge(25), { curseur: 5, multiplicateur: 2 })
  assert.deepEqual(curseurJauge(30), { curseur: 10, multiplicateur: 3 })
})

// ── Validation de la journée ─────────────────────────────────────────────────

test('streakValidated : une session pleine valide immédiatement', () => {
  const r = applySession(etat(), { module: 'theorie', xpEarned: 100, medal: '🥇' }, AUJOURD_HUI)
  assert.equal(r.streakValidated, true)
  assert.equal(r.newState.streak.lastDate, AUJOURD_HUI)
  assert.equal(r.newState.dailyPoints.count, POINTS_JOURNEE)
})

test('streakValidated : faux si la journée était DÉJÀ validée', () => {
  // Sans le test sur l'état précédent, on célébrerait à chaque session du jour.
  const s = etat({ streak: serie(2, AUJOURD_HUI, 4), dailyPoints: { date: AUJOURD_HUI, count: 10 } })
  const r = applySession(s, SESSION_PLEINE, AUJOURD_HUI)
  assert.equal(r.streakValidated, false)
  assert.equal(r.newState.dailyPoints.count, 20)
})

test('streakValidated : 9 exercices isolés ne valident pas, le 10ᵉ oui, le 11ᵉ non', () => {
  const neuf = jouer(etat(), Array(9).fill(EXO_RYTHME))
  assert.equal(neuf.newState.streak.lastDate, null)
  const dix = applySession(neuf.newState, EXO_RYTHME, AUJOURD_HUI)
  assert.equal(dix.streakValidated, true)
  const onze = applySession(dix.newState, EXO_RYTHME, AUJOURD_HUI)
  assert.equal(onze.streakValidated, false)
  assert.equal(onze.newState.dailyPoints.count, 11)
})

test('streakValidated : une série Théorie seule ne valide pas, deux oui', () => {
  const une = applySession(etat(), SERIE_THEORIE, AUJOURD_HUI)
  assert.equal(une.streakValidated, false)
  const deux = applySession(une.newState, SERIE_THEORIE, AUJOURD_HUI)
  assert.equal(deux.streakValidated, true)
})

test('streakValidated : les modules se cumulent (1 série Théorie + 5 exercices Rythme)', () => {
  const r = jouer(etat(), [SERIE_THEORIE, ...Array(5).fill(EXO_RYTHME)])
  assert.equal(r.newState.streak.lastDate, AUJOURD_HUI)
})

test('streakValidated : les points de la veille ne comptent pas pour aujourd’hui', () => {
  const s = etat({ dailyPoints: { date: HIER, count: 5 } })
  const r = applySession(s, SERIE_THEORIE, AUJOURD_HUI)
  assert.equal(r.streakValidated, false)
  assert.equal(r.newState.dailyPoints.count, 5)
})

test('série : prolongée le lendemain, remise à 1 après une rupture sans rattrapage', () => {
  const lendemain = applySession(etat({ streak: serie(4, HIER) }), SESSION_PLEINE, AUJOURD_HUI)
  assert.equal(lendemain.newState.streak.current, 5)
  const apresRupture = applySession(etat({ streak: serie(4, '2026-08-10') }), SESSION_PLEINE, AUJOURD_HUI)
  assert.equal(apresRupture.newState.streak.current, 1)
})

// ── Rattrapage ───────────────────────────────────────────────────────────────

test('rattrapageDuJour : objectif 3×, 8×, 15× selon les jours manqués, rien au-delà', () => {
  assert.equal(rattrapageDuJour(serie(12, HIER), AUJOURD_HUI), null)
  assert.equal(rattrapageDuJour(serie(12, '2026-08-14'), AUJOURD_HUI)?.target, 30)
  assert.equal(rattrapageDuJour(serie(12, '2026-08-13'), AUJOURD_HUI)?.target, 80)
  assert.equal(rattrapageDuJour(serie(12, '2026-08-12'), AUJOURD_HUI)?.target, 150)
  assert.equal(rattrapageDuJour(serie(12, '2026-08-11'), AUJOURD_HUI), null)
  assert.equal(rattrapageDuJour(serie(0, null), AUJOURD_HUI), null)
})

test('objectifDuJour : 10 hors rattrapage, objectif de rattrapage sinon', () => {
  assert.equal(objectifDuJour(serie(5, HIER), AUJOURD_HUI), POINTS_JOURNEE)
  assert.equal(objectifDuJour(serie(5, '2026-08-13'), AUJOURD_HUI), 80)
})

test('rattrapage : 1 jour manqué, 3 journées le jour de reprise → série rétablie, jour manqué compris', () => {
  const s = etat({ streak: serie(12, '2026-08-14') })
  const r = jouer(s, [SESSION_PLEINE, SESSION_PLEINE, SESSION_PLEINE])
  assert.equal(r.streakRepaired, true)
  assert.equal(r.historyEntry.streakRepaired, true)
  assert.equal(r.newState.streak.current, 12 + 1 + 1)
  assert.equal(r.newState.streak.longest, 14)
  assert.equal(r.newState.streak.repair?.done, true)
})

test('rattrapage : objectif non atteint → nouvelle série de 1, rattrapage mémorisé', () => {
  const s = etat({ streak: serie(12, '2026-08-14') })
  const r = jouer(s, [SESSION_PLEINE, SESSION_PLEINE])
  assert.equal(r.streakRepaired, false)
  assert.equal(r.newState.streak.current, 1)
  // La série rompue survit à la validation de la journée : la 3ᵉ session répare encore.
  assert.equal(rattrapageDuJour(r.newState.streak, AUJOURD_HUI)?.previous, 12)
  const fin = applySession(r.newState, SESSION_PLEINE, AUJOURD_HUI)
  assert.equal(fin.streakRepaired, true)
  assert.equal(fin.newState.streak.current, 14)
})

test('rattrapage : 3 jours manqués exigent 150 points', () => {
  const s = etat({ streak: serie(20, '2026-08-12') })
  const presque = jouer(s, Array(14).fill(SESSION_PLEINE))
  assert.equal(presque.newState.streak.current, 1)
  const fin = jouer(presque.newState, [...Array(9).fill(EXO_RYTHME), EXO_RYTHME])
  assert.equal(fin.streakRepaired, true)
  assert.equal(fin.newState.streak.current, 20 + 3 + 1)
})

test('rattrapage : pas de deuxième réparation ni de célébration répétée', () => {
  const s = etat({ streak: serie(12, '2026-08-14') })
  const r = jouer(s, Array(4).fill(SESSION_PLEINE))
  assert.equal(r.streakRepaired, false)
  assert.equal(r.newState.streak.current, 14)
})

test('rattrapage : ne vaut que le jour de reprise', () => {
  const s = etat({ streak: serie(12, '2026-08-14') })
  const reprise = jouer(s, [SESSION_PLEINE])
  assert.equal(reprise.newState.streak.current, 1)
  // Le lendemain, plus rien à réparer : la série repart de 1 → 2.
  const lendemain = applySession(reprise.newState, SESSION_PLEINE, '2026-08-17')
  assert.equal(rattrapageDuJour(lendemain.newState.streak, '2026-08-17'), null)
  assert.equal(lendemain.newState.streak.current, 2)
})

// ── Recalcul rétroactif ──────────────────────────────────────────────────────

const e = (date: string, module: EntreeSerie['module'] = 'notes', extra: Partial<EntreeSerie> = {}): EntreeSerie =>
  ({ date, module, ...extra })

test('rejouerSerie : jours consécutifs, exercices isolés et séries Théorie reconnus', () => {
  const entries = [
    e('2026-08-10'),
    ...Array(10).fill(e('2026-08-11', 'rythme', { individual: true })),
    e('2026-08-12', 'theorie', { mode: 'Entraînement' }),
    e('2026-08-12', 'theorie', { mode: 'Entraînement' }),
    e('2026-08-13', 'theorie', { mode: 'Entraînement' }), // 5 points : jour non validé
  ]
  const { streak } = rejouerSerie(entries, AUJOURD_HUI)
  assert.equal(streak.current, 3)
  assert.equal(streak.lastDate, '2026-08-12')
})

test('rejouerSerie : applique la réparation du passé', () => {
  const entries = [
    e('2026-08-01'), e('2026-08-02'), e('2026-08-03'),
    // 04 et 05 manqués, reprise le 06 avec 8 journées
    ...Array(8).fill(e('2026-08-06')),
    e('2026-08-07'),
  ]
  const { streak } = rejouerSerie(entries, AUJOURD_HUI)
  assert.equal(streak.current, 3 + 2 + 1 + 1)
})

test('appliquerRecalculSerie : relève la série, attribue les trophées de série, pose le drapeau', () => {
  const entries = [
    ...['2026-08-08', '2026-08-09', '2026-08-10', '2026-08-11'].map(d => e(d)),
    ...Array(3).fill(e('2026-08-13')), // 12 manqué, réparé le 13
    e('2026-08-14'), e('2026-08-15'),
  ]
  const s = etat({ streak: serie(3, '2026-08-15', 4) })
  const { state, nouveauxTrophees } = appliquerRecalculSerie(s, entries, AUJOURD_HUI)
  assert.equal(state.streak.current, 4 + 1 + 1 + 2)
  assert.equal(state.streak.longest, 8)
  assert.deepEqual(nouveauxTrophees, ['portee'])
  assert.ok(state.trophies.includes('portee'))
  assert.equal(state.serieRecalculee, VERSION_RECALCUL_SERIE)
})

test('appliquerRecalculSerie : ne fait jamais baisser la série', () => {
  // Série venue d'une progression invité, absente de l'historique.
  const s = etat({ streak: serie(9, '2026-08-15', 9) })
  const { state } = appliquerRecalculSerie(s, [e('2026-08-15')], AUJOURD_HUI)
  assert.equal(state.streak.current, 9)
  assert.equal(state.streak.longest, 9)
})

test('appliquerRecalculSerie : reprend les points du jour depuis l’historique', () => {
  const entries = Array(4).fill(e(AUJOURD_HUI, 'rythme', { individual: true }))
  const { state } = appliquerRecalculSerie(etat(), entries, AUJOURD_HUI)
  assert.equal(pointsDuJour(state, AUJOURD_HUI), 4)
})

test('newRankId : renseigné seulement en cas de montée', () => {
  const sansMontee = applySession(etat(), { module: 'notes', xpEarned: 5, medal: '🎯' }, AUJOURD_HUI)
  assert.equal(sansMontee.rankedUp, false)
  assert.equal(sansMontee.newRankId, null)

  const avecMontee = applySession(etat(), { module: 'notes', xpEarned: 3000, medal: '🥇' }, AUJOURD_HUI)
  assert.equal(avecMontee.rankedUp, true)
  assert.equal(typeof avecMontee.newRankId, 'string')
})
