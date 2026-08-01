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

import { ORDRE_TIERCES } from './geometrie.ts'
import { romainChiffre } from './chiffrage.ts'
import { geometrieGlyphe, lireDrapeaux, pointCercle, type TeinteGlyphe } from './glyphe.ts'
import { type DrapeauxDetection } from './detection.ts'
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
const MARQUEUR_R = 15
const ANNEAU_R = 19

export function CercleTierces({
  ecrit,
  entendu,
  mode,
  drapeaux,
  taille = 200,
}: {
  ecrit: Accord
  entendu: Accord
  mode: Mode
  drapeaux: DrapeauxDetection
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

      {/* La corde : l'écart de degré, tracé avant les marqueurs pour passer dessous. */}
      {!confondus && (
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

      {confondus && (
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
        const p = pointCercle(degre, CENTRE, CENTRE, RAYON)
        const estEcrit = degre === ecrit.degre
        const estEntendu = degre === entendu.degre

        let remplissage = 'none'
        let contour = 'none'
        let couleurTexte = 'var(--text)'
        let opacite = 0.4

        if (estEntendu) {
          remplissage = couleur
          couleurTexte = SUR_TEINTE
          opacite = 1
        } else if (estEcrit) {
          contour = 'var(--text)'
          opacite = 1
        }

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
              fontSize={estEcrit || estEntendu ? 13 : 11}
              fontWeight={estEcrit || estEntendu ? 600 : 400}
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
  drapeaux: DrapeauxDetection
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
  drapeaux: DrapeauxDetection
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
