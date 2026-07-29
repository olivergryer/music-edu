// ─── Sélection d'items : tirage pondéré + génération de lignes tonales (spec §9) ─
//
// selectNextItem — P0/P1, items isolés. Tirage PONDÉRÉ (jamais déterministe) :
//   poids = (1 + tauxErreurRécent) × (rtMédian / rtCible) × facteurRécence
// Plancher de rétention pour que les items maîtrisés réapparaissent ; jamais deux
// fois le même item consécutivement.
//
// generateLine — P2, lignes de 8. Pondération TONALE, pas aléatoire uniforme :
// ~65 % conjoint, ~25 % sauts sur degrés d'accord, ~10 % autres ; début et fin
// sur degré stable.

import { median } from './stats.ts'
import { degreeOf } from './diatonic.ts'
import { weightedPick, type Rng } from './rng.ts'
import type { Mastery, NoteItem } from './types.ts'

// ── selectNextItem ────────────────────────────────────────────────────────────

export interface SelectionContext {
  rtTargetMs: number
  floorWeight: number      // plancher de rétention (poids minimal d'un item maîtrisé)
  turn: number             // tour de tirage courant (récence)
  previousItemId?: string  // item précédent, exclu du tirage
}

const UNSEEN_WEIGHT = 1.5   // items jamais vus : introduits en priorité douce
const RECENCY_CAP = 12      // saturation de la récence (tours)
const RECENCY_K = 0.1       // pente de la récence

export function itemWeight(item: NoteItem, mastery: Mastery, ctx: SelectionContext): number {
  if (item.id === ctx.previousItemId) return 0
  const m = mastery[item.id]
  if (!m || m.recent.length === 0) return Math.max(ctx.floorWeight, UNSEEN_WEIGHT)

  const errRate = m.recent.filter(c => !c).length / m.recent.length
  const rtMed = m.rtSamples.length ? median(m.rtSamples) : ctx.rtTargetMs
  const recency = 1 + Math.min(ctx.turn - m.lastPlayedTurn, RECENCY_CAP) * RECENCY_K
  const w = (1 + errRate) * (rtMed / ctx.rtTargetMs) * recency
  return Math.max(ctx.floorWeight, w)
}

export function selectNextItem(pool: NoteItem[], mastery: Mastery, rng: Rng, ctx: SelectionContext): NoteItem {
  if (pool.length === 0) throw new Error('selectNextItem: pool vide')
  if (pool.length === 1) return pool[0]

  const weights = pool.map(it => itemWeight(it, mastery, ctx))
  const idx = weightedPick(weights, rng)
  if (idx < 0) {
    // Tous les poids nuls (ex. pool == {previous}) : premier item ≠ previous.
    return pool.find(it => it.id !== ctx.previousItemId) ?? pool[0]
  }
  return pool[idx]
}

// ── generateLine ──────────────────────────────────────────────────────────────

export interface LineWeights {
  conjoint: number    // mouvement conjoint ±1
  chordLeap: number   // saut vers un degré d'accord (stable)
  other: number       // autre petit saut
}

export const DEFAULT_LINE_WEIGHTS: LineWeights = { conjoint: 0.65, chordLeap: 0.25, other: 0.10 }

// Degrés stables = tonique/tierce/quinte de Do majeur (do/mi/sol) : la gamme
// diatonique non altérée de la v1 est celle de Do (spec §9, degrés d'accord).
const STABLE_DEGREES = [0, 2, 4]
const isStable = (idx: number) => STABLE_DEGREES.includes(degreeOf(idx))

export function generateLine(
  pool: NoteItem[],
  weights: LineWeights,
  rng: Rng,
  length = 8,
): NoteItem[] {
  if (pool.length === 0) throw new Error('generateLine: pool vide')

  const clef = pool[0].clef
  const idxs = [...new Set(pool.map(p => p.diatonicIndex))].sort((a, b) => a - b)
  const idxSet = new Set(idxs)
  const minI = idxs[0]
  const maxI = idxs[idxs.length - 1]
  const stableIdxs = idxs.filter(isStable)
  const itemFor = (idx: number): NoteItem => ({ id: `${clef}:${idx}`, clef, diatonicIndex: idx })

  const nearestStable = (idx: number): number => {
    if (stableIdxs.length === 0) return idx
    return stableIdxs.reduce((best, s) => (Math.abs(s - idx) < Math.abs(best - idx) ? s : best), stableIdxs[0])
  }
  const pickFrom = (arr: number[]): number => arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))]

  // Départ : degré stable proche du centre de l'ambitus (sinon n'importe quel index).
  const center = (minI + maxI) / 2
  const startPool = (stableIdxs.length ? stableIdxs : idxs)
    .slice()
    .sort((a, b) => Math.abs(a - center) - Math.abs(b - center))
    .slice(0, Math.max(1, Math.ceil((stableIdxs.length || idxs.length) / 2)))
  let current = pickFrom(startPool)
  const line: NoteItem[] = [itemFor(current)]

  for (let i = 1; i < length; i++) {
    // Dernière note : forcée sur un degré stable (fin stable).
    if (i === length - 1) {
      const targets = stableIdxs.filter(s => s !== current && Math.abs(s - current) <= 4)
      current = targets.length ? pickFrom(targets) : nearestStable(current)
      line.push(itemFor(current))
      break
    }

    const type = weightedPick([weights.conjoint, weights.chordLeap, weights.other], rng)
    let next = current

    if (type === 1) {
      // Saut d'accord : degré stable proche (≤ 5), différent du courant.
      const targets = stableIdxs.filter(s => s !== current && Math.abs(s - current) <= 5)
      next = targets.length ? pickFrom(targets) : current
    } else if (type === 2) {
      // Autre : petit saut ±2..±4 présent dans le pool.
      const targets = idxs.filter(x => { const d = Math.abs(x - current); return d >= 2 && d <= 4 })
      next = targets.length ? pickFrom(targets) : current
    }

    if (next === current || !idxSet.has(next)) {
      // Défaut / conjoint : voisin ±1 dans le pool.
      const neighbors = [current - 1, current + 1].filter(x => idxSet.has(x) && x >= minI && x <= maxI)
      next = neighbors.length ? pickFrom(neighbors) : nearestStable(current)
    }

    current = next
    line.push(itemFor(current))
  }

  return line
}
