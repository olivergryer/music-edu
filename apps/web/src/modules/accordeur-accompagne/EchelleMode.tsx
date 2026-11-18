// ─── Échelle du mode (brief UI v1, § 5.2) ─────────────────────────────────────────────
// Sept sphères pour la tonalité du slot audible. Sons de l'accord : cercle pointillé. Son hors
// échelle : petite sphère chromatique entre ses deux voisines. Degré joué : remplissage de la
// couleur de l'écart, estompé en 1 s après la fin de la note, anneau de battements si le degré sonne.

import { echelleDuMode, nomClasse, type TonaliteEcrite } from './notation.ts'
import AnneauBattements, { type EtatAnneau } from './AnneauBattements.tsx'
import type { Mode } from '../harmonie/types.ts'

const ROMAINS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']
const X = (i: number) => 70 + i * 90
const Y = 46

export interface JeuSurEchelle {
  place: { degre: number } | { entre: number }
  couleur: string
  vivant: boolean               // note en cours ; sinon remplissage qui s'estompe
}

interface Props {
  ecrite: TonaliteEcrite
  mode: Mode
  /** Sons de l'accord courant, en demi-tons au-dessus de la tonique (sons réels, modulo 12). */
  sonsAccord: number[]
  jeux?: JeuSurEchelle[]
  /** Remplissage définitif par degré (bilan). */
  bilan?: { degre: number; couleur: string; n: number }[]
  anneau?: { degre: number; lire: () => EtatAnneau | null } | null
  nomTonalite?: string
}

export default function EchelleMode({ ecrite, mode, sonsAccord, jeux = [], bilan, anneau, nomTonalite }: Props) {
  const echelle = echelleDuMode(mode)
  const pcs = echelle.map(s => nomClasse(ecrite.tonique + s, ecrite))
  const degresAccord = new Set<number>()
  const chromatiques: number[] = []                // entre-deux (indice du degré inférieur)
  for (const s of sonsAccord) {
    const i = echelle.indexOf(((s % 12) + 12) % 12)
    if (i >= 0) degresAccord.add(i)
    else { let bas = 0; echelle.forEach((v, k) => { if (v < ((s % 12) + 12) % 12) bas = k }); chromatiques.push(bas) }
  }
  const xEntre = (bas: number) => (X(bas) + X(Math.min(6, bas + 1))) / 2
  const nomsEntre = (pcRel: number) => nomClasse(ecrite.tonique + pcRel, ecrite)

  return (
    <svg viewBox="0 0 680 118" width="100%" role="img" aria-label={`Échelle ${nomTonalite ?? ''}`} style={{ display: 'block' }}>
      {nomTonalite && <text x={340} y={10} textAnchor="middle" fontSize={12} fill="var(--text-muted)">{nomTonalite}</text>}
      {echelle.map((_, i) => {
        const jeu = jeux.find(j => 'degre' in j.place && j.place.degre === i)
        const b = bilan?.find(x => x.degre === i && x.n > 0)
        const remplissage = jeu ? jeu.couleur : b ? b.couleur : 'var(--bg)'
        const opacite = jeu ? (jeu.vivant ? 1 : 0) : b ? 0.9 : 1
        return (
          <g key={i}>
            {degresAccord.has(i) && <circle cx={X(i)} cy={Y} r={33} fill="none" stroke="var(--text-muted)" strokeWidth={1.5} strokeDasharray="5 4" />}
            <circle cx={X(i)} cy={Y} r={22} fill="var(--bg)" stroke="var(--border-strong, var(--border-c))" strokeWidth={1} />
            <circle cx={X(i)} cy={Y} r={22} fill={remplissage} fillOpacity={opacite} style={{ transition: jeu && !jeu.vivant ? 'fill-opacity 1s linear' : 'none' }} stroke="none" />
            {anneau && anneau.degre === i && <AnneauBattements cx={X(i)} cy={Y} r={27} lire={anneau.lire} etiquette={false} />}
            <text x={X(i)} y={Y + 5} textAnchor="middle" fontSize={13} fill="var(--text)">{pcs[i]}</text>
            <text x={X(i)} y={Y + 52} textAnchor="middle" fontSize={12} fill="var(--text-muted)">{ROMAINS[i]}</text>
            {b && b.n > 0 && (
              <g>
                <circle cx={X(i) + 18} cy={Y - 18} r={9} fill="var(--surface)" stroke="var(--border-strong, var(--border-c))" />
                <text x={X(i) + 18} y={Y - 14} textAnchor="middle" fontSize={11} fill="var(--text)">{b.n}</text>
              </g>
            )}
          </g>
        )
      })}
      {sonsAccord.filter(s => echelle.indexOf(((s % 12) + 12) % 12) < 0).map((s, k) => (
        <g key={`c${k}`}>
          <circle cx={xEntre(chromatiques[k])} cy={Y} r={12} fill="var(--bg)" stroke="var(--text-muted)" strokeWidth={1.5} strokeDasharray="3 3" />
          <text x={xEntre(chromatiques[k])} y={Y + 4} textAnchor="middle" fontSize={10} fill="var(--text)">{nomsEntre(((s % 12) + 12) % 12)}</text>
        </g>
      ))}
      {jeux.filter(j => 'entre' in j.place).map((j, k) => (
        <circle key={`j${k}`} cx={xEntre((j.place as { entre: number }).entre)} cy={Y} r={11} fill={j.couleur} fillOpacity={j.vivant ? 1 : 0}
          style={{ transition: j.vivant ? 'none' : 'fill-opacity 1s linear' }} stroke="var(--text-muted)" strokeDasharray="3 3" />
      ))}
    </svg>
  )
}
