// ─── Harmonie — les deux rendus du glyphe de correction A/B ──────────────────
//
// Même donnée, deux rendus, selon ce que l'écran demande (décidé avec Matthieu) :
//
//   <CercleTierces>   feedback de l'item — le modèle rendu visible, là où l'élève
//                     prend le temps de comprendre SA faute.
//   <GlypheColonne>   bilan — abstrait mais sériable : dix items en une ligne, et
//                     l'élève voit que ses fautes penchent toutes du même côté.
//
// Toute la géométrie vient de `glyphe.ts` ; ici il n'y a que du tracé.

import { ORDRE_TIERCES, franchitArc } from './geometrie.ts'
import { romainChiffre } from './chiffrage.ts'
import {
  RETRAIT_TRAINE,
  arcEntreDegres,
  geometrieGlyphe,
  intensiteTrace,
  lireDrapeaux,
  pointCercle,
  type EcartGlyphe,
  type TeinteGlyphe,
} from './glyphe.ts'
import { type Accord, type Degre, type Mode, type Renversement } from './types.ts'

const TEINTES: Record<TeinteGlyphe, string> = {
  interne: '#c084fc', // arc partagé — la sonorité change, pas la fonction
  arc: '#f87171', // arc franchi — la fonction a changé, c'est la faute grave
  'hors-tonalite': '#fbbf24', // les quatre canaux ne s'appliquent pas
}

const SUR_TEINTE = '#0d1026' // texte posé sur un aplat de teinte

// ─── Le cercle des tierces ───────────────────────────────────────────────────

const CENTRE = 100
const RAYON = 66
const RAYON_TRAINE = RAYON - RETRAIT_TRAINE
const MARQUEUR_R = 15
const ANNEAU_R = 19
const POINT_TRAINE_R = 5

/**
 * Trois états, et un seul cercle pour les trois :
 *
 *   `statique` — après la réponse, avant toute réécoute : l'écart du seul accord
 *                fautif, plus la trajectoire de A en fantôme.
 *   `lecture`  — une version se joue : sa traîne avance, accord par accord.
 *   `figee`    — la lecture est finie : tout le parcours reste affiché.
 */
export type EtatTrace =
  | { phase: 'statique' }
  | { phase: 'lecture'; index: number }
  | { phase: 'figee' }

export type VersionJouee = 'ecrit' | 'entendu'

