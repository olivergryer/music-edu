// ─── Carnet — sources des tempi ───────────────────────────────────────────────
//
// Ordre de priorité :
//   1. l'URL collée par l'utilisateur (CSV ou Google Sheets publié), si présente ;
//   2. sinon le document en ligne de la classe (Google Sheets publié) ;
//   3. en cas d'échec : la dernière version chargée (cache local), puis le CSV de
//      secours embarqué (/carnet-gammes.csv, aussi modèle téléchargeable).
//
// Un Google Sheets « publié sur le Web » expose une page /pubhtml qui liste ses
// feuilles (nom + gid) ; chaque feuille se lit ensuite en CSV. Le nom de la
// feuille donne le niveau (C1, C2/1…).

import { completerNiveaux, parserGammesCsv, type LigneGamme } from './gammesData.ts'

export const URL_DOC_CLASSE =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vS_oNdmiikBxL4LyXgY7Huv9FDMqSdcjW7lBF2f5hfFlYaPf_4WFblikepVli8wShKhe2wjJ6HTRjEo/pubhtml'
export const URL_SECOURS = '/carnet-gammes.csv'

const CLE_CACHE = 'carnet-gammes-cache-v1'
const CLE_URL = 'carnet-source-url-v1'
const DELAI_MS = 8000

export type Source = 'classe' | 'perso' | 'secours'

export interface Chargement {
  lignes: LigneGamme[]
  source: Source
  /** Données issues du cache ou du secours : la source en ligne n'a pas répondu. */
  horsLigne: boolean
}

// ─── Réseau ───────────────────────────────────────────────────────────────────

async function lireTexte(url: string): Promise<string> {
  const ctrl = new AbortController()
  const minuterie = window.setTimeout(() => ctrl.abort(), DELAI_MS)
  try {
    const r = await fetch(url, { signal: ctrl.signal })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return await r.text()
  } finally {
    window.clearTimeout(minuterie)
  }
}

/** Page Google Sheets publiée, listant les feuilles (≠ export CSV direct). */
function estGooglePublie(url: string): boolean {
  return /docs\.google\.com\/spreadsheets\/d\/e\/[^/?#]+\/pub(html)?(\?|#|$)/.test(url)
    && !/output=(csv|tsv)/.test(url)
}

function decoderEchappements(s: string): string {
  return s
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\(.)/g, '$1')
}

async function chargerGoogle(url: string): Promise<LigneGamme[]> {
  const base = url.split(/[?#]/)[0].replace(/\/pubhtml$/, '/pub')
  const html = await lireTexte(`${base}html`)
  const feuilles = [...html.matchAll(/items\.push\(\{name: "((?:[^"\\]|\\.)*)"[\s\S]*?gid: "(\d+)"/g)]
    .map(m => ({ nom: decoderEchappements(m[1]).trim(), gid: m[2] }))
  if (!feuilles.length) throw new Error('Aucune feuille trouvée dans le document publié.')

  const resultats = await Promise.allSettled(feuilles.map(async f => {
    const csv = await lireTexte(`${base}?gid=${f.gid}&single=true&output=csv`)
    return parserGammesCsv(csv, f.nom)
  }))
  // Une feuille illisible n'invalide pas les autres.
  return completerNiveaux(resultats.flatMap(r => (r.status === 'fulfilled' ? r.value : [])))
}

async function chargerUrl(url: string): Promise<LigneGamme[]> {
  if (estGooglePublie(url)) return chargerGoogle(url)
  return completerNiveaux(parserGammesCsv(await lireTexte(url)))
}

// ─── Cache et préférence d'URL ────────────────────────────────────────────────

interface EntreeCache { url: string; lignes: LigneGamme[] }

function lireCache(url: string): LigneGamme[] | null {
  try {
    const e = JSON.parse(localStorage.getItem(CLE_CACHE) ?? 'null') as EntreeCache | null
    return e && e.url === url && Array.isArray(e.lignes) && e.lignes.length ? e.lignes : null
  } catch { return null }
}

function ecrireCache(url: string, lignes: LigneGamme[]) {
  try { localStorage.setItem(CLE_CACHE, JSON.stringify({ url, lignes })) } catch { /* ignore */ }
}

export function lireUrlPerso(): string | null {
  try { return localStorage.getItem(CLE_URL) || null } catch { return null }
}

function memoriserUrlPerso(url: string | null) {
  try {
    if (url) localStorage.setItem(CLE_URL, url)
    else localStorage.removeItem(CLE_URL)
  } catch { /* ignore */ }
}

/** Données du cache pour l'affichage immédiat, avant la réponse du réseau. */
export function lireCachePourSource(urlPerso: string | null): LigneGamme[] | null {
  return lireCache(urlPerso || URL_DOC_CLASSE)
}

// ─── API ──────────────────────────────────────────────────────────────────────

export async function charger(urlPerso: string | null): Promise<Chargement> {
  const cible = urlPerso || URL_DOC_CLASSE
  const source: Source = urlPerso ? 'perso' : 'classe'
  try {
    const lignes = await chargerUrl(cible)
    if (!lignes.length) throw new Error('Aucune ligne exploitable.')
    ecrireCache(cible, lignes)
    return { lignes, source, horsLigne: false }
  } catch {
    const cache = lireCache(cible)
    if (cache) return { lignes: cache, source, horsLigne: true }
    const secours = completerNiveaux(parserGammesCsv(await lireTexte(URL_SECOURS)))
    return { lignes: secours, source: 'secours', horsLigne: true }
  }
}

/**
 * Teste une URL fournie par l'utilisateur. Lève une erreur lisible en cas d'échec
 * (les données déjà chargées restent alors en place). En cas de succès, l'URL est
 * mémorisée. `null` ou chaîne vide : retour au document de la classe.
 */
export async function appliquerUrlPerso(url: string | null): Promise<Chargement> {
  const propre = url?.trim() || null
  if (propre && !/^https?:\/\//i.test(propre)) throw new Error('L’adresse doit commencer par https://')
  if (!propre) {
    memoriserUrlPerso(null)
    return charger(null)
  }
  let lignes: LigneGamme[]
  try {
    lignes = await chargerUrl(propre)
  } catch {
    throw new Error('Impossible de lire cette adresse (accès refusé, fichier non publié ou hors ligne).')
  }
  if (!lignes.length) throw new Error('Aucune ligne exploitable dans ce fichier. Vérifie les colonnes avec le modèle.')
  ecrireCache(propre, lignes)
  memoriserUrlPerso(propre)
  return { lignes, source: 'perso', horsLigne: false }
}
