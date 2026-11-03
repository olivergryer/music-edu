// Cercle des quintes : 12 paires (majeure + relative mineure) rangées par quinte
// ascendante à partir de Do M / La m. Chaque tonalité a au plus deux graphies
// enharmoniques (la préférée en premier), cf. bas du cercle.

export interface Paire {
  maj: string[]
  min: string[]
}

export const PAIRES: Paire[] = [
  { maj: ['Do M'], min: ['La m'] },
  { maj: ['Sol M'], min: ['Mi m'] },
  { maj: ['Ré M'], min: ['Si m'] },
  { maj: ['La M'], min: ['Fa# m'] },
  { maj: ['Mi M'], min: ['Do# m'] },
  { maj: ['Si M', 'Dob M'], min: ['Sol# m', 'Lab m'] },
  { maj: ['Fa# M', 'Solb M'], min: ['Ré# m', 'Mib m'] },
  { maj: ['Réb M', 'Do# M'], min: ['Sib m', 'La# m'] },
  { maj: ['Lab M'], min: ['Fa m'] },
  { maj: ['Mib M'], min: ['Do m'] },
  { maj: ['Sib M'], min: ['Sol m'] },
  { maj: ['Fa M'], min: ['Ré m'] },
]

/** Toutes les clés que le cercle sait représenter (pour ordonner / valider). */
export const CLES_CERCLE = PAIRES.flatMap(p => [...p.maj, ...p.min])

/** Index de la paire contenant la tonalité, ou -1. */
export function indexPaire(cle: string): number {
  return PAIRES.findIndex(p => p.maj.includes(cle) || p.min.includes(cle))
}

/** Clé de la paire pour un mode : la graphie disponible, sinon null. */
export function clePourMode(paire: Paire, majeur: boolean, disponibles: Set<string>): string | null {
  return (majeur ? paire.maj : paire.min).find(c => disponibles.has(c)) ?? null
}
