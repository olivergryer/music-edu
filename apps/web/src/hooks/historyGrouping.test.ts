// ─── Tests : regroupement de l'historique du tableau de bord ──────────────────
// node --test "src/**/*.test.ts"
//
// Le piège central : l'historique en base MÉLANGE deux générations d'entrées.
// Celles écrites avant l'ajout des détails n'ont ni `items`, ni `level`, ni
// `streakValidated`. Chaque test ci-dessous vérifie que leur présence ne casse
// rien — c'est le cas réel de tout compte existant.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { groupHistory, joursValidantStreak, iconeMedaille } from './historyGrouping.ts'
import type { HistoryEntry } from './progressLogic.ts'

function entree(over: Partial<HistoryEntry> = {}): HistoryEntry {
  return { date: '2026-08-19', module: 'rythme', xp: 100, medal: '🥈', ...over }
}

test('sessions consécutives du même module et du même jour : un seul groupe', () => {
  const g = groupHistory([
    entree({ xp: 100, items: 1, level: 'C1/2' }),
    entree({ xp: 150, items: 1, level: 'C1/2' }),
    entree({ xp: 120, items: 1, level: 'C1/3' }),
  ])
  assert.equal(g.length, 1)
  assert.equal(g[0].count, 3)
  assert.equal(g[0].xp, 370)
  assert.equal(g[0].items, 3)
  assert.deepEqual(g[0].levels, ['C1/2', 'C1/3'])
})

test('un module différent coupe le groupe, même dans la journée', () => {
  const g = groupHistory([
    entree({ module: 'rythme' }),
    entree({ module: 'theorie' }),
    entree({ module: 'rythme' }),
  ])
  assert.equal(g.length, 3)
  assert.deepEqual(g.map(x => x.module), ['rythme', 'theorie', 'rythme'])
})

test('une date différente coupe le groupe', () => {
  const g = groupHistory([
    entree({ date: '2026-08-19' }),
    entree({ date: '2026-08-18' }),
  ])
  assert.equal(g.length, 2)
})

test('la meilleure médaille du groupe est retenue, emoji ou mot', () => {
  const g = groupHistory([
    entree({ medal: '🥉' }),
    entree({ medal: '🥇' }),
    entree({ medal: '🎯' }),
  ])
  assert.equal(g[0].medal, '🥇')

  // Notes et Harmonie écrivent des mots : les deux formes coexistent en base.
  const mots = groupHistory([
    entree({ module: 'notes', medal: 'bronze' }),
    entree({ module: 'notes', medal: 'or' }),
  ])
  assert.equal(mots[0].medal, 'or')
})

test('une entrée sans `items` n’annule pas le total des autres', () => {
  // Le cas qui casse une somme naïve : `undefined` au milieu du groupe.
  const g = groupHistory([
    entree({ items: 10 }),
    entree({}),            // ancienne entrée, sans compteur
    entree({ items: 5 }),
  ])
  assert.equal(g[0].items, 15)
  assert.equal(g[0].count, 3)
})

test('un groupe entièrement ancien a `items` à null, pas à zéro', () => {
  // `null` = « on ne sait pas », et se distingue de 0 = « aucun item ».
  // L'affichage doit pouvoir choisir de dire « 2 sessions » plutôt que
  // « 0 exercice », qui serait faux.
  const g = groupHistory([entree({}), entree({})])
  assert.equal(g[0].items, null)
})

test('le groupe est validant dès qu’une seule de ses sessions l’est', () => {
  const g = groupHistory([
    entree({}),
    entree({ streakValidated: true }),
    entree({}),
  ])
  assert.equal(g[0].streakValidated, true)
})

test('`single` n’est renseigné que pour un groupe d’une seule session', () => {
  const seul = groupHistory([entree({ score: '37/40' })])
  assert.equal(seul[0].single?.score, '37/40')

  const multiple = groupHistory([entree({}), entree({})])
  assert.equal(multiple[0].single, null)
})

test('niveaux dédoublonnés, dans l’ordre d’apparition', () => {
  const g = groupHistory([
    entree({ level: 'C1/3' }),
    entree({ level: 'C1/2' }),
    entree({ level: 'C1/3' }),
  ])
  assert.deepEqual(g[0].levels, ['C1/3', 'C1/2'])
})

test('historique vide', () => {
  assert.deepEqual(groupHistory([]), [])
})

test('joursValidantStreak ne retient que les dates marquées', () => {
  const jours = joursValidantStreak([
    entree({ date: '2026-08-19', streakValidated: true }),
    entree({ date: '2026-08-18' }),
    entree({ date: '2026-08-17', streakValidated: true }),
  ])
  assert.deepEqual([...jours].sort(), ['2026-08-17', '2026-08-19'])
})

test('iconeMedaille traduit les mots et laisse les emojis intacts', () => {
  assert.equal(iconeMedaille('or'), '🥇')
  assert.equal(iconeMedaille('argent'), '🥈')
  assert.equal(iconeMedaille('bronze'), '🥉')
  assert.equal(iconeMedaille('🥇'), '🥇')
  assert.equal(iconeMedaille('🎯'), '🎯')
})
