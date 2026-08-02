// ─── Roue figée — saisie à 7 secteurs + glissement vertical ──────────────────
//
// À NE PAS CONFONDRE avec `modules/notes/RadialWheel.tsx`, qui est un menu radial
// *relatif* (on pose le doigt n'importe où, la roue naît sous le contact). Celle-ci
// est FIGÉE : affichée en permanence, on appuie SUR un secteur, et le glissement
// vertical choisit la qualité. Toute la logique est dans `roue.ts`, testée ;
// ici il n'y a que du tracé et de la gestion de pointeur.
//
// ⚠ TAILLE EN PIXELS RÉELS, pas de mise à l'échelle : les seuils (`RAYON_MORT_PX`,
// `SEUIL_QUALITE_PX`) sont en pixels client. Si le SVG était redimensionné, les
// frontières visibles des secteurs ne coïncideraient plus avec le calcul. 280 px
// tient sur le plus étroit des mobiles visés (375 − 32 de marges).

import { useRef, useState } from 'react'

import {
  DEGRES_SECTEUR,
  RAYON_MORT_PX,
  SECTEURS,
  angleCentreSecteur,
  qualiteAuDrag,
  secteurAuPoint,
  type SecteurRoue,
} from './roue.ts'

const ACCENT = '#c084fc'
const ACCENT_PROFOND = '#7c3aed'

const PEUT_VIBRER = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'

export default function RoueFigee({
  secteurs,
  onSelect,
  desactivee = false,
  indice = 'Touche un secteur',
  taille = 280,
}: {
  /** Exactement `SECTEURS` entrées, dans le sens horaire depuis le haut. */
  secteurs: readonly SecteurRoue[]
  onSelect: (choix: { cle: string; qualite: string }) => void
  desactivee?: boolean
  /** Texte au centre au repos. */
  indice?: string
  taille?: number
}) {
  const boiteRef = useRef<HTMLDivElement>(null)
  const appuiRef = useRef<{ x: number; y: number } | null>(null)
  const derniereQualiteRef = useRef<string | null>(null)

  const [actif, setActif] = useState<number | null>(null)
  const [qualite, setQualite] = useState<string | null>(null)

  const rayon = taille / 2
  const centre = { x: rayon, y: rayon }
  const secteurActif = actif === null ? null : secteurs[actif]

  const pointLocal = (e: React.PointerEvent) => {
    const r = boiteRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (desactivee) return
    const p = pointLocal(e)
    const index = secteurAuPoint(p.x - centre.x, p.y - centre.y)
    if (index === null || !secteurs[index]) return

    appuiRef.current = p
    setActif(index)
    const q = qualiteAuDrag(secteurs[index], 0)
    derniereQualiteRef.current = q
    setQualite(q)
    boiteRef.current?.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const appui = appuiRef.current
    if (appui === null || actif === null || !secteurs[actif]) return

    const p = pointLocal(e)
    const q = qualiteAuDrag(secteurs[actif], p.y - appui.y)
    if (q !== derniereQualiteRef.current) {
      if (PEUT_VIBRER && q !== null) navigator.vibrate(5)
      derniereQualiteRef.current = q
      setQualite(q)
    }
  }

  const finGeste = (valider: boolean) => {
    const q = derniereQualiteRef.current
    const s = actif === null ? null : secteurs[actif]
    appuiRef.current = null
    derniereQualiteRef.current = null
    setActif(null)
    setQualite(null)
    // `q === null` : secteur sans repos qu'on n'a pas glissé — rien à valider.
    if (valider && s && q !== null) onSelect({ cle: s.cle, qualite: q })
  }

  const demi = ((DEGRES_SECTEUR * Math.PI) / 180) / 2

  const quartier = (i: number): string => {
    const c = angleCentreSecteur(i)
    const x0 = centre.x + rayon * Math.cos(c - demi)
    const y0 = centre.y + rayon * Math.sin(c - demi)
    const x1 = centre.x + rayon * Math.cos(c + demi)
    const y1 = centre.y + rayon * Math.sin(c + demi)
    return `M ${centre.x} ${centre.y} L ${x0.toFixed(1)} ${y0.toFixed(1)} A ${rayon} ${rayon} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)} Z`
  }

  return (
    <div
      ref={boiteRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => finGeste(true)}
      onPointerCancel={() => finGeste(false)}
      style={{
        position: 'relative',
        width: taille,
        height: taille,
        margin: '0 auto',
        touchAction: 'none',
        userSelect: 'none',
        cursor: desactivee ? 'default' : 'pointer',
        opacity: desactivee ? 0.45 : 1,
      }}
    >
      <svg width={taille} height={taille} style={{ display: 'block' }}>
        <circle
          cx={centre.x}
          cy={centre.y}
          r={rayon - 1}
          fill="rgba(124,58,237,0.08)"
          stroke="var(--border-c)"
          strokeWidth={1}
        />

        {Array.from({ length: SECTEURS }, (_, i) => (
          <path
            key={secteurs[i]?.cle ?? i}
            d={quartier(i)}
            fill={i === actif ? 'rgba(124,58,237,0.30)' : 'transparent'}
            stroke={i === actif ? ACCENT : 'var(--border-c)'}
            strokeWidth={i === actif ? 2 : 1}
          />
        ))}

        {secteurs.map((s, i) => {
          const c = angleCentreSecteur(i)
          const lr = rayon * 0.7
          const enAvant = i === actif
          return (
            <text
              key={`l-${s.cle}`}
              x={centre.x + lr * Math.cos(c)}
              y={centre.y + lr * Math.sin(c)}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={enAvant ? 22 : 17}
              fontWeight={enAvant ? 800 : 600}
              fill={enAvant ? '#fff' : 'var(--text)'}
              style={{ fontFamily: "'Poppins', sans-serif", pointerEvents: 'none' }}
            >
              {s.label}
            </text>
          )
        })}

        <circle
          cx={centre.x}
          cy={centre.y}
          r={RAYON_MORT_PX}
          fill="var(--surface-2)"
          stroke="var(--border-c)"
          strokeWidth={1}
        />
      </svg>

      {/* La bande de qualités, au centre : elle montre le geste autant qu'elle
          affiche la sélection. Absente quand le secteur n'a pas de modificateur. */}
      {secteurActif && secteurActif.qualites.length > 1 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column-reverse', // `qualites` va du bas vers le haut
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            pointerEvents: 'none',
          }}
        >
          {secteurActif.qualites.map((q) => (
            <span
              key={q}
              style={{
                fontSize: 13,
                fontWeight: q === qualite ? 700 : 400,
                padding: '3px 10px',
                borderRadius: 999,
                background: q === qualite ? ACCENT_PROFOND : 'var(--surface-2)',
                color: q === qualite ? '#fff' : 'var(--text-muted)',
                border: '1px solid var(--border-c)',
              }}
            >
              {q}
            </span>
          ))}
        </div>
      )}

      {actif === null && (
        <div
          className="text-app-muted"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            textAlign: 'center',
            padding: '0 40px',
            pointerEvents: 'none',
            opacity: 0.75,
          }}
        >
          {indice}
        </div>
      )}
    </div>
  )
}
