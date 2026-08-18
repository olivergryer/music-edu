// node scripts/generate-questions.js
// Génère public/data/questions.json à partir de:
//   - public/data/questions-base.json (questions manuelles)
//   - constantes tonalités + intervalles ci-dessous

import fs from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

// ─── Données tonalités ────────────────────────────────────────────────────────

const MAJOR_SHARP = [
  { note: 'Do',  count: 0, alts: [] },
  { note: 'Sol', count: 1, alts: ['Fa#'] },
  { note: 'Ré',  count: 2, alts: ['Fa#', 'Do#'] },
  { note: 'La',  count: 3, alts: ['Fa#', 'Do#', 'Sol#'] },
  { note: 'Mi',  count: 4, alts: ['Fa#', 'Do#', 'Sol#', 'Ré#'] },
  { note: 'Si',  count: 5, alts: ['Fa#', 'Do#', 'Sol#', 'Ré#', 'La#'] },
  { note: 'Fa#', count: 6, alts: ['Fa#', 'Do#', 'Sol#', 'Ré#', 'La#', 'Mi#'] },
  { note: 'Do#', count: 7, alts: ['Fa#', 'Do#', 'Sol#', 'Ré#', 'La#', 'Mi#', 'Si#'] },
]

const MAJOR_FLAT = [
  { note: 'Fa',   count: 1, alts: ['Sib'] },
  { note: 'Sib',  count: 2, alts: ['Sib', 'Mib'] },
  { note: 'Mib',  count: 3, alts: ['Sib', 'Mib', 'Lab'] },
  { note: 'Lab',  count: 4, alts: ['Sib', 'Mib', 'Lab', 'Réb'] },
  { note: 'Réb',  count: 5, alts: ['Sib', 'Mib', 'Lab', 'Réb', 'Solb'] },
  { note: 'Solb', count: 6, alts: ['Sib', 'Mib', 'Lab', 'Réb', 'Solb', 'Dob'] },
  { note: 'Dob',  count: 7, alts: ['Sib', 'Mib', 'Lab', 'Réb', 'Solb', 'Dob', 'Fab'] },
]

// Mineur naturel (même armure que relatif majeur)
const MINOR_SHARP = [
  { note: 'La',   count: 0, alts: [], accidentelle: 'Sol#' },
  { note: 'Mi',   count: 1, alts: ['Fa#'], accidentelle: 'Ré#' },
  { note: 'Si',   count: 2, alts: ['Fa#', 'Do#'], accidentelle: 'La#' },
  { note: 'Fa#',  count: 3, alts: ['Fa#', 'Do#', 'Sol#'], accidentelle: 'Mi#' },
  { note: 'Do#',  count: 4, alts: ['Fa#', 'Do#', 'Sol#', 'Ré#'], accidentelle: 'Si#' },
  { note: 'Sol#', count: 5, alts: ['Fa#', 'Do#', 'Sol#', 'Ré#', 'La#'], accidentelle: 'Fa##' },
  { note: 'Ré#',  count: 6, alts: ['Fa#', 'Do#', 'Sol#', 'Ré#', 'La#', 'Mi#'], accidentelle: 'Do##' },
  { note: 'La#',  count: 7, alts: ['Fa#', 'Do#', 'Sol#', 'Ré#', 'La#', 'Mi#', 'Si#'], accidentelle: 'Sol##' },
]

const MINOR_FLAT = [
  { note: 'Ré',  count: 1, alts: ['Sib'], accidentelle: 'Do#' },
  { note: 'Sol', count: 2, alts: ['Sib', 'Mib'], accidentelle: 'Fa#' },
  { note: 'Do',  count: 3, alts: ['Sib', 'Mib', 'Lab'], accidentelle: 'Si♮' },
  { note: 'Fa',  count: 4, alts: ['Sib', 'Mib', 'Lab', 'Réb'], accidentelle: 'Mi♮' },
  { note: 'Sib', count: 5, alts: ['Sib', 'Mib', 'Lab', 'Réb', 'Solb'], accidentelle: 'La♮' },
  { note: 'Mib', count: 6, alts: ['Sib', 'Mib', 'Lab', 'Réb', 'Solb', 'Dob'], accidentelle: 'Ré♮' },
  { note: 'Lab', count: 7, alts: ['Sib', 'Mib', 'Lab', 'Réb', 'Solb', 'Dob', 'Fab'], accidentelle: 'Sol♮' },
]

