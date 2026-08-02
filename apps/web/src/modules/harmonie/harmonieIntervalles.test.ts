import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ITEMS_PAR_SESSION_INTERVALLES,
  NOMBRES_JUSTES,
  POOLS,
  SECTEURS_INTERVALLES,
  construireSessionIntervalles,
  demiTons,
  estJuste,
  memeIntervalle,
  nomIntervalle,
  qualitesDe,
  scorerIntervalles,
  type IntervalleNomme,
  type NiveauIntervalles,
  type ReponseIntervalle,
} from './intervalles.ts'
import { SECTEURS, qualiteAuDrag } from './roue.ts'

const NIVEAUX: NiveauIntervalles[] = ['facile', 'moyen', 'complet']

// ─── Les demi-tons ───────────────────────────────────────────────────────────

test('les intervalles usuels tombent sur les bons demi-tons', () => {
  assert.equal(demiTons({ nombre: 1, qualite: 'juste' }), 0)
  assert.equal(demiTons({ nombre: 2, qualite: 'mineure' }), 1)
  assert.equal(demiTons({ nombre: 2, qualite: 'Majeure' }), 2)
  assert.equal(demiTons({ nombre: 3, qualite: 'mineure' }), 3)
  assert.equal(demiTons({ nombre: 3, qualite: 'Majeure' }), 4)
  assert.equal(demiTons({ nombre: 4, qualite: 'juste' }), 5)
  assert.equal(demiTons({ nombre: 5, qualite: 'juste' }), 7)
  assert.equal(demiTons({ nombre: 6, qualite: 'mineure' }), 8)
  assert.equal(demiTons({ nombre: 6, qualite: 'Majeure' }), 9)
  assert.equal(demiTons({ nombre: 7, qualite: 'mineure' }), 10)
  assert.equal(demiTons({ nombre: 7, qualite: 'Majeure' }), 11)
})

test('le triton se nomme des deux façons, et fait 6 demi-tons dans les deux', () => {
  assert.equal(demiTons({ nombre: 4, qualite: 'augmentée' }), 6)
  assert.equal(demiTons({ nombre: 5, qualite: 'diminuée' }), 6)
  // Même son, deux noms : `memeIntervalle` ne doit surtout pas les confondre.
  assert.equal(
    memeIntervalle({ nombre: 4, qualite: 'augmentée' }, { nombre: 5, qualite: 'diminuée' }),
    false,
  )
})

// La dissymétrie est musicale : elle doit être refusée, pas silencieusement tolérée.
test('une quinte n’est ni majeure ni mineure, une tierce n’est jamais juste', () => {
  for (const nombre of NOMBRES_JUSTES) {
    assert.throws(() => demiTons({ nombre, qualite: 'Majeure' }), /ni majeure ni mineure/)
    assert.throws(() => demiTons({ nombre, qualite: 'mineure' }), /ni majeure ni mineure/)
  }
  for (const nombre of [2, 3, 6, 7]) {
    assert.throws(() => demiTons({ nombre, qualite: 'juste' }), /jamais juste/)
  }
})

test('diminué part du juste sur 1/4/5, du mineur ailleurs', () => {
  assert.equal(demiTons({ nombre: 5, qualite: 'diminuée' }), 7 - 1)
  assert.equal(demiTons({ nombre: 3, qualite: 'diminuée' }), 4 - 2)
})

// ─── Les secteurs de la roue ─────────────────────────────────────────────────

test('la roue a sept secteurs, un par nombre, unisson en haut', () => {
  assert.equal(SECTEURS_INTERVALLES.length, SECTEURS)
  SECTEURS_INTERVALLES.forEach((s, i) => assert.equal(s.cle, String(i + 1)))
})

// Le comportement que Matthieu a tranché : clic sec = « juste » sur une quinte,
// clic sec = rien sur une tierce.
test('les justes ont un repos, les autres exigent le glissement', () => {
  for (const s of SECTEURS_INTERVALLES) {
    const nombre = Number(s.cle)
    assert.deepEqual(s.qualites, qualitesDe(nombre))

    if (estJuste(nombre)) {
      assert.equal(qualiteAuDrag(s, 0), 'juste', `clic sec sur ${s.label}`)
      assert.equal(qualiteAuDrag(s, -40), 'augmentée')
      assert.equal(qualiteAuDrag(s, 40), 'diminuée')
    } else {
      assert.equal(s.defaut, null, `${s.label} ne doit pas avoir de repos`)
      assert.equal(qualiteAuDrag(s, 0), null, `clic sec sur ${s.label}`)
      assert.equal(qualiteAuDrag(s, -40), 'Majeure')
      assert.equal(qualiteAuDrag(s, 40), 'mineure')
    }
  }
})

