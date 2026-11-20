import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decalageOptimal, nombreDeTetes } from './decalage.ts'
import { PHRASES_FOURNIES } from './phrase.ts'
import { construirePlanningPhrase } from './planningPhrase.ts'
import type { SegmentsAncien } from './ancienMoteur.ts'

const cad = PHRASES_FOURNIES[0]
const phrase = { ...cad, tempo: 120, boucle: false, decompte: 0 as const }     // noire = 0,5 s
const pp = construirePlanningPhrase(phrase, { sampleRate: 48000 })
const t0 = pp.t0

/** Segments d'un élève qui joue une note par temps, avec `avanceMs` d'avance sur la grille. */
function segs(avanceMs: number, nb = 6): SegmentsAncien {
  const decalageMicro = pp.planning.latenceBoucleMs / 1000
  const out = []
  for (let k = 1; k <= nb; k++) {
    const on = t0 + k * 0.5 - avanceMs / 1000, off = on + 0.46
    const frames = []
    for (let t = on; t <= off; t += 512 / 48000) frames.push({ tMs: (t + decalageMicro) * 1000, hz: 440 })
    out.push({ debutMs: frames[0].tMs, finMs: frames[frames.length - 1].tMs, frames })
  }
  return { segs: out, dernierMs: 99999 }
}

const opts = { fs: 48000, offsetS: pp.planning.latenceBoucleMs / 1000, planning: pp.planning, reglages: { silenceDurationMs: 100 } as never }

test('un élève en avance de 80 ms : le décalage optimal le recale (et diminue le nombre de têtes)', () => {
  const sg = segs(80)
  const r = decalageOptimal(sg, opts, phrase, pp)
  assert.ok(r.decalageMs > 40 && r.decalageMs <= 150, `décalage ${r.decalageMs}`)
  const sans = nombreDeTetes((await0(sg)), phrase, pp)
  assert.ok(r.tetes < sans, `${r.tetes} < ${sans}`)
})

test('élève déjà calé : décalage proche de 0', () => {
  const r = decalageOptimal(segs(0), opts, phrase, pp)
  assert.ok(Math.abs(r.decalageMs) <= 40, `décalage ${r.decalageMs}`)
})

import { notesDepuisSegments } from './ancienMoteur.ts'
function await0(sg: SegmentsAncien) { return notesDepuisSegments(sg, opts) }
