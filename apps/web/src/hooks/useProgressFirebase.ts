import { useState, useEffect, useCallback, useRef } from 'react'
import { doc, getDoc, setDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../auth/AuthProvider'
import {
  applySession,
  DEFAULT_STATE,
  mergeWithDefaults,
  getRank,
  getNextRank,
  todayStr,
  type AddSessionParams,
  type ProgressState,
} from './progressLogic'

export { RANKS, TROPHIES, getRank, getNextRank } from './progressLogic'

interface AddSessionResult {
  newTrophies: string[]
  rankedUp: boolean
}

export default function useProgressFirebase() {
  const { user } = useAuth()
  const [data, setData] = useState<ProgressState>(DEFAULT_STATE)
  const [loaded, setLoaded] = useState(false)
  const dataRef = useRef(data)

  useEffect(() => { dataRef.current = data }, [data])

  useEffect(() => {
    if (!user) {
      setData(DEFAULT_STATE)
      setLoaded(false)
      return
    }
    getDoc(doc(db, 'users', user.uid, 'progress', 'data')).then(snap => {
      setData(snap.exists() ? mergeWithDefaults(snap.data()) : DEFAULT_STATE)
      setLoaded(true)
    })
  }, [user])

  const addSession = useCallback(async (params: AddSessionParams): Promise<AddSessionResult> => {
    if (!user || !loaded) return { newTrophies: [], rankedUp: false }

    const result = applySession(dataRef.current, params, todayStr())
    setData(result.newState)

    await setDoc(doc(db, 'users', user.uid, 'progress', 'data'), result.newState)
    await addDoc(collection(db, 'users', user.uid, 'history'), {
      ...result.historyEntry,
      createdAt: serverTimestamp(),
    })

    return { newTrophies: result.newTrophies, rankedUp: result.rankedUp }
  }, [user, loaded])

  return {
    xp: data.xp,
    rank: getRank(data.xp),
    nextRank: getNextRank(data.xp),
    streak: data.streak,
    trophies: data.trophies,
    modules: data.modules,
    loaded,
    addSession,
  }
}
