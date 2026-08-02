import test from 'node:test'
import assert from 'node:assert/strict'

import {
  QUINTE_BARREE,
  chiffrageDe,
  chiffrageplat,
  chiffrer,
  estSeptiemeDeDominante,
  romainChiffre,
} from './chiffrage.ts'
import * as obsolete from './chiffrageObsolete.ts'
import { formatGabarit, parseGabarit } from './gabarits.ts'
import { NIVEAUX } from './niveaux.ts'
import { DEGRES, creerAccord, type Degre, type Mode, type Renversement } from './types.ts'

const MODES: Mode[] = ['majeur', 'mineur']
const acc = (degre: Degre, renversement: Renversement = 0, septieme = false, modeInverse = false) =>
  creerAccord(0, { degre, renversement, septieme, modeInverse })

// ─── Les trois sons ──────────────────────────────────────────────────────────

test('trois sons : 5 · 6 · 6/4', () => {
  assert.deepEqual(chiffrageDe(acc(1, 0)).etages, ['5'])
  assert.deepEqual(chiffrageDe(acc(1, 1)).etages, ['6'])
  assert.deepEqual(chiffrageDe(acc(1, 2)).etages, ['6', '4'])
})

test('les trois formes valent sur les sept degrés et les deux modes', () => {
  for (const mode of MODES) {
    for (const degre of DEGRES) {
      for (const r of [0, 1, 2] as Renversement[]) {
        const plat = chiffrer(acc(degre, r), mode)
        assert.ok(plat.startsWith(romainChiffre(degre, mode)), plat)
        assert.match(plat, /(5|6|6\/4)$/, plat)
      }
    }
  }
})

// ─── La septième de dominante ────────────────────────────────────────────────
//
// LA table, vérifiée entrée par entrée. Le « + » marque la sensible, et le
// chiffre dit à quel intervalle elle se trouve au-dessus de la basse.

test('septième de dominante : 7/+ · 6/5̸ · +6 · +4', () => {
  assert.deepEqual(chiffrageDe(acc(5, 0, true)).etages, ['7', '+'])
  assert.deepEqual(chiffrageDe(acc(5, 1, true)).etages, ['6', QUINTE_BARREE])
  assert.deepEqual(chiffrageDe(acc(5, 2, true)).etages, ['+6'])
  assert.deepEqual(chiffrageDe(acc(5, 3, true)).etages, ['+4'])
})

// V est majeur dans les deux modes (sensible haussée en mineur) : la table vaut
// donc des deux côtés, sans exception.
test('la table de dominante vaut en majeur comme en mineur', () => {
  for (const mode of MODES) {
    assert.equal(chiffrer(acc(5, 0, true), mode), 'V 7/+')
    assert.equal(chiffrer(acc(5, 1, true), mode), 'V 6/5̸')
    assert.equal(chiffrer(acc(5, 2, true), mode), 'V +6')
    assert.equal(chiffrer(acc(5, 3, true), mode), 'V +4')
  }
})

// ─── Les septièmes ordinaires ────────────────────────────────────────────────

test('septièmes ordinaires : 7 · 6/5 · 4/3 · 2, sans + ni barre', () => {
  // ii7 apparaît au niveau 6, IV7 au niveau 7.
  for (const degre of [2, 4] as Degre[]) {
    assert.deepEqual(chiffrageDe(acc(degre, 0, true)).etages, ['7'])
    assert.deepEqual(chiffrageDe(acc(degre, 1, true)).etages, ['6', '5'])
    assert.deepEqual(chiffrageDe(acc(degre, 2, true)).etages, ['4', '3'])
    assert.deepEqual(chiffrageDe(acc(degre, 3, true)).etages, ['2'])
  }
})

test('aucun degré hors V ne porte le + ni la quinte barrée', () => {
  for (const degre of DEGRES) {
    if (degre === 5) continue
    for (const r of [0, 1, 2, 3] as Renversement[]) {
      const plat = chiffrageplat(acc(degre, r, true))
      assert.ok(!plat.includes('+'), `degré ${degre} renv. ${r} : ${plat}`)
      assert.ok(!plat.includes(QUINTE_BARREE), `degré ${degre} renv. ${r} : ${plat}`)
    }
  }
})

