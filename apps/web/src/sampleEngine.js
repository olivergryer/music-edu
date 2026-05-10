import { midiToHz, JUST_RATIOS_CENTS } from './accordeurUtils'

// ─── Base URL R2 ──────────────────────────────────────────────────────────────
const R2_BASE = 'https://pub-bcb45c74de5d47c598fedde0a9f6a474.r2.dev/samples/'

// Noms de notes pour les URLs R2 (bémols uniquement, jamais de dièses)
const R2_PC = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

// ─── Définitions des instruments ──────────────────────────────────────────────
export const INSTRUMENTS = {
  flute:     { label: 'Flûte',         loMidi: 59, hiMidi: 97, pattern: (n, o) => `flute/Flute.nonvib.ff.${n}${o}.stereo.aif`     },
  oboe:      { label: 'Hautbois',       loMidi: 58, hiMidi: 92, pattern: (n, o) => `oboe/Oboe.ff.${n}${o}.stereo.aif`               },
  clarinet:  { label: 'Clarinette',     loMidi: 50, hiMidi: 95, pattern: (n, o) => `clarinet/BbClarinet.ff.${n}${o}.stereo.aif`     },
  saxophone: { label: 'Saxophone alto', loMidi: 49, hiMidi: 80, pattern: (n, o) => `saxophone/AltoSax.NoVib.ff.${n}${o}.stereo.aif` },
  bassoon:   { label: 'Basson',         loMidi: 34, hiMidi: 74, pattern: (n, o) => `bassoon/Bassoon.ff.${n}${o}.stereo.aif`         },
}

// ─── URL d'un sample ─────────────────────────────────────────────────────────
function buildSampleUrl(instrument, midi) {
  const pc  = ((midi % 12) + 12) % 12
  const oct = Math.floor(midi / 12) - 1
  return R2_BASE + INSTRUMENTS[instrument].pattern(R2_PC[pc], oct)
}

// ─── Détection de l'onset (premier frame > -40 dB) ───────────────────────────
function detectOnset(buffer) {
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) {
    if (Math.abs(data[i]) > 0.01) return (i / buffer.sampleRate) * 1000
  }
  return 0
}

// ─── Cache mémoire (persist dans la session) ─────────────────────────────────
const _memCache  = new Map()  // instrument → Map<midi, {buffer, onsetMs}>
const _inFlight  = new Map()  // instrument → Promise (évite double-fetch)

// ─── Vérifie si un MIDI est dans la tessiture de l'instrument ─────────────────
export function inTessiture(instrument, midi) {
  const { loMidi, hiMidi } = INSTRUMENTS[instrument]
  return midi >= loMidi && midi <= hiMidi
}

// ─── Charge tous les samples d'un instrument ─────────────────────────────────
// onProgress(ratio 0-1) appelé à chaque sample chargé.
// Retourne Map<midi, {buffer: AudioBuffer, onsetMs: number}>
export async function loadInstrumentSamples(instrument, onProgress) {
  if (_memCache.has(instrument)) {
    onProgress?.(1)
    return _memCache.get(instrument)
  }
  if (_inFlight.has(instrument)) {
    const map = await _inFlight.get(instrument)
    onProgress?.(1)
    return map
  }

  const { loMidi, hiMidi } = INSTRUMENTS[instrument]
  const total = hiMidi - loMidi + 1
  const map   = new Map()
  let loaded  = 0

  const ctx = new AudioContext()

  const promise = Promise.all(
    Array.from({ length: total }, (_, i) => loMidi + i).map(async midi => {
      const url = buildSampleUrl(instrument, midi)
      try {
        const res = await fetch(url)
        if (!res.ok) throw new Error()
        const buf = await ctx.decodeAudioData(await res.arrayBuffer())
        map.set(midi, { buffer: buf, onsetMs: detectOnset(buf) })
      } catch {
        // sample absent ou CORS → note silencieuse
      }
      onProgress?.(++loaded / total)
    })
  ).then(() => {
    ctx.close()
    _memCache.set(instrument, map)
    _inFlight.delete(instrument)
    return map
  })

  _inFlight.set(instrument, promise)
  return promise
}

