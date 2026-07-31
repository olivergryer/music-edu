// ─── Générateur de progressions (spec §3 + annexe §1-§3) ─────────────────────
//
// DÉTERMINISTE PAR SEED : indispensable pour rejouer un exercice raté et pour les
// tests. Aucun appel à `Math.random`, un seul flux `mulberry32` consommé
// séquentiellement — deux appels de même signature produisent le même résultat
// bit à bit, y compris à travers les tentatives de rejet.
//
// Trois régimes (annexe §1) : `atome` (0-1), `gabarit` (2-5), `matrice` (6-8).
// La matrice de transition n'est requise qu'à partir du niveau 6.

import { debutImpose, respecteContraintes, substitutionValide, violations } from './contraintes.ts'
import { longueurGabarit, parseGabarit } from './gabarits.ts'
import { ligneRestreinte } from './matrice.ts'
import { assertNiveauGenerable, type NiveauSpec } from './niveaux.ts'
import { mulberry32, pick, pickInt, weightedPick, type Rng } from './rng.ts'
import {
  DEGRES,
  creerAccord,
  qualite,
  type Accord,
  type Degre,
  type Mode,
  type PositionMetrique,
  type Progression,
  type Renversement,
} from './types.ts'

// TODO Matthieu — conventions V1, à revoir le jour où le rendu impose un vrai
// modèle métrique. Toutes les durées valent une pulsation ; les temps alternent
// fort/faible à partir de l'index 0. Le 6/4 cadentiel a donc besoin d'un index
// PAIR suivi d'un V (contrainte dure n°3).
export const METRIQUE_V1 = {
  duree: 1,
  positionMetrique: (index: number): PositionMetrique => (index % 2 === 0 ? 'fort' : 'faible'),
}

// TODO Matthieu — pondérations de surface, sans valeur pédagogique arrêtée.
export const POIDS_RENVERSEMENT_V1: Readonly<Record<Renversement, number>> = {
  0: 0.6,
  1: 0.3,
  2: 0.1,
  3: 0.05,
}
export const PROBA_SEPTIEME_V1 = 0.35

const TENTATIVES_MAX = 60

// Longueurs réellement produisibles. Au régime `gabarit` ce n'est PAS l'intervalle
// déclaré `spec.longueur` mais la liste des longueurs de formules disponibles :
// le niveau 5 annonce [3, 5] alors que ses quatre gabarits font 3 ou 4 accords.
export function longueursDisponibles(spec: NiveauSpec): number[] {
  if (spec.regime === 'gabarit') {
    return [...new Set((spec.gabarits ?? []).map(longueurGabarit))].sort((a, b) => a - b)
  }
  const [min, max] = spec.longueur
  return Array.from({ length: max - min + 1 }, (_, i) => min + i)
}

// Vocabulaire effectivement tirable. La tâche `qualite_binaire` (niveau 0) ne peut
// pas présenter d'accord diminué : la réponse attendue est « majeur ou mineur », et
// un accord diminué n'est ni l'un ni l'autre. En majeur cela ne change rien ; en
// mineur cela retire le II du niveau 0.
// VALIDÉ avec Matthieu (2026-07-31) — l'annexe déclarait `vocabulaire [1, 4, 5, 2, 6]`
// au niveau 0 sans distinguer les modes ; l'écart est assumé.
export function vocabulaireTirable(spec: NiveauSpec, mode: Mode): Degre[] {
  if (spec.tache !== 'qualite_binaire') return [...spec.vocabulaire]
  return spec.vocabulaire.filter((d) => qualite(mode, d) !== 'dim')
}

