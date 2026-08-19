import test from 'node:test'
import assert from 'node:assert/strict'

import {
  LIBELLES_MODE_SESSION,
  MODES_SESSION,
  estModeSession,
  modesDeSession,
} from './modeSession.ts'
import { construireSession } from './detection.ts'
import { construireSessionDictee } from './dictee.ts'
import { construireSessionBinaire, NIVEAUX_BINAIRE } from './binaire.ts'
import { construireSessionFlux, NIVEAU_MIN_FLUX } from './flux.ts'
import { construireSessionCadences } from './cadences.ts'
import type { Mode } from './types.ts'

const MODES: Mode[] = ['majeur', 'mineur']

test('estModeSession ne reconnaît que les trois positions', () => {
  assert.equal(estModeSession('majeur'), true)
  assert.equal(estModeSession('mineur'), true)
  assert.equal(estModeSession('les_deux'), true)
  assert.equal(estModeSession('LES_DEUX'), false)
  assert.equal(estModeSession(null), false)
  // Les trois positions sont libellées : une position sans libellé serait vide
  // à l'écran.
  for (const m of MODES_SESSION) assert.ok(LIBELLES_MODE_SESSION[m].length > 0)
})

// ─── Le tirage ───────────────────────────────────────────────────────────────

test('un mode simple donne une session entièrement dans ce mode', () => {
  for (const mode of MODES) {
    assert.deepEqual(
      modesDeSession(mode, 10, 42),
      Array.from({ length: 10 }, () => mode),
    )
  }
})

test('« les deux » : autant de majeurs que de mineurs', () => {
  for (const n of [2, 4, 10, 20]) {
    const modes = modesDeSession('les_deux', n, 7)
    assert.equal(modes.length, n)
    assert.equal(modes.filter((m) => m === 'majeur').length, n / 2)
  }
})

test('« les deux » : un nombre impair se répartit à un près', () => {
  const modes = modesDeSession('les_deux', 5, 3)
  const majeurs = modes.filter((m) => m === 'majeur').length
  assert.equal(majeurs, 3)
  assert.equal(modes.length - majeurs, 2)
})

// Une alternance stricte serait équilibrée mais devinable : l'élève répondrait
// au rythme et non à l'oreille. C'est la raison d'être du mélange.
test('« les deux » ne produit pas une alternance stricte', () => {
  const alterne = (modes: Mode[]) => modes.every((m, i) => i === 0 || m !== modes[i - 1])
  const graines = [1, 2, 3, 4, 5, 6, 7, 8]
  assert.ok(
    graines.some((g) => !alterne(modesDeSession('les_deux', 10, g))),
    'toutes les graines alternent strictement',
  )
})

test('le tirage est déterministe par graine', () => {
  assert.deepEqual(modesDeSession('les_deux', 10, 99), modesDeSession('les_deux', 10, 99))
  assert.notDeepEqual(modesDeSession('les_deux', 10, 99), modesDeSession('les_deux', 10, 100))
})

// ⚠ Le mélange des modes ne doit pas suivre celui des réponses du binaire, qui
// emploie la même graine : les deux tirages seraient corrélés et le mode
// annoncerait la réponse.
test('le mélange des modes n’est pas celui des réponses du binaire', () => {
  const modes = modesDeSession('les_deux', 10, 5).map((m) => (m === 'majeur' ? 0 : 1))
  const items = construireSessionBinaire('les_deux', 4, 5)
  const reponses = items.map((i) => i.reponse)
  assert.notDeepEqual(modes, reponses)
})

// ─── L'invariant de non-régression ───────────────────────────────────────────
//
// `Mode ⊂ ModeSession` : les cinq builders ont élargi leur paramètre, donc tout
// appel existant doit se comporter EXACTEMENT comme avant. Si ce test tombe, une
// session « majeur » s'est mise à produire du mineur.

test('les cinq builders, en mode simple, ne produisent que ce mode', () => {
  for (const mode of MODES) {
    for (const item of construireSession(mode, 4, 31)) {
      assert.equal(item.progression.mode, mode, 'détection')
    }
    for (const item of construireSessionDictee(mode, 31)) {
      assert.equal(item.progression.mode, mode, 'dictée')
    }
    for (const niveau of NIVEAUX_BINAIRE) {
      for (const item of construireSessionBinaire(mode, niveau, 31)) {
        assert.equal(item.progression.mode, mode, 'binaire')
      }
    }
    for (const item of construireSessionFlux(mode, NIVEAU_MIN_FLUX, 31)) {
      assert.equal(item.progression.mode, mode, 'flux')
    }
    for (const item of construireSessionCadences(mode, 'niveau3', 'nue', 31)) {
      assert.equal(item.mode, mode, 'cadences')
    }
  }
})

test('les cinq builders, en « les deux », mêlent les deux modes', () => {
  const modes = (ms: Mode[]) => new Set(ms).size

  assert.equal(modes(construireSession('les_deux', 4, 31).map((i) => i.progression.mode)), 2)
  assert.equal(modes(construireSessionDictee('les_deux', 31).map((i) => i.progression.mode)), 2)
  assert.equal(
    modes(construireSessionBinaire('les_deux', 4, 31).map((i) => i.progression.mode)),
    2,
  )
  assert.equal(
    modes(construireSessionFlux('les_deux', NIVEAU_MIN_FLUX, 31).map((i) => i.progression.mode)),
    2,
  )
  assert.equal(
    modes(construireSessionCadences('les_deux', 'niveau3', 'nue', 31).map((i) => i.mode)),
    2,
  )
})
