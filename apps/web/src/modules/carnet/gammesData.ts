// ─── Carnet de gammes — données (CSV) ─────────────────────────────────────────
//
// Source de vérité : /public/carnet-gammes.csv, format long, une ligne par
// (niveau, tonalité, exercice). Aucune liste en dur : les niveaux, tonalités et
// exercices proposés sont DÉRIVÉS des lignes présentes. Une combinaison absente
// du CSV n'est simplement pas proposée.
//
//   niveau,tonalite,exercice,tempo,figure
//   C1,Do M,diatonique-lie,60,noire
//
// Lignes vides et lignes commençant par # ignorées.

import { FIGURE_IDS, type FigureId } from './figures.ts'

/** Ordre d'affichage des niveaux ; un niveau inconnu du CSV est placé à la suite. */
export const NIVEAUX_ORDRE = ['C1', 'C2/1', 'C2/2', 'C2/3', 'C2/4', 'C3', 'CPES']

export const EXERCICES: { id: string; label: string }[] = [
  { id: 'diatonique-lie', label: 'Diatonique lié' },
  { id: 'diatonique-detache', label: 'Diatonique détaché' },
  { id: 'secondes', label: 'Secondes' },
  { id: 'secondes-doublees', label: 'Secondes doublées' },
  { id: 'tierces', label: 'Tierces' },
  { id: 'tierces-doublees', label: 'Tierces doublées' },
  { id: 'arpeges', label: 'Arpèges' },
]

export function labelExercice(id: string): string {
  return EXERCICES.find(e => e.id === id)?.label ?? id
}

export interface LigneGamme {
  niveau: string
  tonalite: string       // clé canonique, voir cleTonalite
  exercice: string
  tempo: number
  figure?: FigureId
}

// ─── Tonalités ────────────────────────────────────────────────────────────────

const NOMS_NOTES: Record<string, string> = {
  do: 'Do', re: 'Ré', 'ré': 'Ré', mi: 'Mi', fa: 'Fa', sol: 'Sol', la: 'La', si: 'Si',
}

/**
 * Normalise une tonalité saisie à la main : « Do M », « fa♯ m », « Sib M »,
 * « Si♭ M » → clé canonique « Do M », « Fa# m », « Sib M ». `null` si illisible.
 * La casse du dernier caractère distingue majeur (M) et mineur (m).
 */
export function cleTonalite(brut: string): string | null {
  const t = brut.trim().replace(/♯/g, '#').replace(/♭/g, 'b')
  const m = t.match(/^([A-Za-zéÉ]+?)([#b]?)\s*(M|m)$/)
  if (!m) return null
  const nom = NOMS_NOTES[m[1].toLowerCase()]
  if (!nom) return null
  return `${nom}${m[2]} ${m[3]}`
}

/** « Fa# m » → « Fa♯ m » pour l'affichage. */
export function affichageTonalite(cle: string): string {
  return cle.replace('#', '♯').replace(/^(\p{L}+)b /u, '$1♭ ')
}

export function estMajeure(cle: string): boolean {
  return cle.endsWith(' M')
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

function decouperLigne(ligne: string): string[] {
  const res: string[] = []
  let cur = ''
  let guillemets = false
  for (const ch of ligne) {
    if (ch === '"') { guillemets = !guillemets; continue }
    if (ch === ',' && !guillemets) { res.push(cur.trim()); cur = ''; continue }
    cur += ch
  }
  res.push(cur.trim())
  return res
}

export function parserGammesCsv(texte: string): LigneGamme[] {
  const lignes = texte.replace(/^﻿/, '').split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
  const resultat: LigneGamme[] = []
  // lignes[0] = en-têtes
  for (const brut of lignes.slice(1)) {
    const [niveau, tonBrute, exercice, tempoBrut, figureBrute] = decouperLigne(brut)
    const tonalite = tonBrute ? cleTonalite(tonBrute) : null
    const tempo = parseInt(tempoBrut ?? '', 10)
    const exerciceConnu = EXERCICES.some(e => e.id === exercice)
    if (!niveau || !tonalite || !exerciceConnu || !Number.isFinite(tempo)) {
      continue
    }
    const figure = FIGURE_IDS.includes(figureBrute as FigureId) ? (figureBrute as FigureId) : undefined
    resultat.push({ niveau, tonalite, exercice, tempo, ...(figure && { figure }) })
  }
  return resultat
}

// ─── Sélecteurs ───────────────────────────────────────────────────────────────

export function niveauxDisponibles(lignes: LigneGamme[]): string[] {
  const presents = new Set(lignes.map(l => l.niveau))
  const connus = NIVEAUX_ORDRE.filter(n => presents.has(n))
  const autres = [...presents].filter(n => !NIVEAUX_ORDRE.includes(n))
  return [...connus, ...autres]
}

export function tonalitesDisponibles(lignes: LigneGamme[], niveau: string): Set<string> {
  return new Set(lignes.filter(l => l.niveau === niveau).map(l => l.tonalite))
}

/** Lignes du tableau pour (niveau, tonalité), dans l'ordre canonique des exercices. */
export function exercicesPour(lignes: LigneGamme[], niveau: string, tonalite: string): LigneGamme[] {
  const ordre = (id: string) => {
    const i = EXERCICES.findIndex(e => e.id === id)
    return i < 0 ? EXERCICES.length : i
  }
  return lignes
    .filter(l => l.niveau === niveau && l.tonalite === tonalite)
    .sort((a, b) => ordre(a.exercice) - ordre(b.exercice))
}
