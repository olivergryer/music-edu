// ─── Figures rythmiques du métronome (carnet de gammes) ───────────────────────
//
// Une figure = le découpage d'UN temps. `onsets` : positions des attaques dans le
// temps (0 = l'appui, 1 = temps suivant). L'appui et les subdivisions sont joués
// avec deux sonorités différentes. Si 0 n'est pas dans `onsets` (demi-soupir
// sur le temps), l'appui est silencieux : il reste signalé visuellement.
//
// `glyph` décrit le dessin (voir FigureSvg) : n4/n8/n16 = notes, r8 = demi-soupir.

export type GlyphItem = 'n4' | 'n8' | 'n16' | 'r8'

export interface FigureDef {
  id: FigureId
  label: string
  onsets: number[]
  glyph: { items: GlyphItem[]; triolet: boolean }
}

export const FIGURE_IDS = [
  'noire',
  'croches',
  'soupir-croche',
  'doubles',
  'triolet',
  'soupir-2croches',
  'croche-soupir-croche',
] as const

export type FigureId = typeof FIGURE_IDS[number]

const T = 1 / 3

export const FIGURES: FigureDef[] = [
  { id: 'noire', label: 'Noire', onsets: [0], glyph: { items: ['n4'], triolet: false } },
  { id: 'croches', label: 'Deux croches', onsets: [0, 0.5], glyph: { items: ['n8', 'n8'], triolet: false } },
  { id: 'soupir-croche', label: 'Demi-soupir, croche', onsets: [0.5], glyph: { items: ['r8', 'n8'], triolet: false } },
  { id: 'doubles', label: 'Quatre doubles croches', onsets: [0, 0.25, 0.5, 0.75], glyph: { items: ['n16', 'n16', 'n16', 'n16'], triolet: false } },
  { id: 'triolet', label: 'Trois croches (triolet)', onsets: [0, T, 2 * T], glyph: { items: ['n8', 'n8', 'n8'], triolet: true } },
  { id: 'soupir-2croches', label: 'Demi-soupir, deux croches (triolet)', onsets: [T, 2 * T], glyph: { items: ['r8', 'n8', 'n8'], triolet: true } },
  { id: 'croche-soupir-croche', label: 'Croche, demi-soupir, croche (triolet)', onsets: [0, 2 * T], glyph: { items: ['n8', 'r8', 'n8'], triolet: true } },
]

export function figureParId(id: string | undefined): FigureDef {
  return FIGURES.find(f => f.id === id) ?? FIGURES[0]
}
