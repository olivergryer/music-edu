import { useState, useEffect, useCallback, useRef } from 'react'
import { doc, getDoc, setDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../auth/AuthProvider'
import {
  applySession,
  applyDecayOnly,
  DEFAULT_STATE,
  mergeWithDefaults,
  getRank,
  getNextRank,
  todayStr,
  type AddSessionParams,
  type ProgressState,
} from './progressLogic'

export { RANKS, TROPHIES, getRank, getNextRank, rankLabel, displayStreak, todayStr } from './progressLogic'

interface AddSessionResult {
  newTrophies: string[]
  rankedUp: boolean
}

export default function useProgressFirebase() {
  const { user } = useAuth()
  // rawData = état persisté tel quel (non-décayé). Source de vérité pour applySession.
  const [rawData, setRawData] = useState<ProgressState>(DEFAULT_STATE)
  const [loaded, setLoaded] = useState(false)
  const rawDataRef = useRef(rawData)

  useEffect(() => { rawDataRef.current = rawData }, [rawData])

  useEffect(() => {
    if (!user) {
      setRawData(DEFAULT_STATE)
      setLoaded(false)
      return
    }
    getDoc(doc(db, 'users', user.uid, 'progress', 'data')).then(snap => {
      setRawData(snap.exists() ? mergeWithDefaults(snap.data()) : DEFAULT_STATE)
      setLoaded(true)
    })
  }, [user])

  const addSession = useCallback(async (params: AddSessionParams): Promise<AddSessionResult> => {
    if (!user || !loaded) return { newTrophies: [], rankedUp: false }

    // applySession calcule lui-même le decay depuis lastDate persisté.
    const result = applySession(rawDataRef.current, params, todayStr())
    setRawData(result.newState)

    await setDoc(doc(db, 'users', user.uid, 'progress', 'data'), result.newState)
    await addDoc(collection(db, 'users', user.uid, 'history'), {
      ...result.historyEntry,
      createdAt: serverTimestamp(),
    })

    return { newTrophies: result.newTrophies, rankedUp: result.rankedUp }
  }, [user, loaded])

  // Vue décayée pour l'affichage (non persistée — recalculée à chaque render).
  const displayData = applyDecayOnly(rawData, todayStr())

  return {
    xp: displayData.xp,
    rank: getRank(displayData.xp),
    nextRank: getNextRank(displayData.xp),
    streak: displayData.streak,
    trophies: displayData.trophies,
    modules: displayData.modules,
    data: displayData,   // état complet décayé (pour la vue dashboard unifiée)
    rawData,             // état brut non-décayé (pour calculer le delta de decay)
    loaded,
    addSession,
  }
}
