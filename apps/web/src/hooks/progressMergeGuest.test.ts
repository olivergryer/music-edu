// ─── Tests : fusion de la progression invité dans un compte ───────────────────
// node --test "src/**/*.test.ts"
//
// mergeGuestInto reverse la progression locale d'un invité dans un compte (neuf à
// l'inscription) : XP additionnés, trophées en union, série la plus récente
// conservée, compteurs de module sommés.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { mergeGuestInto, DEFAULT_STATE, type ProgressState } from './progressLogic.ts'

function etat(patch: Partial<ProgressState> = {}): ProgressState {
  return { ...structuredClone(DEFAULT_STATE), ...patch }
}

test('fusion dans un compte neuf : reprend intégralement l’invité', () => {
  const guest = etat({
    xp: 250,
    trophies: ['premiere-serie'],
    streak: { current: 3, longest: 3, lastDate: '2026-08-18' },
    dailyRythmeIndiv: { date: '2026-08-18', count: 7 },
    modules: {
      ...DEFAULT_STATE.modules,
      rythme: { seriesPlayed: 2, exercisesPlayed: 7, xpTotal: 250 },
    },
  })
  const merged = mergeGuestInto(DEFAULT_STATE, guest)
  assert.equal(merged.xp, 250)
  assert.deepEqual(merged.trophies, ['premiere-serie'])
  assert.equal(merged.streak.current, 3)
  assert.equal(merged.streak.lastDate, '2026-08-18')
  assert.equal(merged.dailyRythmeIndiv.count, 7)
  assert.equal(merged.modules.rythme.exercisesPlayed, 7)
})

test('XP additionnés et trophées dédupliqués', () => {
  const account = etat({ xp: 100, trophies: ['duo'] })
  const guest = etat({ xp: 250, trophies: ['duo', 'premiere-serie'] })
  const merged = mergeGuestInto(account, guest)
  assert.equal(merged.xp, 350)
  assert.deepEqual([...merged.trophies].sort(), ['duo', 'premiere-serie'])
})

test('streak : série de la date la plus récente, longest = max', () => {
  const account = etat({ streak: { current: 5, longest: 9, lastDate: '2026-08-10' } })
  const guest = etat({ streak: { current: 2, longest: 4, lastDate: '2026-08-18' } })
  const merged = mergeGuestInto(account, guest)
  assert.equal(merged.streak.current, 2)          // invité plus récent
  assert.equal(merged.streak.lastDate, '2026-08-18')
  assert.equal(merged.streak.longest, 9)          // max des deux
})

test('compteur journalier : la date la plus récente l’emporte', () => {
  const account = etat({ dailyRythmeIndiv: { date: '2026-08-10', count: 4 } })
  const guest = etat({ dailyRythmeIndiv: { date: '2026-08-18', count: 6 } })
  const merged = mergeGuestInto(account, guest)
  assert.deepEqual(merged.dailyRythmeIndiv, { date: '2026-08-18', count: 6 })
})

test('modules : compteurs sommés', () => {
  const account = etat({ modules: { ...DEFAULT_STATE.modules, theorie: { sessionsPlayed: 3, xpTotal: 120 } } })
  const guest = etat({ modules: { ...DEFAULT_STATE.modules, theorie: { sessionsPlayed: 2, xpTotal: 80 } } })
  const merged = mergeGuestInto(account, guest)
  assert.equal(merged.modules.theorie.sessionsPlayed, 5)
  assert.equal(merged.modules.theorie.xpTotal, 200)
})