// ─── Données intervalles ──────────────────────────────────────────────────────

// Tous les noms d'intervalles (ordre ascendant par demi-tons)
const INTERVAL_NAMES = [
  'Unisson juste',      // 0
  'Seconde mineure',    // 1
  'Seconde majeure',    // 2
  'Tierce mineure',     // 3
  'Tierce majeure',     // 4
  'Quarte juste',       // 5
  'Quarte augmentée',   // 6
  'Quinte juste',       // 7
  'Sixte mineure',      // 8
  'Sixte majeure',      // 9
  'Septième mineure',   // 10
  'Septième majeure',   // 11
  'Octave juste',       // 12
]

// Questions texte : nature de l'intervalle Do → X
const TEXT_INTERVALS = [
  { to: 'Réb', name: 'Seconde mineure',    idx: 1 },
  { to: 'Ré',  name: 'Seconde majeure',    idx: 2 },
  { to: 'Mib', name: 'Tierce mineure',     idx: 3 },
  { to: 'Mi',  name: 'Tierce majeure',     idx: 4 },
  { to: 'Fa',  name: 'Quarte juste',       idx: 5 },
  { to: 'Fa#', name: 'Quarte augmentée',   idx: 6 },
  { to: 'Sol', name: 'Quinte juste',       idx: 7 },
  { to: 'Lab', name: 'Sixte mineure',      idx: 8 },
  { to: 'La',  name: 'Sixte majeure',      idx: 9 },
  { to: 'Sib', name: 'Septième mineure',   idx: 10 },
  { to: 'Si',  name: 'Septième majeure',   idx: 11 },
  { to: "Do'", name: 'Octave juste',       idx: 12 },
]

// Données pour génération algorithmique VexFlow
const VEX_INTERVAL_DEFS = [
  { name: 'Seconde mineure',    steps: 1, semis: 1,  idx: 1 },
  { name: 'Seconde majeure',    steps: 1, semis: 2,  idx: 2 },
  { name: 'Tierce mineure',     steps: 2, semis: 3,  idx: 3 },
  { name: 'Tierce majeure',     steps: 2, semis: 4,  idx: 4 },
  { name: 'Quarte juste',       steps: 3, semis: 5,  idx: 5 },
  { name: 'Quarte augmentée',   steps: 3, semis: 6,  idx: 6 },
  { name: 'Quinte juste',       steps: 4, semis: 7,  idx: 7 },
  { name: 'Sixte mineure',      steps: 5, semis: 8,  idx: 8 },
  { name: 'Sixte majeure',      steps: 5, semis: 9,  idx: 9 },
  { name: 'Septième mineure',   steps: 6, semis: 10, idx: 10 },
  { name: 'Septième majeure',   steps: 6, semis: 11, idx: 11 },
  { name: 'Octave juste',       steps: 7, semis: 12, idx: 12 },
]

const VEX_LETTERS = ['c', 'd', 'e', 'f', 'g', 'a', 'b']
const VEX_NATURAL_SEMIS = [0, 2, 4, 5, 7, 9, 11]

// Retourne la clé VexFlow de la seconde note (ex: 'f#/4') ou null si double altération requise.
function computeSecondNote(startLetterIdx, ivDef, ascending, startOctave = 4) {
  const startMidi = startOctave * 12 + VEX_NATURAL_SEMIS[startLetterIdx]

  let rawIdx, targetLetterIdx, targetOctave, targetMidi
  if (ascending) {
    rawIdx = startLetterIdx + ivDef.steps
    targetLetterIdx = rawIdx % 7
    targetOctave = startOctave + Math.floor(rawIdx / 7)
    targetMidi = startMidi + ivDef.semis
  } else {
    rawIdx = startLetterIdx - ivDef.steps
    targetLetterIdx = ((rawIdx % 7) + 7) % 7
    targetOctave = startOctave + Math.floor(rawIdx / 7)
    targetMidi = startMidi - ivDef.semis
  }

  const naturalMidi = targetOctave * 12 + VEX_NATURAL_SEMIS[targetLetterIdx]
  const accSemis = targetMidi - naturalMidi
  if (Math.abs(accSemis) > 1) return null

  const acc = accSemis === 1 ? '#' : accSemis === -1 ? 'b' : ''
  return `${VEX_LETTERS[targetLetterIdx]}${acc}/${targetOctave}`
}

const MIDI_G3 = 3 * 12 + 7  // = 43

