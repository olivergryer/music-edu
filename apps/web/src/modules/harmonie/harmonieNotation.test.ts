import test from 'node:test'
import assert from 'node:assert/strict'

import {
  TONIQUE_UT,
  armureVex,
  cleVex,
  decalageVersUt,
  ecrireAccord,
  nommerHauteur,
  orthographeAccord,
  transposerVersUt,
} from './notation.ts'
import { classeDeHauteur, nomNote, type NoteNommee } from './tonalites.ts'
import { realiserProgression } from './dispositions.ts'
import {
  MODES,
  DEGRES,
  accepteBasculeMode,
  creerAccord,
  type Accord,
  type Mode,
  type Progression,
  type Renversement,
} from './types.ts'

const TONIQUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

function suite(accord: Accord, tonique: number, mode: Mode): Progression {
  return { id: 'test', tonique, mode, accords: [accord], niveau: 6 }
}

function ecrit(accord: Accord, tonique: number, mode: Mode): string[] {
  const [hauteurs] = realiserProgression(suite(accord, tonique, mode))
  return ecrireAccord(hauteurs, accord, tonique, mode).map(nomNote)
}

// ─── L'octave se déduit de la lettre, pas du MIDI ────────────────────────────

test('do central : MIDI 60 s’écrit do à l’octave 4', () => {
  const carte = orthographeAccord(creerAccord(0, { degre: 1 }), 0, 'majeur')
  const note = nommerHauteur(60, carte)
  assert.equal(note.lettre, 'do')
  assert.equal(note.alteration, 0)
  assert.equal(note.octave, 4)
  assert.equal(cleVex(note), 'c/4')
})

// Le piège que l'octave calculée sur le MIDI brut ne verrait pas : si♯ et do
// sonnent la même touche mais ne sont pas dans la même octave écrite.
test('si♯ et do♭ restent dans leur octave écrite', () => {
  const siDiese: ReadonlyMap<number, NoteNommee> = new Map([[0, { lettre: 'si', alteration: 1 }]])
  const nSiDiese = nommerHauteur(60, siDiese)
  assert.equal(nSiDiese.octave, 3)
  assert.equal(cleVex(nSiDiese), 'b#/3')

  const doBemol: ReadonlyMap<number, NoteNommee> = new Map([[11, { lettre: 'do', alteration: -1 }]])
  const nDoBemol = nommerHauteur(59, doBemol)
  assert.equal(nDoBemol.octave, 4)
  assert.equal(cleVex(nDoBemol), 'cb/4')
})

test('une hauteur étrangère à l’accord est refusée, pas devinée', () => {
  const carte = orthographeAccord(creerAccord(0, { degre: 1 }), 0, 'majeur')
  assert.throws(() => nommerHauteur(61, carte), /absente de l’accord/)
})

// ─── L'invariant qui épingle notation.ts à dispositions.ts ───────────────────
//
// Toute hauteur réellement produite par le module doit être écrivable. Si un jour
// `dispositions.ts` change sa construction, ce test tombe — c'est son seul but.

test('toute hauteur réalisée s’écrit, dans les 24 tonalités', () => {
  for (const mode of MODES) {
    for (const tonique of TONIQUES) {
      for (const degre of DEGRES) {
        for (const septieme of [false, true]) {
          for (const renversement of [0, 1, 2, 3] as Renversement[]) {
            if (renversement === 3 && !septieme) continue
            const accord = creerAccord(0, { degre, renversement, septieme })
            const [hauteurs] = realiserProgression(suite(accord, tonique, mode))

            const notes = ecrireAccord(hauteurs, accord, tonique, mode)
            notes.forEach((note, i) => {
              assert.equal(
                classeDeHauteur(note),
                ((hauteurs[i] % 12) + 12) % 12,
                `${mode} tonique ${tonique} degré ${degre} : ${nomNote(note)} ≠ MIDI ${hauteurs[i]}`,
              )
            })
          }
        }
      }
    }
  }
})

test('les accords à mode inversé s’écrivent aussi', () => {
  for (const mode of MODES) {
    for (const tonique of TONIQUES) {
      for (const degre of DEGRES) {
        if (!accepteBasculeMode(mode, degre)) continue
        const accord = creerAccord(0, { degre, modeInverse: true })
        const [hauteurs] = realiserProgression(suite(accord, tonique, mode))

        ecrireAccord(hauteurs, accord, tonique, mode).forEach((note, i) => {
          assert.equal(
            classeDeHauteur(note),
            ((hauteurs[i] % 12) + 12) % 12,
            `${mode} tonique ${tonique} degré ${degre} inversé : ${nomNote(note)}`,
          )
        })
      }
    }
  }
})

