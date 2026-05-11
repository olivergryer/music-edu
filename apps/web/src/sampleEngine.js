import { midiToHz, JUST_RATIOS_CENTS } from './accordeurUtils'

// ─── Base URL R2 ──────────────────────────────────────────────────────────────
const R2_BASE = 'https://pub-bcb45c74de5d47c598fedde0a9f6a474.r2.dev/samples/'
const R2_PC   = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

// ─── Définitions des instruments ─────────────────────────────────────────────
export const INSTRUMENTS = {
  oscillator: { label: 'Sinusoïde',     loMidi: 0,  hiMidi: 127, isOsc: true },
  flute:      { label: 'Flûte',         loMidi: 59, hiMidi: 97,  pattern: (n, o) => `flute/Flute.nonvib.ff.${n}${o}.stereo.aif`     },
  oboe:       { label: 'Hautbois',      loMidi: 58, hiMidi: 92,  pattern: (n, o) => `oboe/Oboe.ff.${n}${o}.stereo.aif`               },
  clarinet:   { label: 'Clarinette',    loMidi: 50, hiMidi: 95,  pattern: (n, o) => `clarinet/BbClarinet.ff.${n}${o}.stereo.aif`     },
  saxophone:  { label: 'Saxophone alto',loMidi: 49, hiMidi: 80,  pattern: (n, o) => `saxophone/AltoSax.NoVib.ff.${n}${o}.stereo.aif` },
  bassoon:    { label: 'Basson',        loMidi: 34, hiMidi: 74,  pattern: (n, o) => `bassoon/Bassoon.ff.${n}${o}.stereo.aif`         },
}

// ─── Instrument oscillateur ? ─────────────────────────────────────────────────
export function isOscillatorInstrument(instrument) {
  return INSTRUMENTS[instrument]?.isOsc === true
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

// ─── Point de boucle stable pour lecture infinie ──────────────────────────────
// Cherche un passage par zéro positif près du point cible.
function findPosiZeroCross(data, target, range = 2000) {
  const end = Math.min(target + range, data.length - 1)
  for (let i = target; i < end; i++) {
    if (data[i] <= 0 && data[i + 1] > 0) return i + 1
  }
  return target
}

// Crossfade in-place : fond les N derniers samples avant loopEnd
// dans les N premiers depuis loopStart → saut inaudible
function applyLoopCrossfade(buffer, loopStartSample, loopEndSample, xfMs = 20) {
  const sr        = buffer.sampleRate
  const xfSamples = Math.min(Math.round(xfMs / 1000 * sr), loopEndSample - loopStartSample)
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < xfSamples; i++) {
      const alpha    = i / xfSamples
      const endIdx   = loopEndSample - xfSamples + i
      const startIdx = loopStartSample + i
      if (endIdx >= 0 && endIdx < data.length && startIdx < data.length) {
        data[endIdx] = data[endIdx] * (1 - alpha) + data[startIdx] * alpha
      }
    }
  }
}

function findLoopPoints(buffer, onsetMs) {
  const sr   = buffer.sampleRate
  const data = buffer.getChannelData(0)
  // Sauter l'attaque (onset + 150ms)
  const sustainStart = Math.floor((onsetMs / 1000 + 0.15) * sr)
  // Début de boucle : 50ms dans le sustain
  const rawStart = sustainStart + Math.floor(0.05 * sr)
  // Fin de boucle : +400ms (boucle de 400ms)
  const rawEnd   = rawStart + Math.floor(0.4 * sr)

  if (rawEnd >= data.length) {
    return { loopStart: sustainStart / sr, loopEnd: buffer.duration }
  }

  const loopStartSample = findPosiZeroCross(data, rawStart)
  const loopEndSample   = findPosiZeroCross(data, rawEnd)
  applyLoopCrossfade(buffer, loopStartSample, loopEndSample)
  return {
    loopStart: loopStartSample / sr,
    loopEnd:   loopEndSample   / sr,
  }
}

// ─── Cache mémoire (persist dans la session) ─────────────────────────────────
const _memCache = new Map()   // instrument → Map<midi, {buffer, onsetMs, loopStart, loopEnd}>
const _inFlight = new Map()   // instrument → Promise

