// ─── Grammaire : matrices de transition (spec §3) ────────────────────────────
//
// LA MATRICE N'EST PAS DÉRIVABLE DU CERCLE. IV→V est à distance angulaire
// maximale (3) et à fréquence syntaxique maximale (.45). Le cercle encode la
// proximité acoustique, la matrice la syntaxe enseignée. Les deux sont
// décorrélés — c'est ce qui rend leur croisement diagnostique. Ne jamais
// remplacer l'une de ces tables par un calcul sur l'autre.
//
// TODO Matthieu — poids à reprendre avec le collègue référent (spec §9). Ce sont
// des valeurs de départ, pas une référence. Elles somment déjà à 1 par ligne, mais
// tout est renormalisé à l'exécution pour rester robuste à une correction.

import { DEGRES, type Degre, type MatriceTransition, type Mode } from './types.ts'

// Majeur. Ligne = degré de départ, colonne = degré d'arrivée. 0 = « — » (interdit).
export const MATRICE_MAJEUR: MatriceTransition = {
  1: { 1: 0.1, 2: 0.15, 3: 0.05, 4: 0.25, 5: 0.25, 6: 0.15, 7: 0.05 },
  2: { 1: 0.1, 2: 0, 3: 0.05, 4: 0.1, 5: 0.5, 6: 0.1, 7: 0.15 },
  3: { 1: 0.1, 2: 0.15, 3: 0, 4: 0.25, 5: 0.1, 6: 0.4, 7: 0 },
  4: { 1: 0.2, 2: 0.15, 3: 0, 4: 0, 5: 0.45, 6: 0.1, 7: 0.1 },
  5: { 1: 0.6, 2: 0, 3: 0.05, 4: 0.05, 5: 0.1, 6: 0.2, 7: 0 },
  6: { 1: 0.15, 2: 0.3, 3: 0.1, 4: 0.25, 5: 0.2, 6: 0, 7: 0 },
  7: { 1: 0.7, 2: 0, 3: 0.2, 4: 0, 5: 0, 6: 0.1, 7: 0 },
}

// Mineur. Mêmes positions, pondérations distinctes. Différences structurantes :
// III (relatif majeur) devient un but fort ; iv→V est la préparation standard ;
// V→VI (rompue) est plus marquée qu'en majeur.
export const MATRICE_MINEUR: MatriceTransition = {
  1: { 1: 0.1, 2: 0.15, 3: 0.2, 4: 0.25, 5: 0.2, 6: 0.05, 7: 0.05 },
  2: { 1: 0.05, 2: 0, 3: 0.05, 4: 0.1, 5: 0.55, 6: 0.1, 7: 0.15 },
  3: { 1: 0.15, 2: 0.1, 3: 0, 4: 0.2, 5: 0.15, 6: 0.4, 7: 0 },
  4: { 1: 0.2, 2: 0.1, 3: 0.05, 4: 0, 5: 0.5, 6: 0.1, 7: 0.05 },
  5: { 1: 0.55, 2: 0, 3: 0.05, 4: 0.05, 5: 0.1, 6: 0.25, 7: 0 },
  6: { 1: 0.1, 2: 0.35, 3: 0.1, 4: 0.25, 5: 0.2, 6: 0, 7: 0 },
  7: { 1: 0.7, 2: 0, 3: 0.2, 4: 0, 5: 0, 6: 0.1, 7: 0 },
}

export function matriceBrute(mode: Mode): MatriceTransition {
  if (mode === 'majeur') return MATRICE_MAJEUR
  if (mode === 'mineur') return MATRICE_MINEUR
  throw new Error(`matriceBrute : mode invalide (${mode})`)
}

export type Ligne = Record<Degre, number>

// Renormalise une ligne à 1 sur les degrés autorisés (poids > 0 ET présents dans
// `vocabulaire`). Retourne des zéros partout si plus rien n'est atteignable —
// c'est au générateur de traiter l'impasse, pas à la normalisation.
export function normaliserLigne(ligne: Readonly<Ligne>, vocabulaire?: readonly Degre[]): Ligne {
  const autorise = (d: Degre) => (vocabulaire ? vocabulaire.includes(d) : true)
  const total = DEGRES.reduce((s, d) => s + (autorise(d) ? Math.max(0, ligne[d] ?? 0) : 0), 0)
  const sortie = {} as Ligne
  for (const d of DEGRES) {
    sortie[d] = total > 0 && autorise(d) ? Math.max(0, ligne[d] ?? 0) / total : 0
  }
  return sortie
}

export function ligneRestreinte(mode: Mode, de: Degre, vocabulaire?: readonly Degre[]): Ligne {
  return normaliserLigne(matriceBrute(mode)[de], vocabulaire)
}

// Matrice entière normalisée par ligne (spec §3 : « normaliser par ligne à
// l'exécution »). Mémoïsée : les tables sont constantes.
const CACHE = new Map<Mode, MatriceTransition>()

export function matriceNormalisee(mode: Mode): MatriceTransition {
  const cachee = CACHE.get(mode)
  if (cachee) return cachee
  const brute = matriceBrute(mode)
  const sortie = {} as Record<Degre, Ligne>
  for (const d of DEGRES) sortie[d] = normaliserLigne(brute[d])
  CACHE.set(mode, sortie)
  return sortie
}

export function probabilite(mode: Mode, de: Degre, vers: Degre): number {
  return matriceNormalisee(mode)[de][vers]
}

// Degrés atteignables depuis `de` (poids strictement positif), éventuellement
// restreints au vocabulaire d'un niveau.
export function successeurs(mode: Mode, de: Degre, vocabulaire?: readonly Degre[]): Degre[] {
  const ligne = ligneRestreinte(mode, de, vocabulaire)
  return DEGRES.filter((d) => ligne[d] > 0)
}
