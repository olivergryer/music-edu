import { PitchDetector } from 'pitchy'

// ─── Constantes segmentation ──────────────────────────────────────────────────
const SILENCE_CONFIDENCE_MIN = 0.85   // en-dessous = silence (YIN renvoie null)
const SILENCE_DURATION_MS    = 80     // silence ≥ 80ms → nouvelle note
const NOTE_JUMP_CENTS        = 60     // saut > 60¢ en < 50ms → changement de note
const NOTE_JUMP_WINDOW_MS    = 50

// ─── Noms de notes (concert Do) ───────────────────────────────────────────────
export const NOTE_NAMES_FR = ['Do', 'Do#', 'Ré', 'Ré#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si']

// ─── Structures par défaut (une par tonique, non modifiables) ─────────────────
export const DEFAULT_STRUCTURES = NOTE_NAMES_FR.map((nom, i) => ({
  id:        `default-${i}`,
  nom,
  toniques:  [{ indexNote: 1, tonique: nom }],
  createdAt: '2026-01-01T00:00:00Z',
  public:    false,
  readOnly:  true,
}))

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
  return centsTempere(hz, diapason) + correction
}

// ─── Analyse audio ────────────────────────────────────────────────────────────

// Plage fréquentielle instrumentale acceptée (Hz)
const HZ_MIN = 60    // Si1 ≈ fondamentale la plus basse
const HZ_MAX = 2000  // couvre toutes tessituras instrumentales + voix

/**
 * Analyse un AudioBuffer et renvoie une série temporelle de fréquences.
 * @param {AudioBuffer} audioBuffer
 * @param {object} opts  { yinThreshold }
 * @returns {Array<{tMs: number, hz: number|null}>}
 */
function frameRMS(frame) {
  let sum = 0
  for (let k = 0; k < frame.length; k++) sum += frame[k] * frame[k]
  return Math.sqrt(sum / frame.length)
}

function preEmphasis(frame, coeff = 0.97) {
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
  const clarityThreshold = opts.clarityThreshold ?? 0.9
  const rmsGate   = opts.rmsGate ?? 0.01
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

  return segments.filter(s => s.frames.length >= 3)
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