export function genererProgression(
  mode: Mode,
  niveau: number,
  longueur: number,
  seed: number,
): Progression {
  const spec = assertNiveauGenerable(niveau)
  const [min, max] = spec.longueur
  if (!Number.isInteger(longueur) || longueur < min || longueur > max) {
    throw new Error(
      `genererProgression : longueur ${longueur} hors bornes du niveau ${niveau} [${min}, ${max}]`,
    )
  }
  const disponibles = longueursDisponibles(spec)
  if (!disponibles.includes(longueur)) {
    throw new Error(
      `genererProgression : niveau ${niveau}, aucun gabarit de ${longueur} accords ` +
        `(disponibles : ${disponibles.join(', ')})`,
    )
  }

  const rng = mulberry32(seed)

  for (let essai = 0; essai < TENTATIVES_MAX; essai++) {
    const accords = tirerAccords(spec, mode, longueur, rng)
    if (accords && respecteContraintes(accords, mode, niveau)) {
      return {
        id: `${mode}-n${niveau}-l${longueur}-s${seed}`,
        tonique: 0, // do : la transposition relève de `plageTransposition` (§6)
        mode,
        accords,
        niveau,
      }
    }
  }

  throw new Error(
    `genererProgression : aucune progression valide en ${TENTATIVES_MAX} tentatives ` +
      `(${mode}, niveau ${niveau}, longueur ${longueur}, seed ${seed})`,
  )
}

// ─── Tirage du squelette, par régime ─────────────────────────────────────────

function tirerAccords(spec: NiveauSpec, mode: Mode, longueur: number, rng: Rng): Accord[] | null {
  const squelette =
    spec.regime === 'gabarit'
      ? tirerGabarit(spec, longueur, rng)
      : (tirerDegres(spec, mode, longueur, rng)?.map((degre, i) => creerAccord(i, { degre })) ?? null)

  return squelette ? habiller(squelette, spec, mode, rng) : null
}

// Régime `gabarit` : une formule tirée parmi celles de la bonne longueur. Le
// chiffrage éventuel écrit dans la formule (V7, VII6…) est conservé tel quel.
function tirerGabarit(spec: NiveauSpec, longueur: number, rng: Rng): Accord[] | null {
  const candidats = (spec.gabarits ?? []).filter((g) => longueurGabarit(g) === longueur)
  const choisi = pick(candidats, rng)
  return choisi ? parseGabarit(choisi) : null
}

// Régimes `atome` et `matrice` : suite de degrés.
function tirerDegres(spec: NiveauSpec, mode: Mode, longueur: number, rng: Rng): Degre[] | null {
  const vocabulaire = vocabulaireTirable(spec, mode)
  const degres: Degre[] = []

  for (let i = 0; i < longueur; i++) {
    const precedent = degres[i - 1]
    const ligne = i > 0 && spec.regime === 'matrice' ? ligneRestreinte(mode, precedent, vocabulaire) : null

    let candidats: Degre[]
    if (i === 0) candidats = debutImpose(spec) ? [1] : [...vocabulaire]
    else if (ligne) candidats = DEGRES.filter((d) => ligne[d] > 0)
    else candidats = [...vocabulaire]

    // Contrainte dure n°4 : jamais trois fois le même degré d'affilée.
    if (i >= 2 && degres[i - 1] === degres[i - 2]) {
      candidats = candidats.filter((d) => d !== degres[i - 1])
    }

    if (i === longueur - 1 && spec.finales.length > 0) {
      candidats = candidats.filter((d) => spec.finales.includes(d))
    } else if (
      // Garder la finale atteignable : ne pas poser en avant-dernière position un
      // degré qui rendrait la finale imposée impossible (triple répétition).
      i === longueur - 2 &&
      spec.finales.length === 1 &&
      degres[i - 1] === spec.finales[0]
    ) {
      candidats = candidats.filter((d) => d !== spec.finales[0])
    }

    if (candidats.length === 0) return null

    const degre = ligne ? tirerPondere(candidats, ligne, rng) : pick(candidats, rng)
    if (degre === undefined) return null
    degres.push(degre)
  }

  return degres
}

function tirerPondere(
  candidats: Degre[],
  poids: Record<Degre, number>,
  rng: Rng,
): Degre | undefined {
  const index = weightedPick(
    candidats.map((d) => poids[d]),
    rng,
  )
  return index >= 0 ? candidats[index] : pick(candidats, rng)
}

