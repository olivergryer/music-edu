// Cercle des quintes : double disque creux. Anneau extérieur = majeures (Do M en
// haut), anneau intérieur = mineures relatives (La m en haut). Le centre affiche
// la tonalité choisie. Les secteurs sans donnée pour le niveau courant sont grisés.

import { affichageTonalite } from './gammesData.ts'

interface Secteur { cles: string[] }  // alternatives enharmoniques, la 1re est la préférée

const MAJEURES: Secteur[] = [
  { cles: ['Do M'] }, { cles: ['Sol M'] }, { cles: ['Ré M'] }, { cles: ['La M'] },
  { cles: ['Mi M'] }, { cles: ['Si M', 'Dob M'] }, { cles: ['Fa# M', 'Solb M'] },
  { cles: ['Réb M', 'Do# M'] }, { cles: ['Lab M'] }, { cles: ['Mib M'] },
  { cles: ['Sib M'] }, { cles: ['Fa M'] },
]
const MINEURES: Secteur[] = [
  { cles: ['La m'] }, { cles: ['Mi m'] }, { cles: ['Si m'] }, { cles: ['Fa# m'] },
  { cles: ['Do# m'] }, { cles: ['Sol# m', 'Lab m'] }, { cles: ['Ré# m', 'Mib m'] },
  { cles: ['Sib m', 'La# m'] }, { cles: ['Fa m'] }, { cles: ['Do m'] },
  { cles: ['Sol m'] }, { cles: ['Ré m'] },
]

/** Toutes les clés que le cercle sait représenter (pour ordonner / valider). */
export const CLES_CERCLE = [...MAJEURES, ...MINEURES].flatMap(s => s.cles)

const C = 150

function polaire(r: number, deg: number): [number, number] {
  const a = (deg - 90) * Math.PI / 180
  return [C + r * Math.cos(a), C + r * Math.sin(a)]
}

function chemin(rIn: number, rOut: number, a0: number, a1: number): string {
  const [x0, y0] = polaire(rOut, a0)
  const [x1, y1] = polaire(rOut, a1)
  const [x2, y2] = polaire(rIn, a1)
  const [x3, y3] = polaire(rIn, a0)
  return `M${x0} ${y0} A${rOut} ${rOut} 0 0 1 ${x1} ${y1} L${x2} ${y2} A${rIn} ${rIn} 0 0 0 ${x3} ${y3} Z`
}

interface Props {
  tonalite: string
  disponibles: Set<string>
  onSelect: (cle: string) => void
}

export default function CercleQuintes({ tonalite, disponibles, onSelect }: Props) {
  const anneau = (secteurs: Secteur[], rIn: number, rOut: number, taillePolice: number) =>
    secteurs.map((s, i) => {
      const dispo = s.cles.find(c => disponibles.has(c))
      const cle = dispo ?? s.cles[0]
      const choisi = s.cles.includes(tonalite)
      const a0 = i * 30 - 14
      const a1 = i * 30 + 14
      const [tx, ty] = polaire((rIn + rOut) / 2, i * 30)
      const nom = affichageTonalite(choisi ? tonalite : cle).replace(/ [Mm]$/, '')
      return (
        <g key={cle}
          role="button"
          tabIndex={dispo ? 0 : -1}
          aria-label={affichageTonalite(cle)}
          aria-pressed={choisi}
          aria-disabled={!dispo}
          onClick={() => dispo && onSelect(dispo)}
          onKeyDown={e => { if (dispo && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect(dispo) } }}
          style={{ cursor: dispo ? 'pointer' : 'default', outline: 'none' }}>
          <path d={chemin(rIn, rOut, a0, a1)}
            fill={choisi ? '#7c3aed' : 'var(--surface-2)'}
            stroke={choisi ? '#c084fc' : 'var(--border-c)'} strokeWidth={choisi ? 2 : 1}
            opacity={dispo ? 1 : 0.35} />
          <text x={tx} y={ty} textAnchor="middle" dominantBaseline="central"
            fontSize={taillePolice} fontWeight={600}
            fill={choisi ? '#fff' : 'var(--text)'} opacity={dispo ? 1 : 0.4}
            style={{ pointerEvents: 'none', fontFamily: 'inherit' }}>
            {nom}
          </text>
        </g>
      )
    })

  return (
    <svg viewBox="0 0 300 300" style={{ width: '100%', maxWidth: 340, display: 'block', margin: '0 auto' }}
      role="group" aria-label="Cercle des quintes">
      {anneau(MAJEURES, 100, 148, 15)}
      {anneau(MINEURES, 52, 98, 13)}
      <circle cx={C} cy={C} r={48} fill="var(--surface)" stroke="var(--border-c)" strokeWidth={1} />
      <text x={C} y={C - 6} textAnchor="middle" dominantBaseline="central" fontSize={20} fontWeight={700}
        fill="var(--text)" style={{ fontFamily: "'Righteous', 'Inter', sans-serif" }}>
        {tonalite ? affichageTonalite(tonalite).replace(/ [Mm]$/, '') : '—'}
      </text>
      <text x={C} y={C + 16} textAnchor="middle" dominantBaseline="central" fontSize={12} fill="var(--text-muted)">
        {tonalite ? (tonalite.endsWith(' M') ? 'majeur' : 'mineur') : ''}
      </text>
    </svg>
  )
}
