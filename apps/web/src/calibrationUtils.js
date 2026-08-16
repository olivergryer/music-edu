// Outils de calibration interne des paramètres de détection/segmentation
// (clarté, gate, silence, saut, durée min). Voir CalibrationPage.

import { analyserBuffer, segmenter, noteNameToPC, NOTE_NAMES_FR, TRANSPOSITIONS } from './accordeurUtils.js'

// ─── Écrit → concert ──────────────────────────────────────────────────────────
// Le micro détecte la hauteur CONCERT (Hz absolu). Les exercices sont écrits en
// Do majeur « tel que lu » par l'instrumentiste. Pour un instrument transpositeur
// (transpoKey ≠ 'C'), on convertit les noms attendus vers le concert avant de
// comparer : written = concert + offset  ⇒  concert = written − offset.
// Octave-insensible : on ne compare que les classes de hauteur (noms).
export function toConcertNames(names, transpoKey = 'C') {
  const offset = TRANSPOSITIONS[transpoKey]?.offset ?? 0
  if (offset === 0) return names
  return names.map(n => NOTE_NAMES_FR[((noteNameToPC(n) - offset) % 12 + 12) % 12])
}

// ─── Set d'exercices ──────────────────────────────────────────────────────────
// variant : 'sequence'   → noms doivent matcher dans l'ordre exact
//           'repete'     → toutes les notes doivent matcher le 1er nom attendu
//           'progressif' → même règle que sequence (durées croissantes sur la
//                          même hauteur — comparateur fonctionne pareil)
const DOMAJ = ['Do', 'Ré', 'Mi', 'Fa', 'Sol', 'La', 'Si', 'Do']
const LEGATO_AR = ['Do', 'Ré', 'Mi', 'Fa', 'Sol', 'Fa', 'Mi', 'Ré', 'Do']

export const EXERCISES = [
  {
    id: 'gamme_lie_noire_60',
    label: 'Gamme Do maj liée — noires 60bpm',
    instructions: 'Joue une gamme de Do majeur, une octave (Do4 → Do5), en noires liées à 60 bpm. 8 notes au total, sans rupture entre les notes.',
    variant: 'sequence',
    expectedNames: DOMAJ,
  },
  {
    id: 'gamme_detache_long',
    label: 'Gamme Do maj détachée longue',
    instructions: 'Gamme de Do majeur, une octave, détaché long à 60 bpm. Chaque note ~700 ms son + ~300 ms silence.',
    variant: 'sequence',
    expectedNames: DOMAJ,
  },
  {
    id: 'gamme_detache_court',
    label: 'Gamme Do maj détachée courte (staccato)',
    instructions: 'Gamme de Do majeur, une octave, détaché staccato à 60 bpm. Chaque note ~300 ms son + ~700 ms silence.',
    variant: 'sequence',
    expectedNames: DOMAJ,
  },
  {
    id: 'gamme_lie_croche',
    label: 'Gamme Do maj — croches liées',
    instructions: 'Gamme de Do majeur, une octave, croches liées à 60 bpm. 8 notes ~500 ms chacune.',
    variant: 'sequence',
    expectedNames: DOMAJ,
  },
  {
    id: 'gamme_lie_double',
    label: 'Gamme Do maj — doubles croches liées',
    instructions: 'Gamme de Do majeur, une octave, doubles croches liées à 60 bpm. 8 notes ~250 ms chacune.',
    variant: 'sequence',
    expectedNames: DOMAJ,
  },
  {
    id: 'repete_noire_10',
    label: '10 Do répétés en noires',
    instructions: 'Joue 10 fois Do4 en noires détachées à 60 bpm.',
    variant: 'repete',
    expectedNames: Array(10).fill('Do'),
  },
  {
    id: 'duree_croissante',
    label: 'Durées croissantes sur Do',
    instructions: 'Joue Do4 répété avec des durées croissantes : 100, 200, 300, 500, 800, 1200 ms. ~200 ms de silence entre chaque.',
    variant: 'progressif',
    expectedNames: Array(6).fill('Do'),
  },
  {
    id: 'legato_aller_retour',
    label: 'Aller-retour lié Do-Sol-Do',
    instructions: 'Do-Ré-Mi-Fa-Sol-Fa-Mi-Ré-Do, liées, noires à 60 bpm. 9 notes.',
    variant: 'sequence',
    expectedNames: LEGATO_AR,
  },
]

