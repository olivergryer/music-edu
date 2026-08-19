import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ITEMS_PAR_SESSION_DICTEE,
  NIVEAU_DICTEE,
  basseNommee,
  bassesDeProgression,
  compterJustes,
  construireSessionDictee,
  evaluerBasseNommee,
  hauteurBasse,
  hauteursDesBasses,
  scorerDictee,
  type ReponseDictee,
} from './dictee.ts'
import { realiserProgression } from './dispositions.ts'
import { LETTRES, gammeNommee, nomNote, type NoteNommee } from './tonalites.ts'
import { niveauSpec } from './niveaux.ts'
import { creerAccord, type Mode } from './types.ts'

const MODES: Mode[] = ['majeur', 'mineur']
const note = (lettre: NoteNommee['lettre'], alteration: NoteNommee['alteration'] = 0): NoteNommee =>
  ({ lettre, alteration })

// ─── La basse d'un accord ────────────────────────────────────────────────────

test('à l’état fondamental la basse est la fondamentale', () => {
  const gamme = gammeNommee(0, 'majeur') // do majeur
  assert.equal(nomNote(basseNommee(creerAccord(0, { degre: 5 }), gamme)), 'Sol')
  assert.equal(nomNote(basseNommee(creerAccord(0, { degre: 4 }), gamme)), 'Fa')
})

// La fonction reste générale bien que le niveau 1 n'ait pas de renversement :
// elle servira telle quelle aux niveaux supérieurs.
test('le renversement fait descendre le bon son à la basse', () => {
  const gamme = gammeNommee(0, 'majeur')
  // V = sol si ré ; 1er renversement → si, 2e → ré.
  assert.equal(nomNote(basseNommee(creerAccord(0, { degre: 5, renversement: 1 }), gamme)), 'Si')
  assert.equal(nomNote(basseNommee(creerAccord(0, { degre: 5, renversement: 2 }), gamme)), 'Ré')
})

test('en mi♭ majeur les basses portent l’altération de l’armure', () => {
  const gamme = gammeNommee(3, 'majeur')
  // I = mi♭, IV = la♭, V = si♭ — c'est l'armure qui les amène, pas les accords.
  assert.equal(nomNote(basseNommee(creerAccord(0, { degre: 1 }), gamme)), 'Mi♭')
  assert.equal(nomNote(basseNommee(creerAccord(0, { degre: 4 }), gamme)), 'La♭')
  assert.equal(nomNote(basseNommee(creerAccord(0, { degre: 5 }), gamme)), 'Si♭')
})

// ─── La session ──────────────────────────────────────────────────────────────

test('la session respecte le niveau 1 et reste déterministe', () => {
  const spec = niveauSpec(NIVEAU_DICTEE)

  for (const mode of MODES) {
    const session = construireSessionDictee(mode, 4242)
    assert.equal(session.length, ITEMS_PAR_SESSION_DICTEE)

    for (const item of session) {
      const n = item.progression.accords.length
      assert.ok(n >= spec.longueur[0] && n <= spec.longueur[1], `longueur ${n}`)
      assert.equal(item.basses.length, n)

      for (const accord of item.progression.accords) {
        assert.ok(spec.vocabulaire.includes(accord.degre), `degré ${accord.degre} hors vocabulaire`)
        assert.equal(accord.renversement, 0, 'le niveau 1 est à l’état fondamental')
      }
    }

    // Même graine, même session.
    assert.deepEqual(construireSessionDictee(mode, 4242), session)
  }
})

// Sans transposition, la basse ne porterait JAMAIS d'altération au niveau 1 et le
// geste dièse/bémol de la roue ne servirait jamais. Le test garde la raison d'être
// du geste.
test('les tonalités varient, donc des altérations apparaissent à la basse', () => {
  const toniques = new Set<number>()
  let avecAlteration = 0

  for (const mode of MODES) {
    for (const item of construireSessionDictee(mode, 77, 12)) {
      toniques.add(item.progression.tonique)
      if (item.basses.some((b) => b.alteration !== 0)) avecAlteration++
    }
  }

  assert.ok(toniques.size > 4, `trop peu de tonalités (${toniques.size})`)
  assert.ok(avecAlteration > 0, 'aucune altération à la basse sur 24 items')
})

test('les basses annoncées sont bien celles de la progression', () => {
  const item = construireSessionDictee('majeur', 9)[0]
  assert.deepEqual(item.basses, bassesDeProgression(item.progression, 'majeur'))
})

// ─── L'évaluation ────────────────────────────────────────────────────────────

test('evaluerBasseNommee ne rend que les fautes', () => {
  const attendu = [note('mi', -1), note('la', -1), note('si', -1)]
  assert.deepEqual(evaluerBasseNommee(attendu, attendu), [])
})

