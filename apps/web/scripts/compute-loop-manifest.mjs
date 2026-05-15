/**
 * compute-loop-manifest.mjs
 * Exécuter une seule fois : node apps/web/scripts/compute-loop-manifest.mjs
 * Génère apps/web/src/sampleLoopManifest.json avec, pour chaque sample :
 *   - onsetMs       : début du son utile (ms)
 *   - loopStart     : début de boucle (s), aligné sur passage par zéro positif
 *   - loopEnd       : fin de boucle (s), = loopStart + N × T (multiple entier de la période)
 *   - pitchCorrCents: correction de hauteur pour ramener au tempérament égal (cents)
 */

import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const R2_BASE = 'https://pub-bcb45c74de5d47c598fedde0a9f6a474.r2.dev/samples/'
const R2_PC   = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']

const INSTRUMENTS = {
  flute:     { loMidi: 59, hiMidi: 97,  pattern: (n, o) => `flute/Flute.nonvib.ff.${n}${o}.stereo.aif`     },
  oboe:      { loMidi: 58, hiMidi: 92,  pattern: (n, o) => `oboe/Oboe.ff.${n}${o}.stereo.aif`               },
  clarinet:  { loMidi: 50, hiMidi: 95,  pattern: (n, o) => `clarinet/BbClarinet.ff.${n}${o}.stereo.aif`     },
  saxophone: { loMidi: 49, hiMidi: 80,  pattern: (n, o) => `saxophone/AltoSax.NoVib.ff.${n}${o}.stereo.aif` },
  bassoon:   { loMidi: 34, hiMidi: 74,  pattern: (n, o) => `bassoon/Bassoon.ff.${n}${o}.stereo.aif`         },
}

// ─── AIFF 24-bit decoder (pas d'AudioContext disponible en Node) ───────────────
function decodeAiff(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer)
  const view  = new DataView(arrayBuffer)

  let numChannels = 2, numFrames = 0, sampleSize = 24, sampleRate = 44100
  let ssndStart = -1

  let pos = 12
  while (pos < bytes.length - 8) {
    const id   = String.fromCharCode(bytes[pos], bytes[pos+1], bytes[pos+2], bytes[pos+3])
    const size = view.getUint32(pos + 4)
    pos += 8
    if (id === 'COMM') {
      numChannels = view.getInt16(pos)
      numFrames   = view.getUint32(pos + 2)
      sampleSize  = view.getInt16(pos + 6)
      const exp   = (view.getUint16(pos + 8) & 0x7FFF) - 16383
      sampleRate  = view.getUint32(pos + 10) * Math.pow(2, exp - 31)
    } else if (id === 'SSND') {
      ssndStart = pos + 8 + view.getUint32(pos)
    }
    pos += size + (size & 1)
    if (ssndStart !== -1 && numFrames > 0) break
  }

  if (ssndStart < 0 || numFrames === 0) throw new Error('AIFF parse failed')

  const bytesPerSample = Math.ceil(sampleSize / 8)
  const stride = numChannels * bytesPerSample
  // Retourne canal 0 uniquement (mono suffisant pour analyse)
  const mono = new Float32Array(numFrames)
  for (let i = 0; i < numFrames; i++) {
    const p = ssndStart + i * stride
    let v = (bytes[p] << 16) | (bytes[p + 1] << 8) | bytes[p + 2]
    if (v & 0x800000) v |= ~0xFFFFFF
    mono[i] = v / 8388608
  }
  return { mono, numFrames, sampleRate }
}

// ─── Détection onset (premier sample > -40 dB) ───────────────────────────────
function detectOnset(mono, sampleRate) {
  for (let i = 0; i < mono.length; i++) {
    if (Math.abs(mono[i]) > 0.01) return (i / sampleRate) * 1000
  }
  return 0
}

// ─── Passage par zéro positif le plus proche de target ───────────────────────
function findPosiZeroCross(mono, target, range = 4000) {
  const end = Math.min(target + range, mono.length - 1)
  for (let i = target; i < end; i++) {
    if (mono[i] <= 0 && mono[i + 1] > 0) return i + 1
  }
  return target
}

