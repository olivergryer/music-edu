import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyserBuffer } from './accordeurUtils.js'

// AudioBuffer minimal : sinusoïde pure à `freq`, amplitude `amp`.
function sineBuffer(freq: number, amp: number, sr = 44100, dur = 0.5) {
  const n = Math.floor(sr * dur)
  const data = new Float32Array(n)
  for (let i = 0; i < n; i++) data[i] = amp * Math.sin(2 * Math.PI * freq * i / sr)
  return { sampleRate: sr, getChannelData: () => data } as unknown as AudioBuffer
}

const countPitched = (serie: any[]) => serie.filter(p => p.hz).length

test('normalisation : signal ×0.003 (type iPad) toujours détecté', () => {
  const loud = analyserBuffer(sineBuffer(440, 0.3),   { clarityThreshold: 0.8, rmsGate: 0.02 })
  const weak = analyserBuffer(sineBuffer(440, 0.003), { clarityThreshold: 0.8, rmsGate: 0.02 })
  assert.ok(countPitched(loud) > 5, 'signal fort détecté')
  assert.ok(countPitched(weak) > 5, 'signal 100× plus faible détecté grâce à la normalisation')
})

test('sans normalisation : le signal faible est gaté (reproduit le bug iPad)', () => {
  const weak = analyserBuffer(sineBuffer(440, 0.003), { clarityThreshold: 0.8, rmsGate: 0.02, normalize: false })
  assert.equal(countPitched(weak), 0)
})