// ─── Niveau du signal enregistré (diagnostic gain micro) ──────────────────────
// Renvoie le pic absolu + le RMS max/moyen par frame (mêmes frames que l'analyse).
// Sert à voir si le signal passe au-dessus du gate — utile pour diagnostiquer les
// appareils au micro faible (ex. iPad AGC désactivé → signal sous le gate).
export function bufferLevel(audioBuffer, frameSize = 2048, hopSize = 512) {
  const data = audioBuffer.getChannelData(0)
  let peak = 0, rmsMax = 0, rmsSum = 0, n = 0
  for (let i = 0; i + frameSize <= data.length; i += hopSize) {
    let s = 0
    for (let k = 0; k < frameSize; k++) {
      const v = data[i + k]
      s += v * v
      const a = v < 0 ? -v : v
      if (a > peak) peak = a
    }
    const rms = Math.sqrt(s / frameSize)
    if (rms > rmsMax) rmsMax = rms
    rmsSum += rms; n++
  }
  return {
    peak:    +peak.toFixed(4),
    rmsMax:  +rmsMax.toFixed(4),
    rmsMean: +(n ? rmsSum / n : 0).toFixed(4),
  }
}

// ─── Métrique binaire pass/fail ───────────────────────────────────────────────
export function exerciseValid(detectedNames, expectedNames, variant) {
  if (detectedNames.length !== expectedNames.length) return false
  if (variant === 'repete' || variant === 'progressif') {
    const target = expectedNames[0]
    return detectedNames.every(d => d === target)
  }
  // sequence
  return detectedNames.every((d, i) => d === expectedNames[i])
}

// ─── Paramètres centraux (= profil Détaché actuel) ────────────────────────────
export const CENTER_PARAMS = {
  clarityThreshold:  0.82,
  gateLevel:         0.02,
  silenceDurationMs: 50,
  noteJumpCents:     30,
  minNoteDurationMs: 80,
  reattackDropRatio: 0,     // 0 = ré-attaque désactivée (neutre par défaut)
}

// ─── Ranges de sweep par paramètre ────────────────────────────────────────────
function range(start, end, step) {
  const out = []
  // Évite l'accumulation d'erreur flottante
  const n = Math.round((end - start) / step) + 1
  for (let i = 0; i < n; i++) out.push(+(start + i * step).toFixed(6))
  return out
}

export const SWEEP_RANGES = {
  clarityThreshold:  range(0.55, 0.95, 0.025),  // 17
  gateLevel:         range(0.005, 0.05, 0.0025), // 19
  silenceDurationMs: range(10, 200, 10),         // 20
  noteJumpCents:     range(15, 100, 5),          // 18
  minNoteDurationMs: range(20, 200, 10),         // 19
  reattackDropRatio: range(0, 0.6, 0.05),        // 13 (0 = désactivé)
}

export const PARAM_KEYS = ['clarityThreshold', 'gateLevel', 'silenceDurationMs', 'noteJumpCents', 'minNoteDurationMs', 'reattackDropRatio']

// ─── Sweep d'un paramètre sur un buffer ───────────────────────────────────────
// Renvoie [{ value, pass }]
function sweepOneParam(audioBuffer, paramKey, expectedNames, variant, diapason = 442) {
  const values = SWEEP_RANGES[paramKey]
  const results = []
  for (const v of values) {
    const params = { ...CENTER_PARAMS, [paramKey]: v }
    const serie = analyserBuffer(audioBuffer, {
      clarityThreshold: params.clarityThreshold,
      rmsGate:          params.gateLevel,
    })
    const segs = segmenter(serie, diapason, {
      silenceDurationMs: params.silenceDurationMs,
      noteJumpCents:     params.noteJumpCents,
      minNoteDurationMs: params.minNoteDurationMs,
      reattackDropRatio: params.reattackDropRatio,
    })
    const detectedNames = segs.map(s => s.nom)
    results.push({ value: v, pass: exerciseValid(detectedNames, expectedNames, variant) })
  }
  return results
}

