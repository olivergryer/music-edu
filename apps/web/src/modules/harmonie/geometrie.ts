// ─── Géométrie : le cercle des tierces (spec §2) ─────────────────────────────
//
// Le cercle encode la proximité ACOUSTIQUE. La matrice de transition (§3) encode
// la syntaxe ENSEIGNÉE. Les deux sont décorrélées — IV→V est à distance angulaire
// maximale et à fréquence syntaxique maximale — et c'est leur croisement qui est
// diagnostique. Ne jamais dériver l'une de l'autre.

import { DEGRES, type Degre, type Fonction, type Mode } from './types.ts'

export const ORDRE_TIERCES: readonly Degre[] = [1, 3, 5, 7, 2, 4, 6]

const POSITIONS: Readonly<Record<Degre, number>> = {
  1: 0,
  3: 1,
  5: 2,
  7: 3,
  2: 4,
  4: 5,
  6: 6,
}

export function positionAngulaire(degre: Degre): number {
  const p = POSITIONS[degre]
  if (p === undefined) throw new Error(`positionAngulaire : degré invalide (${degre})`)
  return p
}

// Distance non signée, 0–3.
export function distanceAngulaire(a: Degre, b: Degre): number {
  const d = Math.abs(positionAngulaire(a) - positionAngulaire(b))
  return Math.min(d, ORDRE_TIERCES.length - d)
}

// Déplacement le plus court, positif dans le sens des tierces MONTANTES
// (I → III → V → VII → II → IV → VI → I). L'égalité est impossible sur 7
// positions (|d| max = 3) ; le garde est défensif, cf. spec §2.
export function distanceAngulaireSignee(a: Degre, b: Degre): number {
  const n = ORDRE_TIERCES.length
  const brut = (positionAngulaire(b) - positionAngulaire(a) + n) % n
  const signee = brut <= Math.floor(n / 2) ? brut : brut - n
  if (Math.abs(signee) === n / 2) {
    throw new Error(`distanceAngulaireSignee : déplacement ambigu entre ${a} et ${b}`)
  }
  return signee
}

// ─── Notes communes ──────────────────────────────────────────────────────────
//
// Tables 7×7 par mode, PAS une formule (spec §2) : en majeur la formule
// distance→communes (0→3, 1→2, 2→1, 3→0) est exacte, mais elle n'est qu'un cas
// particulier. En mineur, DEUX arêtes dévient — et non une seule comme l'annonce
// la spec §2 :
//
//   III–V   `do mi sol` / `mi sol♯ si`  → 1 note commune (mi)      au lieu de 2
//   III–VII `do mi sol` / `sol♯ si ré`  → 0 note commune           au lieu de 1
//
// Cause unique : III est le seul accord bâti sur le VII° degré NATUREL, quand V
// et vii° portent la sensible haussée. Toute paire III–(accord à sensible) dévie,
// et il y en a exactement deux. Les tables ci-dessous sont vérifiées entrée par
// entrée contre les hauteurs réellement construites (`harmonieGeometrie.test.ts`).

type TableNotesCommunes = Readonly<Record<Degre, Readonly<Record<Degre, number>>>>

export const NOTES_COMMUNES_MAJEUR: TableNotesCommunes = {
  1: { 1: 3, 2: 0, 3: 2, 4: 1, 5: 1, 6: 2, 7: 0 },
  2: { 1: 0, 2: 3, 3: 0, 4: 2, 5: 1, 6: 1, 7: 2 },
  3: { 1: 2, 2: 0, 3: 3, 4: 0, 5: 2, 6: 1, 7: 1 },
  4: { 1: 1, 2: 2, 3: 0, 4: 3, 5: 0, 6: 2, 7: 1 },
  5: { 1: 1, 2: 1, 3: 2, 4: 0, 5: 3, 6: 0, 7: 2 },
  6: { 1: 2, 2: 1, 3: 1, 4: 2, 5: 0, 6: 3, 7: 0 },
  7: { 1: 0, 2: 2, 3: 1, 4: 1, 5: 2, 6: 0, 7: 3 },
}

