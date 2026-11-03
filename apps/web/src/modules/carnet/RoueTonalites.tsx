// Roue des tonalités : arc rotatif du cercle des quintes.
//
// Seul le haut de la roue est visible (5 paires). On la fait glisser au pouce,
// elle s'aimante sur une paire (armure) ; la majeure est toujours au-dessus, sa
// relative mineure en dessous. Un appui sur le nom choisit la tonalité ; un
// appui sur une paire voisine la ramène au centre. La roue est cyclique.
//
// `onSelect` renvoie false quand le parent refuse le changement (ex. saisies non
// sauvegardées) : la roue revient alors à la tonalité courante.

import { useCallback, useEffect, useRef, useState } from 'react'
import { PAIRES, clePourMode, indexPaire } from './quintes.ts'
import { affichageTonalite } from './gammesData.ts'

const W = 360, H = 150, CX = 180, CY = 140
const R_MAJ = 112, R_MIN = 68, PAS_DEG = 30
const PAS_PX = R_MAJ * PAS_DEG * Math.PI / 180   // distance entre deux paires, en unités SVG
const SEUIL_DRAG = 6

const mod12 = (n: number) => ((n % 12) + 12) % 12
const delta12 = (cible: number, depuis: number) => ((((cible - depuis) % 12) + 18) % 12) - 6  // ∈ [-6, 6)

interface Props {
  tonalite: string
  disponibles: Set<string>
  onSelect: (cle: string) => boolean
}

