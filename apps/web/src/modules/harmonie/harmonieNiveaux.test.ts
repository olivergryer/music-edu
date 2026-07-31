// Table des niveaux 0 à 8, gabarits, progression des perturbations (annexe §2-§4, tests §6).

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  NIVEAUX,
  NIVEAU_MAX_IMPLEMENTE,
  assertNiveauGenerable,
  niveauSpec,
  perturbationsAutorisees,
  sixQuatreRestreintAuCadentiel,
} from './niveaux.ts'
import {
  degresGabarit,
  formatGabarit,
  longueurGabarit,
  parseAccordGabarit,
  parseGabarit,
} from './gabarits.ts'

const inclus = <T>(petit: readonly T[], grand: readonly T[]) => petit.every((x) => grand.includes(x))

// ── Intégrité de la table ────────────────────────────────────────────────────

test('NIVEAUX contient exactement les niveaux 0 à 8, sans trou ni doublon', () => {
  assert.equal(NIVEAUX.length, 9)
  NIVEAUX.forEach((spec, i) => assert.equal(spec.niveau, i))
  assert.equal(new Set(NIVEAUX.map((s) => s.niveau)).size, 9)
  assert.throws(() => niveauSpec(9))
  assert.throws(() => niveauSpec(-1))
})

test('renversements et septiemeSur sont croissants par inclusion sur 0 → 8', () => {
  for (let n = 1; n < NIVEAUX.length; n++) {
    assert.ok(
      inclus(NIVEAUX[n - 1].renversements, NIVEAUX[n].renversements),
      `renversements ${n - 1} ⊄ ${n}`,
    )
    assert.ok(
      inclus(NIVEAUX[n - 1].septiemeSur, NIVEAUX[n].septiemeSur),
      `septiemeSur ${n - 1} ⊄ ${n}`,
    )
  }
  assert.deepEqual(NIVEAUX[4].septiemeSur, [])
  assert.deepEqual(NIVEAUX[5].septiemeSur, [5]) // la septième s'introduit sur V seul
})

// CORRECTION au test de l'annexe §6 (« vocabulaire croissant du niveau 2 au 7 ») :
// la croissance est rompue en 3 → 4, et c'est intentionnel.
test('le vocabulaire croît par inclusion, sauf le resserrement délibéré 3 → 4', () => {
  const ruptures: string[] = []
  for (let n = 3; n <= 7; n++) {
    if (!inclus(NIVEAUX[n - 1].vocabulaire, NIVEAUX[n].vocabulaire)) ruptures.push(`${n - 1}→${n}`)
  }
  assert.deepEqual(ruptures, ['3→4'])

  // Le niveau 4 discrimine la BASSE : il revient à I-IV-V pour que la variable
  // isolée soit le renversement, pas le degré.
  assert.deepEqual(NIVEAUX[4].vocabulaire, [1, 4, 5])
  assert.deepEqual(NIVEAUX[4].renversements, [0, 1])
  assert.deepEqual(NIVEAUX[3].renversements, [0])
})

test('gabarits présents si et seulement si le régime est « gabarit »', () => {
  for (const spec of NIVEAUX) {
    if (spec.regime === 'gabarit') {
      assert.ok(spec.gabarits && spec.gabarits.length > 0, `niveau ${spec.niveau}`)
    } else {
      assert.equal(spec.gabarits, undefined, `niveau ${spec.niveau}`)
    }
  }
  assert.deepEqual(
    NIVEAUX.filter((s) => s.regime === 'gabarit').map((s) => s.niveau),
    [2, 3, 4, 5],
  )
  assert.deepEqual(
    NIVEAUX.filter((s) => s.regime === 'atome').map((s) => s.niveau),
    [0, 1],
  )
})

test('chaque gabarit reste dans le vocabulaire, les finales et les bornes de son niveau', () => {
  for (const spec of NIVEAUX) {
    for (const gabarit of spec.gabarits ?? []) {
      const degres = degresGabarit(gabarit)
      assert.ok(inclus(degres, spec.vocabulaire), `${gabarit} hors vocabulaire du niveau ${spec.niveau}`)
      assert.ok(
        spec.finales.includes(degres[degres.length - 1]),
        `${gabarit} : finale hors finales du niveau ${spec.niveau}`,
      )
      const l = longueurGabarit(gabarit)
      assert.ok(
        l >= spec.longueur[0] && l <= spec.longueur[1],
        `${gabarit} : longueur ${l} hors bornes du niveau ${spec.niveau}`,
      )
      // Contrainte dure n°4, vérifiée dès la formule.
      for (let i = 2; i < degres.length; i++) {
        assert.ok(
          !(degres[i] === degres[i - 1] && degres[i] === degres[i - 2]),
          `${gabarit} : trois répétitions`,
        )
      }
    }
  }
})

