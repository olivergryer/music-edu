import test from 'node:test'
import assert from 'node:assert/strict'

import {
  LETTRES,
  classeDeHauteur,
  gammeNommee,
  memeNote,
  nomNote,
  nomTonalite,
  toniqueNommee,
  type NoteNommee,
} from './tonalites.ts'
import { type Mode } from './types.ts'

const MODES: Mode[] = ['majeur', 'mineur']
const PATRONS: Record<Mode, number[]> = {
  majeur: [0, 2, 4, 5, 7, 9, 11],
  mineur: [0, 2, 3, 5, 7, 8, 11],
}

// ─── L'invariant d'écriture ──────────────────────────────────────────────────
//
// C'est LE test qui attrape « ré♯ » là où on attend « mi♭ » : une gamme emploie
// les sept lettres, chacune une fois. Si l'orthographieur se trompe, deux degrés
// partagent une lettre et un troisième disparaît.

test('toute gamme emploie les sept lettres, chacune exactement une fois', () => {
  for (const mode of MODES) {
    for (let tonique = 0; tonique < 12; tonique++) {
      const gamme = gammeNommee(tonique, mode)
      assert.equal(gamme.length, 7)

      const lettres = new Set(gamme.map((n) => n.lettre))
      assert.equal(
        lettres.size,
        LETTRES.length,
        `${nomTonalite(tonique, mode)} : ${gamme.map(nomNote).join(' ')}`,
      )
    }
  }
})

test('les degrés tombent sur les bons demi-tons, dans les 24 tonalités', () => {
  for (const mode of MODES) {
    for (let tonique = 0; tonique < 12; tonique++) {
      const gamme = gammeNommee(tonique, mode)
      gamme.forEach((note, degre) => {
        const attendu = (tonique + PATRONS[mode][degre]) % 12
        assert.equal(
          classeDeHauteur(note),
          attendu,
          `${nomTonalite(tonique, mode)} degré ${degre + 1} : ${nomNote(note)}`,
        )
      })
    }
  }
})

// Les doubles altérations existent, et elles sont JUSTES : hausser la sensible
// d'un mineur dont le 7ᵉ degré est déjà dièse donne un double dièse. Le test
// verrouille l'endroit exact où c'est légitime — ailleurs, ce serait une faute.
test('la seule double altération est la sensible de sol♯ mineur', () => {
  for (const mode of MODES) {
    for (let tonique = 0; tonique < 12; tonique++) {
      gammeNommee(tonique, mode).forEach((note, degre) => {
        if (Math.abs(note.alteration) <= 1) return
        assert.equal(mode, 'mineur', `double altération en majeur : ${nomTonalite(tonique, mode)}`)
        assert.equal(degre, 6, 'une double altération ne peut tomber que sur la sensible')
        assert.equal(nomTonalite(tonique, mode), 'Sol♯ mineur')
        assert.equal(nomNote(note), 'Fa♯♯')
      })
    }
  }
})

// Sans conséquence sur la dictée : le niveau 1 n'emploie que I, IV et V, donc le
// 7ᵉ degré ne descend jamais à la basse.
test('sol♯ mineur : sensible en fa double dièse, et le reste simple', () => {
  assert.deepEqual(gammeNommee(8, 'mineur').map(nomNote), [
    'Sol♯', 'La♯', 'Si', 'Do♯', 'Ré♯', 'Mi', 'Fa♯♯',
  ])
})

// ─── Les cas d'école ─────────────────────────────────────────────────────────

test('do majeur n’a aucune altération, la mineur en a une seule — la sensible', () => {
  assert.deepEqual(gammeNommee(0, 'majeur').map(nomNote), ['Do', 'Ré', 'Mi', 'Fa', 'Sol', 'La', 'Si'])
  // Mineur HARMONIQUE : le sol est haussé, comme dans `qualite()`.
  assert.deepEqual(gammeNommee(9, 'mineur').map(nomNote), [
    'La', 'Si', 'Do', 'Ré', 'Mi', 'Fa', 'Sol♯',
  ])
})

test('trois demi-tons au-dessus de do s’écrit Mi♭, jamais Ré♯', () => {
  const gamme = gammeNommee(3, 'majeur')
  assert.equal(nomNote(gamme[0]), 'Mi♭')
  assert.deepEqual(gamme.map(nomNote), ['Mi♭', 'Fa', 'Sol', 'La♭', 'Si♭', 'Do', 'Ré'])
})

test('do mineur : sensible si♮ contre armure à trois bémols', () => {
  assert.deepEqual(gammeNommee(0, 'mineur').map(nomNote), [
    'Do', 'Ré', 'Mi♭', 'Fa', 'Sol', 'La♭', 'Si',
  ])
})

test('les toniques retenues sont celles que l’usage écrit', () => {
  assert.equal(nomNote(toniqueNommee(6, 'majeur')), 'Fa♯')
  assert.equal(nomNote(toniqueNommee(3, 'mineur')), 'Mi♭')
  assert.equal(nomNote(toniqueNommee(8, 'mineur')), 'Sol♯')
  assert.equal(nomNote(toniqueNommee(10, 'mineur')), 'Si♭')
  assert.equal(nomTonalite(3, 'majeur'), 'Mi♭ majeur')
})

// ─── Comparaison ─────────────────────────────────────────────────────────────

test('memeNote distingue l’enharmonie — c’est tout l’intérêt', () => {
  const misBemol: NoteNommee = { lettre: 'mi', alteration: -1 }
  const reDiese: NoteNommee = { lettre: 're', alteration: 1 }

  assert.equal(classeDeHauteur(misBemol), classeDeHauteur(reDiese))
  assert.equal(memeNote(misBemol, reDiese), false)
  assert.equal(memeNote(misBemol, { lettre: 'mi', alteration: -1 }), true)
  // Même lettre, altération différente : faux aussi.
  assert.equal(memeNote(misBemol, { lettre: 'mi', alteration: 0 }), false)
})