export const NOTES_COMMUNES_MINEUR: TableNotesCommunes = {
  1: { 1: 3, 2: 0, 3: 2, 4: 1, 5: 1, 6: 2, 7: 0 },
  2: { 1: 0, 2: 3, 3: 0, 4: 2, 5: 1, 6: 1, 7: 2 },
  3: { 1: 2, 2: 0, 3: 3, 4: 0, 5: 1, 6: 1, 7: 0 }, // ← III–V : 1 · III–VII : 0
  4: { 1: 1, 2: 2, 3: 0, 4: 3, 5: 0, 6: 2, 7: 1 },
  5: { 1: 1, 2: 1, 3: 1, 4: 0, 5: 3, 6: 0, 7: 2 }, // ← V–III : 1
  6: { 1: 2, 2: 1, 3: 1, 4: 2, 5: 0, 6: 3, 7: 0 },
  7: { 1: 0, 2: 2, 3: 0, 4: 1, 5: 2, 6: 0, 7: 3 }, // ← VII–III : 0
}

export function notesCommunes(mode: Mode, a: Degre, b: Degre): 0 | 1 | 2 | 3 {
  const table = mode === 'majeur' ? NOTES_COMMUNES_MAJEUR : NOTES_COMMUNES_MINEUR
  const n = table[a]?.[b]
  if (n === undefined) throw new Error(`notesCommunes : paire invalide (${a}, ${b})`)
  return n as 0 | 1 | 2 | 3
}

// ─── Arcs fonctionnels ───────────────────────────────────────────────────────
//
// Trois arcs contigus de 3 positions sur le cercle, deux pivots (III et VI).
// Validés par le collègue référent.
export const ARCS: Record<Fonction, readonly Degre[]> = {
  T: [6, 1, 3],
  D: [3, 5, 7],
  S: [2, 4, 6],
}

// Ordre de parcours fixe → sortie déterministe : III donne ['T','D'], VI ['T','S'].
const ORDRE_FONCTIONS: readonly Fonction[] = ['T', 'D', 'S']

export function fonctions(degre: Degre): Fonction[] {
  if (!DEGRES.includes(degre)) throw new Error(`fonctions : degré invalide (${degre})`)
  return ORDRE_FONCTIONS.filter((f) => ARCS[f].includes(degre))
}

export function estPivot(degre: Degre): boolean {
  return fonctions(degre).length === 2
}

// Faux si les deux degrés partagent au moins une fonction.
export function franchitArc(a: Degre, b: Degre): boolean {
  const fa = fonctions(a)
  return !fonctions(b).some((f) => fa.includes(f))
}

// La couture VII–II : voisins immédiats sur le cercle (2 notes communes) mais
// arcs disjoints (D contre S). C'est la confusion la plus diagnostique du module
// (spec §2 et §5) — elle doit être identifiable comme telle, pas noyée dans
// « distance 1 ». C'est l'UNIQUE paire adjacente qui franchit un arc : les six
// autres arêtes du cercle restent à l'intérieur d'un arc.
export function estCouture(a: Degre, b: Degre): boolean {
  return (a === 7 && b === 2) || (a === 2 && b === 7)
}

// Même fonction, aucune note commune — le « quadrant vide » de la spec §5.
//
// Le raisonnement de la §5 (arc partagé ⟹ distance ≤ 2 ⟹ au moins une note
// commune) s'appuie sur la FORMULE distance→communes. Il est exact en majeur, où
// ce prédicat est toujours faux. Il tombe en mineur sur une paire et une seule :
//
//   III–VII  `do mi sol` / `sol♯ si ré`  — arc D partagé, ZÉRO note commune
//
// C'est la conséquence directe du III naturel, la même cause que les déviations
// de la table ci-dessus. Autrement dit : « la proximité fonctionnelle implique la
// proximité acoustique » vaut en majeur, pas en mineur harmonique.
//
// Volontairement NON câblé dans `diagnostiquer` : la §5 classe cette paire
// `degre_voisin` (|angulaire| = 2, arc partagé) et on s'y tient. Le prédicat
// existe pour que le cas reste repérable dans le log, et pour rendre le
// basculement trivial si le collègue référent tranche autrement.
export function estFonctionSansSonorite(mode: Mode, a: Degre, b: Degre): boolean {
  return !franchitArc(a, b) && notesCommunes(mode, a, b) === 0
}