// ─── Ce que la seule classe de hauteur ne dirait pas ─────────────────────────

test('la tierce baissée garde sa lettre : mi♭ et non ré♯', () => {
  const inverse = creerAccord(0, { degre: 1, modeInverse: true })
  const carte = orthographeAccord(inverse, 0, 'majeur')
  assert.deepEqual(carte.get(3), { lettre: 'mi', alteration: -1 })
})

test('la tierce haussée garde sa lettre : fa♯ et non sol♭', () => {
  // ii en do majeur (ré-fa-la) basculé en majeur : la tierce monte.
  const inverse = creerAccord(0, { degre: 2, modeInverse: true })
  const carte = orthographeAccord(inverse, 0, 'majeur')
  assert.deepEqual(carte.get(6), { lettre: 'fa', alteration: 1 })
})

test('le V mineur porte la sensible haussée', () => {
  assert.deepEqual(ecrit(creerAccord(0, { degre: 5 }), 9, 'mineur').sort(), ['Mi', 'Mi', 'Si', 'Sol♯'])
})

test('le III mineur est pris naturel — sol, pas sol♯', () => {
  const carte = orthographeAccord(creerAccord(0, { degre: 3 }), 9, 'mineur')
  const notes = [...carte.values()].map(nomNote).sort()
  assert.deepEqual(notes, ['Do', 'Mi', 'Sol'])
})

test('une doublure ne crée pas d’entrée supplémentaire', () => {
  assert.equal(orthographeAccord(creerAccord(0, { degre: 1 }), 0, 'majeur').size, 3)
  assert.equal(orthographeAccord(creerAccord(0, { degre: 5, septieme: true }), 0, 'majeur').size, 4)
})

// ─── Armure ──────────────────────────────────────────────────────────────────

test('les 24 tonalités ont un nom d’armure VexFlow', () => {
  const attendusMajeur = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
  const attendusMineur = ['Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm']

  assert.deepEqual(TONIQUES.map((t) => armureVex(t, 'majeur')), attendusMajeur)
  assert.deepEqual(TONIQUES.map((t) => armureVex(t, 'mineur')), attendusMineur)
})

// ─── Remise en Ut ────────────────────────────────────────────────────────────

test('la remise en Ut vise Do majeur et la mineur', () => {
  assert.equal(TONIQUE_UT.majeur, 0)
  assert.equal(TONIQUE_UT.mineur, 9)
  assert.equal(armureVex(TONIQUE_UT.majeur, 'majeur'), 'C')
  assert.equal(armureVex(TONIQUE_UT.mineur, 'mineur'), 'Am')
})

test('le décalage vise la tonique d’Ut par le plus court chemin', () => {
  for (const mode of MODES) {
    for (const tonique of TONIQUES) {
      const d = decalageVersUt(tonique, mode)
      assert.ok(d >= -6 && d <= 5, `décalage ${d} hors bornes`)
      assert.equal((((tonique + d) % 12) + 12) % 12, TONIQUE_UT[mode], `${mode} depuis ${tonique}`)
    }
  }
})

test('transposer en Ut décale toutes les voix du même intervalle', () => {
  const hauteurs = [
    [43, 59, 62, 67],
    [48, 60, 64, 67],
  ]
  const decalage = decalageVersUt(7, 'majeur') // sol majeur → do majeur
  const transpose = transposerVersUt(hauteurs, 7, 'majeur')

  transpose.forEach((accord, i) => {
    accord.forEach((midi, j) => assert.equal(midi - hauteurs[i][j], decalage))
  })
})

// Une suite remise en Ut doit rester écrivable dans SA nouvelle tonalité.
test('une suite remise en Ut s’écrit dans la tonalité d’arrivée', () => {
  for (const mode of MODES) {
    for (const tonique of TONIQUES) {
      const accord = creerAccord(0, { degre: 5, septieme: true })
      const realisation = realiserProgression(suite(accord, tonique, mode))
      const [hauteurs] = transposerVersUt(realisation, tonique, mode)

      ecrireAccord(hauteurs, accord, TONIQUE_UT[mode], mode).forEach((note, i) => {
        assert.equal(classeDeHauteur(note), ((hauteurs[i] % 12) + 12) % 12)
      })
    }
  }
})