// ─── Plage acceptable : plus longue séquence contiguë de pass ────────────────
export function findAcceptableRange(sweepResults) {
  let bestStart = -1, bestLen = 0
  let curStart = -1, curLen = 0
  sweepResults.forEach((r, i) => {
    if (r.pass) {
      if (curLen === 0) curStart = i
      curLen++
      if (curLen > bestLen) { bestLen = curLen; bestStart = curStart }
    } else {
      curLen = 0
    }
  })
  if (bestLen === 0) return null
  const min = sweepResults[bestStart].value
  const max = sweepResults[bestStart + bestLen - 1].value
  const mid = +((min + max) / 2).toFixed(6)
  return { min, max, mid }
}

// ─── Sweep complet pour un exercice ───────────────────────────────────────────
export function runSweepForExercise(audioBuffer, exercise, diapason = 442, transpoKey = 'C') {
  // Noms attendus convertis en hauteur concert selon la transposition instrument.
  const expectedConcert = toConcertNames(exercise.expectedNames, transpoKey)
  const sweep = {}
  const acceptableRanges = {}
  for (const key of PARAM_KEYS) {
    const sw = sweepOneParam(audioBuffer, key, expectedConcert, exercise.variant, diapason)
    sweep[key] = sw
    acceptableRanges[key] = findAcceptableRange(sw)
  }
  // Détection avec paramètres centraux pour info
  const centerSerie = analyserBuffer(audioBuffer, {
    clarityThreshold: CENTER_PARAMS.clarityThreshold,
    rmsGate:          CENTER_PARAMS.gateLevel,
  })
  const centerSegs = segmenter(centerSerie, diapason, {
    silenceDurationMs: CENTER_PARAMS.silenceDurationMs,
    noteJumpCents:     CENTER_PARAMS.noteJumpCents,
    minNoteDurationMs: CENTER_PARAMS.minNoteDurationMs,
    reattackDropRatio: CENTER_PARAMS.reattackDropRatio,
  })
  return {
    id: exercise.id,
    detectedCountFinal: centerSegs.length,
    // Niveau du signal (pic + RMS) vs gate central — diagnostic gain micro.
    level: { ...bufferLevel(audioBuffer), gate: CENTER_PARAMS.gateLevel },
    // Notes réellement détectées avec les paramètres centraux (debug UI).
    detectedNotes: centerSegs.map(s => ({
      nom: s.nom,
      octave: s.octave,
      dureeMs: Math.round(s.finMs - s.debutMs),
    })),
    // Noms concert attendus (déjà transposés) pour comparaison à l'affichage.
    expectedConcert,
    sweep,
    acceptableRanges,
  }
}

// ─── Mapping exercice → profil ─────────────────────────────────────────────────
export const PROFILE_EXERCISES = {
  legato:  ['gamme_lie_noire_60', 'gamme_lie_croche', 'gamme_lie_double', 'legato_aller_retour'],
  detache: ['gamme_detache_long', 'repete_noire_10', 'duree_croissante'],
  rapide:  ['gamme_detache_court', 'gamme_lie_double'],
}

// ─── Dérivation profils suggérés ──────────────────────────────────────────────
// Pour chaque profil et chaque paramètre :
//   intersection des plages acceptables → mid de l'intersection.
//   si vide → mid de la plage la plus large + conflict flag.
export function deriveSuggestedProfiles(exerciseResults) {
  // exerciseResults : Map exId → { acceptableRanges }
  const out = {}
  for (const [profile, exIds] of Object.entries(PROFILE_EXERCISES)) {
    const params = {}
    const conflicts = []
    for (const key of PARAM_KEYS) {
      const ranges = exIds
        .map(id => exerciseResults.get(id)?.acceptableRanges?.[key])
        .filter(Boolean)
      if (ranges.length === 0) {
        // Aucun exercice n'a de plage : fallback valeur centrale
        params[key] = CENTER_PARAMS[key]
        conflicts.push(key)
        continue
      }
      const interMin = Math.max(...ranges.map(r => r.min))
      const interMax = Math.min(...ranges.map(r => r.max))
      if (interMin <= interMax) {
        params[key] = +((interMin + interMax) / 2).toFixed(6)
      } else {
        // Pas d'intersection : prend la plus large
        const widest = ranges.reduce((a, b) => ((b.max - b.min) > (a.max - a.min) ? b : a))
        params[key] = widest.mid
        conflicts.push(key)
      }
    }
    out[profile] = { ...params, conflicts }
  }
  return out
}