// ─── Les pools ───────────────────────────────────────────────────────────────

test('tout intervalle des pools est calculable et les pools sont croissants', () => {
  for (const niveau of NIVEAUX) {
    for (const i of POOLS[niveau]) {
      const n = demiTons(i)
      assert.ok(n >= 0 && n <= 12, `${nomIntervalle(i)} → ${n} demi-tons`)
    }
  }
  assert.ok(POOLS.moyen.length > POOLS.facile.length)
  assert.ok(POOLS.complet.length > POOLS.moyen.length)
  // Chaque pool contient le précédent : la progression est un élargissement.
  for (const i of POOLS.facile) {
    assert.ok(POOLS.moyen.some((x) => memeIntervalle(x, i)), nomIntervalle(i))
  }
})

test('aucun doublon dans un pool', () => {
  for (const niveau of NIVEAUX) {
    const vus = new Set(POOLS[niveau].map(nomIntervalle))
    assert.equal(vus.size, POOLS[niveau].length, niveau)
  }
})

// ─── La session ──────────────────────────────────────────────────────────────

test('la session est déterministe et respecte le pool', () => {
  for (const niveau of NIVEAUX) {
    const session = construireSessionIntervalles(niveau, 4242)
    assert.equal(session.length, ITEMS_PAR_SESSION_INTERVALLES)
    assert.deepEqual(construireSessionIntervalles(niveau, 4242), session)

    for (const item of session) {
      assert.ok(
        POOLS[niveau].some((i) => memeIntervalle(i, item.intervalle)),
        `${nomIntervalle(item.intervalle)} hors du pool ${niveau}`,
      )
      // Les hauteurs réalisent bien l'intervalle annoncé.
      assert.equal(item.hauteurs[1] - item.hauteurs[0], demiTons(item.intervalle))
      assert.ok(item.hauteurs[0] >= 55 && item.hauteurs[1] <= 78, 'tessiture')
    }
  }
})

test('l’alternance arpégé / plaqué est stricte, un item sur deux', () => {
  const session = construireSessionIntervalles('moyen', 7)
  session.forEach((item, i) => {
    assert.equal(item.presentation, i % 2 === 0 ? 'arpege' : 'plaque', `item ${i}`)
  })
})

// ─── Le score ────────────────────────────────────────────────────────────────

test('scorerIntervalles sépare le nombre de la qualité', () => {
  const reponses: ReponseIntervalle[] = [
    {
      index: 0,
      attendu: { nombre: 3, qualite: 'Majeure' },
      repondu: { nombre: 3, qualite: 'Majeure' },
      correct: true,
      nombreJuste: true,
      rtMs: 2000,
      presentation: 'arpege',
    },
    {
      // A mesuré le bon écart mais s'est trompé de couleur : ce n'est pas la
      // même faute que de se tromper de nombre.
      index: 1,
      attendu: { nombre: 3, qualite: 'Majeure' },
      repondu: { nombre: 3, qualite: 'mineure' },
      correct: false,
      nombreJuste: true,
      rtMs: 4000,
      presentation: 'plaque',
    },
  ]

  const r = scorerIntervalles(reponses)
  assert.equal(r.accuracy, 0.5)
  assert.equal(r.score, 50)
  assert.equal(r.precisionNombre, 1)
  assert.equal(r.medianRtMs, 3000)
})

test('scorerIntervalles : session vide', () => {
  assert.deepEqual(scorerIntervalles([]), {
    score: 0,
    itemCount: 0,
    accuracy: 0,
    medianRtMs: 0,
    precisionNombre: 0,
  })
})

// Un intervalle non représentable sur la roue ne doit pas exister dans un pool :
// c'est ce qui garantit que toute bonne réponse est saisissable.
test('tout intervalle des pools est saisissable à la roue', () => {
  for (const niveau of NIVEAUX) {
    for (const i of POOLS[niveau]) {
      const secteur = SECTEURS_INTERVALLES[i.nombre - 1]
      assert.ok(
        secteur.qualites.includes(i.qualite),
        `${nomIntervalle(i)} n'est pas atteignable sur le secteur ${secteur.label}`,
      )
    }
  }
})