// ─── Autocorrélation → période fondamentale en samples ───────────────────────
// Plage de recherche : 50 Hz .. 2000 Hz
// Prend le PREMIER pic local qui dépasse 80 % du maximum global
// → évite les erreurs d'octave (2×T au lieu de T)
function detectPeriod(mono, startSample, sampleRate, windowSize = 4096) {
  const minPeriod = Math.floor(sampleRate / 2000)
  const maxPeriod = Math.floor(sampleRate / 50)
  const end       = Math.min(startSample + windowSize, mono.length)
  const len       = end - startSample

  // Énergie de référence (lag=0)
  let e0 = 0
  for (let i = 0; i < len; i++) e0 += mono[startSample + i] ** 2

  // Calcule le vecteur d'autocorrélation normalisée sur toute la plage
  const acfVec = new Float32Array(maxPeriod + 1)
  for (let lag = minPeriod; lag <= Math.min(maxPeriod, len - 1); lag++) {
    let acf = 0, eLag = 0
    const n = len - lag
    for (let i = 0; i < n; i++) {
      acf  += mono[startSample + i] * mono[startSample + i + lag]
      eLag += mono[startSample + i + lag] ** 2
    }
    const norm = Math.sqrt(e0 * eLag)
    acfVec[lag] = norm > 0 ? acf / norm : 0
  }

  // Maximum global dans la plage
  let globalMax = -Infinity
  for (let lag = minPeriod; lag <= Math.min(maxPeriod, len - 1); lag++) {
    if (acfVec[lag] > globalMax) globalMax = acfVec[lag]
  }

  // Premier pic local dépassant 80 % du maximum global = fondamentale
  const threshold = 0.8 * globalMax
  for (let lag = minPeriod + 1; lag < Math.min(maxPeriod, len - 2); lag++) {
    if (acfVec[lag] > threshold &&
        acfVec[lag] >= acfVec[lag - 1] &&
        acfVec[lag] >= acfVec[lag + 1]) {
      return lag
    }
  }

  // Fallback : maximum global
  let bestPeriod = minPeriod
  let bestVal    = -Infinity
  for (let lag = minPeriod; lag <= Math.min(maxPeriod, len - 1); lag++) {
    if (acfVec[lag] > bestVal) { bestVal = acfVec[lag]; bestPeriod = lag }
  }
  return bestPeriod
}

// ─── Traitement d'un sample ───────────────────────────────────────────────────
function processSample(mono, sampleRate, midi) {
  const onsetMs      = detectOnset(mono, sampleRate)
  const sustainStart = Math.floor((onsetMs / 1000 + 0.20) * sampleRate)

  // Période fondamentale (autocorrélation sur 4096 samples dans la zone sustain)
  const period = detectPeriod(mono, sustainStart, sampleRate, 4096)

  // Loop start : passage par zéro positif dans le sustain
  const loopStartSample = findPosiZeroCross(mono, sustainStart + Math.floor(0.05 * sampleRate))

  // Loop end : loopStart + N × period, N tel que boucle ≈ 0.8s
  const N             = Math.max(1, Math.round(0.8 * sampleRate / period))
  const rawEnd        = loopStartSample + N * period
  const loopEndSample = Math.min(Math.round(rawEnd), mono.length - 1)

  const loopStart = loopStartSample / sampleRate
  const loopEnd   = loopEndSample   / sampleRate

  // Correction de justesse — garde-fou : si |corr| > 100¢ = erreur de détection
  const f0Measured = sampleRate / period
  const f0ET       = 440 * Math.pow(2, (midi - 69) / 12)
  const rawCents   = 1200 * Math.log2(f0ET / f0Measured)
  const pitchCorrCents = Math.abs(rawCents) > 100 ? 0 : parseFloat(rawCents.toFixed(2))

  return {
    onsetMs:        parseFloat(onsetMs.toFixed(2)),
    loopStart:      parseFloat(loopStart.toFixed(6)),
    loopEnd:        parseFloat(loopEnd.toFixed(6)),
    pitchCorrCents,
    periodSamples:  period,
  }
}

// ─── URL d'un sample ─────────────────────────────────────────────────────────
function buildUrl(instrument, midi) {
  const pc  = ((midi % 12) + 12) % 12
  const oct = Math.floor(midi / 12) - 1
  return R2_BASE + INSTRUMENTS[instrument].pattern(R2_PC[pc], oct)
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const manifest = {}
  const warnings = []
  const BATCH    = 8  // requêtes parallèles

  for (const [instrument, { loMidi, hiMidi }] of Object.entries(INSTRUMENTS)) {
    manifest[instrument] = {}
    const midis = Array.from({ length: hiMidi - loMidi + 1 }, (_, i) => loMidi + i)
    let done = 0

    for (let b = 0; b < midis.length; b += BATCH) {
      const batch = midis.slice(b, b + BATCH)
      await Promise.all(batch.map(async midi => {
        const url = buildUrl(instrument, midi)
        try {
          const res = await fetch(url)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const buf = await res.arrayBuffer()
          const { mono, sampleRate } = decodeAiff(buf)
          const entry = processSample(mono, sampleRate, midi)
          manifest[instrument][midi] = entry

          if (Math.abs(entry.pitchCorrCents) > 1) {
            warnings.push(`  ⚠  ${instrument} MIDI ${midi} → ${entry.pitchCorrCents > 0 ? '+' : ''}${entry.pitchCorrCents}¢`)
          }
        } catch (e) {
          console.error(`  ✗ ${instrument} ${midi}: ${e.message}`)
        }
        process.stdout.write(`\r${instrument}: ${++done}/${midis.length}   `)
      }))
    }
    console.log()
  }

  // Rapport justesse
  if (warnings.length > 0) {
    console.log('\nSamples avec correction > ±5¢ :')
    warnings.forEach(w => console.log(w))
  } else {
    console.log('\nTous les samples dans ±1¢ du tempérament égal.')
  }

  // Écriture manifest
  const outPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../src/sampleLoopManifest.json'
  )
  writeFileSync(outPath, JSON.stringify(manifest, null, 2))
  console.log(`\nManifest écrit : ${outPath}`)

  // Taille estimée du fichier
  const total = Object.values(manifest).reduce((s, m) => s + Object.keys(m).length, 0)
  console.log(`${total} samples traités.`)
}

main().catch(e => { console.error(e); process.exit(1) })
