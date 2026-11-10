import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ETAPES,
  ROUTES_ACTIVITES,
  alternatives,
  avancementEtape,
  clesLevels,
  dansLeParcours,
  etapeCourante,
  exerciceConseille,
  jalonValide,
  lienJalon,
  lireParametresParcours,
  niveauDemande,
  niveauImpose,
  statsDuJalon,
  statutsEtapes,
  type CarteLevels,
  type Jalon,
} from './parcours.ts'
import { NIVEAUX } from './niveaux.ts'
import { NIVEAUX_BINAIRE } from './binaire.ts'
import { NIVEAU_MAX_DETECTION, NIVEAU_MIN_DETECTION } from './detection.ts'
import { NIVEAU_MAX_FLUX, NIVEAU_MIN_FLUX } from './flux.ts'

const bon = { best: 0.9, attempts: 3 }

/** Une carte où tous les jalons conseillés des étapes `jusqua` (incluse) sont validés. */
function carteValidee(jusqua: number): CarteLevels {
  const c: CarteLevels = {}
  for (const e of ETAPES) {
    if (e.numero > jusqua) break
    for (const j of e.jalons.filter((x) => x.conseille)) c[clesLevels(j)[0]] = bon
  }
  return c
}

// ─── La table ────────────────────────────────────────────────────────────────

test('les étapes sont numérotées 1 à 4, dans l’ordre', () => {
  assert.deepEqual(ETAPES.map((e) => e.numero), [1, 2, 3, 4])
})

test('chaque étape a au moins un jalon conseillé', () => {
  for (const e of ETAPES) assert.ok(e.jalons.some((j) => j.conseille), `étape ${e.numero}`)
})

test('aucun jalon n’est déclaré deux fois', () => {
  const vus = new Set<string>()
  for (const e of ETAPES)
    for (const j of e.jalons) {
      const k = `${j.activite}:${j.niveau}`
      assert.ok(!vus.has(k), k)
      vus.add(k)
    }
})

test('tout jalon vise un niveau du barème que son activité sait jouer', () => {
  for (const e of ETAPES)
    for (const j of e.jalons) {
      assert.ok(j.niveau in NIVEAUX, `niveau ${j.niveau} absent de NIVEAUX`)
      if (j.activite === 'binaire') assert.ok((NIVEAUX_BINAIRE as readonly number[]).includes(j.niveau))
      if (j.activite === 'detection')
        assert.ok(j.niveau >= NIVEAU_MIN_DETECTION && j.niveau <= NIVEAU_MAX_DETECTION)
      if (j.activite === 'flux') assert.ok(j.niveau >= NIVEAU_MIN_FLUX && j.niveau <= NIVEAU_MAX_FLUX)
    }
})

test('les niveaux annoncés par une étape couvrent ceux de ses jalons', () => {
  for (const e of ETAPES)
    for (const j of e.jalons) assert.ok(e.niveaux.includes(j.niveau), `${e.numero} / ${j.activite}:${j.niveau}`)
})

test('le barème 1-7 est entièrement couvert par les étapes, sans trou ni doublon d’étape', () => {
  const couverts = new Set(ETAPES.flatMap((e) => e.niveaux))
  for (let n = 1; n <= NIVEAU_MAX_FLUX; n++) assert.ok(couverts.has(n), `niveau ${n}`)
  // Le niveau 8 n'est pas générable : il ne doit PAS être dans le parcours.
  assert.ok(!couverts.has(8))
})

test('chaque activité du parcours a une route', () => {
  for (const e of ETAPES) for (const j of e.jalons) assert.ok(ROUTES_ACTIVITES[j.activite].startsWith('/harmonie/'))
})

// ─── Les clés `levels` ───────────────────────────────────────────────────────

test('clés levels : celles réellement écrites par les pages', () => {
  const cle = (activite: Jalon['activite'], niveau: number) => clesLevels({ activite, niveau })
  assert.deepEqual(cle('basse', 1), ['basse:1'])
  assert.deepEqual(cle('binaire', 4), ['binaire:4'])
  assert.deepEqual(cle('flux', 6), ['flux:6'])
  assert.deepEqual(cle('cadences', 3), ['cadences:3'])
})

