import * as Tone from 'tone'
import { midiToHz, JUST_RATIOS_CENTS } from './accordeurUtils'

// ─── Instruments ─────────────────────────────────────────────────────────────
export const INSTRUMENTS = {
  oscillator: { label: 'Sinusoïde',      loMidi: 0,  hiMidi: 127, isOsc: true },
  flute:      { label: 'Flûte',          loMidi: 59, hiMidi: 97  },
  oboe:       { label: 'Hautbois',       loMidi: 58, hiMidi: 92  },
  clarinet:   { label: 'Clarinette',     loMidi: 50, hiMidi: 95  },
  saxophone:  { label: 'Saxophone alto', loMidi: 49, hiMidi: 80  },
  bassoon:    { label: 'Basson',         loMidi: 34, hiMidi: 74  },
}

export function isOscillatorInstrument(instrument) {
  return INSTRUMENTS[instrument]?.isOsc === true
}

// ─── CDN MusyngKite ───────────────────────────────────────────────────────────
const MUSYNGKITE_BASE = 'https://gleitz.github.io/midi-js-soundfonts/MusyngKite/'
const NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

function midiToNoteName(midi) {
  return NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1)
}

// ~10-14 samples clés par instrument (tous les 3-4 demi-tons dans la tessiture)
const SAMPLE_MIDIS = {
  flute:     [60, 64, 67, 71, 74, 78, 81, 84, 88, 91, 95],
  oboe:      [58, 62, 65, 69, 72, 76, 79, 83, 86, 90],
  clarinet:  [50, 53, 57, 60, 64, 67, 71, 74, 78, 81, 85, 88, 92, 95],
  saxophone: [49, 52, 56, 59, 63, 66, 70, 73, 77, 80],
  bassoon:   [34, 38, 41, 45, 48, 52, 55, 59, 62, 66, 69, 73],
}

const SF_NAME = {
  flute:     'flute',
  oboe:      'oboe',
  clarinet:  'clarinet',
  saxophone: 'alto-sax',
  bassoon:   'bassoon',
}

// ─── Cache session ────────────────────────────────────────────────────────────
const _bufferCache = new Map()
const _inFlight    = new Map()

// ─── Chargement ───────────────────────────────────────────────────────────────
export async function loadInstrumentSamples(instrument, onProgress) {
  if (INSTRUMENTS[instrument]?.isOsc) { onProgress?.(1); return new Map() }

  if (_bufferCache.has(instrument)) { onProgress?.(1); return _bufferCache.get(instrument) }
  if (_inFlight.has(instrument)) {
    const map = await _inFlight.get(instrument)
    onProgress?.(1)
    return map
  }

  const midis   = SAMPLE_MIDIS[instrument]
  const baseUrl = MUSYNGKITE_BASE + SF_NAME[instrument] + '-mp3/'
  const urls    = {}
  midis.forEach(midi => { const n = midiToNoteName(midi); urls[n] = n + '.mp3' })

  const loadedPromise = new Promise(resolve => {
    const buffers = new Tone.ToneAudioBuffers({
      urls,
      baseUrl,
      onload: () => {
        onProgress?.(1)
        const map = new Map([['__tone__', { buffers, sampleMidis: midis }]])
        _bufferCache.set(instrument, map)
        _inFlight.delete(instrument)
        resolve(map)
      },
      onerror: e => {
        console.error(`windEngine: chargement échoué (${instrument})`, e)
        _inFlight.delete(instrument)
        resolve(new Map())
      },
    })
  })

  _inFlight.set(instrument, loadedPromise)
  return loadedPromise
}

// ─── Sample le plus proche ────────────────────────────────────────────────────
function findClosestMidi(target, sampleMidis) {
  return sampleMidis.reduce((best, m) =>
    Math.abs(m - target) < Math.abs(best - target) ? m : best
  )
}

// ─── Joue une note avec sustain infini ───────────────────────────────────────
// Retourne { src: { stop, playbackRate: { setTargetAtTime } }, midi, pitchCorrCents }
// callerRate dans setTargetAtTime = Math.pow(2, (diapasonCents + offset) / 1200)
// player.playbackRate = semitonesRate × callerRate
function _playToneNote(toneData, midi, centsOffset) {
  const { buffers, sampleMidis } = toneData
  const closestMidi  = findClosestMidi(midi, sampleMidis)
  const noteName     = midiToNoteName(closestMidi)

  let buffer
  try { buffer = buffers.get(noteName) } catch { return null }
  if (!buffer?.loaded) return null

  const semitonesRate = Math.pow(2, (midi - closestMidi) / 12)
  const initialRate   = semitonesRate * Math.pow(2, centsOffset / 1200)

  const dur       = buffer.duration
  const loopStart = Math.min(0.3, dur * 0.15)
  const loopEnd   = dur * 0.80

  const toneCtx = Tone.getContext()
  if (toneCtx.state === 'suspended') toneCtx.resume()

  const player = new Tone.Player({
    url:       buffer,
    loop:      true,
    loopStart,
    loopEnd,
    fadeIn:    0.02,
    fadeOut:   0.15,
  }).toDestination()

  player.playbackRate = initialRate
  player.start()

  return {
    src: {
      stop: () => {
        try { player.stop() } catch {}
        setTimeout(() => { try { player.dispose() } catch {} }, 400)
      },
      playbackRate: {
        setTargetAtTime: (callerRate) => {
          player.playbackRate = semitonesRate * callerRate
        },
      },
    },
    midi,
    pitchCorrCents: 0,
  }
}

