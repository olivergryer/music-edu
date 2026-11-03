// ─── Carnet de gammes — données (CSV) ─────────────────────────────────────────
//
// Deux formats de CSV acceptés, détectés automatiquement :
//
//  • LONG (modèle téléchargeable, /carnet-gammes.csv) — une ligne par
//    (niveau, tonalité, exercice) :
//        niveau,tonalite,exercice,tempo
//        C1,Do M,Diatonique lié,92
//
//  • LARGE (feuilles du document de la classe) — une feuille = un niveau, dont le
//    nom donne le niveau ; tonalités en colonnes, exercices en lignes :
//        ,Do M,La m,Sol M
//        Diatonique lié,92,80,80
//
// Aucune liste en dur : niveaux, tonalités et exercices proposés sont DÉRIVÉS des
// lignes présentes. Une combinaison absente (ou une case vide) n'est pas proposée.
// Lignes vides et lignes commençant par # ignorées.

/** Ordre d'affichage des niveaux ; un niveau inconnu du CSV est placé à la suite. */
export const NIVEAUX_ORDRE = ['C1', 'C2/1', 'C2/2', 'C2/3', 'C2/4', 'C3', 'CPES']

/** Niveaux sans feuille propre qui reprennent les tempi d'un autre niveau (même contenu en classe). */
export const NIVEAUX_ALIAS: Record<string, string> = { 'C2/2': 'C2/1', 'C2/4': 'C2/3' }

/** Ajoute les niveaux alias absents des données (copie des lignes du niveau source). */
export function completerNiveaux(lignes: LigneGamme[]): LigneGamme[] {
  const presents = new Set(lignes.map(l => l.niveau))
  const copies = Object.entries(NIVEAUX_ALIAS)
    .filter(([alias, source]) => !presents.has(alias) && presents.has(source))
    .flatMap(([alias, source]) => lignes.filter(l => l.niveau === source).map(l => ({ ...l, niveau: alias })))
  return copies.length ? [...lignes, ...copies] : lignes
}

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

/** « Diatonique détaché » → « diatonique-detache » (sans accents, casse ni ponctuation). */
export function idExercice(texte: string): string {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export interface LigneGamme {
  niveau: string
  tonalite: string       // clé canonique, voir cleTonalite
  exercice: string       // identifiant (slug)
  /** Libellé d'affichage, seulement pour un exercice hors de la liste connue. */
  libelle?: string
  tempo: number
}

// ─── Tonalités ────────────────────────────────────────────────────────────────

const NOMS_NOTES: Record<string, string> = {
  do: 'Do', re: 'Ré', 'ré': 'Ré', mi: 'Mi', fa: 'Fa', sol: 'Sol', la: 'La', si: 'Si',
}

/**
 * Normalise une tonalité saisie à la main : « Do M », « fa♯ m », « Sib M »,
 * « Si♭ M » → clé canonique « Do M », « Fa# m », « Sib M ». `null` si illisible.
 * La casse du dernier caractère distingue majeur (M) et mineur (m).
 * Un double nom enharmonique (« Fa#/Solb M ») garde sa première variante.
 */
export function cleTonalite(brut: string): string | null {
  let t = brut.trim().replace(/♯/g, '#').replace(/♭/g, 'b')
  if (t.includes('/')) {
    const mode = t.match(/\s*(M|m)$/)
    if (!mode) return null
    t = `${t.slice(0, t.length - mode[0].length).split('/')[0].trim()} ${mode[1]}`
  }
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

function lignesUtiles(texte: string): string[] {
  return texte.replace(/^﻿/, '').split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#') && !/^[,;\s]+$/.test(l))
}

function ligneGamme(niveau: string, tonalite: string, exerciceBrut: string, tempo: number): LigneGamme {
  const exercice = idExercice(exerciceBrut)
  const connu = EXERCICES.some(e => e.id === exercice)
  return { niveau, tonalite, exercice, tempo, ...(!connu && { libelle: exerciceBrut.trim() }) }
}

function parserLong(lignes: string[]): LigneGamme[] {
  const entetes = decouperLigne(lignes[0]).map(idExercice)
  const col = (nom: string) => entetes.indexOf(nom)
  const [iN, iT, iE, iP] = [col('niveau'), col('tonalite'), col('exercice'), col('tempo')]
  const resultat: LigneGamme[] = []
  for (const brut of lignes.slice(1)) {
    const c = decouperLigne(brut)
    const niveau = c[iN]
    const tonalite = c[iT] ? cleTonalite(c[iT]) : null
    const tempo = parseInt(c[iP] ?? '', 10)
    if (!niveau || !tonalite || !c[iE] || !Number.isFinite(tempo) || tempo <= 0) continue
    resultat.push(ligneGamme(niveau, tonalite, c[iE], tempo))
  }
  return resultat
}

function parserLarge(lignes: string[], niveau: string): LigneGamme[] {
  const entetes = decouperLigne(lignes[0]).map(h => (h ? cleTonalite(h) : null))
  const resultat: LigneGamme[] = []
  for (const brut of lignes.slice(1)) {
    const c = decouperLigne(brut)
    const exercice = c[0]
    if (!exercice) continue
    for (let j = 1; j < entetes.length; j++) {
      const tonalite = entetes[j]
      const tempo = parseInt(c[j] ?? '', 10)
      if (!tonalite || !Number.isFinite(tempo) || tempo <= 0) continue
      resultat.push(ligneGamme(niveau, tonalite, exercice, tempo))
    }
  }
  return resultat
}

/**
 * Lit un CSV, format long ou large selon l'en-tête. Pour le format large, le
 * niveau n'est pas dans le fichier : `niveauParDefaut` (nom de la feuille).
 */
export function parserGammesCsv(texte: string, niveauParDefaut = 'Perso'): LigneGamme[] {
  const lignes = lignesUtiles(texte)
  if (lignes.length < 2) return []
  const entetes = decouperLigne(lignes[0]).map(idExercice)
  const long = entetes.includes('niveau') && entetes.includes('tonalite') && entetes.includes('tempo')
  return long ? parserLong(lignes) : parserLarge(lignes, niveauParDefaut)
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

/** Lignes du tableau pour (niveau, tonalité) : exercices connus d'abord, dans l'ordre canonique. */
export function exercicesPour(lignes: LigneGamme[], niveau: string, tonalite: string): LigneGamme[] {
  const ordre = (id: string) => {
    const i = EXERCICES.findIndex(e => e.id === id)
    return i < 0 ? EXERCICES.length : i
  }
  return lignes
    .filter(l => l.niveau === niveau && l.tonalite === tonalite)
    .sort((a, b) => ordre(a.exercice) - ordre(b.exercice))
}
