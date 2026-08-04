import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ACCORDS_CHROMATIQUES,
  NOMS_CHROMATIQUES,
  accordChromatique,
  ecrireChromatique,
  orthographeChromatique,
  sonsAbsolus,
} from './chromatiques.ts'
import { noteSurDegre } from './notation.ts'
import { classeDeHauteur, nomNote } from './tonalites.ts'
import { MODES, type Mode } from './types.ts'

const TONIQUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

// ─── `noteSurDegre`, la brique ───────────────────────────────────────────────

test('noteSurDegre impose la lettre et déduit l’altération', () => {
  // ♭2 en do majeur : la lettre est ré, donc ré♭ et jamais do♯.
  assert.deepEqual(noteSurDegre(1, 1, 0, 'majeur'), { lettre: 're', alteration: -1 })
  // ♯4 en do : la lettre est fa, donc fa♯ et jamais sol♭.
  assert.deepEqual(noteSurDegre(3, 6, 0, 'majeur'), { lettre: 'fa', alteration: 1 })
})

// Le même son, la même lettre, une altération différente selon le mode : c'est
// exactement ce qu'une table en altérations aurait raté.
test('le ♭6 s’écrit altéré en majeur et diatonique en mineur', () => {
  assert.deepEqual(noteSurDegre(5, 8, 0, 'majeur'), { lettre: 'la', alteration: -1 })
  assert.deepEqual(noteSurDegre(5, 8, 0, 'mineur'), { lettre: 'la', alteration: -1 })
  // En do mineur le la♭ est le 6ᵉ degré de la gamme : l'écart vaut zéro.
  assert.equal(classeDeHauteur(noteSurDegre(5, 8, 0, 'mineur')), 8)
})

// ─── La table ────────────────────────────────────────────────────────────────

test('les sons de chaque accord montent strictement depuis la basse', () => {
  for (const nom of NOMS_CHROMATIQUES) {
    const { sons } = accordChromatique(nom)
    for (let i = 1; i < sons.length; i++) {
      assert.ok(sons[i].demiTons > sons[i - 1].demiTons, `${nom} : son ${i} ne monte pas`)
    }
  }
})

test('chaque accord atteint quatre voix, doublure comprise', () => {
  for (const nom of NOMS_CHROMATIQUES) {
    const { sons, double } = accordChromatique(nom)
    const voix = sons.length + (double === null ? 0 : 1)
    assert.equal(voix, 4, `${nom} : ${voix} voix`)
    if (double !== null) assert.ok(double >= 0 && double < sons.length, `${nom} : doublure hors bornes`)
  }
})

test('les trois sixtes augmentées partagent leur basse et leur sommet', () => {
  const augmentees = ['italienne', 'francaise', 'allemande'] as const
  for (const nom of augmentees) {
    const { sons } = accordChromatique(nom)
    assert.equal(sons[0].demiTons, 8, `${nom} : la basse n’est pas le ♭6`)
    assert.equal(sons[sons.length - 1].demiTons, 18, `${nom} : le sommet n’est pas le ♯4`)
  }
})

// L'intervalle qui donne son nom à l'accord : de la basse au sommet, une sixte
// augmentée vaut dix demi-tons — une septième mineure à l'oreille, d'où la
// difficulté propre de ces accords.
test('la sixte augmentée vaut bien dix demi-tons', () => {
  for (const nom of ['italienne', 'francaise', 'allemande'] as const) {
    const { sons } = accordChromatique(nom)
    assert.equal(sons[sons.length - 1].demiTons - sons[0].demiTons, 10, nom)
  }
})

test('la napolitaine est un accord de sixte sur le 4ᵉ degré', () => {
  const { sons } = ACCORDS_CHROMATIQUES.napolitaine
  assert.equal(sons[0].demiTons, 5) // la basse est le 4ᵉ degré
  assert.equal(sons[0].degreGamme, 3)
  // ♭2 et ♭6 sont bien là, une octave plus haut pour le ♭2.
  assert.deepEqual(
    sons.map((s) => s.demiTons % 12).sort((a, b) => a - b),
    [1, 5, 8],
  )
})

