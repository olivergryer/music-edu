// ─── Accordeur accompagné — modèle de phrase (brief UI v1, § 3) ───────────────
// Logique pure : aucun React, aucun audio. Imports relatifs avec extension `.ts`
// et marqueur `type` (runner `node --test`, mode « strip types »).
//
// Tout est stocké en SONS RÉELS ; la transposition (`acc_transpo`) n'intervient
// qu'à l'affichage.

import { noteNameToPC } from '../../accordeurUtils.js'
import type { Degre, Mode, Renversement } from '../harmonie/types.ts'
import { qualiteDiatonique, renversementValide } from './qualites.ts'

export type Mesure = '2/4' | '3/4' | '4/4'
export type Formule = 'tenu' | 'blanche' | 'noire' | 'croche'
export type AccordageSon = 'tempere' | 'juste' | 'utilisateur'
export type Role = 'F' | '3' | '5' | '7'
export type QualiteAccord = 'maj' | 'min' | 'dim' | 'dom7' | 'maj7' | 'min7' | 'hdim7' | 'dim7' | 'minmaj7'

export interface ReglageSon {
  cents?: number      // intonation réglée, absolue par rapport au tempéré ; absent = valeur de l'accordage
  volume?: number     // 0–1, défaut 0,8
  muet?: boolean
}

export interface Tonalite {
  tonique: number     // classe de hauteur 0–11, en SONS RÉELS
  nomTonique: string  // orthographe en sons réels, parmi les 17 de `NOMS_TONIQUES`
  mode: Mode
}

export interface EntreeSlot {
  tonalite: Tonalite
  degre: Degre
  qualite: QualiteAccord
  renversement: Renversement
  formule: Formule
  accordage: AccordageSon
  sons: Partial<Record<Role, ReglageSon>>
}

export interface Phrase {
  version: 1
  id: string
  nom: string
  mesure: Mesure
  tempo: number             // noires par minute, 40–160
  nbMesures: number         // 1–16
  boucle: boolean
  decompte: 0 | 1
  registre: -12 | 0 | 12
  volume: number            // 0–1
  entrees: Record<number, EntreeSlot>   // clé = index du temps ; l'index 0 est obligatoire
}

/** Les 17 toniques (orthographes de `DEFAULT_STRUCTURES`). */
export const NOMS_TONIQUES: readonly string[] = [
  'Do', 'Do#', 'Réb', 'Ré', 'Ré#', 'Mib', 'Mi', 'Fa', 'Fa#', 'Solb', 'Sol', 'Sol#', 'Lab', 'La', 'La#', 'Sib', 'Si',
]

export const TEMPO_MIN = 40
export const TEMPO_MAX = 160
export const MESURES_MAX = 16
export const VOLUME_PAR_DEFAUT_SON = 0.8

export function tonalite(nomTonique: string, mode: Mode): Tonalite {
  if (!NOMS_TONIQUES.includes(nomTonique)) throw new Error(`tonalite : tonique inconnue « ${nomTonique} »`)
  return { tonique: noteNameToPC(nomTonique) as number, nomTonique, mode }
}

export function tempsParMesure(m: Mesure): number {
  return m === '2/4' ? 2 : m === '3/4' ? 3 : 4
}

/** Nombre de slots (= de temps) de la phrase. */
export function nbSlots(p: Phrase): number {
  return p.nbMesures * tempsParMesure(p.mesure)
}

/** Position « mesure.temps » à partir de 1 (ex. « 3.2 »). */
export function positionMesureTemps(p: Phrase, k: number): { mesure: number; temps: number } {
  const pm = tempsParMesure(p.mesure)
  return { mesure: Math.floor(k / pm) + 1, temps: (k % pm) + 1 }
}

// ─── Résolution des slots (auto-remplissage, § 3) ─────────────────────────────

/** Index des entrées explicites, croissant. */
export function indicesEntrees(p: Phrase): number[] {
  return Object.keys(p.entrees).map(Number).sort((a, b) => a - b)
}

/** Index de l'entrée en vigueur au slot k : la dernière entrée d'index ≤ k. */
export function indiceEntreeDuSlot(p: Phrase, k: number): number {
  let courant = 0
  for (const i of indicesEntrees(p)) { if (i <= k) courant = i; else break }
  return courant
}

