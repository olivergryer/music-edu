// ─── Carnet — exercices ajoutés par l'élève ───────────────────────────────────
//
// Ligne supplémentaire sous le tableau, valable pour TOUTES les tonalités d'un
// niveau. Local d'abord (localStorage), copie dans users/{uid}/carnet-exercices
// si l'élève est connecté ; fusion par `id` à la connexion (`maj` la plus récente).

import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { dateExpiration } from '../../lib/donneesPersonnelles'
import { nouvelId } from './carnetStorage.ts'

const CLE_LS = 'carnet-exercices-perso-v1'

export interface ExercicePerso {
  id: string            // sert aussi de clé d'exercice dans les séances
  niveau: string
  nom: string
  objectif?: number
  maj: string
}

export function lireExercicesPerso(): ExercicePerso[] {
  try {
    const liste = JSON.parse(localStorage.getItem(CLE_LS) ?? '[]')
    return Array.isArray(liste) ? liste : []
  } catch { return [] }
}

function ecrire(liste: ExercicePerso[]) {
  try { localStorage.setItem(CLE_LS, JSON.stringify(liste)) } catch { /* ignore */ }
}

export function creerExercicePerso(niveau: string, nom: string, objectif?: number): ExercicePerso {
  return {
    id: `perso-${nouvelId().slice(0, 8)}`,
    niveau, nom: nom.trim(),
    ...(objectif && objectif > 0 && { objectif }),
    maj: new Date().toISOString(),
  }
}

export function ajouterLocal(e: ExercicePerso): ExercicePerso[] {
  const liste = [...lireExercicesPerso().filter(x => x.id !== e.id), e]
  ecrire(liste)
  return liste
}

export function retirerLocal(id: string): ExercicePerso[] {
  const liste = lireExercicesPerso().filter(x => x.id !== id)
  ecrire(liste)
  return liste
}

export async function pousserExercice(uid: string, e: ExercicePerso): Promise<void> {
  await setDoc(doc(db, 'users', uid, 'carnet-exercices', e.id), { ...e, expireAt: dateExpiration() })
}

export async function supprimerExercice(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(db, 'users', uid, 'carnet-exercices', id))
}

export async function synchroniserExercices(uid: string): Promise<ExercicePerso[]> {
  const locaux = lireExercicesPerso()
  const snap = await getDocs(collection(db, 'users', uid, 'carnet-exercices'))
  const cloud = new Map<string, ExercicePerso>()
  snap.docs.forEach(d => {
    const { expireAt: _e, ...e } = d.data() as ExercicePerso & { expireAt?: unknown }
    cloud.set(d.id, { ...e, id: d.id })
  })
  const fusion = new Map(cloud)
  const aPousser: ExercicePerso[] = []
  for (const l of locaux) {
    const c = cloud.get(l.id)
    if (!c || c.maj < l.maj) { fusion.set(l.id, l); aPousser.push(l) }
  }
  const liste = [...fusion.values()]
  ecrire(liste)
  await Promise.all(aPousser.map(e => pousserExercice(uid, e)))
  return liste
}