// ─── Helpers ──────────────────────────────────────────────────────────────────

function altCountToLevel(n) {
  if (n === 0) return 'C1/1'
  if (n <= 1)  return 'C1/4'
  if (n <= 2)  return 'C2/1'
  if (n <= 3)  return 'C2/3'
  if (n <= 4)  return 'C2/4'
  return 'C3'
}

function intervalToLevel(idx) {
  if (idx <= 4) return 'C1/3'
  if (idx <= 7) return 'C2/1'
  if (idx <= 9) return 'C2/2'
  return 'C2/3'
}

function formatAlts(alts) {
  if (alts.length === 0) return 'Aucune altération'
  if (alts.length === 1) return alts[0]
  if (alts.length === 2) return `${alts[0]} et ${alts[1]}`
  return `${alts.slice(0, -1).join(', ')} et ${alts[alts.length - 1]}`
}

// Renvoie 3 distracteurs en alternant proches / lointains dans series + otherSeries
function altDistr3(series, idx, otherSeries, correct) {
  const candidates = []
  for (let d = 1; d < series.length; d++) {
    if (candidates.length >= 3) break
    if (idx - d >= 0) candidates.push(formatAlts(series[idx - d].alts))
    if (candidates.length < 3 && idx + d < series.length) candidates.push(formatAlts(series[idx + d].alts))
  }
  // Compléter avec l'autre série si besoin
  for (const k of otherSeries) {
    if (candidates.length >= 3) break
    const f = formatAlts(k.alts)
    if (f !== correct && !candidates.includes(f)) candidates.push(f)
  }
  return candidates.filter(c => c !== correct).slice(0, 3)
}

// Vocabulaire unifié : les deux termes sont enseignés ensemble
const A_LA_CLEF = "à l'armure / à la clef"

function idSafe(note) { return note.replace('#', 's') }

// « 3 dièses » / « 2 bémols » — null si armure vide
function altCountLabel(count, kind) {
  if (count === 0) return null
  return kind === 'd' ? `${count} dièse${count > 1 ? 's' : ''}` : `${count} bémol${count > 1 ? 's' : ''}`
}

function whichKeyQuestion(count, kind, modeAdj) {
  const fem = modeAdj === 'majeur' ? 'majeure' : 'mineure'
  const label = altCountLabel(count, kind)
  return label === null
    ? `Quelle tonalité ${fem} n'a aucune altération ${A_LA_CLEF} ?`
    : `Quelle tonalité ${fem} a ${label} ${A_LA_CLEF} ?`
}

function armureExplication(note, modeAdj, k) {
  if (k.alts.length === 0) return `En ${note} ${modeAdj}, l'armure est vide : aucune altération à la clef.`
  const kind = k.alts[0].includes('#') ? 'dièse' : 'bémol'
  return `En ${note} ${modeAdj}, l'armure comporte ${k.count} ${kind}${k.count > 1 ? 's' : ''} : ${formatAlts(k.alts)}.`
}

// Renvoie 3 tonalités distractrices : armures voisines du même mode, libellées avec le mode
function keyDistr3ByCount(series, idx, otherSeries, modeAdj) {
  const correct = `${series[idx].note} ${modeAdj}`
  const out = []
  for (let d = 1; out.length < 3 && d < series.length; d++) {
    if (idx - d >= 0) out.push(`${series[idx - d].note} ${modeAdj}`)
    if (out.length < 3 && idx + d < series.length) out.push(`${series[idx + d].note} ${modeAdj}`)
  }
  for (const k of otherSeries) {
    if (out.length >= 3) break
    const label = `${k.note} ${modeAdj}`
    if (!out.includes(label)) out.push(label)
  }
  return out.filter(l => l !== correct).slice(0, 3)
}

// Distracteurs d'intervalles : voisins dans INTERVAL_NAMES (questions texte)
function intervalDistr3(correctName) {
  const ci = INTERVAL_NAMES.indexOf(correctName)
  const result = []
  for (let d = 1; result.length < 3 && d < INTERVAL_NAMES.length; d++) {
    if (ci - d >= 0) result.push(INTERVAL_NAMES[ci - d])
    if (result.length < 3 && ci + d < INTERVAL_NAMES.length) result.push(INTERVAL_NAMES[ci + d])
  }
  return result
}

