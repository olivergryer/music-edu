// Dessin SVG inline d'une figure rythmique (notes et demi-soupirs).
// Couleur héritée (currentColor).

import { figureParId, type FigureId, type GlyphItem } from './figures.ts'

const H = 44
const Y_TETE = 34
const Y_HAMPE = 15

export default function FigureSvg({ id, hauteur = 44 }: { id: FigureId; hauteur?: number }) {
  const fig = figureParId(id)
  const { items, triolet } = fig.glyph
  const pas = items[0] === 'n16' ? 14 : 18
  const largeur = items.length * pas + 12
  const xs = items.map((_, i) => 12 + i * pas)
  const estNote = (g: GlyphItem) => g !== 'r8'
  const niveauxBarre = (g: GlyphItem) => (g === 'n16' ? 2 : g === 'n8' ? 1 : 0)

  const barres: React.ReactNode[] = []
  const drapeaux: React.ReactNode[] = []
  items.forEach((g, i) => {
    if (!estNote(g) || niveauxBarre(g) === 0) return
    const suivant = items[i + 1]
    const precedent = items[i - 1]
    const lieSuivant = suivant && estNote(suivant)
    const liePrecedent = precedent && estNote(precedent)
    if (lieSuivant) {
      for (let n = 0; n < niveauxBarre(g); n++) {
        barres.push(
          <line key={`b${i}-${n}`} x1={xs[i] + 4} y1={Y_HAMPE + n * 5} x2={xs[i + 1] + 4} y2={Y_HAMPE + n * 5}
            stroke="currentColor" strokeWidth={3} />,
        )
      }
    } else if (!liePrecedent) {
      drapeaux.push(
        <path key={`f${i}`} d={`M${xs[i] + 4} ${Y_HAMPE} q 8 6 4 14`} fill="none" stroke="currentColor" strokeWidth={2} />,
      )
    }
  })

  return (
    <svg width={largeur * hauteur / H} height={hauteur} viewBox={`0 0 ${largeur} ${H}`} role="img" aria-label={fig.label}
      style={{ color: 'inherit', flexShrink: 0 }}>
      {items.map((g, i) => estNote(g) ? (
        <g key={i}>
          <ellipse cx={xs[i]} cy={Y_TETE} rx={5} ry={3.6} transform={`rotate(-20 ${xs[i]} ${Y_TETE})`} fill="currentColor" />
          <line x1={xs[i] + 4.4} y1={Y_TETE - 1} x2={xs[i] + 4.4} y2={Y_HAMPE} stroke="currentColor" strokeWidth={1.8} />
        </g>
      ) : (
        <g key={i} fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx={xs[i] - 2} cy={Y_TETE - 12} r={2.2} fill="currentColor" stroke="none" />
          <path d={`M${xs[i] + 3} ${Y_TETE - 13} Q ${xs[i]} ${Y_TETE - 8} ${xs[i] - 3} ${Y_TETE + 2}`} />
        </g>
      ))}
      {barres}
      {drapeaux}
      {triolet && (
        <g fill="none" stroke="currentColor" strokeWidth={1}>
          <path d={`M${xs[0]} 13 V10 H${xs[xs.length - 1] + 4} V13`} />
          <text x={(xs[0] + xs[xs.length - 1] + 4) / 2} y={8} fontSize={9} textAnchor="middle" fill="currentColor"
            stroke="none" style={{ fontWeight: 700 }}>3</text>
        </g>
      )}
    </svg>
  )
}