// La bascule majeur→mineur du moteur de perturbation détruit la sensible : le
// « + » n'aurait plus rien à marquer.
test('un V7 à qualité inversée retombe sur les figures ordinaires', () => {
  assert.equal(estSeptiemeDeDominante(acc(5, 0, true)), true)
  assert.equal(estSeptiemeDeDominante(acc(5, 0, true, true)), false)

  assert.deepEqual(chiffrageDe(acc(5, 0, true, true)).etages, ['7'])
  assert.equal(chiffrer(acc(5, 0, true, true), 'majeur'), 'V 7 ~')
})

// ─── Le chiffre romain — inchangé par la migration ───────────────────────────

test('la casse et le ° restent dérivés de la qualité', () => {
  assert.equal(romainChiffre(1, 'majeur'), 'I')
  assert.equal(romainChiffre(2, 'majeur'), 'ii')
  assert.equal(romainChiffre(7, 'majeur'), 'vii°')
  assert.equal(romainChiffre(1, 'mineur'), 'i')
  assert.equal(romainChiffre(3, 'mineur'), 'III') // III naturel : majeur
  assert.equal(romainChiffre(2, 'mineur'), 'ii°')
})

// ─── La syntaxe SOURCE des gabarits n'a pas bougé ────────────────────────────
//
// `gabarits.ts` décrit une syntaxe de SAISIE, `chiffrage.ts` une notation
// d'AFFICHAGE. Les confondre obligerait à réécrire toutes les formules.

test('formatGabarit reste l’inverse de parseGabarit sur toute la table', () => {
  for (const spec of NIVEAUX) {
    for (const gabarit of spec.gabarits ?? []) {
      assert.equal(formatGabarit(parseGabarit(gabarit)), gabarit, gabarit)
    }
  }
})

test('l’alias de saisie +4 vise bien le 3e renversement', () => {
  const [accord] = parseGabarit('V+4')
  assert.equal(accord.renversement, 3)
  assert.equal(accord.septieme, true)
  // Et son affichage est cohérent avec la table.
  assert.equal(chiffrageplat(accord), '+4')
})

test('l’alias de saisie +6 vise le 2e renversement', () => {
  const [accord] = parseGabarit('V+6')
  assert.equal(accord.renversement, 2)
  assert.equal(accord.septieme, true)
  assert.equal(chiffrageplat(accord), '+6')
})

// ─── Le module obsolète ──────────────────────────────────────────────────────
//
// Gardé « au cas où » à la demande de Matthieu. Sans test il pourrirait en
// silence et ne fonctionnerait plus le jour où on en aurait besoin.

test('chiffrageObsolete rend toujours l’ancienne notation anglo-saxonne', () => {
  assert.equal(obsolete.chiffrer(acc(1, 0), 'majeur'), 'I')
  assert.equal(obsolete.chiffrer(acc(1, 2), 'majeur'), 'I64')
  assert.equal(obsolete.chiffrer(acc(5, 0, true), 'majeur'), 'V7')
  assert.equal(obsolete.chiffrer(acc(5, 1, true), 'majeur'), 'V65')
  assert.equal(obsolete.chiffrer(acc(5, 2, true), 'majeur'), 'V43')
  assert.equal(obsolete.chiffrer(acc(5, 3, true), 'majeur'), 'V2')
  assert.equal(obsolete.chiffrer(acc(7, 1), 'majeur'), 'vii°6')
  assert.equal(obsolete.romainChiffre(3, 'mineur'), 'III')
})

test('les deux notations diffèrent bien — la migration a eu lieu', () => {
  const v7 = acc(5, 2, true)
  assert.notEqual(chiffrer(v7, 'majeur'), obsolete.chiffrer(v7, 'majeur'))
  assert.equal(obsolete.chiffrer(v7, 'majeur'), 'V43')
  assert.equal(chiffrer(v7, 'majeur'), 'V +6')
})