// CONTRADICTION relevée dans l'annexe : le niveau 5 annonce [3, 5] alors qu'aucune
// de ses quatre formules ne fait 5 accords. Consigné ici pour que le jour où une
// formule de 5 accords est ajoutée, le test tombe et l'écart se referme.
test('niveau 5 : la borne haute annoncée (5) n’est couverte par aucun gabarit', () => {
  const longueurs = new Set((NIVEAUX[5].gabarits ?? []).map(longueurGabarit))
  assert.deepEqual([...longueurs].sort(), [3, 4])
  assert.deepEqual(NIVEAUX[5].longueur, [3, 5])
})

test('le niveau 3 est le seul à admettre une finale autre que I', () => {
  for (const spec of NIVEAUX) {
    if (spec.finales.length === 0) continue
    if (spec.niveau === 3) assert.deepEqual(spec.finales, [1, 5, 6])
    else assert.deepEqual(spec.finales, [1], `niveau ${spec.niveau}`)
  }
  assert.deepEqual(NIVEAUX[0].finales, []) // accord isolé : aucune contrainte
})

test('le contexte tonal tombe au niveau 7 : l’élève établit la tonique lui-même', () => {
  assert.deepEqual(
    NIVEAUX.map((s) => s.contexteTonal),
    [true, true, true, true, true, true, true, false, false],
  )
})

test('le niveau 8 est réservé : la table le déclare, le générateur le refuse', () => {
  assert.equal(NIVEAU_MAX_IMPLEMENTE, 7)
  assert.doesNotThrow(() => niveauSpec(8))
  assert.throws(() => assertNiveauGenerable(8), /hors périmètre V1/)
  assert.doesNotThrow(() => assertNiveauGenerable(7))
})

// ── Perturbations par niveau (annexe §4) ─────────────────────────────────────

test('les types de perturbation sont cumulatifs et suivent la table de l’annexe §4', () => {
  assert.deepEqual([...perturbationsAutorisees(0)], [])
  assert.deepEqual([...perturbationsAutorisees(1)], [])
  for (let n = 1; n <= 8; n++) {
    assert.ok(
      inclus(perturbationsAutorisees(n - 1), perturbationsAutorisees(n)),
      `niveau ${n} n’est pas cumulatif`,
    )
  }
  assert.ok(!perturbationsAutorisees(3).includes('renversement'))
  assert.ok(perturbationsAutorisees(4).includes('renversement'))
  assert.ok(!perturbationsAutorisees(4).includes('cardinalite'))
  assert.ok(perturbationsAutorisees(5).includes('cardinalite'))
  assert.ok(!perturbationsAutorisees(5).includes('degre_associe'))
  assert.ok(perturbationsAutorisees(6).includes('degre_associe'))
  assert.ok(!perturbationsAutorisees(6).includes('mode'))
  assert.ok(perturbationsAutorisees(7).includes('mode'))
})

test('le 6/4 n’est restreint au cadentiel que jusqu’au niveau 6 inclus', () => {
  for (let n = 0; n <= 6; n++) assert.equal(sixQuatreRestreintAuCadentiel(n), true, `niveau ${n}`)
  assert.equal(sixQuatreRestreintAuCadentiel(7), false)
  assert.equal(sixQuatreRestreintAuCadentiel(8), false)
})

// ── Grammaire des gabarits ───────────────────────────────────────────────────

test('parseGabarit : degrés et chiffrage français', () => {
  const accords = parseGabarit('I-IV-V7-I')
  assert.deepEqual(
    accords.map((a) => [a.degre, a.renversement, a.septieme]),
    [
      [1, 0, false],
      [4, 0, false],
      [5, 0, true],
      [1, 0, false],
    ],
  )
  assert.deepEqual(
    parseGabarit('I-VII6-I').map((a) => [a.degre, a.renversement]),
    [
      [1, 0],
      [7, 1],
      [1, 0],
    ],
  )
  const chiffrages: [string, number, boolean][] = [
    ['I', 0, false],
    ['I6', 1, false],
    ['I64', 2, false],
    ['V7', 0, true],
    ['V65', 1, true],
    ['V43', 2, true],
    ['V2', 3, true],
  ]
  for (const [jeton, renversement, septieme] of chiffrages) {
    const accord = parseAccordGabarit(jeton, 0)
    assert.equal(accord.renversement, renversement, jeton)
    assert.equal(accord.septieme, septieme, jeton)
  }
})

test('parseGabarit : rejette un jeton illisible ou un chiffrage inconnu', () => {
  assert.throws(() => parseGabarit('I-X-I'), /illisible/)
  assert.throws(() => parseGabarit('I-V9-I'), /chiffrage inconnu/)
  assert.throws(() => parseGabarit(''), /vide/)
})

test('formatGabarit est l’inverse de parseGabarit sur toutes les formules de la table', () => {
  for (const spec of NIVEAUX) {
    for (const gabarit of spec.gabarits ?? []) {
      assert.equal(formatGabarit(parseGabarit(gabarit)), gabarit, gabarit)
    }
  }
})