// ─── Correction cents 5-limite (miroir de centsCinqLimite dans accordeurUtils) ─
// Inclut : triton → 7:4 depuis dominante (−31.175¢), min7 → 7:4 (−31.175¢)
function _correctionCinqLimite(semitoneFromTonic) {
  const justCents =
    semitoneFromTonic === 10 ? 968.825 :
    semitoneFromTonic === 6  ? 568.825 :
    JUST_RATIOS_CENTS[semitoneFromTonic]
  return justCents - semitoneFromTonic * 100
}

// ─── Joue un seul sample ─────────────────────────────────────────────────────
// centsOffset = décalage total par rapport au pitch nominal du sample (440 Hz ET)
// Retourne l'AudioBufferSourceNode (pour mise à jour playbackRate ultérieure)
function _playSample(ctx, sampleMap, midi, durationMs, startTime, centsOffset) {
  const entry = sampleMap.get(midi)
  if (!entry) return null
  const { buffer, onsetMs } = entry
  const durSec = Math.min(durationMs, 2000) / 1000
  const src    = ctx.createBufferSource()
  src.buffer   = buffer
  src.playbackRate.value = Math.pow(2, centsOffset / 1200)
  const gain   = ctx.createGain()
  gain.gain.setValueAtTime(0.75, startTime)
  // Fondu sortie 50 ms avant la fin pour éviter les clics
  gain.gain.setTargetAtTime(0, Math.max(startTime, startTime + durSec - 0.08), 0.04)
  src.connect(gain)
  gain.connect(ctx.destination)
  src.start(startTime, onsetMs / 1000, durSec)
  return src
}

// ─── Joue un accord (simultané) ──────────────────────────────────────────────
// offsets : décalages knob en cents (relatifs au ET à 440 Hz)
// diapason : diapason cible (appliqué via playbackRate)
// Retourne [AudioBufferSourceNode] pour mise à jour smooth des playbackRates
export function playChord(ctx, midis, offsets, sampleMap, diapason = 442) {
  const t0            = ctx.currentTime + 0.05
  const diapasonCents = 1200 * Math.log2(diapason / 440)
  return midis.map((midi, i) => {
    const centsOffset = diapasonCents + (offsets[i] ?? 0)
    return _playSample(ctx, sampleMap, midi, 4000, t0, centsOffset)
  }).filter(Boolean)
}

// ─── Joue la phrase en version juste (legato, timestamps absolus) ─────────────
// notes : tableau issu de calculerEcarts ({ midiCible, debutMs, finMs })
// Retourne [AudioBufferSourceNode]
export function playPhrase(ctx, notes, sampleMap, referentiel, tonikMidi, diapason = 442) {
  const tonic         = tonikMidi ?? 60
  const diapasonCents = 1200 * Math.log2(diapason / 440)
  let time = ctx.currentTime + 0.05
  const srcs = []

  notes.forEach(note => {
    const { midiCible, debutMs, finMs } = note
    const durationMs = finMs - debutMs
    if (durationMs <= 0) return

    let corrCents = 0
    if (referentiel === '5-limite') {
      const interval = ((midiCible - tonic) % 12 + 12) % 12
      corrCents = _correctionCinqLimite(interval)
    }

    const centsOffset = diapasonCents + corrCents
    const src = _playSample(ctx, sampleMap, midiCible, durationMs, time, centsOffset)
    if (src) srcs.push(src)
    // Avancer le curseur même si la note est hors tessiture (silence légato)
    time += Math.min(durationMs, 2000) / 1000
  })

  return srcs
}

// ─── Durée totale d'une phrase (ms) ──────────────────────────────────────────
export function phraseDurationMs(notes) {
  return notes.reduce((acc, n) => acc + Math.min(n.finMs - n.debutMs, 2000), 0)
}
