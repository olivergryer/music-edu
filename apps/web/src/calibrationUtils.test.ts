import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aggregateProfilesFromSessions, CENTER_PARAMS, PARAM_KEYS } from './calibrationUtils.js'

// Jeu de plages identiques sur tous les paramètres (raccourci de test).
const rs = (min: number, max: number) =>
  Object.fromEntries(PARAM_KEYS.map(k => [k, { min, max, mid: (min + max) / 2 }]))

test('intersection non vide → centre de l’intersection', () => {
  const sessions = [
    { exercises: [{ id: 'gamme_lie_noire_60', acceptableRanges: rs(0.6, 0.8) }] },
    { exercises: [{ id: 'gamme_lie_noire_60', acceptableRanges: rs(0.7, 0.9) }] },
  ]
  const p = aggregateProfilesFromSessions(sessions)
  // legato ∩ = [0.7, 0.8] → centre 0.75
  assert.equal(p.legato.clarityThreshold, 0.75)
  assert.deepEqual(p.legato.conflicts, [])
  assert.equal(p.legato.details.clarityThreshold.source, 'intersection')
})

test('intersection vide → conflit + fallback plage la plus large', () => {
  const sessions = [
    { exercises: [{ id: 'gamme_lie_noire_60', acceptableRanges: { clarityThreshold: { min: 0.50, max: 0.60, mid: 0.55 } } }] },
    { exercises: [{ id: 'gamme_lie_croche',  acceptableRanges: { clarityThreshold: { min: 0.80, max: 0.95, mid: 0.875 } } }] },
  ]
  const p = aggregateProfilesFromSessions(sessions)
  assert.ok(p.legato.conflicts.includes('clarityThreshold'))
  // plus large = [0.80,0.95] → mid 0.875
  assert.equal(p.legato.clarityThreshold, 0.875)
  assert.equal(p.legato.details.clarityThreshold.source, 'fallback-widest')
})

test('aucune plage → valeur centrale + conflit', () => {
  const p = aggregateProfilesFromSessions([{ exercises: [] }])
  assert.equal(p.legato.gateLevel, CENTER_PARAMS.gateLevel)
  assert.ok(p.legato.conflicts.includes('gateLevel'))
  assert.equal(p.legato.details.gateLevel.source, 'fallback-center')
})
