// Tests des données (profils + table instruments) — critères d'acceptation §5.
// node --test "src/**/*.test.ts"

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { READING_PROFILES, PROFILE_IDS } from './profiles.ts'
import { INSTRUMENTS, beginnerInstruments } from './instruments.ts'

const CLEFS = new Set(['treble', 'bass', 'alto', 'tenor'])

// ── Profils ─────────────────────────────────────────────────────────────────
test('profils : clef valide, 3-4 repères, étapes d\'ambitus low ≤ high', () => {
  for (const id of PROFILE_IDS) {
    const p = READING_PROFILES[id]
    assert.equal(p.id, id)
    assert.ok(CLEFS.has(p.clef), `clef ${p.clef}`)
    assert.ok(p.landmarks.length >= 3 && p.landmarks.length <= 4, `${id} repères`)
    assert.ok(p.ambitusSequence.length >= 1)
    for (const step of p.ambitusSequence) assert.ok(step.low <= step.high, `${id} étape low≤high`)
  }
})

test('profils : cor rattaché à treble-mid → 4 profils (pas de treble-low)', () => {
  assert.equal(PROFILE_IDS.length, 4)
  assert.ok(!PROFILE_IDS.includes('treble-low'))
})

// ── Table instruments (§5) ───────────────────────────────────────────────────
test('§5.1 : chaque instrument a les champs requis, ids uniques', () => {
  const ids = new Set<string>()
  for (const i of INSTRUMENTS) {
    assert.ok(i.id && i.label && i.primaryProfile, `${i.id} champs`)
    assert.equal(typeof i.transposition, 'number')
    assert.equal(typeof i.beginnerFriendly, 'boolean')
    assert.ok(!ids.has(i.id), `id dupliqué ${i.id}`)
    ids.add(i.id)
  }
  assert.equal(INSTRUMENTS.length, 20)
})

test('§5.2 : le sélecteur v1 ne renvoie que beginnerFriendly', () => {
  const b = beginnerInstruments()
  assert.ok(b.every(i => i.beginnerFriendly))
  assert.equal(b.length, INSTRUMENTS.filter(i => i.beginnerFriendly).length)
  assert.ok(b.some(i => i.id === 'violon'))
  assert.ok(!b.some(i => i.id === 'piccolo')) // doublure = non débutant
})

test('§5.3 : profils non dupliqués — instruments partageant la progression pointent le même profil', () => {
  for (const i of INSTRUMENTS) {
    assert.ok(READING_PROFILES[i.primaryProfile], `profil manquant ${i.primaryProfile}`)
    for (const c of i.secondaryClefs) assert.ok(CLEFS.has(c), `clef secondaire ${c}`)
  }
  // Même expérience de lecture ⇒ même id de profil (aucune redéfinition).
  for (const id of ['violon', 'hautbois', 'clarinette-sib', 'trompette-sib', 'sax-alto-mib', 'cor-fa']) {
    assert.equal(INSTRUMENTS.find(i => i.id === id)!.primaryProfile, 'treble-mid')
  }
})

test('§5.4 : aucun code du module Notes ne lit `transposition`', () => {
  const dir = dirname(fileURLToPath(import.meta.url))
  const files = readdirSync(dir).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'instruments.ts')
  for (const f of files) {
    const src = readFileSync(join(dir, f), 'utf8')
    assert.ok(!src.includes('transposition'), `${f} référence transposition`)
  }
})