// LE point qui justifie de ne pas réutiliser `evaluerBasse` : mi et mi♭ tombent
// tous deux sur le degré 3, la faute d'altération y serait invisible.
test('la faute d’altération est distinguée de la faute de lettre', () => {
  const attendu = [note('mi', -1), note('la', -1)]
  const repondu = [note('mi', 0), note('sol')]
  const erreurs = evaluerBasseNommee(attendu, repondu)

  assert.equal(erreurs.length, 2)

  // Bonne lettre, mauvaise altération — l'élève a entendu le degré, pas l'armure.
  assert.equal(erreurs[0].lettreJuste, true)
  assert.equal(erreurs[0].alterationJuste, false)

  // Mauvaise lettre — c'est une faute d'oreille, pas de tonalité.
  assert.equal(erreurs[1].lettreJuste, false)
})

test('réponse trop courte ou trop longue : sentinelles', () => {
  const attendu = [note('do'), note('fa')]

  const courte = evaluerBasseNommee(attendu, [note('do')])
  assert.equal(courte.length, 1)
  assert.equal(courte[0].repondu, null)

  const longue = evaluerBasseNommee(attendu, [note('do'), note('fa'), note('sol')])
  assert.equal(longue.length, 1)
  assert.equal(longue[0].attendu, null)
})

test('compterJustes ignore les trous', () => {
  const attendu = [note('do'), note('fa'), note('sol')]
  assert.equal(compterJustes(attendu, [note('do'), null, note('sol')]), 2)
  assert.equal(compterJustes(attendu, []), 0)
  assert.equal(compterJustes(attendu, attendu), 3)
})

// ─── Le score ────────────────────────────────────────────────────────────────

test('scorerDictee : un item n’est juste qu’en entier, mais la précision est plus fine', () => {
  const reponses: ReponseDictee[] = [
    { index: 0, correct: true, rtMs: 4000, justes: 3, total: 3 },
    { index: 1, correct: false, rtMs: 6000, justes: 2, total: 3 },
  ]
  const r = scorerDictee(reponses)

  assert.equal(r.itemCount, 2)
  assert.equal(r.accuracy, 0.5)
  assert.equal(r.score, 50)
  assert.equal(r.medianRtMs, 5000)
  // 5 basses justes sur 6 : l'élève est bien meilleur que « 50 % ».
  assert.ok(Math.abs(r.precisionNotes - 5 / 6) < 1e-9)
})

test('scorerDictee : session vide', () => {
  assert.deepEqual(scorerDictee([]), {
    score: 0,
    itemCount: 0,
    accuracy: 0,
    medianRtMs: 0,
    precisionNotes: 0,
  })
})

// ─── Entendre les basses saisies ─────────────────────────────────────────────
//
// Une `NoteNommee` n'a pas d'octave : il faut la poser quelque part, et le seul
// endroit juste est au plus près de la basse attendue — c'est l'écart
// d'INTERVALLE qu'on veut entendre, pas un saut d'octave qui n'a pas eu lieu.

test('hauteurBasse pose la note dans l’octave la plus proche', () => {
  // do3 = 48. Un ré se place au-dessus (50), un si en dessous (47).
  assert.equal(hauteurBasse({ lettre: 'do', alteration: 0 }, 48), 48)
  assert.equal(hauteurBasse({ lettre: 're', alteration: 0 }, 48), 50)
  assert.equal(hauteurBasse({ lettre: 'si', alteration: 0 }, 48), 47)
  // Jamais plus d'un demi-octave d'écart, quelle que soit la note.
  for (const lettre of LETTRES) {
    const h = hauteurBasse({ lettre, alteration: 0 }, 55)
    assert.ok(Math.abs(h - 55) <= 6, `${lettre} : ${h} contre 55`)
  }
})

// ⚠ L'octave se déduit de la CLASSE DE HAUTEUR, pas de la lettre : si♯ et do
// sonnent la même touche, et c'est la touche qu'on joue.
test('hauteurBasse : si♯ sonne comme un do, pas comme un si', () => {
  assert.equal(
    hauteurBasse({ lettre: 'si', alteration: 1 }, 48),
    hauteurBasse({ lettre: 'do', alteration: 0 }, 48),
  )
})

test('hauteursDesBasses saute les cases vides plutôt que d’y mettre un silence', () => {
  const notes = [{ lettre: 'do' as const, alteration: 0 as const }, null, { lettre: 'sol' as const, alteration: 0 as const }]
  const hauteurs = hauteursDesBasses(notes, [48, 50, 55])
  assert.equal(hauteurs.length, 2)
  // Un accord = une note : ce sont des basses nues, pas des accords.
  assert.ok(hauteurs.every((a) => a.length === 1))
})

test('les basses attendues d’un item sont jouables telles quelles', () => {
  const item = construireSessionDictee('mineur', 13)[0]
  const references = realiserProgression(item.progression).map((a) => a[0])
  const hauteurs = hauteursDesBasses(item.basses, references)

  assert.equal(hauteurs.length, item.basses.length)
  // Et elles retombent sur les basses réellement sonnées : la ligne « bonnes
  // basses » doit être celle de l'exercice, pas une approximation.
  hauteurs.forEach(([h], i) => assert.equal(h, references[i]))
})