export default function RoueTonalites({ tonalite, disponibles, onSelect }: Props) {
  const idxProp = Math.max(0, indexPaire(tonalite))
  const majeur = tonalite.endsWith(' M')

  const [pos, setPos] = useState(idxProp)
  const posRef = useRef(idxProp)
  const anim = useRef(0)
  const drag = useRef<{ x: number; pos0: number; deplace: boolean } | null>(null)
  const clicSupprime = useRef(false)
  const dernierEntier = useRef(idxProp)
  const svgRef = useRef<SVGSVGElement>(null)

  const poser = useCallback((v: number) => { posRef.current = v; setPos(v) }, [])

  const animerVers = useCallback((cible: number) => {
    cancelAnimationFrame(anim.current)
    const pas = () => {
      const d = cible - posRef.current
      if (Math.abs(d) < 0.003) { poser(cible); return }
      poser(posRef.current + d * 0.28)
      anim.current = requestAnimationFrame(pas)
    }
    anim.current = requestAnimationFrame(pas)
  }, [poser])

  // Changement externe (séance rouverte, nouveau niveau…) : la roue suit.
  useEffect(() => {
    if (drag.current?.deplace) return
    animerVers(posRef.current + delta12(idxProp, posRef.current))
  }, [idxProp, animerVers])

  useEffect(() => () => cancelAnimationFrame(anim.current), [])

  const dispoPaire = (i: number) => {
    const p = PAIRES[mod12(i)]
    return clePourMode(p, true, disponibles) !== null || clePourMode(p, false, disponibles) !== null
  }

  /** Entier le plus proche de `brut` dont la paire a au moins une tonalité disponible. */
  const entierDisponible = (brut: number): number | null => {
    let meilleur: number | null = null
    for (let n = Math.floor(brut) - 12; n <= Math.ceil(brut) + 12; n++) {
      if (!dispoPaire(n)) continue
      if (meilleur === null || Math.abs(n - brut) < Math.abs(meilleur - brut)) meilleur = n
    }
    return meilleur
  }

  const retour = () => animerVers(posRef.current + delta12(idxProp, posRef.current))

  const choisir = (n: number, cle: string) => {
    const accepte = cle === tonalite || onSelect(cle)
    if (accepte) animerVers(n)
    else retour()
  }

  // ── Geste ────────────────────────────────────────────────────────────────
  const onDown = (e: React.PointerEvent) => {
    cancelAnimationFrame(anim.current)
    drag.current = { x: e.clientX, pos0: posRef.current, deplace: false }
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x
    if (!d.deplace && Math.abs(dx) > SEUIL_DRAG) {
      d.deplace = true
      svgRef.current?.setPointerCapture(e.pointerId)
    }
    if (!d.deplace) return
    const echelle = svgRef.current!.getBoundingClientRect().width / W
    const v = d.pos0 - dx / (PAS_PX * echelle)
    poser(v)
    const r = Math.round(v)
    if (r !== dernierEntier.current) {
      dernierEntier.current = r
      try { navigator.vibrate?.(6) } catch { /* non supporté */ }
    }
  }
  const onUp = () => {
    const d = drag.current
    drag.current = null
    if (!d?.deplace) return
    clicSupprime.current = true
    window.setTimeout(() => { clicSupprime.current = false }, 0)
    const n = entierDisponible(posRef.current)
    if (n === null) { retour(); return }
    const paire = PAIRES[mod12(n)]
    const cle = clePourMode(paire, majeur, disponibles) ?? clePourMode(paire, !majeur, disponibles)
    if (!cle) { retour(); return }
    choisir(n, cle)
  }

  // ── Rendu ────────────────────────────────────────────────────────────────
  const centre = Math.round(pos)
  const items: React.ReactNode[] = []
  for (let k = -3; k <= 3; k++) {
    const n = centre + k
    const angle = (n - pos) * PAS_DEG
    const abs = Math.abs(angle)
    if (abs > 82) continue
    const paire = PAIRES[mod12(n)]
    const rad = angle * Math.PI / 180
    const facteur = Math.max(0.55, 1 - abs / 110)
    const opaciteBase = Math.max(0.35, 1 - abs / 120)

    const etiquette = (estMaj: boolean) => {
      const cles = estMaj ? paire.maj : paire.min
      const cle = clePourMode(paire, estMaj, disponibles)
      const affichee = cle ?? cles[0]
      const r = estMaj ? R_MAJ : R_MIN
      const x = CX + r * Math.sin(rad)
      const y = CY - r * Math.cos(rad)
      const choisie = cles.includes(tonalite)
      const taille = (estMaj ? 21 : 16) * facteur
      const largeur = (estMaj ? 54 : 48) * facteur
      const hauteur = (estMaj ? 30 : 26) * facteur
      return (
        <g key={`${n}-${estMaj ? 'M' : 'm'}`}
          role="button" tabIndex={cle ? 0 : -1} aria-label={affichageTonalite(affichee)} aria-pressed={choisie}
          aria-disabled={!cle}
          onClick={() => { if (!clicSupprime.current && cle) choisir(n, cle) }}
          onKeyDown={e => { if (cle && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); choisir(n, cle) } }}
          style={{ cursor: cle ? 'pointer' : 'default', outline: 'none' }}
          opacity={cle ? opaciteBase : 0.2}>
          <rect x={x - largeur / 2} y={y - hauteur / 2} width={largeur} height={hauteur} rx={hauteur / 2}
            fill={choisie ? '#7c3aed' : 'transparent'} stroke={choisie ? '#c084fc' : 'none'} strokeWidth={1.5} />
          <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={taille} fontWeight={choisie ? 700 : 600}
            fill={choisie ? '#fff' : 'var(--text)'} style={{ pointerEvents: 'none', fontFamily: 'inherit' }}>
            {affichageTonalite(affichee)}
          </text>
        </g>
      )
    }
    items.push(etiquette(true), etiquette(false))
  }

  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Roue des tonalités, glisser pour changer d’armure"
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      style={{ width: '100%', maxWidth: 440, display: 'block', margin: '0 auto', touchAction: 'pan-y', userSelect: 'none' }}>
      {/* Fenêtre fixe : paire au centre */}
      <rect x={CX - 38} y={6} width={76} height={92} rx={24} fill="rgba(124,58,237,0.08)" stroke="var(--border-c)" strokeWidth={1.5} />
      {/* Rail */}
      <path d={`M ${CX - R_MAJ * Math.sin(1.4)} ${CY - R_MAJ * Math.cos(1.4)} A ${R_MAJ} ${R_MAJ} 0 0 1 ${CX + R_MAJ * Math.sin(1.4)} ${CY - R_MAJ * Math.cos(1.4)}`}
        fill="none" stroke="var(--border-c)" strokeWidth={1} strokeDasharray="2 5" opacity={0.7} />
      {items}
    </svg>
  )
}
