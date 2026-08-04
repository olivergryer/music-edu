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

/**
 * Le rendu seul : un symbole à gauche, des étages à droite.
 *
 * Séparé du calcul parce que tout ce qui s'affiche ici n'est pas un accord à
 * degré — les accords chromatiques de `chromatiques.ts` portent un nom (`It`,
 * `♭II`) et un chiffrage qu'aucune fonction de `chiffrage.ts` ne saurait dériver.
 */
export function ChiffrageBrut({
  symbole,
  etages,
  aria,
  taille = 19,
  couleur = 'var(--text)',
  suffixe,
}: {
  symbole: string
  etages: readonly string[]
  /** Équivalent textuel — un chiffrage empilé lu à voix haute perd sa structure. */
  aria: string
  taille?: number
  couleur?: string
  /** Marque discrète après le chiffrage (le « ~ » des accords hors tonalité). */
  suffixe?: string
}) {
  const tailleEtage = Math.round(taille * 0.62)

  return (
    <span
      role="img"
      aria-label={aria}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        color: couleur,
        lineHeight: 1,
      }}
    >
      <span style={{ fontSize: taille, fontWeight: 600 }}>{symbole}</span>

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

      {suffixe && (
        <span aria-hidden="true" style={{ fontSize: tailleEtage, opacity: 0.8 }}>
          {suffixe}
        </span>
      )}
    </span>
  )
}

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
  return (
    <ChiffrageBrut
      symbole={romainChiffre(accord.degre, mode)}
      etages={chiffrageDe(accord).etages}
      aria={chiffrer(accord, mode)}
      taille={taille}
      couleur={couleur}
      // Accord à qualité inversée — hors tonalité, donc hors convention d'écriture.
      suffixe={accord.modeInverse ? '~' : undefined}
    />
  )
}
