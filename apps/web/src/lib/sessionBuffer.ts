// ─── Buffer de session — reprise après crash/rechargement (spec §4) ───────────
//
// Les items d'une session sont bufferisés EN MÉMOIRE pendant le jeu, avec un
// checkpoint IndexedDB toutes les 30 s (JAMAIS Firestore — le quota Spark ne le
// supporte pas pour 200-400 items/session). Au démarrage de l'app, un buffer
// orphelin (session non committée) peut être proposé en reprise ou flushé.
//
// API native IndexedDB uniquement — pas de lib externe (contrainte CLAUDE.md).

import type { EncodedItem, SessionSummary } from './moduleProgress'
import type { ModuleId } from './modules'

const DB_NAME = 'tessitura'
const STORE = 'sessionBuffers'
const DB_VERSION = 1

/** Intervalle de checkpoint recommandé (ms) — cf. useModuleProgress. */
export const CHECKPOINT_INTERVAL_MS = 30_000

export interface SessionBuffer {
  /** Clé primaire : `${uid}:${moduleId}:${sessionId}`. */
  key: string
  uid: string
  moduleId: ModuleId
  sessionId: string
  startedAtMs: number
  updatedAtMs: number
  config: Record<string, unknown>
  items: EncodedItem[]
  summary: SessionSummary | null
}

function bufferKey(uid: string, moduleId: ModuleId, sessionId: string): string {
  return `${uid}:${moduleId}:${sessionId}`
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB indisponible'))
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const idb = req.result
        if (!idb.objectStoreNames.contains(STORE)) {
          const store = idb.createObjectStore(STORE, { keyPath: 'key' })
          store.createIndex('by_uid', 'uid', { unique: false })
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    idb =>
      new Promise<T>((resolve, reject) => {
        const store = idb.transaction(STORE, mode).objectStore(STORE)
        const req = run(store)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}

/** Écrit/écrase le checkpoint de la session courante. Silencieux si IndexedDB KO. */
export async function saveCheckpoint(buf: Omit<SessionBuffer, 'key' | 'updatedAtMs'>): Promise<void> {
  try {
    const record: SessionBuffer = {
      ...buf,
      key: bufferKey(buf.uid, buf.moduleId, buf.sessionId),
      updatedAtMs: Date.now(),
    }
    await tx('readwrite', store => store.put(record))
  } catch {
    // Reprise = best-effort ; ne jamais faire échouer une session pour ça.
  }
}

/** Supprime le buffer d'une session (après commit Firestore réussi). */
export async function clearBuffer(uid: string, moduleId: ModuleId, sessionId: string): Promise<void> {
  try {
    await tx('readwrite', store => store.delete(bufferKey(uid, moduleId, sessionId)))
  } catch {
    /* best-effort */
  }
}

/** Renvoie tous les buffers orphelins d'un utilisateur (sessions non committées). */
export async function loadOrphanBuffers(uid: string): Promise<SessionBuffer[]> {
  try {
    const all = await tx<SessionBuffer[]>('readonly', store => {
      const idx = store.index('by_uid')
      return idx.getAll(IDBKeyRange.only(uid)) as IDBRequest<SessionBuffer[]>
    })
    return all ?? []
  } catch {
    return []
  }
}
