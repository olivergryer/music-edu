// ─── Droit à l'effacement et durée de conservation ───────────────────────────
//
// Deux mécanismes distincts :
//   1. `expireAt` — joint aux écritures EXISTANTES du document principal, pour
//      qu'une politique TTL Firestore purge les comptes inactifs. Aucune
//      écriture supplémentaire n'est déclenchée depuis ce fichier.
//   2. `effacerMesDonnees()` — effacement immédiat à la demande.

import { Timestamp, collection, deleteDoc, doc, getDocs } from 'firebase/firestore'
import { deleteUser, signOut } from 'firebase/auth'
import { auth, db } from './firebase'

/** Durée de conservation annoncée dans la politique de confidentialité. */
export const CONSERVATION_MOIS = 24

/**
 * Horodatage d'expiration à joindre à une écriture du document utilisateur.
 *
 * Repoussé à CHAQUE écriture : la promesse faite est « 24 mois après la dernière
 * utilisation », pas 24 mois après l'inscription.
 *
 * ⚠ Écrire le champ ne supprime rien par lui-même. La politique TTL doit être
 * activée dans la console Firebase, collection par collection. Tant qu'elle ne
 * l'est pas, le champ n'est qu'une date informative.
 */
export function dateExpiration(): Timestamp {
  const d = new Date()
  d.setMonth(d.getMonth() + CONSERVATION_MOIS)
  return Timestamp.fromDate(d)
}

// ─── Effacement ──────────────────────────────────────────────────────────────

export interface ResultatEffacement {
  /** Documents Firestore supprimés. */
  documentsSupprimes: number
  /** Le compte d'authentification (et donc l'adresse e-mail) a-t-il été supprimé ? */
  compteSupprime: boolean
  /**
   * Renseigné quand le compte Auth a survécu — Firebase exige une connexion
   * récente pour le supprimer. L'appelant doit alors inviter à se reconnecter
   * puis à recommencer.
   */
  raisonCompteConserve?: 'reconnexion-requise' | 'echec'
}

/** Supprime tous les documents d'une sous-collection de l'utilisateur. */
async function viderSousCollection(uid: string, nom: string): Promise<number> {
  const snap = await getDocs(collection(db, 'users', uid, nom))
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)))
  return snap.size
}

/**
 * Efface toutes les données de l'utilisateur courant, puis recharge l'app.
 *
 * Ne vide PAS les caches du service worker : ce sont les fichiers de
 * l'application, pas des données personnelles, et les effacer ferait perdre le
 * mode hors ligne sans rien protéger.
 *
 * Refuse de s'exécuter hors ligne : les suppressions Firestore seraient mises en
 * file d'attente dans IndexedDB… que l'étape suivante détruit. L'utilisateur
 * croirait ses données parties alors qu'elles seraient intactes sur le serveur.
 */
export async function effacerMesDonnees(): Promise<ResultatEffacement> {
  const user = auth.currentUser
  const resultat: ResultatEffacement = { documentsSupprimes: 0, compteSupprime: false }

  if (user && typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('hors-ligne')
  }

  if (user) {
    const uid = user.uid

    // Le code d'un professeur vit dans une collection à part, indexée par le
    // code : il faut le lire AVANT de supprimer le profil qui le porte.
    let teacherCode: string | null = null
    try {
      const { getDoc } = await import('firebase/firestore')
      const profil = await getDoc(doc(db, 'users', uid))
      teacherCode = (profil.data()?.teacherCode as string | undefined) ?? null
    } catch { /* profil illisible : rien à nettoyer côté teacherCodes */ }

    for (const sousCollection of ['history', 'sessions', 'calibrations', 'progress']) {
      try {
        resultat.documentsSupprimes += await viderSousCollection(uid, sousCollection)
      } catch (err) {
        console.warn(`Effacement : sous-collection ${sousCollection} incomplète.`, err)
      }
    }

    if (teacherCode) {
      try {
        await deleteDoc(doc(db, 'teacherCodes', teacherCode))
        resultat.documentsSupprimes++
      } catch (err) { console.warn('Effacement : code professeur conservé.', err) }
    }

    try {
      await deleteDoc(doc(db, 'users', uid))
      resultat.documentsSupprimes++
    } catch (err) { console.warn('Effacement : profil conservé.', err) }

    // Supprimer les documents sans supprimer le compte laisserait l'adresse
    // e-mail chez Firebase Auth — le droit à l'effacement ne serait pas honoré.
    try {
      await deleteUser(user)
      resultat.compteSupprime = true
    } catch (err) {
      const code = (err as { code?: string }).code ?? ''
      resultat.raisonCompteConserve = code === 'auth/requires-recent-login'
        ? 'reconnexion-requise'
        : 'echec'
      try { await signOut(auth) } catch { /* déconnexion best-effort */ }
    }
  }

  effacerStockageLocal()
  await supprimerBasesIndexedDb()

  return resultat
}

/**
 * Vide le localStorage en entier. L'origine n'héberge que Tessitura : tout ce
 * qui s'y trouve lui appartient (progression invité, réglages, tutoriels vus).
 * Une liste de clés à supprimer aurait vieilli à chaque nouveau module.
 */
export function effacerStockageLocal(): void {
  try { localStorage.clear() } catch { /* stockage indisponible */ }
  try { sessionStorage.clear() } catch { /* idem */ }
}

/**
 * Supprime les bases IndexedDB : le tampon de session de Tessitura, mais aussi
 * le cache persistant de Firestore et la session Firebase Auth — qui contiennent
 * une réplique locale des documents et l'adresse e-mail.
 */
async function supprimerBasesIndexedDb(): Promise<void> {
  if (typeof indexedDB === 'undefined') return

  let noms: string[] = ['tessitura']
  // `databases()` n'existe pas sur Firefox : on retombe sur les noms connus.
  if (typeof indexedDB.databases === 'function') {
    try {
      const bases = await indexedDB.databases()
      noms = bases.map(b => b.name).filter((n): n is string => Boolean(n))
    } catch { /* on garde la liste par défaut */ }
  } else {
    noms = ['tessitura', 'firebaseLocalStorageDb', 'firestore/[DEFAULT]/tessitura-97d58/main']
  }

  await Promise.all(noms.map(nom => new Promise<void>(resolve => {
    const req = indexedDB.deleteDatabase(nom)
    // `blocked` se déclenche quand un autre onglet tient la base ouverte : on
    // n'attend pas indéfiniment, le rechargement qui suit fera le reste.
    req.onsuccess = req.onerror = req.onblocked = () => resolve()
  })))
}