// ─── Charge tous les samples d'un instrument ─────────────────────────────────
export async function loadInstrumentSamples(instrument, onProgress) {
  // Oscillateur virtuel : pas de sample à charger
  if (INSTRUMENTS[instrument]?.isOsc) {
    onProgress?.(1)
    return new Map()
  }

  if (_memCache.has(instrument)) { onProgress?.(1); return _memCache.get(instrument) }
  if (_inFlight.has(instrument)) {
    const map = await _inFlight.get(instrument)
    onProgress?.(1)
    return map
  }

  const { loMidi, hiMidi } = INSTRUMENTS[instrument]
  const total = hiMidi - loMidi + 1
  const map   = new Map()
  let loaded  = 0
  const ctx   = new AudioContext()

  const promise = Promise.all(
    Array.from({ length: total }, (_, i) => loMidi + i).map(async midi => {
      const url = buildSampleUrl(instrument, midi)
      try {
        const res = await fetch(url)
        if (!res.ok) throw new Error()
        const buf = await ctx.decodeAudioData(await res.arrayBuffer())
        const onsetMs = detectOnset(buf)
        const { loopStart, loopEnd } = findLoopPoints(buf, onsetMs)
        map.set(midi, { buffer: buf, onsetMs, loopStart, loopEnd })
      } catch { /* note absente ou erreur réseau */ }
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

// ─── Correction 5-limite (= centsCinqLimite moins centsTempere) ───────────────
function _correctionCinqLimite(semitoneFromTonic) {
  const justCents =
    semitoneFromTonic === 10 ? 968.825 :
    semitoneFromTonic === 6  ? 568.825 :
    JUST_RATIOS_CENTS[semitoneFromTonic]
  return justCents - semitoneFromTonic * 100
}

// ─── Joue un sample, avec ou sans boucle ─────────────────────────────────────
// Retourne {src: AudioBufferSourceNode, midi}
function _playSample(ctx, sampleMap, midi, durationMs, startTime, centsOffset, loop = false) {
  const entry = sampleMap.get(midi)
  if (!entry) return null
  const { buffer, onsetMs, loopStart, loopEnd } = entry
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.playbackRate.value = Math.pow(2, centsOffset / 1200)

  if (loop) {
    src.loop      = true
    src.loopStart = loopStart
    src.loopEnd   = loopEnd
  }

  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.75, startTime)
  if (!loop) {
    const durSec = Math.min(durationMs, 2000) / 1000
    gain.gain.setTargetAtTime(0, Math.max(startTime, startTime + durSec - 0.08), 0.04)
    src.connect(gain)
    gain.connect(ctx.destination)
    src.start(startTime, onsetMs / 1000, durSec)
  } else {
    src.connect(gain)
    gain.connect(ctx.destination)
    src.start(startTime, onsetMs / 1000)
  }
  return { src, midi }
}

// ─── Joue un accord en boucle (samples, infini) ───────────────────────────────
// Retourne [{src, midi}] pour mise à jour smooth du playbackRate
export function playChord(ctx, midis, offsets, sampleMap, diapason = 442) {
  const t0            = ctx.currentTime + 0.05
  const diapasonCents = 1200 * Math.log2(diapason / 440)
  return midis.map((midi, i) => {
    const centsOffset = diapasonCents + (offsets[i] ?? 0)
    return _playSample(ctx, sampleMap, midi, 0, t0, centsOffset, true)
  }).filter(Boolean)
}

// ─── Joue un accord via oscillateurs sinusoïdaux ─────────────────────────────
// Retourne [{osc, gain, midi}] pour mise à jour smooth de la fréquence
export function playChordOscillator(ctx, midis, offsets, diapason = 442) {
  const t = ctx.currentTime
  return midis.map((midi, i) => {
    const hz   = midiToHz(midi, diapason) * Math.pow(2, (offsets[i] ?? 0) / 1200)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, t)
    gain.gain.setTargetAtTime(0.25, t, 0.02)
    gain.connect(ctx.destination)
    const osc = ctx.createOscillator()
    osc.type  = 'sine'
    osc.frequency.value = hz
    osc.connect(gain)
    osc.start()
    return { osc, gain, midi }
  })
}

// ─── Joue la phrase en version juste (samples, legato) ───────────────────────
// Durée mini par note : 200 ms. Retourne [AudioBufferSourceNode]
export function playPhrase(ctx, notes, sampleMap, referentiel, tonikMidi, diapason = 442) {
  const tonic         = tonikMidi ?? 60
  const diapasonCents = 1200 * Math.log2(diapason / 440)
  let time = ctx.currentTime + 0.05
  const srcs = []

  notes.forEach(note => {
    const { midiCible, debutMs, finMs } = note
    const rawMs     = finMs - debutMs
    const durationMs = Math.max(200, rawMs)

    let corrCents = 0
    if (referentiel === '5-limite') {
      const interval = ((midiCible - tonic) % 12 + 12) % 12
      corrCents = _correctionCinqLimite(interval)
    }

    const entry = _playSample(ctx, sampleMap, midiCible, durationMs, time, diapasonCents + corrCents, false)
    if (entry) srcs.push(entry.src)
    time += Math.min(durationMs, 2000) / 1000
  })

  return srcs
}

// ─── Joue la phrase via oscillateurs sinusoïdaux (version juste) ─────────────
export function playPhraseOscillator(ctx, notes, referentiel, tonikMidi, diapason = 442) {
  const tonic = tonikMidi ?? 60
  let time = ctx.currentTime + 0.05
  const oscs = []

  notes.forEach(note => {
    const { midiCible, debutMs, finMs } = note
    const durSec = Math.max(200, Math.min(finMs - debutMs, 2000)) / 1000

    let hz = midiToHz(midiCible, diapason)
    if (referentiel === '5-limite') {
      const interval = ((midiCible - tonic) % 12 + 12) % 12
      hz *= Math.pow(2, _correctionCinqLimite(interval) / 1200)
    }

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, time)
    gain.gain.setTargetAtTime(0.3, time, 0.02)
    gain.gain.setTargetAtTime(0, Math.max(time, time + durSec - 0.06), 0.03)
    gain.connect(ctx.destination)

    const osc = ctx.createOscillator()
    osc.type  = 'sine'
    osc.frequency.value = hz
    osc.connect(gain)
    osc.start(time)
    osc.stop(time + durSec + 0.1)
    oscs.push(osc)
    time += durSec
  })

  return oscs
}

// ─── Durée totale d'une phrase (ms, durée mini 200ms par note) ───────────────
export function phraseDurationMs(notes) {
  return notes.reduce((acc, n) => acc + Math.min(Math.max(200, n.finMs - n.debutMs), 2000), 0)
}
