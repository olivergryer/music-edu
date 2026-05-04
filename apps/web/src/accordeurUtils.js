import { PitchDetector } from 'pitchy'

// ─── Constantes segmentation ──────────────────────────────────────────────────
const SILENCE_CONFIDENCE_MIN = 0.85   // en-dessous = silence (YIN renvoie null)
const SILENCE_DURATION_MS    = 50     // silence ≥ 80ms → nouvelle note
const NOTE_JUMP_CENTS        = 30     // saut > 60¢ en < 50ms → changement de note
const NOTE_JUMP_WINDOW_MS    = 50

// ─── Noms de notes (concert Do) ───────────────────────────────────────────────
export const NOTE_NAMES_FR = ['Do', 'Réb', 'Ré', 'Mib', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'Sib', 'Si']

// ─── Mapping complet nom → classe de hauteur (inclut enharmoniques) ──────────
const _ALL_PC = {
  'Do': 0, 'Do#': 1, 'Dob': 11,
  'Réb': 1, 'Ré': 2, 'Ré#': 3,
  'Mib': 3, 'Mi': 4, 'Mi#': 5,
  'Fab': 4, 'Fa': 5, 'Fa#': 6,
  'Solb': 6, 'Sol': 7, 'Sol#': 8,
  'Lab': 8, 'La': 9, 'La#': 10,
  'Sib': 10, 'Si': 11, 'Si#': 0,
}

// Retourne la classe de hauteur (0–11) pour n'importe quel nom de note FR
export function noteNameToPC(name) {
  const pc = _ALL_PC[name]
  if (pc !== undefined) return pc
  const idx = NOTE_NAMES_FR.indexOf(name)
  return idx >= 0 ? idx : 0
}

// ─── Gamme chromatique enharmonique relative à une tonique ────────────────────
// Règle : +n demi-tons depuis T = lettre (T + degré_diatonique) + altération ad hoc
// Degrés diatoniques : [0,1,1,2,2,3,3,4,4,5,6,6] pour les offsets 0–11
const _LFR  = ['Do', 'Ré', 'Mi', 'Fa', 'Sol', 'La', 'Si']
const _LVEX = ['c',  'd',  'e',  'f',  'g',   'a',  'b' ]
const _LPC  = [0, 2, 4, 5, 7, 9, 11]          // demi-tons naturels (C…B)
const _STEP = [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 6, 6]

function _lidx(nom) {
  if (nom.startsWith('Sol')) return 4
  if (nom.startsWith('Si'))  return 6
  if (nom.startsWith('Do'))  return 0
  if (nom.startsWith('Ré'))  return 1
  if (nom.startsWith('Mi'))  return 2
  if (nom.startsWith('Fa'))  return 3
  if (nom.startsWith('La'))  return 5
  return 0
}

// Retourne tableau[12] indexé par classe de hauteur.
// null aux positions où l'altération serait double (rare, toniques altérées).
function _buildScale(tonicName, letters) {
  const tonicPC = noteNameToPC(tonicName)
  const tL  = _lidx(tonicName)
  const out = new Array(12)
  for (let off = 0; off < 12; off++) {
    const lIdx   = (tL + _STEP[off]) % 7
    const natInt = (_LPC[lIdx] - tonicPC + 12) % 12
    let acc = off - natInt
    // Normaliser dans [-6, 5] pour couvrir le cas tonique♯ (acc peut être -11)
    if (acc > 6)  acc -= 12
    if (acc < -6) acc += 12
    const l = letters[lIdx]
    out[(tonicPC + off) % 12] =
      acc === 0  ? l :
      acc === 1  ? l + '#' :
      acc === -1 ? l + 'b' :
      null  // double altération → le caller substituera le fallback
  }
  return out
}

const _DEFAULT_VEX = ['c', 'db', 'd', 'eb', 'e', 'f', 'f#', 'g', 'g#', 'a', 'bb', 'b']

// Retourne tableau[12] de noms français indexé par classe de hauteur (0=Do)
export function buildEnharmonicScale(tonicName) {
  const res = _buildScale(tonicName, _LFR)
  // Remplace les nulls (double altération) par le nom C-base
  return res.map((n, pc) => n ?? NOTE_NAMES_FR[pc])
}