// Distracteurs VexFlow : même degré (même lettre cible, altération différente), puis voisins
function intervalDistr3SameDegree(correctName) {
  const def = VEX_INTERVAL_DEFS.find(d => d.name === correctName)
  if (!def) return intervalDistr3(correctName)
  const sameDeg = VEX_INTERVAL_DEFS.filter(d => d.steps === def.steps && d.name !== correctName).map(d => d.name)
  const result = [...sameDeg]
  const ci = VEX_INTERVAL_DEFS.indexOf(def)
  for (let d = 1; result.length < 3 && d < VEX_INTERVAL_DEFS.length; d++) {
    if (ci - d >= 0 && !result.includes(VEX_INTERVAL_DEFS[ci - d].name)) result.push(VEX_INTERVAL_DEFS[ci - d].name)
    if (result.length < 3 && ci + d < VEX_INTERVAL_DEFS.length && !result.includes(VEX_INTERVAL_DEFS[ci + d].name)) result.push(VEX_INTERVAL_DEFS[ci + d].name)
  }
  return result.filter(n => n !== correctName).slice(0, 3)
}

// ─── Générateurs ─────────────────────────────────────────────────────────────

function generateMajorAltQuestions() {
  const qs = []

  // "De quelle(s) altération(s) la gamme de X majeur est-elle constituée ?"
  const allSharp = MAJOR_SHARP.map(k => ({
    id: `TGM_${k.note.replace('#','s')}_alts`,
    niveau: altCountToLevel(k.count),
    categorie: 'tonalites_alterations',
    type: 'qcm',
    question: `De quelle(s) altération(s) la gamme de ${k.note} majeur est-elle constituée ?`,
    reponse_correcte: formatAlts(k.alts),
    ...Object.fromEntries(
      altDistr3(MAJOR_SHARP, MAJOR_SHARP.indexOf(k), MAJOR_FLAT, formatAlts(k.alts))
        .map((v, i) => [`reponse_fausse_${i + 1}`, v])
    ),
  }))

  const allFlat = MAJOR_FLAT.map(k => ({
    id: `TGM_${k.note.replace('b','b')}_alts`,
    niveau: altCountToLevel(k.count),
    categorie: 'tonalites_alterations',
    type: 'qcm',
    question: `De quelle(s) altération(s) la gamme de ${k.note} majeur est-elle constituée ?`,
    reponse_correcte: formatAlts(k.alts),
    ...Object.fromEntries(
      altDistr3(MAJOR_FLAT, MAJOR_FLAT.indexOf(k), MAJOR_SHARP, formatAlts(k.alts))
        .map((v, i) => [`reponse_fausse_${i + 1}`, v])
    ),
  }))

  qs.push(...allSharp, ...allFlat)

  // "Quelle tonalité majeure a N dièses à l'armure / à la clef ?"
  for (const k of MAJOR_SHARP) {
    const wrong = keyDistr3ByCount(MAJOR_SHARP, MAJOR_SHARP.indexOf(k), MAJOR_FLAT, 'majeur')
    qs.push({
      id: `TGM_${k.count}d_which`,
      niveau: altCountToLevel(k.count),
      categorie: 'tonalites_alterations',
      type: 'qcm',
      question: whichKeyQuestion(k.count, 'd', 'majeur'),
      reponse_correcte: `${k.note} majeur`,
      reponse_fausse_1: wrong[0],
      reponse_fausse_2: wrong[1],
      reponse_fausse_3: wrong[2],
      explication: armureExplication(k.note, 'majeur', k),
    })
  }

  for (const k of MAJOR_FLAT) {
    const wrong = keyDistr3ByCount(MAJOR_FLAT, MAJOR_FLAT.indexOf(k), MAJOR_SHARP, 'majeur')
    qs.push({
      id: `TGM_${k.count}b_which`,
      niveau: altCountToLevel(k.count),
      categorie: 'tonalites_alterations',
      type: 'qcm',
      question: whichKeyQuestion(k.count, 'b', 'majeur'),
      reponse_correcte: `${k.note} majeur`,
      reponse_fausse_1: wrong[0],
      reponse_fausse_2: wrong[1],
      reponse_fausse_3: wrong[2],
      explication: armureExplication(k.note, 'majeur', k),
    })
  }

  return qs
}

