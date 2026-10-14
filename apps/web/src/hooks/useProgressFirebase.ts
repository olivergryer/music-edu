import { useState, useEffect, useCallback, useRef } from 'react'
import { doc, getDoc, getDocs, setDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { dateExpiration } from '../lib/donneesPersonnelles'
import { db } from '../lib/firebase'
import { useAuth } from '../auth/AuthProvider'
import { useCelebrations, type Celebration } from './CelebrationContext'
import {
  applySession,
  applyDecayOnly,
  pointsDuJour,
  objectifDuJour,
  rattrapageDuJour,
  appliquerRecalculSerie,
  VERSION_RECALCUL_SERIE,
  POINTS_JOURNEE,
  prendreSessionEnAttente,
  parametresRattrapes,
  DEFAULT_STATE,
  mergeWithDefaults,
  readGuestProgress,
  writeGuestProgress,
  getRank,
  getNextRank,
  todayStr,
  type AddSessionParams,
  type EntreeSerie,
  type ProgressState,
} from './progressLogic'

/**
 * Recalcul rétroactif de la série, une fois par compte. Relit l'historique
 * Firestore de l'élève et le rejoue avec la règle de rattrapage. Sans écriture
 * si la lecture vient du cache (hors ligne) : un historique partiel donnerait un
 * résultat faux, et le drapeau empêcherait de le refaire.
 * Plusieurs instances du hook peuvent le lancer en même temps : le calcul est
 * déterministe, les écritures concurrentes sont identiques.
 */
async function recalculerSerie(uid: string, state: ProgressState): Promise<ProgressState> {
  if (state.serieRecalculee >= VERSION_RECALCUL_SERIE) return state
  const snap = await getDocs(collection(db, 'users', uid, 'history'))
  if (snap.metadata.fromCache) return state
  const entries: EntreeSerie[] = snap.docs.map(d => {
    const e = d.data()
    return { date: e.date, module: e.module, individual: e.individual, mode: e.mode, points: e.points }
  })
  const { state: next } = appliquerRecalculSerie(state, entries, todayStr())
  // `merge` : seuls les champs recalculés sont écrits, `expireAt` reste intact.
  await setDoc(doc(db, 'users', uid, 'progress', 'data'), {
    streak: next.streak,
    dailyPoints: next.dailyPoints,
    trophies: next.trophies,
    serieRecalculee: next.serieRecalculee,
  }, { merge: true })
  return next
}

export { RANKS, TROPHIES, getRank, getNextRank, rankLabel, displayStreak, todayStr } from './progressLogic'

// Série Rythme laissée en plan lors de la vie précédente de la page (onglet
// fermé, app tuée). Lue et retirée UNE fois, au chargement du module : à cet
// instant, aucune série ne peut être en cours, et une série commencée ensuite ne
// risque pas d'être prise pour une série abandonnée. Enregistrée par la première
// instance du hook chargée, une fois l'authentification connue.
let sessionAbandonnee = prendreSessionEnAttente()

interface AddSessionResult {
  newTrophies: string[]
  rankedUp: boolean
}

export default function useProgressFirebase() {
  const { user, loading: authLoading } = useAuth()
  const { pousser } = useCelebrations()
  // rawData = état persisté tel quel (non-décayé). Source de vérité pour applySession.
  const [rawData, setRawData] = useState<ProgressState>(DEFAULT_STATE)
  const [loaded, setLoaded] = useState(false)
  const rawDataRef = useRef(rawData)
  // Compte dont `rawData` est issu (null = invité). Lors du passage invité →
  // connecté, `loaded` vaut encore true le temps d'un rendu, sur l'état invité.
  const chargePourRef = useRef<string | null | undefined>(undefined)

  useEffect(() => { rawDataRef.current = rawData }, [rawData])

  useEffect(() => {
    if (!user) {
      // Invité : progression locale (localStorage). `loaded = true` pour qu'addSession
      // accumule dès maintenant — la série de 10 et le streak fonctionnent hors compte.
      setRawData(readGuestProgress() ?? DEFAULT_STATE)
      chargePourRef.current = null
      setLoaded(true)
      return
    }
    // Repasse à « non chargé » : l'état invité lu avant la réponse de l'auth ne
    // doit ni recevoir de session ni déclencher la pop-up de rattrapage.
    chargePourRef.current = undefined
    setLoaded(false)
    // Le cache persistant sert cette lecture hors ligne. Le `catch` reste
    // indispensable : sans lui, un échec laissait `loaded` à false pour toujours,
    // et `addSession` jetait alors toute progression par son garde d'entrée.
    getDoc(doc(db, 'users', user.uid, 'progress', 'data'))
      .then(async snap => {
        const state = snap.exists() ? mergeWithDefaults(snap.data()) : DEFAULT_STATE
        setRawData(state)
        if (!snap.exists()) return
        try {
          setRawData(await recalculerSerie(user.uid, state))
        } catch (err) {
          console.warn('Série : recalcul rétroactif reporté.', err)
        }
      })
      .catch(err => {
        console.warn('Progression : lecture impossible, démarrage sur l’état par défaut.', err)
        setRawData(DEFAULT_STATE)
      })
      .finally(() => { chargePourRef.current = user.uid; setLoaded(true) })
  }, [user])

  const addSession = useCallback(async (params: AddSessionParams): Promise<AddSessionResult> => {
    if (!loaded) return { newTrophies: [], rankedUp: false }

    // applySession calcule lui-même le decay depuis lastDate persisté.
    const result = applySession(rawDataRef.current, params, todayStr())
    setRawData(result.newState)

    if (user) {
      // Écritures NON attendues, volontairement. Hors ligne, Firestore n'acquitte
      // qu'au retour du réseau : `await` figeait donc tous les écrans de fin de
      // session. Le cache persistant applique la donnée localement tout de suite et
      // rejoue l'écriture à la reconnexion — l'état affiché est déjà à jour via
      // `setRawData` ci-dessus, il n'y a rien à attendre.
      // `expireAt` accompagne l'écriture existante — aucune écriture de plus.
      // Repoussé à chaque session : la conservation court depuis la DERNIÈRE
      // utilisation, comme l'annonce la politique de confidentialité.
      void setDoc(doc(db, 'users', user.uid, 'progress', 'data'), {
        ...result.newState,
        expireAt: dateExpiration(),
      }).catch(err => console.warn('Progression : enregistrement différé.', err))
      void addDoc(collection(db, 'users', user.uid, 'history'), {
        ...result.historyEntry,
        createdAt: serverTimestamp(),
      }).catch(err => console.warn('Historique : enregistrement différé.', err))
    } else {
      // Invité : progression conservée en localStorage (pas d'historique Firestore).
      writeGuestProgress(result.newState)
    }

    // Alimentation de la couche de célébration. C'est ici — et non chez les 11
    // appelants — que le branchement se fait : tout module, présent ou futur,
    // en bénéficie sans une ligne de plus.
    const events: Celebration[] = []
    if (result.streakValidated) {
      events.push({ type: 'streak', jours: result.newState.streak.current })
    }
    if (result.streakRepaired) {
      events.push({ type: 'reparation', jours: result.newState.streak.current })
    }
    if (result.rankedUp && result.newRankId) {
      events.push({ type: 'rang', rangId: result.newRankId })
    }
    result.newTrophies.forEach(id => events.push({ type: 'trophee', trophyId: id }))
    pousser(events)

    return { newTrophies: result.newTrophies, rankedUp: result.rankedUp }
  }, [user, loaded, pousser])

  useEffect(() => {
    if (!loaded || authLoading || !sessionAbandonnee) return
    if (chargePourRef.current !== (user?.uid ?? null)) return
    const session = sessionAbandonnee
    sessionAbandonnee = null
    void addSession(parametresRattrapes(session, todayStr()))
  }, [loaded, authLoading, user, addSession])

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
    // Progression du jour vers la validation de la journée, tous modules
    // confondus. Calculée sur `rawData` : le decay ne touche que l'XP.
    pointsDuJour: pointsDuJour(rawData, todayStr()),
    objectifDuJour: objectifDuJour(rawData.streak, todayStr()),
    pointsJournee: POINTS_JOURNEE,
    rattrapage: rattrapageDuJour(rawData.streak, todayStr()),
  }
}