test('la détection se lit sous la clé nue ET sous la clé préfixée', () => {
  const j: Jalon = { activite: 'detection', niveau: 4, conseille: false }
  assert.deepEqual(clesLevels(j), ['4', 'detection:4'])
  assert.deepEqual(statsDuJalon({ '4': { best: 0.7, attempts: 2 } }, j), { best: 0.7, attempts: 2 })
  assert.deepEqual(statsDuJalon({ 'detection:4': { best: 0.6, attempts: 1 } }, j), { best: 0.6, attempts: 1 })
  // Les deux : meilleur score, tentatives additionnées.
  assert.deepEqual(
    statsDuJalon({ '4': { best: 0.7, attempts: 2 }, 'detection:4': { best: 0.9, attempts: 1 } }, j),
    { best: 0.9, attempts: 3 },
  )
})

test('une clé vide ou partielle ne casse pas la lecture', () => {
  const j: Jalon = { activite: 'binaire', niveau: 2, conseille: true }
  assert.deepEqual(statsDuJalon({}, j), { best: 0, attempts: 0 })
  assert.deepEqual(statsDuJalon({ 'binaire:2': {} }, j), { best: 0, attempts: 0 })
  assert.deepEqual(statsDuJalon({ 'binaire:2': undefined }, j), { best: 0, attempts: 0 })
})

// ─── Validation d'un jalon ───────────────────────────────────────────────────

test('jalon validé : deux tentatives ET 80 %', () => {
  const j: Jalon = { activite: 'binaire', niveau: 2, conseille: true }
  assert.equal(jalonValide({ 'binaire:2': { best: 0.8, attempts: 2 } }, j), true)
  assert.equal(jalonValide({ 'binaire:2': { best: 0.79, attempts: 5 } }, j), false)
  assert.equal(jalonValide({ 'binaire:2': { best: 1, attempts: 1 } }, j), false)
  assert.equal(jalonValide({}, j), false)
})

// ─── Étape courante ──────────────────────────────────────────────────────────

test('élève neuf : étape 1 courante, les autres à venir', () => {
  assert.equal(etapeCourante({})?.numero, 1)
  assert.deepEqual(statutsEtapes({}), { 1: 'courante', 2: 'a_venir', 3: 'a_venir', 4: 'a_venir' })
})

test('l’étape courante avance avec la validation', () => {
  assert.equal(etapeCourante(carteValidee(1))?.numero, 2)
  assert.equal(etapeCourante(carteValidee(2))?.numero, 3)
  assert.equal(etapeCourante(carteValidee(3))?.numero, 4)
  assert.deepEqual(statutsEtapes(carteValidee(2)), {
    1: 'terminee',
    2: 'terminee',
    3: 'courante',
    4: 'a_venir',
  })
})

test('parcours fini : plus d’étape courante, tout est terminé', () => {
  const c = carteValidee(4)
  assert.equal(etapeCourante(c), null)
  assert.deepEqual(statutsEtapes(c), { 1: 'terminee', 2: 'terminee', 3: 'terminee', 4: 'terminee' })
})

test('SANS VERROUILLAGE : jouer l’étape 4 sans avoir fini la 2 ne la valide pas pour autant', () => {
  const c: CarteLevels = { 'flux:6': bon, 'flux:7': bon }
  assert.equal(etapeCourante(c)?.numero, 1)
})

test('une alternative (détection) ne suffit pas à terminer une étape', () => {
  const c: CarteLevels = { ...carteValidee(2), '4': bon, '5': bon }
  assert.equal(etapeCourante(c)?.numero, 3)
})

// ─── Exercice proposé ────────────────────────────────────────────────────────