export function entreeDuSlot(p: Phrase, k: number): EntreeSlot {
  const e = p.entrees[indiceEntreeDuSlot(p, k)]
  if (!e) throw new Error('entreeDuSlot : la phrase n’a pas d’entrée au temps 0')
  return e
}

export function estExplicite(p: Phrase, k: number): boolean {
  return p.entrees[k] !== undefined
}

function copieEntree(e: EntreeSlot): EntreeSlot {
  return structuredClone(e)
}

/**
 * Modifie le slot k. Si k est auto-rempli, on copie l'entrée héritée, on applique
 * la modification et on crée l'entrée (§ 3). `creee` permet d'afficher la mention
 * « Nouvelle entrée au temps 3.2 ».
 */
export function modifierSlot(p: Phrase, k: number, modif: (e: EntreeSlot) => EntreeSlot): { phrase: Phrase; creee: boolean } {
  if (k < 0 || k >= nbSlots(p)) throw new Error(`modifierSlot : slot ${k} hors phrase`)
  const creee = !estExplicite(p, k)
  const base = copieEntree(entreeDuSlot(p, k))
  const nouvelle = modif(base)
  return { phrase: { ...p, entrees: { ...p.entrees, [k]: nouvelle } }, creee }
}

/** Rend le slot à l'auto-remplissage. Impossible au temps 0. */
export function supprimerEntree(p: Phrase, k: number): Phrase {
  if (k === 0) throw new Error('supprimerEntree : l’entrée du temps 0 est obligatoire')
  if (!estExplicite(p, k)) return p
  const entrees = { ...p.entrees }
  delete entrees[k]
  return { ...p, entrees }
}

/** Ajoute une mesure en fin de phrase (bouton « + mesure »). */
export function ajouterMesure(p: Phrase): Phrase {
  return p.nbMesures >= MESURES_MAX ? p : { ...p, nbMesures: p.nbMesures + 1 }
}

/** Retire la dernière mesure et les entrées qui tombent hors phrase. */
export function retirerMesure(p: Phrase): Phrase {
  if (p.nbMesures <= 1) return p
  const nb = { ...p, nbMesures: p.nbMesures - 1 }
  const max = nbSlots(nb)
  const entrees: Record<number, EntreeSlot> = {}
  for (const i of indicesEntrees(p)) if (i < max) entrees[i] = p.entrees[i]
  return { ...nb, entrees }
}

// ─── Validation ───────────────────────────────────────────────────────────────

export function entreeValide(e: EntreeSlot): boolean {
  if (!e || !e.tonalite || !NOMS_TONIQUES.includes(e.tonalite.nomTonique)) return false
  if (e.tonalite.mode !== 'majeur' && e.tonalite.mode !== 'mineur') return false
  if (!Number.isInteger(e.degre) || e.degre < 1 || e.degre > 7) return false
  if (!['tenu', 'blanche', 'noire', 'croche'].includes(e.formule)) return false
  if (!['tempere', 'juste', 'utilisateur'].includes(e.accordage)) return false
  if (!renversementValide(e.qualite, e.renversement)) return false
  return true
}

export function phraseValide(p: unknown): p is Phrase {
  const x = p as Phrase
  if (!x || x.version !== 1 || typeof x.id !== 'string' || typeof x.nom !== 'string') return false
  if (!['2/4', '3/4', '4/4'].includes(x.mesure)) return false
  if (!(x.tempo >= TEMPO_MIN && x.tempo <= TEMPO_MAX)) return false
  if (!(Number.isInteger(x.nbMesures) && x.nbMesures >= 1 && x.nbMesures <= MESURES_MAX)) return false
  if (!x.entrees || typeof x.entrees !== 'object' || !x.entrees[0]) return false
  const max = nbSlots(x)
  for (const [cle, e] of Object.entries(x.entrees)) {
    const i = Number(cle)
    if (!Number.isInteger(i) || i < 0 || i >= max || !entreeValide(e)) return false
  }
  return true
}

// ─── Partage par URL : ?p=<base64url(JSON)> ───────────────────────────────────

function versBase64Url(texte: string): string {
  const octets = new TextEncoder().encode(texte)
  let bin = ''
  for (const o of octets) bin += String.fromCharCode(o)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function depuisBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  const bin = atob(b64)
  const octets = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) octets[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(octets)
}