// ─── L'orthographe, dans les 24 tonalités ────────────────────────────────────

test('tout accord chromatique s’écrit dans les 24 tonalités', () => {
  for (const mode of MODES) {
    for (const tonique of TONIQUES) {
      for (const nom of NOMS_CHROMATIQUES) {
        const notes = ecrireChromatique(nom, tonique, mode)
        const hauteurs = sonsAbsolus(nom, tonique)
        notes.forEach((note, i) => {
          assert.equal(
            classeDeHauteur(note),
            ((hauteurs[i] % 12) + 12) % 12,
            `${nom} en ${mode} sur ${tonique} : ${nomNote(note)}`,
          )
        })
      }
    }
  }
})

test('chaque son garde une lettre distincte', () => {
  for (const mode of MODES) {
    for (const tonique of TONIQUES) {
      for (const nom of NOMS_CHROMATIQUES) {
        const lettres = ecrireChromatique(nom, tonique, mode).map((n) => n.lettre)
        assert.equal(new Set(lettres).size, lettres.length, `${nom} en ${mode} sur ${tonique}`)
      }
    }
  }
})

// Le cas limite annoncé : sol♯ mineur pousse le ♯4 au double dièse. Il doit
// passer — au-delà, `noteSurDegre` lève, et c'est voulu.
test('le ♯4 de sol♯ mineur s’écrit do♯♯', () => {
  const notes = ecrireChromatique('allemande', 8, 'mineur')
  const sommet = notes[notes.length - 1]
  assert.deepEqual(sommet, { lettre: 'do', alteration: 2 })
  assert.equal(nomNote(sommet), 'Do♯♯')
})

test('l’orthographe indexée couvre chaque classe de hauteur de l’accord', () => {
  for (const mode of MODES) {
    for (const tonique of TONIQUES) {
      for (const nom of NOMS_CHROMATIQUES) {
        const carte = orthographeChromatique(nom, tonique, mode)
        for (const midi of sonsAbsolus(nom, tonique)) {
          assert.ok(carte.has(((midi % 12) + 12) % 12), `${nom} en ${mode} sur ${tonique}`)
        }
      }
    }
  }
})

// ─── Les hauteurs en do, lisibles à l'œil ────────────────────────────────────

test('en do, les quatre accords sonnent les notes attendues', () => {
  const attendus: Record<string, string[]> = {
    napolitaine: ['Fa', 'La♭', 'Ré♭'],
    italienne: ['La♭', 'Do', 'Fa♯'],
    francaise: ['La♭', 'Do', 'Ré', 'Fa♯'],
    allemande: ['La♭', 'Do', 'Mi♭', 'Fa♯'],
  }
  for (const nom of NOMS_CHROMATIQUES) {
    assert.deepEqual(
      ecrireChromatique(nom, 0, 'majeur').map(nomNote),
      attendus[nom],
      `${nom} en do majeur`,
    )
  }
})

test('chaque accord porte un chiffrage et un nom', () => {
  for (const nom of NOMS_CHROMATIQUES) {
    const a = accordChromatique(nom)
    assert.ok(a.chiffrage.etages.length > 0, `${nom} : chiffrage vide`)
    assert.ok(a.libelle.length > 0, `${nom} : libellé vide`)
    assert.ok(a.romain.length > 0, `${nom} : romain vide`)
    // Les quatre mènent à la dominante : c'est ce qui les rend interchangeables
    // dans une cadence, donc comparables à l'oreille.
    assert.equal(a.resout, 5, `${nom} : ne résout pas sur V`)
  }
})

test('un nom inconnu est refusé', () => {
  assert.throws(() => accordChromatique('napolitain' as never), /nom inconnu/)
})

test('la table est stable d’un appel à l’autre', () => {
  const mode: Mode = 'mineur'
  assert.deepEqual(ecrireChromatique('allemande', 3, mode), ecrireChromatique('allemande', 3, mode))
})
