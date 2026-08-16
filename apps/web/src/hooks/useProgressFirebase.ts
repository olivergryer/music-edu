import { useState, useEffect, useCallback, useRef } from 'react'
import { doc, getDoc, setDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../auth/AuthProvider'
import { useCelebrations, type Celebration } from './CelebrationContext'
import {
  applySession,
  applyDecayOnly,
  rythmeIndivDuJour,
  resteAvantStreak,
  RYTHME_INDIV_POUR_STREAK,
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
  const { pousser } = useCelebrations()
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
    // Le cache persistant sert cette lecture hors ligne. Le `catch` reste
    // indispensable : sans lui, un échec laissait `loaded` à false pour toujours,
    // et `addSession` jetait alors toute progression par son garde d'entrée.
    getDoc(doc(db, 'users', user.uid, 'progress', 'data'))
      .then(snap => {
        setRawData(snap.exists() ? mergeWithDefaults(snap.data()) : DEFAULT_STATE)
      })
      .catch(err => {
        console.warn('Progression : lecture impossible, démarrage sur l’état par défaut.', err)
        setRawData(DEFAULT_STATE)
      })
      .finally(() => setLoaded(true))
  }, [user])

  const addSession = useCallback(async (params: AddSessionParams): Promise<AddSessionResult> => {
    if (!user || !loaded) return { newTrophies: [], rankedUp: false }

    // applySession calcule lui-même le decay depuis lastDate persisté.
    const result = applySession(rawDataRef.current, params, todayStr())
    setRawData(result.newState)

    // Écritures NON attendues, volontairement. Hors ligne, Firestore n'acquitte
    // qu'au retour du réseau : `await` figeait donc tous les écrans de fin de
    // session. Le cache persistant applique la donnée localement tout de suite et
    // rejoue l'écriture à la reconnexion — l'état affiché est déjà à jour via
    // `setRawData` ci-dessus, il n'y a rien à attendre.
    void setDoc(doc(db, 'users', user.uid, 'progress', 'data'), result.newState)
      .catch(err => console.warn('Progression : enregistrement différé.', err))
    void addDoc(collection(db, 'users', user.uid, 'history'), {
      ...result.historyEntry,
      createdAt: serverTimestamp(),
    }).catch(err => console.warn('Historique : enregistrement différé.', err))

    // Alimentation de la couche de célébration. C'est ici — et non chez les 11
    // appelants — que le branchement se fait : tout module, présent ou futur,
    // en bénéficie sans une ligne de plus.
    const events: Celebration[] = []
    if (result.streakValidated) {
      events.push({ type: 'streak', jours: result.newState.streak.current })
    }
    if (result.rankedUp && result.newRankId) {
      events.push({ type: 'rang', rangId: result.newRankId })
    }
    result.newTrophies.forEach(id => events.push({ type: 'trophee', trophyId: id }))
    pousser(events)

    return { newTrophies: result.newTrophies, rankedUp: result.rankedUp }
  }, [user, loaded, pousser])

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
    // Progression du jour vers la validation du streak par exercices Rythme
    // isolés. Calculée sur `rawData` : le decay ne touche que l'XP.
    rythmeIndivDuJour: rythmeIndivDuJour(rawData, todayStr()),
    resteAvantStreak: resteAvantStreak(rawData, todayStr()),
    seuilRythmeIndiv: RYTHME_INDIV_POUR_STREAK,
  }
}
