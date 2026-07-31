// Cercle des tierces, notes communes, arcs fonctionnels (spec §2, tests §7).

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  ARCS,
  NOTES_COMMUNES_MAJEUR,
  ORDRE_TIERCES,
  distanceAngulaire,
  distanceAngulaireSignee,
  estCouture,
  estFonctionSansSonorite,
  estPivot,
  fonctions,
  franchitArc,
  notesCommunes,
  positionAngulaire,
} from './geometrie.ts'
import { DEGRES, MODES, type Degre, type Fonction } from './types.ts'
import { notesCommunesReelles } from './harmonieRef.ts'

const PAIRES: [Degre, Degre][] = DEGRES.flatMap((a) => DEGRES.map((b) => [a, b] as [Degre, Degre]))

// ── Cercle ───────────────────────────────────────────────────────────────────

test('ORDRE_TIERCES contient les 7 degrés une fois chacun', () => {
  assert.equal(ORDRE_TIERCES.length, 7)
  assert.equal(new Set(ORDRE_TIERCES).size, 7)
  DEGRES.forEach((d) => assert.ok(ORDRE_TIERCES.includes(d), `degré ${d} absent`))
  ORDRE_TIERCES.forEach((d, i) => assert.equal(positionAngulaire(d), i))
})

test('distanceAngulaire : I–V vaut 2 (quinte), IV–V vaut 3 (maximum)', () => {
  assert.equal(distanceAngulaire(1, 5), 2)
  assert.equal(distanceAngulaire(4, 5), 3)
  // IV→V : distance angulaire maximale ET fréquence syntaxique maximale — c'est
  // la décorrélation qui rend le croisement cercle/matrice diagnostique (§3).
})

test('distanceAngulaire : symétrique et bornée à 0–3', () => {
  for (const [a, b] of PAIRES) {
    const d = distanceAngulaire(a, b)
    assert.equal(d, distanceAngulaire(b, a), `symétrie ${a}/${b}`)
    assert.ok(d >= 0 && d <= 3, `borne ${a}/${b} = ${d}`)
    assert.equal(d === 0, a === b)
  }
})

test('distanceAngulaireSignee : antisymétrique, de même module que la distance', () => {
  for (const [a, b] of PAIRES) {
    const s = distanceAngulaireSignee(a, b)
    assert.equal(s + distanceAngulaireSignee(b, a), 0, `antisymétrie ${a}/${b}`)
    assert.equal(Math.abs(s), distanceAngulaire(a, b), `module ${a}/${b}`)
  }
  // Positif dans le sens des tierces montantes.
  assert.equal(distanceAngulaireSignee(1, 3), 1)
  assert.equal(distanceAngulaireSignee(3, 1), -1)
  assert.equal(distanceAngulaireSignee(1, 7), 3)
})

// ── Notes communes ───────────────────────────────────────────────────────────

test('notesCommunes majeur : suit le tableau §2 sur les 21 paires', () => {
  const parDistance = [3, 2, 1, 0]
  for (const [a, b] of PAIRES) {
    assert.equal(
      notesCommunes('majeur', a, b),
      parDistance[distanceAngulaire(a, b)],
      `majeur ${a}/${b}`,
    )
  }
})

test('notesCommunes : les deux tables valent les hauteurs réellement construites', () => {
  for (const mode of MODES) {
    for (const [a, b] of PAIRES) {
      assert.equal(notesCommunes(mode, a, b), notesCommunesReelles(mode, a, b), `${mode} ${a}/${b}`)
    }
  }
})

// CORRECTION à la spec §2 (« une seule arête dévie ») : il y en a DEUX, pour une
// cause unique — III est le seul accord bâti sur le VII° degré naturel, face à
// V et vii° qui portent la sensible haussée.
test('notesCommunes mineur : exactement deux arêtes dévient du majeur — III–V et III–VII', () => {
  const deviations = PAIRES.filter(
    ([a, b]) => notesCommunes('mineur', a, b) !== NOTES_COMMUNES_MAJEUR[a][b],
  ).map(([a, b]) => [a, b].sort().join('-'))

  assert.deepEqual([...new Set(deviations)].sort(), ['3-5', '3-7'])
  assert.equal(notesCommunes('mineur', 3, 5), 1) // au lieu de 2
  assert.equal(notesCommunes('mineur', 3, 7), 0) // au lieu de 1
  assert.equal(notesCommunes('mineur', 5, 3), 1) // table symétrique
  assert.equal(notesCommunes('mineur', 7, 3), 0)
})

test('notesCommunes : tables symétriques et diagonale à 3', () => {
  for (const mode of MODES) {
    for (const [a, b] of PAIRES) {
      assert.equal(notesCommunes(mode, a, b), notesCommunes(mode, b, a))
    }
    DEGRES.forEach((d) => assert.equal(notesCommunes(mode, d, d), 3))
  }
})

