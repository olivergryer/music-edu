// ─── Portée live : placement en mesures, liaisons, découpages (brief UI v1, § 5.3, 4.4) ──
// Logique pure : les instants sont en temps musicaux (noires depuis le temps 0 de la phrase).

import { indicesEntrees, nbSlots, tempsParMesure, type Phrase } from './phrase.ts'

/** Un fragment d'une note, après découpage aux barres et aux changements d'accord. */
export interface Morceau<T> {
  note: T
  debut: number
  fin: number
  lieeAvant: boolean
  lieeApres: boolean
  mesure: number        // index 0-based de la mesure où se trouve la tête
}

const EPS = 1e-6

/** Instants de coupure d'une phrase : barres de mesure (fin comprise) et débuts d'entrées explicites. */
export function coupuresDePhrase(p: Phrase): number[] {
  const pm = tempsParMesure(p.mesure)
  const total = nbSlots(p)
  const s = new Set<number>()
  for (let t = pm; t <= total; t += pm) s.add(t)
  for (const i of indicesEntrees(p)) if (i > 0) s.add(i)
  return [...s].sort((a, b) => a - b)
}

export function mesureDe(p: Phrase, t: number): number {
  return Math.floor((t + EPS) / tempsParMesure(p.mesure))
}

/**
 * Découpe une note à chaque coupure qui tombe strictement à l'intérieur. Une note
 * qui passe la barre devient deux têtes liées ; une note tenue à travers un changement
 * d'accord aussi, même à l'intérieur d'une mesure. `coupures` doit être trié ; les
 * coupures répétées chaque tour de boucle se déduisent par `coupuresDeTour`.
 */
export function decouperNote<T extends { tOn: number; tOff: number }>(note: T, coupures: readonly number[], pm: number): Morceau<T>[] {
  const pts = [note.tOn, ...coupures.filter((c) => c > note.tOn + EPS && c < note.tOff - EPS), note.tOff]
  return pts.slice(0, -1).map((debut, i) => ({
    note, debut, fin: pts[i + 1],
    lieeAvant: i > 0, lieeApres: i < pts.length - 2,
    mesure: Math.floor((debut + EPS) / pm),
  }))
}

/** Coupures valables sur plusieurs tours de boucle (la phrase se répète tous les `nbSlots`). */
export function coupuresDeTour(p: Phrase, jusqua: number): number[] {
  const tour = nbSlots(p)
  const base = coupuresDePhrase(p)
  const out: number[] = []
  for (let k = 0; k * tour <= jusqua + EPS; k++) {
    for (const c of base) out.push(c + k * tour)
    if (k > 0) out.push(k * tour)
  }
  return [...new Set(out)].sort((a, b) => a - b)
}

/** Paires d'index de morceaux à relier par un arc (même note, morceaux consécutifs). */
export function liaisons<T>(morceaux: readonly Morceau<T>[]): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < morceaux.length - 1; i++) {
    if (morceaux[i].lieeApres && morceaux[i + 1].note === morceaux[i].note && morceaux[i + 1].lieeAvant) out.push([i, i + 1])
  }
  return out
}

/** Abscisse d'un instant : chaque slot occupe `largeurTemps` pixels depuis `x0`. */
export function xDeTemps(t: number, x0: number, largeurTemps: number): number {
  return x0 + t * largeurTemps
}

/** Largeur en pixels d'une mesure (somme de ses slots). */
export function largeurMesure(p: Phrase, largeurTemps: number): number {
  return tempsParMesure(p.mesure) * largeurTemps
}

/** Ramène un instant au tour de boucle courant. */
export function tempsDansTour(p: Phrase, t: number): { tour: number; t: number } {
  const n = nbSlots(p)
  const tour = Math.floor((t + EPS) / n)
  return { tour, t: t - tour * n }
}
