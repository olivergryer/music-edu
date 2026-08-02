// ─── Rendu empilé du chiffrage français ──────────────────────────────────────
//
// Les chiffres se superposent — 6 sur 4, 7 sur +, 6 sur 5̸ — et non côte à côte.
// Un seul étage se rend inline, sans changer la hauteur de ligne.
//
// L'équivalent textuel vient de `chiffrer()` : un chiffrage empilé lu par une
// synthèse vocale donnerait « six quatre » sans structure, d'où l'`aria-label`
// explicite et les étages masqués aux lecteurs d'écran.

import { chiffrageDe, chiffrer, romainChiffre } from './chiffrage.ts'
import { type Accord, type Mode } from './types.ts'

export default function ChiffrageEmpile({
  accord,
  mode,
  taille = 19,
  couleur = 'var(--text)',
}: {
  accord: Accord
  mode: Mode
  /** Taille du chiffre romain ; les étages suivent à 0,62×. */
  taille?: number
  couleur?: string
}) {
  const { etages } = chiffrageDe(accord)
  const tailleEtage = Math.round(taille * 0.62)

  return (
    <span
      role="img"
      aria-label={chiffrer(accord, mode)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        color: couleur,
        lineHeight: 1,
      }}
    >
      <span style={{ fontSize: taille, fontWeight: 600 }}>
        {romainChiffre(accord.degre, mode)}
      </span>

      <span
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: tailleEtage,
          fontWeight: 500,
          lineHeight: 1.05,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {etages.map((etage, i) => (
          <span key={i}>{etage}</span>
        ))}
      </span>

      {/* Accord à qualité inversée — hors tonalité, donc hors convention d'écriture. */}
      {accord.modeInverse && (
        <span aria-hidden="true" style={{ fontSize: tailleEtage, opacity: 0.8 }}>
          ~
        </span>
      )}
    </span>
  )
}