export function CercleTierces({
  ecrit,
  entendu,
  degresEcrits,
  degresEntendus,
  mode,
  drapeaux,
  trace = { phase: 'statique' },
  version = 'entendu',
  taille = 200,
}: {
  ecrit: Accord
  entendu: Accord
  /** Trajectoire complète de A — ce qui est écrit. */
  degresEcrits: readonly Degre[]
  /** Trajectoire complète de B — ce qui a sonné. */
  degresEntendus: readonly Degre[]
  mode: Mode
  drapeaux: EcartGlyphe
  trace?: EtatTrace
  version?: VersionJouee
  taille?: number
}) {
  const { teinte, pointille } = geometrieGlyphe(drapeaux)
  const couleur = TEINTES[teinte]

  // Les deux marqueurs se superposent dès que le degré n'a pas bougé — toujours
  // sur une perturbation `mode`, mais aussi sur `renversement` et `cardinalite`.
  // Sans traitement propre, le cercle afficherait un rond unique qui ne montre
  // rien. On l'entoure alors d'un anneau : « même degré, autre chose a bougé ».
  const confondus = ecrit.degre === entendu.degre
  const pEcrit = pointCercle(ecrit.degre, CENTRE, CENTRE, RAYON)
  const pEntendu = pointCercle(entendu.degre, CENTRE, CENTRE, RAYON)

  const animes = version === 'ecrit' ? degresEcrits : degresEntendus
  // Le fantôme est TOUJOURS l'autre version : c'est la superposition des deux qui
  // fait voir la divergence à l'instant où elle sonne.
  const fantome = version === 'ecrit' ? degresEntendus : degresEcrits
  const enTrace = trace.phase !== 'statique'
  const jusqua = trace.phase === 'lecture' ? trace.index : animes.length - 1
  const degreCourant = trace.phase === 'lecture' ? animes[trace.index] : undefined

  return (
    <svg
      viewBox="0 0 200 200"
      width={taille}
      height={taille}
      role="img"
      aria-label={`Écart entre l’accord écrit et l’accord entendu : ${lireDrapeaux(drapeaux)}`}
      style={{ display: 'block', margin: '0 auto', maxWidth: '100%' }}
    >
      <circle
        cx={CENTRE}
        cy={CENTRE}
        r={RAYON}
        fill="none"
        stroke="var(--border-c)"
        strokeWidth={1}
      />

      {/* Le fantôme : la trajectoire de l'autre version, en permanence. */}
      <Trainee degres={fantome} jusqua={fantome.length - 1} fantome />

      {/* La traîne animée, ou le parcours figé une fois la lecture finie. */}
      {enTrace && <Trainee degres={animes} jusqua={jusqua} fantome={false} figee={trace.phase === 'figee'} />}

      {/* L'écart du seul accord fautif — la vue d'avant réécoute, conservée. */}
      {!enTrace && !confondus && (
        <line
          x1={pEcrit.x}
          y1={pEcrit.y}
          x2={pEntendu.x}
          y2={pEntendu.y}
          stroke={couleur}
          strokeWidth={2}
          strokeDasharray={pointille ? '4 3' : undefined}
        />
      )}
      {!enTrace && confondus && (
        <circle
          cx={pEcrit.x}
          cy={pEcrit.y}
          r={ANNEAU_R}
          fill="none"
          stroke={couleur}
          strokeWidth={2}
          strokeDasharray={pointille ? '4 3' : undefined}
        />
      )}

      {ORDRE_TIERCES.map((degre: Degre) => {
        const estCourant = degre === degreCourant
        const estEcrit = !enTrace && degre === ecrit.degre
        const estEntendu = !enTrace && degre === entendu.degre

        let remplissage = 'none'
        let contour = 'none'
        let couleurTexte = 'var(--text)'
        let opacite = 0.4

        if (estEntendu || estCourant) {
          remplissage = couleur
          couleurTexte = SUR_TEINTE
          opacite = 1
        } else if (estEcrit) {
          contour = 'var(--text)'
          opacite = 1
        }

        const p = pointCercle(degre, CENTRE, CENTRE, RAYON)
        const enAvant = estEcrit || estEntendu || estCourant

        return (
          <g key={degre} opacity={opacite}>
            <circle
              cx={p.x}
              cy={p.y}
              r={MARQUEUR_R}
              fill={remplissage}
              stroke={contour}
              strokeWidth={2}
            />
            <text
              x={p.x}
              y={p.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={enAvant ? 13 : 11}
              fontWeight={enAvant ? 600 : 400}
              fill={couleurTexte}
            >
              {romainChiffre(degre, mode)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/**
 * Le parcours sur la piste intérieure : un point par accord visité, un arc par
 * déplacement. L'ancienneté commande l'opacité — `PERSISTANCE_ACCORDS` accords
 * restent visibles, le plus ancien s'effaçant.
 *
 * Chaque arc est teinté selon qu'il FRANCHIT UN ARC FONCTIONNEL ou non : la
 * traînée devient alors une lecture de la syntaxe, avec la même convention de
 * couleur que le glyphe statique.
 */
function Trainee({
  degres,
  jusqua,
  fantome,
  figee = false,
}: {
  degres: readonly Degre[]
  jusqua: number
  fantome: boolean
  figee?: boolean
}) {
  if (jusqua < 0) return null

  const elements: React.ReactNode[] = []

  for (let i = 0; i <= jusqua && i < degres.length; i++) {
    // Figé ou fantôme : tout le parcours à intensité constante. En lecture :
    // l'ancienneté décide.
    const intensite = figee || fantome ? 1 : intensiteTrace(jusqua - i)
    if (intensite === 0) continue

    const depuis = i > 0 ? degres[i - 1] : undefined
    const teinte: TeinteGlyphe =
      depuis !== undefined && franchitArc(depuis, degres[i]) ? 'arc' : 'interne'
    const couleur = fantome ? 'var(--text)' : TEINTES[teinte]
    const opacite = fantome ? 0.22 : intensite

    if (depuis !== undefined) {
      const chemin = arcEntreDegres(depuis, degres[i], CENTRE, CENTRE, RAYON_TRAINE)
      if (chemin) {
        elements.push(
          <path
            key={`a${i}`}
            d={chemin}
            fill="none"
            stroke={couleur}
            strokeWidth={fantome ? 1.5 : 3}
            strokeLinecap="round"
            strokeDasharray={fantome ? '3 4' : undefined}
            opacity={opacite}
          />,
        )
      }
    }

    const p = pointCercle(degres[i], CENTRE, CENTRE, RAYON_TRAINE)
    elements.push(
      <circle
        key={`p${i}`}
        cx={p.x}
        cy={p.y}
        r={fantome ? 3 : POINT_TRAINE_R}
        fill={couleur}
        opacity={opacite}
      />,
    )
  }

  return <g>{elements}</g>
}

// ─── L'empilement — renversement et septième en une seule figure ─────────────
//
// L'accord en barres, fondamentale en bas, septième en haut : le NOMBRE de barres
// dit la cardinalité, la barre ACCENTUÉE dit quel son est à la basse, donc le
// renversement. Les deux canaux que le cercle ne porte pas tiennent ici.

const BARRE_H = 5
const BARRE_GAP = 4
const PILE_H = 38

function Empilement({
  renversement,
  septieme,
  accent,
  pointille,
}: {
  renversement: Renversement
  septieme: boolean
  accent: string
  pointille: boolean
}) {
  const notes = septieme ? 4 : 3
  return (
    <svg viewBox="0 0 26 40" width={26} height={40} aria-hidden="true">
      {Array.from({ length: notes }, (_, i) => {
        const estBasse = i === renversement
        return (
          <rect
            key={i}
            x={estBasse ? 1 : 4}
            y={PILE_H - (i + 1) * BARRE_H - i * BARRE_GAP}
            width={estBasse ? 24 : 18}
            height={BARRE_H}
            rx={2}
            fill={estBasse ? accent : 'var(--border-c)'}
            strokeDasharray={estBasse && pointille ? '3 2' : undefined}
          />
        )
      })}
    </svg>
  )
}

/** Les deux empilements côte à côte — rendu seulement si la basse ou la septième a bougé. */
export function EcartEmpilement({
  ecrit,
  entendu,
  drapeaux,
}: {
  ecrit: Accord
  entendu: Accord
  drapeaux: EcartGlyphe
}) {
  const { teinte, pointille } = geometrieGlyphe(drapeaux)
  if (ecrit.renversement === entendu.renversement && ecrit.septieme === entendu.septieme) return null

  return (
    <div className="flex items-end justify-center" style={{ gap: 10 }}>
      <Legendee texte="écrit">
        <Empilement
          renversement={ecrit.renversement}
          septieme={ecrit.septieme}
          accent="var(--text)"
          pointille={false}
        />
      </Legendee>
      <span className="text-app-muted" style={{ fontSize: 15, paddingBottom: 16 }}>
        →
      </span>
      <Legendee texte="entendu">
        <Empilement
          renversement={entendu.renversement}
          septieme={entendu.septieme}
          accent={TEINTES[teinte]}
          pointille={pointille}
        />
      </Legendee>
    </div>
  )
}

function Legendee({ texte, children }: { texte: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center" style={{ gap: 2 }}>
      {children}
      <span className="text-app-muted" style={{ fontSize: 10 }}>
        {texte}
      </span>
    </div>
  )
}

// ─── La colonne — les quatre canaux en un seul signe ─────────────────────────

const COL_L = 44
const COL_H = 56
const COL_CX = COL_L / 2
const COL_BASE = 50
const COL_AMPLITUDE = 40 // hauteur en px pour `hauteur` = 1
const COL_DEMI_LARGEUR = 4
const RENFLEMENT_MAX_PX = 7

export function GlypheColonne({
  drapeaux,
  taille = COL_L,
}: {
  drapeaux: EcartGlyphe
  taille?: number
}) {
  const g = geometrieGlyphe(drapeaux)
  const couleur = TEINTES[g.teinte]

  const h = g.hauteur * COL_AMPLITUDE
  const sommet = COL_BASE - h
  const milieu = COL_BASE - h / 2
  const b = g.renflement * RENFLEMENT_MAX_PX
  const gauche = COL_CX - COL_DEMI_LARGEUR
  const droite = COL_CX + COL_DEMI_LARGEUR

  // Montants gauche et droit bombés (ou pincés) symétriquement à mi-hauteur.
  const chemin = [
    `M ${gauche} ${COL_BASE}`,
    `Q ${gauche - b} ${milieu} ${gauche} ${sommet}`,
    `L ${droite} ${sommet}`,
    `Q ${droite + b} ${milieu} ${droite} ${COL_BASE}`,
    'Z',
  ].join(' ')

  return (
    <svg
      viewBox={`0 0 ${COL_L} ${COL_H}`}
      width={taille}
      height={(taille * COL_H) / COL_L}
      role="img"
      aria-label={lireDrapeaux(drapeaux)}
    >
      {/* Le sol ne tourne pas : c'est lui qui rend l'inclinaison lisible. */}
      <line
        x1={8}
        y1={COL_BASE}
        x2={COL_L - 8}
        y2={COL_BASE}
        stroke="var(--border-c)"
        strokeWidth={1.5}
      />
      <path
        d={chemin}
        transform={`rotate(${g.rotationDeg} ${COL_CX} ${COL_BASE})`}
        fill={couleur}
        fillOpacity={0.22}
        stroke={couleur}
        strokeWidth={1.5}
        strokeDasharray={g.pointille ? '3 2' : undefined}
        strokeLinejoin="round"
      />
    </svg>
  )
}

// ─── Légende du bilan ────────────────────────────────────────────────────────
//
// La colonne est abstraite : sans légende elle est décorative. La dernière ligne
// lève la seule ambiguïté du bloc — deux rouges qui ne disent pas la même chose.

export function LegendeColonne() {
  const lignes: [string, string][] = [
    ['penchée', 'un autre degré a sonné'],
    ['renflée', 'une autre basse'],
    ['plus haute', 'une septième en plus'],
    ['rouge', 'la fonction a changé'],
    ['ambre pointillé', 'hors tonalité'],
  ]

  return (
    <div className="text-app-muted" style={{ fontSize: 11, lineHeight: 1.6 }}>
      {lignes.map(([forme, sens]) => (
        <div key={forme}>
          <span style={{ color: 'var(--text)' }}>{forme}</span> — {sens}
        </div>
      ))}
      <div style={{ marginTop: 6 }}>
        La couleur du signe dit la nature de l’altération ; la marque en dessous dit ta réponse.
      </div>
    </div>
  )
}
