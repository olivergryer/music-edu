// Matrices de transition et générateur — 3 régimes, contraintes dures
// (spec §3, tests §7 · annexe §1-§3, tests §6).

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { genererProgression, longueursDisponibles } from './generateur.ts'
import { violations } from './contraintes.ts'
import { MATRICE_MAJEUR, MATRICE_MINEUR, matriceNormalisee, probabilite } from './matrice.ts'
import { NIVEAUX, NIVEAU_MAX_IMPLEMENTE, niveauSpec } from './niveaux.ts'
import { distanceAngulaire } from './geometrie.ts'
import { DEGRES, qualite, type Mode, type Progression } from './types.ts'

const MODES_TEST: Mode[] = ['majeur', 'mineur']

// Tous les triplets (mode, niveau, longueur) réellement générables.
function combos(): { mode: Mode; niveau: number; longueur: number }[] {
  const sortie: { mode: Mode; niveau: number; longueur: number }[] = []
  for (let niveau = 0; niveau <= NIVEAU_MAX_IMPLEMENTE; niveau++) {
    const spec = niveauSpec(niveau)
    for (const longueur of longueursDisponibles(spec)) {
      for (const mode of MODES_TEST) sortie.push({ mode, niveau, longueur })
    }
  }
  return sortie
}

// Échantillon large, réparti sur tous les niveaux et les deux modes.
function echantillon(nombre: number): Progression[] {
  const liste = combos()
  return Array.from({ length: nombre }, (_, i) => {
    const { mode, niveau, longueur } = liste[i % liste.length]
    return genererProgression(mode, niveau, longueur, 1000 + i)
  })
}

// ── Matrices (§3) ────────────────────────────────────────────────────────────

test('chaque ligne de matrice se normalise à 1', () => {
  for (const mode of MODES_TEST) {
    const normalisee = matriceNormalisee(mode)
    for (const de of DEGRES) {
      const somme = DEGRES.reduce((s, vers) => s + normalisee[de][vers], 0)
      assert.ok(Math.abs(somme - 1) < 1e-9, `${mode}, ligne ${de} : ${somme}`)
    }
  }
})

test('les poids bruts somment déjà à 1 par ligne (table de la spec §3)', () => {
  for (const brute of [MATRICE_MAJEUR, MATRICE_MINEUR]) {
    for (const de of DEGRES) {
      const somme = DEGRES.reduce((s, vers) => s + brute[de][vers], 0)
      assert.ok(Math.abs(somme - 1) < 1e-9, `ligne ${de} : ${somme}`)
    }
  }
})

test('la matrice n’est pas dérivable du cercle : IV→V est le contre-exemple', () => {
  // Distance angulaire maximale ET poids syntaxique quasi maximal de sa ligne.
  assert.equal(distanceAngulaire(4, 5), 3)
  assert.equal(probabilite('majeur', 4, 5), 0.45)
  assert.ok(probabilite('majeur', 4, 5) > probabilite('majeur', 4, 1))
  // Différences structurantes du mineur annoncées par la spec.
  assert.ok(probabilite('mineur', 1, 3) > probabilite('majeur', 1, 3)) // III, but fort
  assert.ok(probabilite('mineur', 4, 5) > probabilite('majeur', 4, 5)) // iv→V, préparation
  assert.ok(probabilite('mineur', 5, 6) > probabilite('majeur', 5, 6)) // rompue plus marquée
})

// ── Déterminisme ─────────────────────────────────────────────────────────────

test('genererProgression : même seed, résultat identique', () => {
  for (const { mode, niveau, longueur } of combos()) {
    for (const seed of [1, 42, 7919]) {
      const a = genererProgression(mode, niveau, longueur, seed)
      const b = genererProgression(mode, niveau, longueur, seed)
      assert.deepEqual(a, b, `${mode} n${niveau} l${longueur} s${seed}`)
    }
  }
})

test('genererProgression : des seeds différentes explorent l’espace', () => {
  const vues = new Set(
    Array.from({ length: 60 }, (_, s) =>
      genererProgression('majeur', 6, 6, s)
        .accords.map((a) => `${a.degre}${a.renversement}${a.septieme ? '7' : ''}`)
        .join('-'),
    ),
  )
  assert.ok(vues.size > 30, `seulement ${vues.size} progressions distinctes sur 60 seeds`)
})

// ── Contraintes dures ────────────────────────────────────────────────────────

test('1000 progressions : aucune violation des contraintes dures', () => {
  for (const prog of echantillon(1000)) {
    assert.deepEqual(violations(prog.accords, prog.mode, prog.niveau), [], prog.id)
  }
})

test('1000 progressions : jamais trois répétitions consécutives du même degré', () => {
  for (const prog of echantillon(1000)) {
    const degres = prog.accords.map((a) => a.degre)
    for (let i = 2; i < degres.length; i++) {
      assert.ok(
        !(degres[i] === degres[i - 1] && degres[i] === degres[i - 2]),
        `${prog.id} : ${degres.join('-')}`,
      )
    }
  }
})