test('« Continuer » propose le premier jalon conseillé non validé', () => {
  const e2 = ETAPES[1]
  assert.deepEqual(exerciceConseille({}, e2), { activite: 'binaire', niveau: 2, conseille: true })
  const apres = exerciceConseille({ 'binaire:2': bon }, e2)
  assert.equal(apres.activite, 'cadences')
})

test('étape terminée : on propose le dernier jalon conseillé (rejouer le plus avancé)', () => {
  const e3 = ETAPES[2]
  const j = exerciceConseille(carteValidee(3), e3)
  assert.equal(j.activite, 'binaire')
  assert.equal(j.niveau, NIVEAUX_BINAIRE[2])
})

test('les alternatives excluent l’exercice proposé et gardent les autres', () => {
  const e3 = ETAPES[2]
  const propose = exerciceConseille({}, e3)
  const alt = alternatives({}, e3)
  assert.equal(alt.length, e3.jalons.length - 1)
  assert.ok(!alt.some((j) => j.activite === propose.activite && j.niveau === propose.niveau))
  assert.ok(alt.some((j) => j.activite === 'detection'))
})

test('avancement : part des jalons conseillés validés', () => {
  const e2 = ETAPES[1]
  assert.equal(avancementEtape({}, e2), 0)
  assert.equal(avancementEtape({ 'binaire:2': bon }, e2), 0.5)
  assert.equal(avancementEtape(carteValidee(2), e2), 1)
})

// ─── Cohabitation : les liens et leur lecture ────────────────────────────────

test('lienJalon : route de l’activité + niveau + étape', () => {
  assert.equal(
    lienJalon({ activite: 'flux', niveau: 6, conseille: true }, 4),
    '/harmonie/flux?niveau=6&etape=4',
  )
})

test('lien puis lecture : aller-retour sans perte, pour tous les jalons', () => {
  for (const e of ETAPES)
    for (const j of e.jalons) {
      const [, query] = lienJalon(j, e.numero).split('?')
      assert.deepEqual(lireParametresParcours(query), { niveau: j.niveau, etape: e.numero })
    }
})

test('sans paramètre : ancien comportement, rien n’est imposé', () => {
  const p = lireParametresParcours('')
  assert.deepEqual(p, { niveau: null, etape: null })
  assert.equal(dansLeParcours(p), false)
  assert.equal(niveauDemande(p, [3, 4, 5], 4), 4)
})

test('lecture tolérante : valeurs absurdes → null, jamais d’exception', () => {
  for (const q of ['niveau=abc', 'niveau=-1', 'niveau=4.5', 'niveau=99', 'etape=0', 'etape=9', 'etape=x', 'niveau=&etape=']) {
    const p = lireParametresParcours(q)
    assert.equal(p.niveau, null, q)
    assert.equal(p.etape, null, q)
  }
})

test('accepte aussi un URLSearchParams (useSearchParams)', () => {
  assert.deepEqual(lireParametresParcours(new URLSearchParams('niveau=5&etape=3')), { niveau: 5, etape: 3 })
})

test('niveauDemande : seulement si l’activité sait le jouer, sinon repli', () => {
  const p = lireParametresParcours('niveau=5&etape=3')
  assert.equal(niveauDemande(p, [2, 4, 5], 2), 5)
  assert.equal(niveauDemande(p, [6, 7], 6), 6) // niveau 5 injouable en flux
})

test('dansLeParcours : vrai seulement avec une étape valide', () => {
  assert.equal(dansLeParcours(lireParametresParcours('niveau=4&etape=3')), true)
  assert.equal(dansLeParcours(lireParametresParcours('niveau=4')), false)
  assert.equal(dansLeParcours(lireParametresParcours('niveau=4&etape=9')), false)
})

test('niveauImpose : null si absent ou injouable — la page garde alors ses réglages relus', () => {
  assert.equal(niveauImpose(lireParametresParcours(''), [2, 4, 5]), null)
  assert.equal(niveauImpose(lireParametresParcours('niveau=3&etape=2'), [2, 4, 5]), null)
  assert.equal(niveauImpose(lireParametresParcours('niveau=4&etape=3'), [2, 4, 5]), 4)
})