// Même chose, notation VexFlow (lettres minuscules, '#'/'b')
export function buildEnharmonicVexScale(tonicName) {
  const res = _buildScale(tonicName, _LVEX)
  return res.map((n, pc) => n ?? _DEFAULT_VEX[pc])
}

// ─── Structures par défaut (une par tonique + enharmoniques) ──────────────────
const _ENH_EXTRAS = [
  { nom: 'Do#',  id: 'default-enh-1'  },
  { nom: 'Ré#',  id: 'default-enh-3'  },
  { nom: 'Solb', id: 'default-enh-6'  },
  { nom: 'Lab',  id: 'default-enh-8'  },
  { nom: 'La#',  id: 'default-enh-10' },
]

export const DEFAULT_STRUCTURES = [
  ...NOTE_NAMES_FR.map((nom, i) => ({
    id: `default-${i}`, nom,
    toniques:  [{ indexNote: 1, tonique: nom }],
    createdAt: '2026-01-01T00:00:00Z', public: false, readOnly: true,
  })),
  ..._ENH_EXTRAS.map(({ nom, id }) => ({
    id, nom,
    toniques:  [{ indexNote: 1, tonique: nom }],
    createdAt: '2026-01-01T00:00:00Z', public: false, readOnly: true,
  })),
]

// ─── Ratios 5-limite par demi-ton depuis tonique ──────────────────────────────
const JUST_RATIOS_CENTS = [
  0,       // unisson  1/1
  111.7,   // min 2    16/15
  203.9,   // maj 2    9/8
  315.6,   // min 3    6/5
  386.3,   // maj 3    5/4
  498.0,   // quarte   4/3
  582.5,   // triton   45/32
  702.0,   // quinte   3/2
  813.7,   // min 6    8/5
  884.4,   // maj 6    5/3
  996.1,   // min 7    16/9
  1088.3,  // maj 7    15/8
]

// ─── Transpositions (offset demi-tons vers Do concert) ────────────────────────
export const TRANSPOSITIONS = {
  'C':    { label: 'Do (concert)',  offset: 0  },
  'Bb':   { label: 'Si♭',          offset: 2  },
  'Eb':   { label: 'Mi♭',          offset: -3 },
  'F':    { label: 'Fa',           offset: -5 },
  'A':    { label: 'La',           offset: -3 },
}

// ─── Utilitaires fréquence ─────────────────────────────────────────────────────

export function hzToMidi(hz, diapason = 442) {
  return 69 + 12 * Math.log2(hz / diapason)
}

export function midiToHz(midi, diapason = 442) {
  return diapason * Math.pow(2, (midi - 69) / 12)
}

export function midiToNoteName(midi) {
  const name   = NOTE_NAMES_FR[((midi % 12) + 12) % 12]
  const octave = Math.floor(midi / 12) - 1
  return { name, octave }
}

/** Écart en cents entre une fréquence mesurée et la note tempérée la plus proche */
export function centsTempere(hz, diapason = 442) {
  const midi        = hzToMidi(hz, diapason)
  const midiRounded = Math.round(midi)
  return (midi - midiRounded) * 100
}

/** Écart en cents par rapport à la justesse 5-limite (depuis une tonique donnée)
 *  tonikMidi : MIDI de la tonique (concert) */
export function centsCinqLimite(hz, tonikMidi, diapason = 442) {
  const midi          = hzToMidi(hz, diapason)
  const midiRounded   = Math.round(midi)
  const semitoneFromC = ((midiRounded - tonikMidi) % 12 + 12) % 12
  const justCents     = JUST_RATIOS_CENTS[semitoneFromC]
  const temperedCents = semitoneFromC * 100
  const correction    = justCents - temperedCents   // correction à appliquer
  return centsTempere(hz, diapason) - correction
}

// ─── Analyse audio ────────────────────────────────────────────────────────────

// Plage fréquentielle instrumentale acceptée (Hz)
export const HZ_MIN = 60    // Si1 ≈ fondamentale la plus basse
export const HZ_MAX = 2000  // couvre toutes tessituras instrumentales + voix