test('toute progression écrite commence sur I ; l’atome garde son début libre', () => {
  for (const prog of echantillon(400)) {
    const spec = niveauSpec(prog.niveau)
    if (spec.regime === 'atome') continue
    assert.equal(prog.accords[0].degre, 1, prog.id)
  }
  // Niveau 1 : la dictée de basse de 2 accords serait I–I si le début était imposé.
  const courtes = Array.from({ length: 40 }, (_, s) => genererProgression('majeur', 1, 2, s))
  assert.ok(courtes.some((p) => p.accords[0].degre !== 1))
})

test('toute progression finit sur un degré autorisé par son niveau', () => {
  for (const prog of echantillon(400)) {
    const finales = niveauSpec(prog.niveau).finales
    if (finales.length === 0) continue
    assert.ok(finales.includes(prog.accords[prog.accords.length - 1].degre), prog.id)
  }
})

test('aucun accord diminué à l’état fondamental (contrainte dure n°2)', () => {
  for (const prog of echantillon(600)) {
    for (const accord of prog.accords) {
      if (qualite(prog.mode, accord.degre) === 'dim') {
        assert.notEqual(accord.renversement, 0, `${prog.id} : degré ${accord.degre}`)
      }
    }
  }
})

test('aucun 6/4 non cadentiel jusqu’au niveau 6 inclus', () => {
  for (const prog of echantillon(600)) {
    if (prog.niveau > 6) continue
    prog.accords.forEach((accord, i) => {
      if (accord.renversement !== 2) return
      assert.equal(accord.positionMetrique, 'fort', prog.id)
      assert.equal(prog.accords[i + 1]?.degre, 5, prog.id)
    })
  }
})

test('aucune septième avant le niveau 5, et jamais hors de septiemeSur', () => {
  for (const prog of echantillon(600)) {
    const spec = niveauSpec(prog.niveau)
    for (const accord of prog.accords) {
      if (prog.niveau < 5) assert.equal(accord.septieme, false, prog.id)
      if (accord.septieme) assert.ok(spec.septiemeSur.includes(accord.degre), prog.id)
    }
  }
})

test('toute progression n’emploie que le vocabulaire de son niveau', () => {
  for (const prog of echantillon(600)) {
    const vocabulaire = niveauSpec(prog.niveau).vocabulaire
    for (const accord of prog.accords) {
      assert.ok(vocabulaire.includes(accord.degre), `${prog.id} : degré ${accord.degre}`)
    }
  }
})

test('niveau 0 : un seul accord, jamais diminué — la réponse est « majeur ou mineur »', () => {
  for (const mode of MODES_TEST) {
    for (let seed = 0; seed < 60; seed++) {
      const prog = genererProgression(mode, 0, 1, seed)
      assert.equal(prog.accords.length, 1)
      assert.equal(prog.accords[0].renversement, 0)
      assert.notEqual(qualite(mode, prog.accords[0].degre), 'dim', `${mode} seed ${seed}`)
    }
  }
  // En mineur, le II du vocabulaire déclaré est diminué : il est écarté du tirage.
  const degres = new Set(
    Array.from({ length: 60 }, (_, s) => genererProgression('mineur', 0, 1, s).accords[0].degre),
  )
  assert.ok(!degres.has(2))
  assert.ok(degres.size >= 3)
})

test('niveau 7 : chaque item comporte un 6/4, objet de la discrimination du niveau', () => {
  for (const mode of MODES_TEST) {
    for (let seed = 0; seed < 40; seed++) {
      const prog = genererProgression(mode, 7, 6, seed)
      assert.ok(
        prog.accords.some((a) => a.renversement === 2),
        `${mode} seed ${seed} : aucun 6/4`,
      )
    }
  }
})

// ── Refus ────────────────────────────────────────────────────────────────────

test('genererProgression lève au niveau 8 (degrés secondaires, hors périmètre V1)', () => {
  assert.throws(() => genererProgression('majeur', 8, 4, 1), /hors périmètre V1/)
  assert.throws(() => genererProgression('mineur', 8, 4, 1), /hors périmètre V1/)
})

test('genererProgression lève hors des bornes de longueur du niveau', () => {
  assert.throws(() => genererProgression('majeur', 2, 4, 1), /hors bornes/)
  assert.throws(() => genererProgression('majeur', 6, 3, 1), /hors bornes/)
  assert.throws(() => genererProgression('majeur', 6, 9, 1), /hors bornes/)
  assert.throws(() => genererProgression('majeur', 6, 4.5, 1), /hors bornes/)
})

// CONTRADICTION de l'annexe : le niveau 5 annonce [3, 5] sans gabarit de 5 accords.
// Le refus est explicite plutôt que silencieux.
test('niveau 5, longueur 5 : refus explicite, aucun gabarit de cette longueur', () => {
  assert.throws(() => genererProgression('majeur', 5, 5, 1), /aucun gabarit de 5 accords/)
  assert.deepEqual(longueursDisponibles(NIVEAUX[5]), [3, 4])
  assert.deepEqual(longueursDisponibles(NIVEAUX[6]), [4, 5, 6, 7, 8])
})
