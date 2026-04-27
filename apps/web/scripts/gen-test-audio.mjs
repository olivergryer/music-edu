/**
 * Génère un WAV mono 44100Hz simulant une clarinette Sib jouant une courte phrase.
 * Notes en pitch concert (diapason La=442Hz), certaines légèrement désaccordées.
 *
 * Timbre clarinette : harmoniques impairs (fondamentale + 3e + 5e + 7e).
 *
 * Usage : node apps/web/scripts/gen-test-audio.mjs
 * Sortie : apps/web/public/test-clarinette.wav
 */

import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
const OUT   = join(__dir, '../public/test-clarinette.wav')

const SAMPLE_RATE = 44100
const DIAPASON    = 442   // La4 = 442 Hz

// ─── Helpers ──────────────────────────────────────────────────────────────────

function midiToHz(midi, cents = 0) {
  return DIAPASON * Math.pow(2, (midi - 69 + cents / 100) / 12)
}

// Synthèse additive : fondamentale + harmoniques impairs (clarinette)
function genNote(hz, durationSec, sampleRate = SAMPLE_RATE, amplitude = 0.6) {
  const n       = Math.floor(durationSec * sampleRate)
  const samples = new Float32Array(n)
  // Enveloppe ADSR simple
  const attack  = Math.floor(0.04 * sampleRate)
  const release = Math.floor(0.06 * sampleRate)

  for (let i = 0; i < n; i++) {
    const t = i / sampleRate
    // Harmoniques impairs : pondération décroissante
    const v = Math.sin(2 * Math.PI * hz       * t)        * 1.00
            + Math.sin(2 * Math.PI * hz * 3   * t)        * 0.30
            + Math.sin(2 * Math.PI * hz * 5   * t)        * 0.10
            + Math.sin(2 * Math.PI * hz * 7   * t)        * 0.04
    // Enveloppe
    let env = 1
    if (i < attack)        env = i / attack
    if (i > n - release)   env = (n - i) / release
    samples[i] = v * amplitude * env / 1.44   // normalisation somme harmoniques
  }
  return samples
}

function genSilence(durationSec, sampleRate = SAMPLE_RATE) {
  return new Float32Array(Math.floor(durationSec * sampleRate))
}

// ─── Phrase de test ────────────────────────────────────────────────────────────
// Notes MIDI (concert pitch) + écart en cents (0 = juste tempéré A=442)
// Clarinette Sib : tessiture pratique Ré3–Ré6 (MIDI 50–86)
// Phrase en Si mineur, style académique
const PHRASE = [
  // [midiConcert, écartCents, durée_sec, silence_après_sec]
  { midi: 71, cents:   0,  dur: 1.8, sil: 0.15 },  // Si4  — juste
  { midi: 69, cents: +11,  dur: 1.4, sil: 0.12 },  // La4  — +11¢ sharp
  { midi: 67, cents:  -8,  dur: 1.6, sil: 0.18 },  // Sol4 — -8¢ flat
  { midi: 66, cents:   0,  dur: 0.9, sil: 0.10 },  // Fa#4 — juste
  { midi: 64, cents: +14,  dur: 1.5, sil: 0.15 },  // Mi4  — +14¢ sharp
  { midi: 62, cents:  -5,  dur: 2.0, sil: 0.20 },  // Ré4  — -5¢ flat
]

// ─── Assemblage ───────────────────────────────────────────────────────────────

const allChunks = []
for (const { midi, cents, dur, sil } of PHRASE) {
  const hz = midiToHz(midi, cents)
  allChunks.push(genNote(hz, dur))
  allChunks.push(genSilence(sil))
}

const totalSamples = allChunks.reduce((a, c) => a + c.length, 0)
const pcm = new Float32Array(totalSamples)
let offset = 0
for (const chunk of allChunks) {
  pcm.set(chunk, offset)
  offset += chunk.length
}

console.log(`Durée totale : ${(totalSamples / SAMPLE_RATE).toFixed(2)}s  (${totalSamples} samples)`)
console.log('Notes générées :')
PHRASE.forEach(({ midi, cents }) => {
  const noteNames = ['Do','Do#','Ré','Ré#','Mi','Fa','Fa#','Sol','Sol#','La','La#','Si']
  const name = noteNames[midi % 12]
  const oct  = Math.floor(midi / 12) - 1
  const hz   = midiToHz(midi, cents).toFixed(2)
  console.log(`  ${name}${oct}  ${hz} Hz  (${cents >= 0 ? '+' : ''}${cents}¢)`)
})

// ─── Écriture WAV ─────────────────────────────────────────────────────────────

function writeWav(filepath, samples, sampleRate) {
  const dataLen    = samples.length * 2          // 16-bit
  const bufSize    = 44 + dataLen
  const buf        = Buffer.alloc(bufSize)
  let pos = 0

  const write4 = (s) => { buf.write(s, pos, 'ascii'); pos += 4 }
  const writeU16 = (v) => { buf.writeUInt16LE(v, pos); pos += 2 }
  const writeU32 = (v) => { buf.writeUInt32LE(v, pos); pos += 4 }

  write4('RIFF')
  writeU32(bufSize - 8)   // taille fichier - 8
  write4('WAVE')
  write4('fmt ')
  writeU32(16)            // taille chunk fmt
  writeU16(1)             // PCM
  writeU16(1)             // mono
  writeU32(sampleRate)
  writeU32(sampleRate * 2)  // byte rate
  writeU16(2)             // block align
  writeU16(16)            // bits per sample
  write4('data')
  writeU32(dataLen)

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]))
    buf.writeInt16LE(Math.round(clamped * 32767), pos)
    pos += 2
  }

  writeFileSync(filepath, buf)
  console.log(`\nFichier écrit : ${filepath}`)
}

writeWav(OUT, pcm, SAMPLE_RATE)
