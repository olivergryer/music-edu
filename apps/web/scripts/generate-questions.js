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

// Questions VexFlow : portée avec deux notes
const VEX_INTERVALS = [
  { vex: ['e/4', 'f/4'],  name: 'Seconde mineure',    idx: 1  },
  { vex: ['c/4', 'd/4'],  name: 'Seconde majeure',    idx: 2  },
  { vex: ['a/4', 'c/5'],  name: 'Tierce mineure',     idx: 3  },
  { vex: ['c/4', 'e/4'],  name: 'Tierce majeure',     idx: 4  },
  { vex: ['g/4', 'c/5'],  name: 'Quarte juste',       idx: 5  },
  { vex: ['c/4', 'f#/4'], name: 'Quarte augmentée',   idx: 6  },
  { vex: ['c/4', 'g/4'],  name: 'Quinte juste',       idx: 7  },
  { vex: ['e/4', 'c/5'],  name: 'Sixte mineure',      idx: 8  },
  { vex: ['c/4', 'a/4'],  name: 'Sixte majeure',      idx: 9  },
  { vex: ['c/4', 'bb/4'], name: 'Septième mineure',   idx: 10 },
  { vex: ['c/4', 'b/4'],  name: 'Septième majeure',   idx: 11 },
  { vex: ['c/4', 'c/5'],  name: 'Octave juste',       idx: 12 },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function altCountToLevel(n) {
  if (n === 0) return 'C1/1'
  if (n <= 2)  return 'C1/2'
  if (n <= 4)  return 'C1/3'
  if (n <= 5)  return 'C2/1'
  if (n <= 6)  return 'C2/2'
  return 'C2/3'
}

function intervalToLevel(idx) {
  if (idx <= 2) return 'C1/2'
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

// Renvoie 3 noms de tonalités pour distracteur
function keyNameDistr3(allNotes, correctNote) {
  // Pick first 4 that aren't correct, trying to vary count
  return allNotes.filter(n => n !== correctNote).slice(0, 3)
}

// Distracteurs d'intervalles : voisins dans INTERVAL_NAMES
function intervalDistr3(correctName) {
  const ci = INTERVAL_NAMES.indexOf(correctName)
  const result = []
  for (let d = 1; result.length < 3 && d < INTERVAL_NAMES.length; d++) {
    if (ci - d >= 0) result.push(INTERVAL_NAMES[ci - d])
    if (result.length < 3 && ci + d < INTERVAL_NAMES.length) result.push(INTERVAL_NAMES[ci + d])
  }
  return result
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

  // "Quelle tonalité majeure a N dièses à l'armure ?"
  for (const k of MAJOR_SHARP) {
    const label = k.count === 0 ? "0 altération" : `${k.count} dièse${k.count > 1 ? 's' : ''}`
    const allMajNotes = [...MAJOR_SHARP, ...MAJOR_FLAT].map(x => x.note)
    const wrong = keyNameDistr3(allMajNotes, k.note)
    qs.push({
      id: `TGM_${k.count}d_which`,
      niveau: altCountToLevel(k.count),
      categorie: 'tonalites_alterations',
      type: 'qcm',
      question: `Quelle tonalité majeure a ${label} à l'armure ?`,
      reponse_correcte: k.note,
      reponse_fausse_1: wrong[0] ?? 'Sol',
      reponse_fausse_2: wrong[1] ?? 'Ré',
      reponse_fausse_3: wrong[2] ?? 'Fa',
    })
  }

  for (const k of MAJOR_FLAT) {
    const label = `${k.count} bémol${k.count > 1 ? 's' : ''}`
    const allMajNotes = [...MAJOR_FLAT, ...MAJOR_SHARP].map(x => x.note)
    const wrong = keyNameDistr3(allMajNotes, k.note)
    qs.push({
      id: `TGM_${k.count}b_which`,
      niveau: altCountToLevel(k.count),
      categorie: 'tonalites_alterations',
      type: 'qcm',
      question: `Quelle tonalité majeure a ${label} à l'armure ?`,
      reponse_correcte: k.note,
      reponse_fausse_1: wrong[0] ?? 'Sib',
      reponse_fausse_2: wrong[1] ?? 'Mib',
      reponse_fausse_3: wrong[2] ?? 'Sol',
    })
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

  // "Quelle tonalité mineure a N dièses/bémols à l'armure ?"
  const allMinorSharpNotes = MINOR_SHARP.map(k => k.note)
  const allMinorFlatNotes  = MINOR_FLAT.map(k => k.note)

  for (const k of MINOR_SHARP) {
    const label = k.count === 0 ? "0 altération" : `${k.count} dièse${k.count > 1 ? 's' : ''}`
    const pool  = [...allMinorSharpNotes, ...allMinorFlatNotes]
    const wrong = keyNameDistr3(pool, k.note)
    qs.push({
      id: `TGm_${k.count}d_which`,
      niveau: altCountToLevel(k.count),
      categorie: 'tonalites_alterations',
      type: 'qcm',
      question: `Quelle tonalité mineure a ${label} à l'armure ?`,
      reponse_correcte: k.note,
      reponse_fausse_1: wrong[0] ?? 'Mi',
      reponse_fausse_2: wrong[1] ?? 'Si',
      reponse_fausse_3: wrong[2] ?? 'Ré',
    })
  }

  for (const k of MINOR_FLAT) {
    const label = `${k.count} bémol${k.count > 1 ? 's' : ''}`
    const pool  = [...allMinorFlatNotes, ...allMinorSharpNotes]
    const wrong = keyNameDistr3(pool, k.note)
    qs.push({
      id: `TGm_${k.count}b_which`,
      niveau: altCountToLevel(k.count),
      categorie: 'tonalites_alterations',
      type: 'qcm',
      question: `Quelle tonalité mineure a ${label} à l'armure ?`,
      reponse_correcte: k.note,
      reponse_fausse_1: wrong[0] ?? 'Sol',
      reponse_fausse_2: wrong[1] ?? 'Do',
      reponse_fausse_3: wrong[2] ?? 'La',
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
  return VEX_INTERVALS.map(iv => {
    const wrong = intervalDistr3(iv.name)
    return {
      id: `IVX_${iv.vex[0].replace('/','').replace('#','s').replace('b','b')}_${iv.vex[1].replace('/','').replace('#','s').replace('b','b')}`,
      niveau: intervalToLevel(iv.idx),
      categorie: 'intervalles',
      type: 'vexflow_intervalle',
      question: 'Quelle est la nature de cet intervalle ?',
      vexflow_notes: iv.vex,
      reponse_correcte: iv.name,
      reponse_fausse_1: wrong[0] ?? 'Seconde majeure',
      reponse_fausse_2: wrong[1] ?? 'Tierce mineure',
      reponse_fausse_3: wrong[2] ?? 'Quarte juste',
    }
  })
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const baseFile = path.join(ROOT, 'public/data/questions-base.json')
const outFile  = path.join(ROOT, 'public/data/questions.json')

const base     = JSON.parse(fs.readFileSync(baseFile, 'utf8'))
const generated = [
  ...generateMajorAltQuestions(),
  ...generateMinorAltQuestions(),
  ...generateIntervalleTextQuestions(),
  ...generateIntervalleVexQuestions(),
]

// Dédoublonnage par id : base prime sur generated
const baseIds = new Set(base.map(q => q.id))
const merged  = [...base, ...generated.filter(q => !baseIds.has(q.id))]

fs.writeFileSync(outFile, JSON.stringify(merged, null, 2))
console.log(`✓ ${base.length} questions base + ${generated.length} générées = ${merged.length} total → ${outFile}`)
