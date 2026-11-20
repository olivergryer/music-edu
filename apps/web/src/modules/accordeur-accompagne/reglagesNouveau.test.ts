import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CHAMPS_NOUVEAU, NOUVEAU_DEFAUT, PREREGLAGES_NOUVEAU, appliquerPreregalage, cleTrames, optionsFinaleDe, optionsPipelineDe, preregalageActif, profilDe } from './reglagesNouveau.ts'

test('chaque réglage a une description, des bornes cohérentes et son défaut dans les bornes', () => {
  for (const c of CHAMPS_NOUVEAU) {
    assert.ok(c.aide.length > 20, c.cle)
    assert.ok(c.min < c.max && NOUVEAU_DEFAUT[c.cle] >= c.min && NOUVEAU_DEFAUT[c.cle] <= c.max, c.cle)
  }
  assert.equal(new Set(CHAMPS_NOUVEAU.map(c => c.cle)).size, Object.keys(NOUVEAU_DEFAUT).length)
})

test('défauts = comportement d\'avant (profil accompagné, garde 40 ms)', () => {
  assert.equal(optionsPipelineDe(NOUVEAU_DEFAUT).gardeAttaqueS, 0.04)
  assert.equal(profilDe(NOUVEAU_DEFAUT).silenceDurationMs, 105)
  assert.equal(optionsFinaleDe(NOUVEAU_DEFAUT, 442).diapason, 442)
})

test('la clé des trames ignore les réglages de segmentation et réagit aux autres', () => {
  const k = cleTrames(NOUVEAU_DEFAUT)
  assert.equal(cleTrames({ ...NOUVEAU_DEFAUT, silenceDurationMs: 30, reattackDropRatio: 0.8 }), k)
  assert.notEqual(cleTrames({ ...NOUVEAU_DEFAUT, seuilF: 80 }), k)
  assert.notEqual(cleTrames({ ...NOUVEAU_DEFAUT, gardeAttaqueMs: 60 }), k)
})

test('les champs à choix contiennent leur défaut ; les préréglages sont reconnus', () => {
  for (const c of CHAMPS_NOUVEAU.filter(x => x.choix)) assert.ok(c.choix!.some(x => x.valeur === NOUVEAU_DEFAUT[c.cle]), c.cle)
  assert.equal(preregalageActif(NOUVEAU_DEFAUT), 'standard')
  const rapides = appliquerPreregalage(PREREGLAGES_NOUVEAU.find(p => p.id === 'rapides')!)
  assert.equal(preregalageActif(rapides), 'rapides')
  assert.equal(preregalageActif({ ...rapides, seuilF: 99 }), null)
  const o = optionsPipelineDe(rapides)
  assert.equal(o.pasS, 0.025); assert.equal(o.fenetreMpm, 1024); assert.equal(o.confirmations, 1)
})