// ─── Accord — sustain infini ──────────────────────────────────────────────────
// ctx ignoré pour instruments Tone.js (Tone gère son propre AudioContext)
export function playChord(ctx, midis, offsets, sampleMap, diapason = 442) {
  const diapasonCents = 1200 * Math.log2(diapason / 440)
  const toneData      = sampleMap?.get('__tone__')
  if (toneData) {
    return midis.map((midi, i) =>
      _playToneNote(toneData, midi, diapasonCents + (offsets[i] ?? 0))
    ).filter(Boolean)
  }
  return []
}

// ─── Accord oscillateurs ──────────────────────────────────────────────────────
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

// ─── Correction 5-limite ──────────────────────────────────────────────────────
function _correctionCinqLimite(semitoneFromTonic) {
  const justCents =
    semitoneFromTonic === 10 ? 968.825 :
    semitoneFromTonic === 6  ? 568.825 :
    JUST_RATIOS_CENTS[semitoneFromTonic]
  return justCents - semitoneFromTonic * 100
}

// ─── Phrase (version juste, legato) ──────────────────────────────────────────
// Retourne [{stop}] — compatible avec srcs.forEach(s => s.stop())
export function playPhrase(ctx, notes, sampleMap, referentiel, tonikMidi, diapason = 442) {
  const tonic         = tonikMidi ?? 60
  const diapasonCents = 1200 * Math.log2(diapason / 440)
  const toneData      = sampleMap?.get('__tone__')

  if (toneData) {
    const toneCtx = Tone.getContext()
    if (toneCtx.state === 'suspended') toneCtx.resume()

    const results = []
    let time = Tone.now() + 0.05

    notes.forEach(({ midiCible, debutMs, finMs }) => {
      const durSec = Math.max(0.2, Math.min((finMs - debutMs) / 1000, 2))
      let corrCents = 0
      if (referentiel === '5-limite') {
        corrCents = _correctionCinqLimite(((midiCible - tonic) % 12 + 12) % 12)
      }

      const { buffers, sampleMidis } = toneData
      const closestMidi  = findClosestMidi(midiCible, sampleMidis)
      let buffer
      try { buffer = buffers.get(midiToNoteName(closestMidi)) } catch { time += durSec; return }
      if (!buffer?.loaded) { time += durSec; return }

      const semitonesRate = Math.pow(2, (midiCible - closestMidi) / 12)
      const player = new Tone.Player({
        url:     buffer,
        loop:    false,
        fadeIn:  0.02,
        fadeOut: 0.08,
      }).toDestination()

      player.playbackRate = semitonesRate * Math.pow(2, (diapasonCents + corrCents) / 1200)
      player.start(time)
      player.stop(time + durSec)

      const disposeDelay = Math.max(0, (time - Tone.now() + durSec + 0.5) * 1000)
      setTimeout(() => { try { player.dispose() } catch {} }, disposeDelay)

      results.push({ stop: () => { try { player.stop() } catch {} } })
      time += durSec
    })

    return results
  }

  return playPhraseOscillator(ctx ?? new AudioContext(), notes, referentiel, tonikMidi, diapason)
}

// ─── Phrase oscillateurs ──────────────────────────────────────────────────────
export function playPhraseOscillator(ctx, notes, referentiel, tonikMidi, diapason = 442) {
  const tonic = tonikMidi ?? 60
  let time = ctx.currentTime + 0.05
  const oscs = []

  notes.forEach(({ midiCible, debutMs, finMs }) => {
    const durSec = Math.max(0.2, Math.min((finMs - debutMs) / 1000, 2))
    let hz = midiToHz(midiCible, diapason)
    if (referentiel === '5-limite') {
      hz *= Math.pow(2, _correctionCinqLimite(((midiCible - tonic) % 12 + 12) % 12) / 1200)
    }
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, time)
    gain.gain.setTargetAtTime(0.3, time, 0.02)
    gain.gain.setTargetAtTime(0, Math.max(time, time + durSec - 0.06), 0.03)
    gain.connect(ctx.destination)
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = hz
    osc.connect(gain)
    osc.start(time)
    osc.stop(time + durSec + 0.1)
    oscs.push(osc)
    time += durSec
  })

  return oscs
}

// ─── Durée totale phrase (ms) ─────────────────────────────────────────────────
export function phraseDurationMs(notes) {
  return notes.reduce((acc, n) => acc + Math.min(Math.max(200, n.finMs - n.debutMs), 2000), 0)
}