/**
 * Analyse un AudioBuffer et renvoie une série temporelle de fréquences.
 * @param {AudioBuffer} audioBuffer
 * @param {object} opts  { yinThreshold }
 * @returns {Array<{tMs: number, hz: number|null}>}
 */
export function frameRMS(frame) {
  let sum = 0
  for (let k = 0; k < frame.length; k++) sum += frame[k] * frame[k]
  return Math.sqrt(sum / frame.length)
}

export function preEmphasis(frame, coeff = 0.97) {
  const out = new Float32Array(frame.length)
  out[0] = frame[0]
  for (let k = 1; k < frame.length; k++) out[k] = frame[k] - coeff * frame[k - 1]
  return out
}

function filtrerIsolés(serie) {
  return serie.map((pt, i) => {
    if (!pt.hz) return pt
    const prevHz = serie[i - 1]?.hz ?? null
    const nextHz = serie[i + 1]?.hz ?? null
    return (prevHz || nextHz) ? pt : { ...pt, hz: null }
  })
}

export function analyserBuffer(audioBuffer, opts = {}) {
  const clarityThreshold = opts.clarityThreshold ?? 0.85
  const rmsGate   = opts.rmsGate ?? 0.02
  const sampleRate  = audioBuffer.sampleRate
  const channelData = audioBuffer.getChannelData(0)

  const frameSize = 2048
  const hopSize   = 512
  const detector  = PitchDetector.forFloat32Array(frameSize)

  const serie = []

  for (let i = 0; i + frameSize <= channelData.length; i += hopSize) {
    const frame         = channelData.subarray(i, i + frameSize)
    const rms           = frameRMS(frame)
    const emphasized    = preEmphasis(frame)
    const [hz, clarity] = detector.findPitch(emphasized, sampleRate)
    const tMs           = (i / sampleRate) * 1000
    const hzVal = (rms >= rmsGate && clarity >= clarityThreshold && hz >= HZ_MIN && hz <= HZ_MAX) ? hz : null
    serie.push({ tMs, hz: hzVal })
  }

  return filtrerIsolés(serie)
}

// ─── Segmentation ─────────────────────────────────────────────────────────────

/**
 * Segmente la série temporelle en notes.
 * @param {number} diapason
 * @param {object} opts  { silenceDurationMs, noteJumpCents }
 * @returns {Array<{nom, octave, debutMs, finMs, frames: [{tMs, hz}]}>}
 */
export function segmenter(serie, diapason = 442, opts = {}) {
  const silenceDurationMs = opts.silenceDurationMs ?? SILENCE_DURATION_MS
  const noteJumpCents     = opts.noteJumpCents     ?? NOTE_JUMP_CENTS

  const segments = []
  let courant    = null

  for (let i = 0; i < serie.length; i++) {
    const { tMs, hz } = serie[i]

    if (!hz) {
      // ── Silence ──
      if (courant) {
        const silenceDebut = tMs
        let j = i + 1
        while (j < serie.length && !serie[j].hz) j++
        const silenceDuree = (j < serie.length ? serie[j].tMs : tMs) - silenceDebut
        if (silenceDuree >= silenceDurationMs) {
          courant.finMs = tMs
          segments.push(_finaliserSegment(courant, diapason))
          courant = null
          i = j - 1
        }
      }
      continue
    }

    if (!courant) {
      const midi   = Math.round(hzToMidi(hz, diapason))
      const { name: nom, octave } = midiToNoteName(midi)
      courant = { nom, octave, debutMs: tMs, finMs: tMs, frames: [] }
    } else {
      const lastHz = courant.frames.at(-1)?.hz
      if (lastHz) {
        const lastTMs  = courant.frames.at(-1).tMs
        const deltaTMs = tMs - lastTMs
        if (deltaTMs <= NOTE_JUMP_WINDOW_MS) {
          const saut = Math.abs(1200 * Math.log2(hz / lastHz))
          if (saut > noteJumpCents) {
            courant.finMs = lastTMs
            segments.push(_finaliserSegment(courant, diapason))
            const midi   = Math.round(hzToMidi(hz, diapason))
            const { name: nom, octave } = midiToNoteName(midi)
            courant = { nom, octave, debutMs: tMs, finMs: tMs, frames: [] }
          }
        }
      }
    }

    courant.frames.push({ tMs, hz })
    courant.finMs = tMs
  }

  if (courant && courant.frames.length >= 3) {
    segments.push(_finaliserSegment(courant, diapason))
  }

  return segments.filter(s => s.frames.length >= 3 && (s.finMs - s.debutMs) >= 100)
}

