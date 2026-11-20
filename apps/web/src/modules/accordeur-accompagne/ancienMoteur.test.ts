import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyserBuffer, analyserTramesBrutes, appliquerSeuils } from '../../accordeurUtils.js'
import { PROFILS_DEFAUT } from '../../profilsSegmentation.ts'
import { notesAncien, SerieBrute } from './ancienMoteur.ts'
import type { Planning } from './dsp/types.ts'

const FS = 44100

/** Signal : suite de notes (hz, durée s) séparées de silences, amplitude `amp`. */
function signal(notes: { hz: number; d: number }[], silence = 0.15, amp = 0.2, depart = 0.3): Float32Array {
  const total = depart + notes.reduce((a, n) => a + n.d + silence, 0) + 0.2
  const x = new Float32Array(Math.floor(total * FS))
  let t = depart
  for (const n of notes) {
    for (let i = Math.floor(t * FS); i < Math.floor((t + n.d) * FS); i++) x[i] = amp * Math.sin(2 * Math.PI * n.hz * i / FS)
    t += n.d + silence
  }
  return x
}

const planningVide = (evs: { tDebut: number; tFin: number; entree: number }[] = []): Planning =>
  ({ sampleRate: FS, gain: 0.1, evenements: evs.map(e => ({ ...e, voix: [] })) } as unknown as Planning)

test('trames brutes + seuils = analyserBuffer (refactoring sans changement de comportement)', () => {
  const x = signal([{ hz: 440, d: 0.5 }, { hz: 523.25, d: 0.5 }])
  const buf = { sampleRate: FS, getChannelData: () => x } as unknown as AudioBuffer
  const a = analyserBuffer(buf, { clarityThreshold: 0.7, rmsGate: 0.015 })
  const b = appliquerSeuils(analyserTramesBrutes(x, FS), FS, { clarityThreshold: 0.7, rmsGate: 0.015 })
  assert.deepEqual(b, a)
})

test('série brute incrémentale = série brute d\'un coup', () => {
  const x = signal([{ hz: 440, d: 0.4 }])
  const s = new SerieBrute()
  s.avancer(x.subarray(0, 20000), FS); s.avancer(x.subarray(0, 33333), FS); s.avancer(x, FS)
  const tout = analyserTramesBrutes(x, FS) as { hz: number[] }
  assert.equal(s.n, tout.hz.length)
  assert.deepEqual(s.hz, tout.hz)
})

test('deux notes legato (profil validé) : deux notes, hauteurs et dates au bon endroit', () => {
  const x = signal([{ hz: 440, d: 0.5 }, { hz: 493.88, d: 0.5 }])
  const s = new SerieBrute(); s.avancer(x, FS)
  const notes = notesAncien(s, { fs: FS, offsetS: 0.1, diapason: 442, planning: planningVide(), reglages: PROFILS_DEFAUT.legato })
  assert.equal(notes.length, 2)
  assert.ok(Math.abs(1200 * Math.log2(notes[0].f0Hz / 440)) < 3)
  assert.ok(Math.abs(1200 * Math.log2(notes[1].f0Hz / 493.88)) < 3)
  // la 1re note commence à 0,3 s dans le micro → 0,2 s dans le planning (retard de boucle 0,1 s)
  assert.ok(Math.abs(notes[0].tOn - 0.2) < 0.08, `tOn ${notes[0].tOn}`)
  assert.ok(notes[1].tOn > notes[0].tOff)
  assert.ok(Number.isFinite(notes[0].sigmaCents) && (notes[0].sigmaCents ?? 0) > 0)
})

test('une note tenue à travers un changement d\'accord est coupée en deux morceaux', () => {
  const x = signal([{ hz: 440, d: 1.2 }])
  const s = new SerieBrute(); s.avancer(x, FS)
  const planning = planningVide([{ tDebut: 0, tFin: 0.8, entree: 0 }, { tDebut: 0.8, tFin: 3, entree: 1 }])
  const notes = notesAncien(s, { fs: FS, offsetS: 0, diapason: 442, planning, reglages: PROFILS_DEFAUT.legato })
  assert.equal(notes.length, 2)
  assert.equal(notes[0].coupeApres, true)
  assert.equal(notes[1].coupeAvant, true)
})

test('changer un seuil change le résultat sans recalculer les trames (gate trop haut = rien)', () => {
  const x = signal([{ hz: 440, d: 0.5 }])
  const s = new SerieBrute(); s.avancer(x, FS)
  const base = { fs: FS, offsetS: 0, diapason: 442, planning: planningVide() }
  assert.equal(notesAncien(s, { ...base, reglages: PROFILS_DEFAUT.legato }).length, 1)
  assert.equal(notesAncien(s, { ...base, reglages: { ...PROFILS_DEFAUT.legato, minNoteDurationMs: 800 } }).length, 0)
})

test('profil legato : valeurs validées sur iPad', () => {
  assert.deepEqual(PROFILS_DEFAUT.legato, { clarityThreshold: 0.70, gateLevel: 0.015, silenceDurationMs: 30, noteJumpCents: 25, minNoteDurationMs: 60, reattackDropRatio: 0.60 })
})
