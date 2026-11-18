import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  JUSTE, TROP_BAS, TROP_HAUT, couleurEcart, formaterEcart, luminositeOklab, melangerOklch, saturationEcart,
} from './couleurs.ts'

const canaux = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))

test('dans le seuil : le vert « juste » exact', () => {
  for (const c of [0, 2, -4.9, 5, -5]) assert.equal(couleurEcart(c, 5), JUSTE)
})

test('saturation : 35 % au-delà du seuil, 100 % à 25 ¢, plafonnée ensuite', () => {
  assert.equal(saturationEcart(3, 5), 0)
  assert.ok(Math.abs(saturationEcart(5.001, 5) - 0.35) < 0.01)
  assert.ok(Math.abs(saturationEcart(15, 5) - 0.675) < 1e-9)
  assert.equal(saturationEcart(25, 5), 1)
  assert.equal(saturationEcart(-80, 5), 1)
})

test('le sens de l’écart compte : bas → bleu, haut → orange', () => {
  const bas = canaux(couleurEcart(-12, 5)), haut = canaux(couleurEcart(12, 5))
  assert.ok(bas[2] > bas[0], 'bleu dominant')
  assert.ok(haut[0] > haut[2], 'rouge/orange dominant')
  assert.notEqual(couleurEcart(-12, 5), couleurEcart(12, 5))
})

test('couleurs extrêmes atteintes à 25 ¢ (à un cran de canal près)', () => {
  const ecart = (a: string, b: string) => Math.max(...canaux(a).map((v, i) => Math.abs(v - canaux(b)[i])))
  assert.ok(ecart(couleurEcart(-25, 5), TROP_BAS) <= 2)
  assert.ok(ecart(couleurEcart(40, 5), TROP_HAUT) <= 2)
})

test('le juste est l’état le plus clair, les écarts sont plus foncés (daltonisme)', () => {
  for (const sens of [-1, 1]) {
    const L = [0, 8, 15, 25].map((a) => luminositeOklab(couleurEcart(sens * a, 5)))
    for (let i = 1; i < L.length; i++) assert.ok(L[i] < L[i - 1] + 1e-9, `${sens} ${L}`)
    assert.ok(L[0] - L[3] > 0.08, `contraste de clarté ${L[0] - L[3]}`)
  }
})

test('interpolation OKLCH : bornes exactes, milieu intermédiaire', () => {
  assert.equal(melangerOklch(JUSTE, TROP_BAS, 0), JUSTE)
  const m = luminositeOklab(melangerOklch(JUSTE, TROP_BAS, 0.5))
  assert.ok(m < luminositeOklab(JUSTE) && m > luminositeOklab(TROP_BAS) - 1e-6)
})

test('formatage signé', () => {
  assert.equal(formaterEcart(6), '+6,0 ¢')
  assert.equal(formaterEcart(-12.34), '−12,3 ¢')
  assert.equal(formaterEcart(0.01), '±0,0 ¢')
  assert.equal(formaterEcart(1.94, 1), '+1,9 ¢')
})
