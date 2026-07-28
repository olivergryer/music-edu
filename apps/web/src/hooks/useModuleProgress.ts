// ─── Hook générique de progression per-module (spec §6) ───────────────────────
//
// Signature UNIQUE pour tous les modules : useModuleProgress(moduleId). Ne PAS
// créer useRythmeProgress/useNotesProgress. Les différences de contenu passent par
// `payload` / `config`, typés par le module appelant.
//
// Ce hook gère la couche per-module `progress/{moduleId}` + `sessions/` et le
// buffer de reprise. Il NE touche PAS la gamification globale (XP/rang/streak/
// trophées) : celle-ci reste dans useProgressFirebase (doc `progress/data`). Un
// module qui veut créditer de l'XP globale appelle EN PLUS addSession(...).

import { useCallback, useEffect, useRef, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../auth/AuthProvider'
import type { ModuleId } from '../lib/modules'
import {
  commitModuleSession,
  defaultModuleProgress,
  encodeItem,
  migrate,
  type CommitSessionInput,
  type EncodedItem,
  type ModuleItem,
  type ModuleProgressDoc,
  type ProgressPatch,
  type SessionSummary,
} from '../lib/moduleProgress'
import {
  CHECKPOINT_INTERVAL_MS,
  clearBuffer,
  saveCheckpoint,
} from '../lib/sessionBuffer'

interface ActiveSession {
  sessionId: string
  startedAtMs: number
  config: Record<string, unknown>
  items: EncodedItem[]
}

export interface CommitOptions {
  summary: SessionSummary
  progressPatch?: ProgressPatch
}

export function useModuleProgress(moduleId: ModuleId) {
  const { user } = useAuth()
  const [progress, setProgress] = useState<ModuleProgressDoc>(() => defaultModuleProgress(moduleId))
  const [loaded, setLoaded] = useState(false)

  // Session courante bufferisée en mémoire (hors cycle de rendu).
  const activeRef = useRef<ActiveSession | null>(null)
  const checkpointTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  // Chargement du doc progress agrégé (via migrate — spec §7).
  useEffect(() => {
    if (!user) {
      setProgress(defaultModuleProgress(moduleId))
      setLoaded(false)
      return
    }
    let cancelled = false
    getDoc(doc(db, 'users', user.uid, 'progress', moduleId)).then(snap => {
      if (cancelled) return
      setProgress(
        snap.exists()
          ? migrate({ ...defaultModuleProgress(moduleId), ...(snap.data() as ModuleProgressDoc) })
          : defaultModuleProgress(moduleId),
      )
      setLoaded(true)
    })
    return () => { cancelled = true }
  }, [user, moduleId])

  const stopCheckpoints = useCallback(() => {
    if (checkpointTimer.current) {
      clearInterval(checkpointTimer.current)
      checkpointTimer.current = null
    }
  }, [])

  const flushCheckpoint = useCallback(() => {
    const a = activeRef.current
    if (!a || !user) return
    void saveCheckpoint({
      uid: user.uid,
      moduleId,
      sessionId: a.sessionId,
      startedAtMs: a.startedAtMs,
      config: a.config,
      items: a.items,
      summary: null,
    })
  }, [user, moduleId])

  // Démarre une session : buffer vide + checkpoints périodiques IndexedDB.
  const startSession = useCallback((config: Record<string, unknown> = {}) => {
    const sessionId = crypto.randomUUID()
    activeRef.current = { sessionId, startedAtMs: Date.now(), config, items: [] }
    stopCheckpoints()
    checkpointTimer.current = setInterval(flushCheckpoint, CHECKPOINT_INTERVAL_MS)
    return sessionId
  }, [stopCheckpoints, flushCheckpoint])

  // Ajoute un item au buffer mémoire (aucune écriture réseau).
  const recordItem = useCallback((item: ModuleItem) => {
    const a = activeRef.current
    if (!a) return
    a.items.push(encodeItem(item))
  }, [])

  // Termine et persiste la session : EXACTEMENT 2 écritures Firestore, puis purge
  // du buffer IndexedDB. Renvoie l'id de session (ou null si rien à committer).
  const commitSession = useCallback(async ({ summary, progressPatch }: CommitOptions): Promise<string | null> => {
    const a = activeRef.current
    if (!a || !user) return null
    stopCheckpoints()

    const input: CommitSessionInput = {
      config: a.config,
      summary,
      items: a.items,
      startedAtMs: a.startedAtMs,
      endedAtMs: Date.now(),
    }

    const sessionId = await commitModuleSession(user.uid, moduleId, input, progressPatch)
    await clearBuffer(user.uid, moduleId, a.sessionId)
    activeRef.current = null
    return sessionId
  }, [user, moduleId, stopCheckpoints])

  // Nettoyage du timer au démontage (le buffer IndexedDB survit pour reprise).
  useEffect(() => stopCheckpoints, [stopCheckpoints])

  return { progress, loaded, startSession, recordItem, commitSession }
}
