// ─── Carnet — séances : stockage local + Firestore ────────────────────────────
//
// Local d'abord (localStorage), copie dans users/{uid}/carnet/{id} si connecté.
// Fusion par `id` à la connexion : la version la plus récente (`maj`) l'emporte.

import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { dateExpiration } from '../../lib/donneesPersonnelles'
import type { FigureId } from './figures.ts'

export { statsExercice, type StatsExercice } from './carnetStats.ts'

const CLE_LS = 'carnet-gammes-v1'

export interface Seance {
  id: string
  date: string                       // ISO, création
  maj: string                        // ISO, dernière sauvegarde
  niveau: string
  tonalite: string
  objectifs: Record<string, number>  // copie du CSV au moment de la séance
  saisis: Record<string, number>
  figure?: FigureId
  schemaVersion: 1
}

export function lireSeances(): Seance[] {
  try {
    const brut = localStorage.getItem(CLE_LS)
    const liste = brut ? JSON.parse(brut) : []
    return Array.isArray(liste) ? liste : []
  } catch { return [] }
}

function ecrireSeances(liste: Seance[]) {
  try { localStorage.setItem(CLE_LS, JSON.stringify(liste)) } catch { /* stockage indisponible */ }
}

export function nouvelId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

/** Enregistre (création ou mise à jour) en local ; renvoie la liste à jour. */
export function sauverLocal(seance: Seance): Seance[] {
  const reste = lireSeances().filter(s => s.id !== seance.id)
  const liste = [...reste, seance]
  ecrireSeances(liste)
  return liste
}

export function supprimerLocal(id: string): Seance[] {
  const liste = lireSeances().filter(s => s.id !== id)
  ecrireSeances(liste)
  return liste
}

// ─── Firestore ────────────────────────────────────────────────────────────────

export async function pousserFirestore(uid: string, seance: Seance): Promise<void> {
  await setDoc(doc(db, 'users', uid, 'carnet', seance.id), { ...seance, expireAt: dateExpiration() })
}

export async function supprimerFirestore(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(db, 'users', uid, 'carnet', id))
}

/**
 * Fusionne local et cloud (union par id, `maj` la plus récente gagne), réécrit le
 * local, envoie au cloud ce qui lui manque. Renvoie la liste fusionnée.
 */
export async function synchroniser(uid: string): Promise<Seance[]> {
  const locales = lireSeances()
  const snap = await getDocs(collection(db, 'users', uid, 'carnet'))
  const cloud = new Map<string, Seance>()
  snap.docs.forEach(d => {
    const { expireAt: _e, ...s } = d.data() as Seance & { expireAt?: unknown }
    cloud.set(d.id, { ...s, id: d.id })
  })

  const fusion = new Map<string, Seance>(cloud)
  const aPousser: Seance[] = []
  for (const l of locales) {
    const c = cloud.get(l.id)
    if (!c || c.maj < l.maj) { fusion.set(l.id, l); aPousser.push(l) }
  }
  const liste = [...fusion.values()]
  ecrireSeances(liste)
  await Promise.all(aPousser.map(s => pousserFirestore(uid, s)))
  return liste
}