// « Que trouve-t-on à l'armure / à la clef en X majeur/mineur ? »
const ARMURE_SERIES = [
  { list: MAJOR_SHARP, other: MAJOR_FLAT,  modeAdj: 'majeur', tag: 'Md' },
  { list: MAJOR_FLAT,  other: MAJOR_SHARP, modeAdj: 'majeur', tag: 'Mb' },
  { list: MINOR_SHARP, other: MINOR_FLAT,  modeAdj: 'mineur', tag: 'md' },
  { list: MINOR_FLAT,  other: MINOR_SHARP, modeAdj: 'mineur', tag: 'mb' },
]

function generateArmureQuestions() {
  const qs = []
  for (const s of ARMURE_SERIES) {
    for (const k of s.list) {
      const correct = formatAlts(k.alts)
      qs.push({
        id: `TCL_${s.tag}_${idSafe(k.note)}`,
        niveau: altCountToLevel(k.count),
        categorie: 'tonalites_alterations',
        type: 'qcm',
        question: `Que trouve-t-on ${A_LA_CLEF} en ${k.note} ${s.modeAdj} ?`,
        reponse_correcte: correct,
        ...Object.fromEntries(
          altDistr3(s.list, s.list.indexOf(k), s.other, correct)
            .map((v, i) => [`reponse_fausse_${i + 1}`, v])
        ),
        explication: armureExplication(k.note, s.modeAdj, k),
      })
    }
  }
  return qs
}

function generateMinorAltQuestions() {
  const qs = []

  // "De quelle(s) altération(s) la gamme de X mineur est-elle constituée ?"
  for (const k of MINOR_SHARP) {
    const idx = MINOR_SHARP.indexOf(k)
    qs.push({
      id: `TGm_${k.note.replace('#','s')}_alts`,
      niveau: altCountToLevel(k.count),
      categorie: 'tonalites_alterations',
      type: 'qcm',
      question: `De quelle(s) altération(s) la gamme de ${k.note} mineur naturel est-elle constituée ?`,
      reponse_correcte: formatAlts(k.alts),
      ...Object.fromEntries(
        altDistr3(MINOR_SHARP, idx, MINOR_FLAT, formatAlts(k.alts))
          .map((v, i) => [`reponse_fausse_${i + 1}`, v])
      ),
    })
  }

  for (const k of MINOR_FLAT) {
    const idx = MINOR_FLAT.indexOf(k)
    qs.push({
      id: `TGm_${k.note}_alts`,
      niveau: altCountToLevel(k.count),
      categorie: 'tonalites_alterations',
      type: 'qcm',
      question: `De quelle(s) altération(s) la gamme de ${k.note} mineur naturel est-elle constituée ?`,
      reponse_correcte: formatAlts(k.alts),
      ...Object.fromEntries(
        altDistr3(MINOR_FLAT, idx, MINOR_SHARP, formatAlts(k.alts))
          .map((v, i) => [`reponse_fausse_${i + 1}`, v])
      ),
    })
  }

  // "Quelle tonalité mineure a N dièses/bémols à l'armure / à la clef ?"
  for (const k of MINOR_SHARP) {
    const wrong = keyDistr3ByCount(MINOR_SHARP, MINOR_SHARP.indexOf(k), MINOR_FLAT, 'mineur')
    qs.push({
      id: `TGm_${k.count}d_which`,
      niveau: altCountToLevel(k.count),
      categorie: 'tonalites_alterations',
      type: 'qcm',
      question: whichKeyQuestion(k.count, 'd', 'mineur'),
      reponse_correcte: `${k.note} mineur`,
      reponse_fausse_1: wrong[0],
      reponse_fausse_2: wrong[1],
      reponse_fausse_3: wrong[2],
      explication: armureExplication(k.note, 'mineur', k),
    })
  }

  for (const k of MINOR_FLAT) {
    const wrong = keyDistr3ByCount(MINOR_FLAT, MINOR_FLAT.indexOf(k), MINOR_SHARP, 'mineur')
    qs.push({
      id: `TGm_${k.count}b_which`,
      niveau: altCountToLevel(k.count),
      categorie: 'tonalites_alterations',
      type: 'qcm',
      question: whichKeyQuestion(k.count, 'b', 'mineur'),
      reponse_correcte: `${k.note} mineur`,
      reponse_fausse_1: wrong[0],
      reponse_fausse_2: wrong[1],
      reponse_fausse_3: wrong[2],
      explication: armureExplication(k.note, 'mineur', k),
    })
  }

  // "Quelle est l'altération accidentelle en X mineur (harmonique) ?"
  const allAccidentelles = [...MINOR_SHARP, ...MINOR_FLAT].map(k => k.accidentelle)
  for (const k of [...MINOR_SHARP, ...MINOR_FLAT]) {
    const wrong = allAccidentelles.filter(a => a !== k.accidentelle).slice(0, 3)
    qs.push({
      id: `TGm_${k.note.replace('#','s')}_acc`,
      niveau: altCountToLevel(k.count) === 'C1/1' ? 'C1/2' : altCountToLevel(k.count),
      categorie: 'tonalites_alterations',
      type: 'qcm',
      question: `Quelle est l'altération accidentelle (sensible) en ${k.note} mineur harmonique ?`,
      reponse_correcte: k.accidentelle,
      reponse_fausse_1: wrong[0] ?? 'Sol#',
      reponse_fausse_2: wrong[1] ?? 'Ré#',
      reponse_fausse_3: wrong[2] ?? 'La#',
      explication: `En mineur harmonique, le 7e degré est haussé d'un demi-ton. En ${k.note} mineur, c'est ${k.accidentelle}.`,
    })
  }

  return qs
}