// ─── Habillage : métrique, septièmes, renversements ──────────────────────────

function habiller(squelette: Accord[], spec: NiveauSpec, mode: Mode, rng: Rng): Accord[] | null {
  const niveau = spec.niveau

  const accords = squelette.map((a, i) =>
    creerAccord(i, {
      degre: a.degre,
      renversement: a.renversement,
      septieme: a.septieme,
      duree: METRIQUE_V1.duree,
      positionMetrique: METRIQUE_V1.positionMetrique(i),
    }),
  )

  // Septièmes — seulement sur les degrés déclarés par le niveau (`septiemeSur`
  // est vide en dessous du niveau 5, ce qui applique la contrainte dure n°5).
  for (let i = 0; i < accords.length; i++) {
    if (accords[i].septieme || !spec.septiemeSur.includes(accords[i].degre)) continue
    if (rng() >= PROBA_SEPTIEME_V1) continue
    const candidat = creerAccord(i, { ...accords[i], septieme: true })
    if (substitutionValide(accords, i, candidat, mode, niveau)) accords[i] = candidat
  }

  // Renversements. Au régime `gabarit`, un SEUL accord désigné bouge — « un accord
  // désigné de la formule est à l'état fondamental ou au premier renversement,
  // l'élève tranche ». Au régime `matrice`, chaque accord est tiré indépendamment.
  const indices =
    spec.regime === 'gabarit' ? indiceDesigne(accords.length, rng) : accords.map((_, i) => i)

  for (const i of indices) {
    const faisables = spec.renversements.filter((r) =>
      substitutionValide(
        accords,
        i,
        creerAccord(i, { ...accords[i], renversement: r }),
        mode,
        niveau,
      ),
    )
    if (faisables.length === 0) continue
    const tire = weightedPick(
      faisables.map((r) => POIDS_RENVERSEMENT_V1[r]),
      rng,
    )
    accords[i] = creerAccord(i, {
      ...accords[i],
      renversement: faisables[tire >= 0 ? tire : 0],
    })
  }

  // Contrainte dure n°2, application impérative : aucun accord diminué ne reste à
  // l'état fondamental, y compris quand le niveau ne déclare pas encore le premier
  // renversement. Cas concret : le ii° du gabarit « I-VI-II-V » au niveau 3 en
  // mineur, joué en ii°6.
  // VALIDÉ avec Matthieu (2026-07-31) — la formule sort alors avec un renversement
  // que le niveau n'enseigne pas encore. L'alternative, un ii° à l'état
  // fondamental, était musicalement fausse.
  for (let i = 0; i < accords.length; i++) {
    if (accords[i].renversement === 0 && qualite(mode, accords[i].degre) === 'dim') {
      accords[i] = creerAccord(i, { ...accords[i], renversement: 1 })
    }
  }

  // Niveau 7 : garantir un 6/4 dans l'item, sans quoi la discrimination
  // « cadentiel contre passage » n'a pas d'objet (annexe §5, correction 3).
  if (niveau === 7 && !accords.some((a) => a.renversement === 2)) {
    const possibles = accords
      .map((_, i) => i)
      .filter((i) =>
        substitutionValide(
          accords,
          i,
          creerAccord(i, { ...accords[i], renversement: 2 }),
          mode,
          niveau,
        ),
      )
    const cible = pick(possibles, rng)
    if (cible === undefined) return null
    accords[cible] = creerAccord(cible, { ...accords[cible], renversement: 2 })
  }

  return violations(accords, mode, niveau).length === 0 ? accords : null
}

// Emplacement variable des gabarits : un accord intérieur de préférence, pour ne
// toucher ni au I initial ni à la cadence finale.
function indiceDesigne(longueur: number, rng: Rng): number[] {
  return [longueur <= 2 ? pickInt(0, longueur - 1, rng) : pickInt(1, longueur - 2, rng)]
}
