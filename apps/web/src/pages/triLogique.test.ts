// ─── Tests : tri des listes de comptes ───────────────────────────────────────
// node --test "src/**/*.test.ts"
//
// Couvre les six critères, l'inversion du sens, le rejet des données absentes
// en fin de liste et le départage par nom.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { trier, CRITERES } from './triLogique.ts'
import { todayStr, localDateStr } from '../hooks/progressLogic.ts'
import type { EleveData, EleveProgress } from './CarteEleve.ts'

const AUJOURDHUI = todayStr()
// `previousDayStr` n'est pas exporté — et ce test n'est pas une raison d'élargir
// la surface publique de progressLogic.
const HIER = localDateStr(new Date(Date.now() - 86_400_000))

function compte(
  nom: string,
  p: Partial<{ xp: number; xpPeak: number; current: number; longest: number; lastDate: string | null; creeLe: string }> = {},
): EleveData {
  const progress: EleveProgress = {
    xp: p.xp ?? 0,
    xpPeak: p.xpPeak,
    streak: {
      current: p.current ?? 0,
      longest: p.longest ?? 0,
      lastDate: p.lastDate === undefined ? AUJOURDHUI : p.lastDate,
    },
    modules: {
      rythme: { seriesPlayed: 0, xpTotal: 0 },
      theorie: { sessionsPlayed: 0, xpTotal: 0 },
      accordeur: { sessionsPlayed: 0, xpTotal: 0 },
      notes: { sessionsPlayed: 0, xpTotal: 0 },
    },
  }
  return {
    uid: nom,
    displayName: nom,
    progress,
    lastSession: null,
    creeLe: p.creeLe ? new Date(p.creeLe) : null,
    xpAffiche: p.xp ?? 0,
  }
}

const noms = (l: EleveData[]) => l.map(e => e.displayName)

test('xpActuel : du plus élevé au plus faible, puis inversion', () => {
  const l = [compte('Bas', { xp: 10 }), compte('Haut', { xp: 900 }), compte('Moyen', { xp: 300 })]
  assert.deepEqual(noms(trier(l, 'xpActuel', true)), ['Haut', 'Moyen', 'Bas'])
  assert.deepEqual(noms(trier(l, 'xpActuel', false)), ['Bas', 'Moyen', 'Haut'])
})

test('xpEver : classe sur le pic, pas sur l’XP courant', () => {
  // Un élève très actif puis absent : son XP a fondu, son pic non.
  const l = [
    compte('Assidu-absent', { xp: 50, xpPeak: 5000 }),
    compte('Régulier', { xp: 800, xpPeak: 800 }),
  ]
  assert.deepEqual(noms(trier(l, 'xpEver', true)), ['Assidu-absent', 'Régulier'])
  assert.deepEqual(noms(trier(l, 'xpActuel', true)), ['Régulier', 'Assidu-absent'])
})

test('serieActuelle : une série périmée vaut 0, même si `current` est resté haut', () => {
  const l = [
    compte('Périmée', { current: 40, lastDate: '2020-01-01' }),
    compte('Vivante', { current: 3, lastDate: HIER }),
  ]
  assert.deepEqual(noms(trier(l, 'serieActuelle', true)), ['Vivante', 'Périmée'])
})

test('serieMax : le record survit à la rupture de série', () => {
  const l = [
    compte('Record', { current: 0, longest: 60, lastDate: '2020-01-01' }),
    compte('EnCours', { current: 5, longest: 5 }),
  ]
  assert.deepEqual(noms(trier(l, 'serieMax', true)), ['Record', 'EnCours'])
})

test('activite : la plus récente d’abord', () => {
  const l = [
    compte('Vieux', { lastDate: '2026-01-05' }),
    compte('Recent', { lastDate: AUJOURDHUI }),
    compte('Milieu', { lastDate: '2026-06-30' }),
  ]
  assert.deepEqual(noms(trier(l, 'activite', true)), ['Recent', 'Milieu', 'Vieux'])
})

test('inscription : la plus récente d’abord', () => {
  const l = [
    compte('Ancien', { creeLe: '2026-04-29' }),
    compte('Nouveau', { creeLe: '2026-10-03' }),
  ]
  assert.deepEqual(noms(trier(l, 'inscription', true)), ['Nouveau', 'Ancien'])
})

test('données absentes : toujours en fin de liste, dans les DEUX sens', () => {
  // Un compte sans date d'inscription ne doit pas prendre la tête d'un tri
  // ascendant au prétexte que son absence vaudrait zéro.
  const l = [
    compte('Sans', {}),                        // creeLe null
    compte('Avec', { creeLe: '2026-04-29' }),
  ]
  assert.deepEqual(noms(trier(l, 'inscription', true)), ['Avec', 'Sans'])
  assert.deepEqual(noms(trier(l, 'inscription', false)), ['Avec', 'Sans'])
})

test('ex æquo départagés par nom', () => {
  const l = [compte('Zoe', { xp: 100 }), compte('Alice', { xp: 100 }), compte('Marc', { xp: 100 })]
  assert.deepEqual(noms(trier(l, 'xpActuel', true)), ['Alice', 'Marc', 'Zoe'])
})

test('trier ne modifie pas le tableau d’origine', () => {
  const l = [compte('B', { xp: 1 }), compte('A', { xp: 2 })]
  const avant = noms(l)
  trier(l, 'xpActuel', true)
  assert.deepEqual(noms(l), avant)
})

test('les six critères annoncés sont tous gérés', () => {
  const l = [compte('A', { xp: 1 }), compte('B', { xp: 2 })]
  for (const c of CRITERES) {
    assert.equal(trier(l, c.id, true).length, 2, `critère ${c.id}`)
  }
  assert.equal(CRITERES.length, 6)
})