function generateIntervalleTextQuestions() {
  return TEXT_INTERVALS.map(iv => {
    const wrong = intervalDistr3(iv.name)
    return {
      id: `IT_Do_${iv.to.replace("'", 'oct').replace('#', 's').replace('b', 'b')}`,
      niveau: intervalToLevel(iv.idx),
      categorie: 'intervalles',
      type: 'qcm',
      question: `Quelle est la nature de l'intervalle ascendant Do – ${iv.to} ?`,
      reponse_correcte: iv.name,
      reponse_fausse_1: wrong[0] ?? 'Seconde majeure',
      reponse_fausse_2: wrong[1] ?? 'Tierce mineure',
      reponse_fausse_3: wrong[2] ?? 'Quarte juste',
    }
  })
}

function generateIntervalleVexQuestions() {
  const qs = []
  for (let li = 0; li < VEX_LETTERS.length; li++) {
    for (const ivDef of VEX_INTERVAL_DEFS) {
      for (const ascending of [true, false]) {
        // Choisir l'octave de départ : monter à 5 si la note basse descend sous G3
        let startOctave = 4
        if (!ascending) {
          const secondMidi = 4 * 12 + VEX_NATURAL_SEMIS[li] - ivDef.semis
          if (secondMidi < MIDI_G3) startOctave = 5
        }

        const startKey = `${VEX_LETTERS[li]}/${startOctave}`
        const secondKey = computeSecondNote(li, ivDef, ascending, startOctave)
        if (!secondKey) continue

        const dir = ascending ? 'asc' : 'desc'
        const startId = startKey.replace('/', '')
        const endId = secondKey.replace('/', '').replace('#', 's')
        const id = `IVX_${dir}_${startId}_${endId}`
        const wrong = intervalDistr3SameDegree(ivDef.name)
        const dirLabel = ascending ? 'ascendant' : 'descendant'

        qs.push({
          id,
          niveau: intervalToLevel(ivDef.idx),
          categorie: 'intervalles',
          type: 'vexflow_intervalle',
          question: `Quelle est la nature de cet intervalle ${dirLabel} ?`,
          vexflow_notes: [startKey, secondKey],
          reponse_correcte: ivDef.name,
          reponse_fausse_1: wrong[0] ?? 'Seconde majeure',
          reponse_fausse_2: wrong[1] ?? 'Tierce mineure',
          reponse_fausse_3: wrong[2] ?? 'Quarte juste',
        })
      }
    }
  }
  return qs
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const baseFile = path.join(ROOT, 'public/data/questions-base.json')
const outFile  = path.join(ROOT, 'public/data/questions.json')

const base     = JSON.parse(fs.readFileSync(baseFile, 'utf8'))
const generated = [
  ...generateMajorAltQuestions(),
  ...generateMinorAltQuestions(),
  ...generateArmureQuestions(),
  ...generateIntervalleTextQuestions(),
  ...generateIntervalleVexQuestions(),
]

// Dédoublonnage par id : base prime sur generated
const baseIds = new Set(base.map(q => q.id))
const merged  = [...base, ...generated.filter(q => !baseIds.has(q.id))]

fs.writeFileSync(outFile, JSON.stringify(merged, null, 2))
console.log(`✓ ${base.length} questions base + ${generated.length} générées = ${merged.length} total → ${outFile}`)