function _finaliserSegment(seg, diapason) {
  // Valider la note dominante par vote majoritaire
  const votes = {}
  seg.frames.forEach(({ hz }) => {
    if (!hz) return
    const midi = Math.round(hzToMidi(hz, diapason))
    votes[midi] = (votes[midi] || 0) + 1
  })
  const midiPrincipal = parseInt(Object.entries(votes).sort((a, b) => b[1] - a[1])[0]?.[0] ?? seg.nom)
  const { name: nom, octave } = midiToNoteName(midiPrincipal)
  return { ...seg, nom, octave, midiCible: midiPrincipal }
}

// ─── Calcul cents par note ─────────────────────────────────────────────────────

/**
 * Calcule μ et σ en cents pour chaque segment.
 * @param {string} referentiel  'tempere' | '5-limite'
 * @param {number} tonikMidi    MIDI de la tonique (concert, ignoré si tempéré)
 */
export function calculerEcarts(segments, referentiel, tonikMidi, diapason = 442) {
  return segments.map(seg => {
    const centsList = seg.frames
      .filter(f => f.hz)
      .map(f => referentiel === '5-limite'
        ? centsCinqLimite(f.hz, tonikMidi, diapason)
        : centsTempere(f.hz, diapason)
      )

    if (!centsList.length) return { ...seg, muCents: 0, sigmaCents: 0 }

    const mu    = centsList.reduce((a, b) => a + b, 0) / centsList.length
    const sigma = Math.sqrt(centsList.reduce((a, b) => a + (b - mu) ** 2, 0) / centsList.length)

    return { ...seg, muCents: mu, sigmaCents: sigma }
  })
}

// ─── Courbe brute ──────────────────────────────────────────────────────────────

export function courbebrute(serie, referentiel, tonikMidi, diapason = 442) {
  return serie
    .filter(p => p.hz)
    .map(p => ({
      tMs: p.tMs,
      cents: referentiel === '5-limite'
        ? centsCinqLimite(p.hz, tonikMidi, diapason)
        : centsTempere(p.hz, diapason),
    }))
}

// ─── Scores ───────────────────────────────────────────────────────────────────

export function scorePedagogique(notes, seuilCents) {
  const justes = notes.filter(n => Math.abs(n.muCents) <= seuilCents).length
  return { justes, total: notes.length, label: `${justes}/${notes.length}` }
}

export function scoreQualite(notes) {
  if (!notes.length) return 0
  const scores = notes.map(n => {
    const mu    = Math.abs(n.muCents)
    const sigma = n.sigmaCents
    if (mu > 30 || sigma > 20) return 0
    return Math.pow(1 - mu / 30, 1.5) * Math.pow(1 - sigma / 20, 0.8)
  })
  const moyenne = scores.reduce((a, b) => a + b, 0) / scores.length
  return Math.round(moyenne * 100)
}

// ─── Couleur justesse ─────────────────────────────────────────────────────────

export function couleurJustesse(muCents, seuil) {
  const abs = Math.abs(muCents)
  if (abs <= seuil)  return '#34d399'   // vert
  if (abs <= 25)     return '#fbbf24'   // orange
  return '#f87171'                      // rouge
}

// ─── Transposition affichage ──────────────────────────────────────────────────

/** Décale un MIDI concert vers l'affichage selon l'instrument transpositeur */
export function transposerMidi(midiConcert, transpoKey) {
  const offset = TRANSPOSITIONS[transpoKey]?.offset ?? 0
  return midiConcert + offset
}

