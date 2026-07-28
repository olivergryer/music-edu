// ─── Couche générique de progression per-module ───────────────────────────────
//
// Schéma extensible (spec §3) : 1 doc `progress/{moduleId}` agrégé + N docs
// `sessions/{sessionId}` immuables (collection PLATE, tous modules confondus, pour
// une lecture unique côté dashboard). AUCUN nom de module en dur ici : tout est
// paramétré par `moduleId`.
//
// Contrainte quota Spark (spec §4) : MAXIMUM 2 écritures Firestore par session
// (1 create session + 1 update progress). Jamais d'écriture par item.

import {
  doc, setDoc, collection, serverTimestamp,
  type FieldValue,
} from 'firebase/firestore'
import { db } from './firebase'
import type { ModuleId } from './modules'

// Version courante des documents. Incrémenter en ajoutant un cas dans migrate().
export const CURRENT_SCHEMA_VERSION = 1

// ─── Formes de documents ──────────────────────────────────────────────────────

export interface ModuleTotals {
  sessions: number
  items: number
  timeMs: number
}

export interface LevelStat {
  best: number
  attempts: number
  lastAt: unknown // Firestore Timestamp à la lecture
}

/** `users/{uid}/progress/{moduleId}` — état agrégé, 1 doc par module. */
export interface ModuleProgressDoc {
  moduleId: ModuleId
  schemaVersion: number
  updatedAt: unknown
  totals: ModuleTotals
  levels: Record<string, LevelStat>
  /** Charge utile spécifique au module — non contrainte. */
  payload: Record<string, unknown>
}

/**
 * Item encodé de façon compacte (spec §4) : tuple plutôt qu'objet pour tenir sous
 * la limite Firestore de 1 MiB/doc (cible < 100 KB). Ordre des champs FIGÉ.
 *   [index, expected, answered, rtMs, flags]
 */
export type EncodedItem = [
  index: number,
  expected: string | number,
  answered: string | number,
  rtMs: number,
  flags: number,
]

export interface SessionSummary {
  score: number
  itemCount: number
  accuracy: number
  medianRtMs: number
}

/** `users/{uid}/sessions/{sessionId}` — 1 doc par session, immuable. */
export interface ModuleSessionDoc {
  moduleId: ModuleId
  schemaVersion: number
  startedAt: unknown
  endedAt: unknown
  durationMs: number
  config: Record<string, unknown>
  summary: SessionSummary
  items: EncodedItem[]
}

// ─── Item — forme « riche » côté application ──────────────────────────────────

export interface ModuleItem {
  index: number
  expected: string | number
  answered: string | number
  rtMs: number
  flags?: number
}

export function encodeItem(it: ModuleItem): EncodedItem {
  return [it.index, it.expected, it.answered, it.rtMs, it.flags ?? 0]
}

export function encodeItems(items: ModuleItem[]): EncodedItem[] {
  return items.map(encodeItem)
}

export function decodeItem(t: EncodedItem): Required<ModuleItem> {
  const [index, expected, answered, rtMs, flags] = t
  return { index, expected, answered, rtMs, flags }
}

export function decodeItems(tuples: EncodedItem[]): Required<ModuleItem>[] {
  return tuples.map(decodeItem)
}

// ─── Migration versionnée (spec §7) ───────────────────────────────────────────
//
// TOUTE lecture d'un doc progress/session passe par migrate(). Aucun code de
// lecture ne doit supposer la version courante. V1 = identité ; ajouter un `case`
// par palier lors d'un bump de CURRENT_SCHEMA_VERSION.

export function migrate<T extends { schemaVersion?: number }>(raw: T): T {
  const d: T = raw
  let v = d.schemaVersion ?? 1
  while (v < CURRENT_SCHEMA_VERSION) {
    switch (v) {
      // case 1: d = migrate1to2(d); break — brancher les migrations futures ici.
      default:
        v = CURRENT_SCHEMA_VERSION
        continue
    }
    v++
  }
  return d
}

// ─── État par défaut ──────────────────────────────────────────────────────────

export function defaultModuleProgress(moduleId: ModuleId): ModuleProgressDoc {
  return {
    moduleId,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    updatedAt: null,
    totals: { sessions: 0, items: 0, timeMs: 0 },
    levels: {},
    payload: {},
  }
}

// ─── Écriture d'une session (les 2 SEULES écritures Firestore) ────────────────

export interface CommitSessionInput {
  config: Record<string, unknown>
  summary: SessionSummary
  items: EncodedItem[]
  startedAtMs: number
  endedAtMs: number
}

/** Patch appliqué au doc progress (fusion). `totals`/`levels` partiels autorisés. */
export interface ProgressPatch {
  totals?: Partial<ModuleTotals> & { sessions?: number | FieldValue; items?: number | FieldValue; timeMs?: number | FieldValue }
  levels?: Record<string, Partial<LevelStat>>
  payload?: Record<string, unknown>
}

/**
 * Persiste une session : create `sessions/{autoId}` + merge `progress/{moduleId}`.
 * EXACTEMENT 2 écritures Firestore, quel que soit le nombre d'items. Renvoie l'id
 * de session créé.
 */
export async function commitModuleSession(
  uid: string,
  moduleId: ModuleId,
  input: CommitSessionInput,
  progressPatch: ProgressPatch = {},
): Promise<string> {
  const sessionRef = doc(collection(db, 'users', uid, 'sessions'))

  const sessionDoc: ModuleSessionDoc = {
    moduleId,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    startedAt: serverTimestamp(),
    endedAt: serverTimestamp(),
    durationMs: Math.max(0, input.endedAtMs - input.startedAtMs),
    config: input.config,
    summary: input.summary,
    items: input.items,
  }

  // Écriture 1 : session (create, immuable).
  await setDoc(sessionRef, sessionDoc)

  // Écriture 2 : progress agrégé (merge, jamais d'écrasement des autres champs).
  await setDoc(
    doc(db, 'users', uid, 'progress', moduleId),
    {
      moduleId,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      updatedAt: serverTimestamp(),
      ...progressPatch,
    },
    { merge: true },
  )

  return sessionRef.id
}