// ─── Arrondi « propre » par paramètre (valeurs de défaut lisibles) ────────────
export const PARAM_ROUND = {
  clarityThreshold:  v => +v.toFixed(3),
  gateLevel:         v => +v.toFixed(4),
  silenceDurationMs: v => Math.round(v),
  noteJumpCents:     v => Math.round(v),
  minNoteDurationMs: v => Math.round(v),
  reattackDropRatio: v => +v.toFixed(2),
}

// ─── Agrégation multi-sessions → profils par défaut « safes » ─────────────────
// Méthode (à ré-appliquer à chaque ajout de sessions/instruments) :
//   pour chaque profil et chaque paramètre, on rassemble les plages acceptables
//   de TOUS les exercices du groupe sur TOUTES les sessions, on les INTERSECTE,
//   et on se place au CENTRE de l'intersection (point de marge maximale).
//   - intersection vide → conflit signalé, fallback = mid de la plage la plus large
//   - aucune plage       → conflit signalé, fallback = valeur centrale
// `sessions` : [{ exercises: [{ id, acceptableRanges }] }] (format Firestore).
export function aggregateProfilesFromSessions(sessions, profileExercises = PROFILE_EXERCISES) {
  const out = {}
  for (const [profile, exIds] of Object.entries(profileExercises)) {
    const params = {}
    const conflicts = []
    const details = {}
    for (const key of PARAM_KEYS) {
      const ranges = []
      for (const s of sessions) {
        for (const ex of (s.exercises || [])) {
          if (!exIds.includes(ex.id)) continue
          const r = ex.acceptableRanges?.[key]
          if (r) ranges.push(r)
        }
      }
      if (ranges.length === 0) {
        params[key] = CENTER_PARAMS[key]
        conflicts.push(key)
        details[key] = { n: 0, inter: null, source: 'fallback-center' }
        continue
      }
      const interMin = Math.max(...ranges.map(r => r.min))
      const interMax = Math.min(...ranges.map(r => r.max))
      if (interMin <= interMax) {
        params[key] = PARAM_ROUND[key]((interMin + interMax) / 2)
        details[key] = { n: ranges.length, inter: { min: interMin, max: interMax }, source: 'intersection' }
      } else {
        const widest = ranges.reduce((a, b) => ((b.max - b.min) > (a.max - a.min) ? b : a))
        params[key] = PARAM_ROUND[key](widest.mid)
        conflicts.push(key)
        details[key] = { n: ranges.length, inter: null, source: 'fallback-widest' }
      }
    }
    out[profile] = { ...params, conflicts, details }
  }
  return out
}

// ─── Override localStorage des ACC_PROFILES par AccordeurPage ─────────────────
export const ACC_PROFILES_OVERRIDE_KEY = 'acc_profiles_custom'

export function readProfilesOverride() {
  try {
    const raw = localStorage.getItem(ACC_PROFILES_OVERRIDE_KEY)
    if (!raw) return null
    const obj = JSON.parse(raw)
    if (obj && obj.legato && obj.detache && obj.rapide) return obj
    return null
  } catch { return null }
}

export function writeProfilesOverride(profiles) {
  // Nettoie le champ `conflicts` (info UI seulement)
  const sanitize = (p) => {
    const { conflicts, ...rest } = p
    return rest
  }
  const payload = {
    legato:  sanitize(profiles.legato),
    detache: sanitize(profiles.detache),
    rapide:  sanitize(profiles.rapide),
  }
  localStorage.setItem(ACC_PROFILES_OVERRIDE_KEY, JSON.stringify(payload))
}

export function clearProfilesOverride() {
  localStorage.removeItem(ACC_PROFILES_OVERRIDE_KEY)
}
