import { test } from 'node:test'
import assert from 'node:assert/strict'
import { segmenter } from './accordeurUtils.js'

// Série synthétique : même hauteur (Sib4 ≈ 466 Hz), deux « notes » séparées par un
// creux d'amplitude AU-DESSUS du gate → pas de silence, pas de saut de hauteur.
// Seule la détection de ré-attaque peut les séparer.
function makeSerie() {
  const hz = 466
  const serie: any[] = []
  let t = 0
  const push = (rms: number, n: number) => { for (let k = 0; k < n; k++) { serie.push({ tMs: t, hz, rms }); t += 12 } }
  push(0.10, 12)   // note 1
  push(0.02, 3)    // creux (langue) — reste au-dessus du gate
  push(0.10, 12)   // note 2
  return serie
}

const OPTS = { silenceDurationMs: 200, noteJumpCents: 30, minNoteDurationMs: 60 }

test('segmenter : ré-attaque désactivée (0) → 1 note', () => {
  const segs = segmenter(makeSerie(), 442, { ...OPTS, reattackDropRatio: 0 })
  assert.equal(segs.length, 1)
})

test('segmenter : ré-attaque activée → 2 notes de même hauteur', () => {
  const segs = segmenter(makeSerie(), 442, { ...OPTS, reattackDropRatio: 0.4 })
  assert.equal(segs.length, 2)
  assert.equal(segs[0].nom, segs[1].nom)
})

test('segmenter : creux trop faible (pas sous le seuil) → 1 note', () => {
  // creux à 0.08 = 80 % du pic : au-dessus de LOW (pic×0.4) → pas d'armement
  const hz = 466
  const serie: any[] = []
  let t = 0
  const push = (rms: number, n: number) => { for (let k = 0; k < n; k++) { serie.push({ tMs: t, hz, rms }); t += 12 } }
  push(0.10, 12); push(0.08, 3); push(0.10, 12)
  const segs = segmenter(serie, 442, { ...OPTS, reattackDropRatio: 0.4 })
  assert.equal(segs.length, 1)
})