// ── Arcs fonctionnels ────────────────────────────────────────────────────────

test('les trois arcs couvrent les 7 degrés, avec exactement 2 pivots', () => {
  const couverts = new Set([...ARCS.T, ...ARCS.D, ...ARCS.S])
  assert.equal(couverts.size, 7)
  DEGRES.forEach((d) => assert.ok(couverts.has(d), `degré ${d} sans fonction`))

  const pivots = DEGRES.filter(estPivot)
  assert.deepEqual(pivots, [3, 6])
  DEGRES.forEach((d) => {
    const f = fonctions(d)
    assert.ok(f.length === 1 || f.length === 2, `degré ${d} : ${f.length} fonction(s)`)
  })
  assert.deepEqual(fonctions(3), ['T', 'D'])
  assert.deepEqual(fonctions(6), ['T', 'S'])
})

test('les trois arcs sont contigus sur le cercle, 3 positions chacun', () => {
  for (const f of ['T', 'D', 'S'] as Fonction[]) {
    const positions = ARCS[f].map(positionAngulaire).sort((x, y) => x - y)
    assert.equal(positions.length, 3, `arc ${f}`)
    const contigu =
      positions[2] - positions[0] === 2 ||
      // arc à cheval sur la couture du cercle (T = VI, I, III → 6, 0, 1)
      positions.every((p) => [6, 0, 1].includes(p))
    assert.ok(contigu, `arc ${f} non contigu : ${positions.join(',')}`)
  }
})

test('franchitArc : la couture VII–II franchit, le pivot I–VI non', () => {
  assert.equal(franchitArc(7, 2), true)
  assert.equal(franchitArc(1, 6), false)
  for (const [a, b] of PAIRES) {
    assert.equal(franchitArc(a, b), franchitArc(b, a), `symétrie ${a}/${b}`)
    if (a === b) assert.equal(franchitArc(a, b), false)
  }
})

test('arc partagé ⟹ distance ≤ 2 (la réciproque est fausse : I–V franchit à distance 2)', () => {
  for (const [a, b] of PAIRES) {
    if (!franchitArc(a, b)) assert.ok(distanceAngulaire(a, b) <= 2, `${a}/${b}`)
    if (distanceAngulaire(a, b) === 3) assert.equal(franchitArc(a, b), true, `${a}/${b}`)
  }
  assert.equal(distanceAngulaire(1, 5), 2)
  assert.equal(franchitArc(1, 5), true)
})

// CORRECTION au raisonnement de la spec §5. Le « quadrant vide » est bien vide
// en majeur, mais pas en mineur : le III naturel y ouvre une unique exception.
test('le quadrant « arc partagé ∧ 0 note commune » est vide en majeur', () => {
  for (const [a, b] of PAIRES) {
    if (!franchitArc(a, b)) {
      assert.ok(notesCommunes('majeur', a, b) >= 1, `majeur ${a}/${b} : quadrant vide violé`)
      assert.equal(estFonctionSansSonorite('majeur', a, b), false)
    }
  }
})

test('en mineur le quadrant admet une exception et une seule : III–VII (arc D, 0 note commune)', () => {
  const exceptions = PAIRES.filter(([a, b]) => estFonctionSansSonorite('mineur', a, b)).map(
    ([a, b]) => [a, b].sort().join('-'),
  )
  assert.deepEqual([...new Set(exceptions)], ['3-7'])
  assert.equal(franchitArc(3, 7), false) // arc D partagé
  assert.equal(notesCommunes('mineur', 3, 7), 0) // `do mi sol` / `sol♯ si ré`
  // La §5 la classe malgré tout `degre_voisin` : le prédicat n'est pas câblé
  // dans `diagnostiquer`, il rend seulement le cas repérable dans le log.
})

test('estCouture : VII–II est l’unique arête adjacente qui franchit un arc', () => {
  const adjacentesFranchissantes = PAIRES.filter(
    ([a, b]) => distanceAngulaire(a, b) === 1 && franchitArc(a, b),
  ).map(([a, b]) => [a, b].sort().join('-'))

  assert.deepEqual([...new Set(adjacentesFranchissantes)], ['2-7'])
  assert.equal(estCouture(7, 2), true)
  assert.equal(estCouture(2, 7), true)
  assert.equal(estCouture(1, 3), false)
  // Voisins immédiats et pourtant 2 notes communes : la confusion la plus
  // diagnostique du module (§2, §5).
  assert.equal(notesCommunes('majeur', 7, 2), 2)
  assert.equal(notesCommunes('mineur', 7, 2), 2)
})