export function transposerNom(nom, octave, transpoKey) {
  const offset = TRANSPOSITIONS[transpoKey]?.offset ?? 0
  if (offset === 0) return { nom, octave }
  const noteNames = NOTE_NAMES_FR
  const midiBase  = noteNames.indexOf(nom) + (octave + 1) * 12
  const midiTransp = midiBase + offset
  const { name, octave: transposedOctave } = midiToNoteName(midiTransp)
  return { nom: name, octave: transposedOctave }
}

// ─── UUID simple ──────────────────────────────────────────────────────────────

export function uuid() {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)
}

// ─── localStorage ─────────────────────────────────────────────────────────────

const KEY_STRUCTURES = 'accordeur_structures'
const KEY_SESSIONS   = 'accordeur_sessions'

export function lireStructures() {
  try { return JSON.parse(localStorage.getItem(KEY_STRUCTURES) ?? '[]') } catch { return [] }
}

export function sauvegarderStructure(s) {
  const list = lireStructures().filter(x => x.id !== s.id)
  localStorage.setItem(KEY_STRUCTURES, JSON.stringify([...list, s]))
}

export function supprimerStructure(id) {
  localStorage.setItem(KEY_STRUCTURES, JSON.stringify(lireStructures().filter(x => x.id !== id)))
}

export function lireSessions() {
  try { return JSON.parse(localStorage.getItem(KEY_SESSIONS) ?? '[]') } catch { return [] }
}

export function sauvegarderSession(session) {
  const list = lireSessions()
  localStorage.setItem(KEY_SESSIONS, JSON.stringify([...list, session]))
}

export function supprimerSession(id) {
  localStorage.setItem(KEY_SESSIONS, JSON.stringify(lireSessions().filter(s => s.id !== id)))
}

// ─── URL structure ────────────────────────────────────────────────────────────

export function structureVersURL(s) {
  const nom   = s.nom.replace(/ /g, '_')
  const parts = s.toniques.flatMap(t => [t.indexNote, t.tonique])
  return `${nom}|${parts.join('|')}`
}

export function urlVersStructure(str) {
  const parts = str.split('|')
  const nom   = (parts[0] ?? '').replace(/_/g, ' ')
  const toniques = []
  for (let i = 1; i + 1 < parts.length; i += 2) {
    toniques.push({ indexNote: parseInt(parts[i]), tonique: parts[i + 1] })
  }
  return { id: uuid(), nom, toniques, createdAt: new Date().toISOString(), public: true }
}

// ─── Analyse spectrale (FFT Cooley-Tukey radix-2) ────────────────────────────

function hannWindow(size) {
  const w = new Float32Array(size)
  for (let i = 0; i < size; i++) w[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (size - 1)))
  return w
}

function fftReal(signal) {
  const n = signal.length
  const real = new Float64Array(signal)
  const imag = new Float64Array(n)
  // bit-reversal permutation
  let j = 0
  for (let i = 1; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[real[i], real[j]] = [real[j], real[i]]
      ;[imag[i], imag[j]] = [imag[j], imag[i]]
    }
  }
  // Cooley-Tukey iterative
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len
    const wRe = Math.cos(ang), wIm = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let uRe = 1, uIm = 0
      for (let k = 0; k < len / 2; k++) {
        const eRe = real[i + k], eIm = imag[i + k]
        const oRe = real[i + k + len / 2] * uRe - imag[i + k + len / 2] * uIm
        const oIm = real[i + k + len / 2] * uIm + imag[i + k + len / 2] * uRe
        real[i + k]           = eRe + oRe
        imag[i + k]           = eIm + oIm
        real[i + k + len / 2] = eRe - oRe
        imag[i + k + len / 2] = eIm - oIm
        const newURe = uRe * wRe - uIm * wIm
        uIm = uRe * wIm + uIm * wRe
        uRe = newURe
      }
    }
  }
  return { real, imag }
}

