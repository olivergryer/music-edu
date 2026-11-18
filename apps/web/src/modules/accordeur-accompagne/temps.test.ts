import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleAppareil, latenceSortieS, lireLatence, memoriserLatence, tempsAudible, tempsPlanningDeNote } from './temps.ts'

test('latence de sortie : outputLatency + baseLatency, sinon une part de la latence de boucle', () => {
  assert.ok(Math.abs(latenceSortieS({ outputLatency: 0.02, baseLatency: 0.005, latenceBoucleMs: 200 }) - 0.025) < 1e-12)
  assert.ok(Math.abs(latenceSortieS({ latenceBoucleMs: 200 }) - 0.1) < 1e-12)
  assert.ok(Math.abs(latenceSortieS({ outputLatency: 0, latenceBoucleMs: 100 }) - 0.05) < 1e-12)
  assert.equal(latenceSortieS({}), 0)
})

test('temps audible et datation d’une note', () => {
  assert.ok(Math.abs(tempsAudible(10, 0.025) - 9.975) < 1e-12)
  assert.ok(Math.abs(tempsPlanningDeNote(5.1, 0.1) - 5) < 1e-12)
})

test('clé d’appareil', () => {
  assert.equal(cleAppareil({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6)', micro: 'iPhone Micro', sampleRate: 48000 }), 'iPhone|iPhone Micro|48000')
  assert.equal(cleAppareil({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', sampleRate: 44100 }), 'Mac||44100')
})

test('mémoire de la latence : sans stockage, aucune erreur', () => {
  assert.equal(lireLatence('Mac||44100'), null)
  memoriserLatence('Mac||44100', 96)            // pas de localStorage sous node : ignoré silencieusement
  assert.equal(lireLatence('Mac||44100'), null)
})

test('mémoire de la latence : aller-retour avec un stockage simulé, valeurs aberrantes refusées', () => {
  const magasin: Record<string, string> = {}
  ;(globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => magasin[k] ?? null, setItem: (k: string, v: string) => { magasin[k] = v },
  }
  try {
    memoriserLatence('iPhone|x|48000', 91.52)
    memoriserLatence('Mac||44100', 96)
    memoriserLatence('Mac||44100', -5)
    memoriserLatence('Mac||44100', 99999)
    assert.equal(lireLatence('iPhone|x|48000'), 91.5)
    assert.equal(lireLatence('Mac||44100'), 96)
    assert.equal(lireLatence('inconnu'), null)
  } finally { delete (globalThis as unknown as { localStorage?: unknown }).localStorage }
})