export function phraseVersURL(p: Phrase): string {
  return versBase64Url(JSON.stringify(p))
}

/** `null` si la chaîne est illisible ou n'est pas une phrase valide. */
export function phraseDepuisURL(s: string): Phrase | null {
  try {
    const p = JSON.parse(depuisBase64Url(s))
    return phraseValide(p) ? p : null
  } catch { return null }
}

// ─── Phrases fournies (lecture seule) ─────────────────────────────────────────

function entree(nom: string, mode: Mode, degre: Degre, qualite: QualiteAccord, formule: Formule): EntreeSlot {
  return { tonalite: tonalite(nom, mode), degre, qualite, renversement: 0, formule, accordage: 'juste', sons: {} }
}

/** Entrée diatonique : la qualité se déduit du degré (3 ou 4 sons). */
function diato(nom: string, mode: Mode, degre: Degre, nbSons: 3 | 4, formule: Formule): EntreeSlot {
  const q = qualiteDiatonique(mode, degre, nbSons)
  if (!q) throw new Error('diato : qualité diatonique introuvable')
  return entree(nom, mode, degre, q, formule)
}

export const PHRASES_FOURNIES: readonly Phrase[] = [
  {
    version: 1, id: 'fournie-cadence-do', nom: 'Cadence I–IV–V7–I (Do majeur)',
    mesure: '4/4', tempo: 72, nbMesures: 4, boucle: true, decompte: 1, registre: 0, volume: 0.8,
    entrees: {
      0: diato('Do', 'majeur', 1, 3, 'tenu'), 4: diato('Do', 'majeur', 4, 3, 'tenu'),
      8: diato('Do', 'majeur', 5, 4, 'tenu'), 12: diato('Do', 'majeur', 1, 3, 'tenu'),
    },
  },
  {
    version: 1, id: 'fournie-i-vi-ii7-v7-fa', nom: 'I–vi–ii7–V7 (Fa majeur)',
    mesure: '4/4', tempo: 80, nbMesures: 4, boucle: true, decompte: 1, registre: 0, volume: 0.8,
    entrees: {
      0: diato('Fa', 'majeur', 1, 3, 'blanche'), 4: diato('Fa', 'majeur', 6, 3, 'blanche'),
      8: diato('Fa', 'majeur', 2, 4, 'blanche'), 12: diato('Fa', 'majeur', 5, 4, 'blanche'),
    },
  },
  {
    version: 1, id: 'fournie-i-iv-v7-i-la-mineur', nom: 'i–iv–V7–i (la mineur)',
    mesure: '3/4', tempo: 76, nbMesures: 4, boucle: true, decompte: 1, registre: 0, volume: 0.8,
    entrees: {
      0: diato('La', 'mineur', 1, 3, 'noire'), 3: diato('La', 'mineur', 4, 3, 'noire'),
      6: diato('La', 'mineur', 5, 4, 'noire'), 9: diato('La', 'mineur', 1, 3, 'noire'),
    },
  },
]

export function phraseVide(nom = 'Nouvelle phrase'): Phrase {
  return {
    version: 1, id: `phrase-${Date.now().toString(36)}`, nom,
    mesure: '4/4', tempo: 72, nbMesures: 4, boucle: true, decompte: 1, registre: 0, volume: 0.8,
    entrees: { 0: diato('Do', 'majeur', 1, 3, 'tenu') },
  }
}

// ─── Persistance locale (navigateur) ──────────────────────────────────────────

const CLE_PHRASES = 'acc_phrases'
const CLE_COURANTE = 'acc_phrase_courante'

export function chargerPhrases(): Phrase[] {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE_PHRASES) ?? '[]')
    return Array.isArray(brut) ? brut.filter(phraseValide) : []
  } catch { return [] }
}

export function sauverPhrases(liste: Phrase[]): void {
  try { localStorage.setItem(CLE_PHRASES, JSON.stringify(liste)) } catch { /* stockage indisponible */ }
}

export function chargerPhraseCourante(): string | null {
  try { return localStorage.getItem(CLE_COURANTE) } catch { return null }
}

export function sauverPhraseCourante(id: string): void {
  try { localStorage.setItem(CLE_COURANTE, id) } catch { /* stockage indisponible */ }
}