function _spectrumFromSamples(data, fftSize) {
  const N_FRAMES = 8
  const hann     = hannWindow(fftSize)
  const bins     = fftSize / 2
  const accum    = new Float64Array(bins)
  let   count    = 0

  // Pad if segment shorter than fftSize
  let src = data
  if (src.length < fftSize) {
    src = new Float32Array(fftSize)
    src.set(data)
  }

  const step = Math.max(1, Math.floor((src.length - fftSize) / (N_FRAMES - 1)))
  for (let f = 0; f < N_FRAMES; f++) {
    const start = Math.min(f * step, src.length - fftSize)
    if (start < 0) break
    const windowed = new Float32Array(fftSize)
    for (let i = 0; i < fftSize; i++) windowed[i] = src[start + i] * hann[i]
    const { real, imag } = fftReal(windowed)
    for (let k = 0; k < bins; k++) accum[k] += Math.sqrt(real[k] * real[k] + imag[k] * imag[k])
    count++
  }

  const result = new Float32Array(bins)
  for (let k = 0; k < bins; k++) {
    const mag = accum[k] / (count * fftSize)
    result[k] = mag > 0 ? 20 * Math.log10(mag) : -120
  }
  return result
}

export function computeAverageSpectrum(audioBuffer, fftSize = 4096) {
  return _spectrumFromSamples(audioBuffer.getChannelData(0), fftSize)
}

// ─── Outils pédagogiques ───────────────────────────────────────────────────

export const ALL_ROOTS = [
  'Do','Do#','Réb','Ré','Ré#','Mib','Mi','Fa','Fa#','Solb','Sol','Sol#','Lab','La','La#','Sib','Si',
]

export const CHORD_TYPES = {
  'maj':   { label: 'Majeur',            intervals: [0, 4, 7] },
  'min':   { label: 'Mineur',            intervals: [0, 3, 7] },
  'dim':   { label: 'Diminué',           intervals: [0, 3, 6] },
  'dom7':  { label: '7e de dominante',   intervals: [0, 4, 7, 10] },
  'maj7':  { label: 'Majeur 7',          intervals: [0, 4, 7, 11] },
  'min7':  { label: 'Mineur 7',          intervals: [0, 3, 7, 10] },
  'hdim7': { label: 'Demi-diminuée',     intervals: [0, 3, 6, 10] },
  'dim7':  { label: 'Diminuée',          intervals: [0, 3, 6, 9] },
}

// Ascending close-position chord. inversion = index of bass note in original interval list.
export function buildChordMidis(rootName, type, inversion = 0, baseOctave = 4) {
  const rootPC = noteNameToPC(rootName)
  const ivals  = CHORD_TYPES[type].intervals
  const n      = ivals.length
  const rot    = [...ivals.slice(inversion), ...ivals.slice(0, inversion)]
  const baseMidi = rootPC + (baseOctave + 1) * 12 + rot[0]
  let prev = baseMidi
  return rot.map((iv, i) => {
    if (i === 0) return baseMidi
    let midi = rootPC + (baseOctave + 1) * 12 + iv
    while (midi <= prev) midi += 12
    prev = midi
    return midi
  })
}

export const SCALE_TYPES = {
  'major':      { label: 'Majeure',              intervals: [0, 2, 4, 5, 7, 9, 11] },
  'nat_minor':  { label: 'Mineure naturelle',     intervals: [0, 2, 3, 5, 7, 8, 10] },
  'harm_minor': { label: 'Mineure harmonique',    intervals: [0, 2, 3, 5, 7, 8, 11] },
  'mel_asc':    { label: 'Mélodique ascendante',  intervals: [0, 2, 3, 5, 7, 9, 11] },
  'mel_desc':   { label: 'Mélodique descendante', intervals: [0, 2, 3, 5, 7, 8, 10] },
}

export function buildScaleMidis(rootName, type, octave = 4) {
  const rootPC   = noteNameToPC(rootName)
  const rootMidi = rootPC + (octave + 1) * 12
  return SCALE_TYPES[type].intervals.map(iv => rootMidi + iv)
}

// Retourne un tableau de Float32Array, un spectre par note (basé sur debutMs/finMs)
export function computeSpectreParNote(audioBuffer, notes, fftSize = 4096) {
  const data = audioBuffer.getChannelData(0)
  const sr   = audioBuffer.sampleRate
  return notes.map(note => {
    const start = Math.max(0, Math.floor((note.debutMs / 1000) * sr))
    const end   = Math.min(data.length, Math.floor((note.finMs / 1000) * sr))
    return _spectrumFromSamples(data.slice(start, end), fftSize)
  })
}
