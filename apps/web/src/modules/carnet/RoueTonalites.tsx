// Roue des tonalités : deux disques concentriques du cercle des quintes, dont on
// ne voit que le haut. Anneau extérieur (violet) = majeures, anneau intérieur
// (bleu) = relatives mineures, séparés par un espace net. On la fait glisser au
// pouce : elle s'aimante sur une paire (armure) placée dans la fenêtre fixe du
// centre. Un appui sur un nom choisit la tonalité ; un appui sur une paire
// voisine la ramène au centre. La roue est cyclique.
//
// Geste « à la iOS » : le doigt entraîne la roue 1:1 ; au lâcher, l'élan (vitesse
// mesurée sur les ~100 dernières ms) la fait continuer, puis un ressort
// quasi-critique la pose sur la paire visée, avec un très léger dépassement. Un
// cran de vibration accompagne chaque paire qui passe sous la fenêtre.
//
// `onSelect` renvoie false quand le parent refuse le changement (ex. saisies non
// sauvegardées) : la roue revient alors à la tonalité courante.

import { useCallback, useEffect, useRef, useState } from 'react'
import { PAIRES, clePourMode, indexPaire } from './quintes.ts'
import { affichageTonalite } from './gammesData.ts'

// Repère SVG : centre des disques sous la zone visible.
const W = 360, H = 134, CX = 180
const R_MAJ = 175, R_MIN = 115          // rayons médians des deux anneaux
const EP = 50                           // épaisseur de chaque anneau (espace entre les deux : 10)
const CY = 34 + R_MAJ                   // la majeure centrale se lit à y = 34
const PAS_DEG = 30
const PAS_PX = R_MAJ * PAS_DEG * Math.PI / 180   // distance entre deux paires, en unités SVG
const SEUIL_DRAG = 6
// Ressort de pose (unités : paires, secondes) — raideur 170, amortissement ~0,9 du critique.
const RAIDEUR = 170
const AMORTISSEMENT = 0.9 * 2 * Math.sqrt(RAIDEUR)
// Élan : distance parcourue = vitesse / FROTTEMENT (décroissance exponentielle).
const FROTTEMENT = 6
const FENETRE_VITESSE_MS = 100
const PORTEE_MAX = 5
const COULEUR_MAJ = '#7c3aed'
const COULEUR_MIN = '#0ea5e9'

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
  const drag = useRef<{ x: number; pos0: number; deplace: boolean; echantillons: { t: number; pos: number }[] } | null>(null)
  const clicSupprime = useRef(false)
  const dernierEntier = useRef(idxProp)
  const svgRef = useRef<SVGSVGElement>(null)

  const poser = useCallback((v: number) => {
    posRef.current = v
    setPos(v)
    const r = Math.round(v)
    if (r !== dernierEntier.current) {
      dernierEntier.current = r
      try { navigator.vibrate?.(6) } catch { /* non supporté */ }
    }
  }, [])

  /** Ressort amorti vers `cible` (en paires), avec la vitesse initiale `v0` (paires/s). */
  const animerVers = useCallback((cible: number, v0 = 0) => {
    cancelAnimationFrame(anim.current)
    let v = v0
    let dernier = performance.now()
    const pas = (t: number) => {
      let dt = Math.min((t - dernier) / 1000, 1 / 20)
      dernier = t
      // Sous-pas de 4 ms : intégration stable même sur un écran 30 Hz.
      while (dt > 0) {
        const h = Math.min(dt, 0.004)
        const a = -RAIDEUR * (posRef.current - cible) - AMORTISSEMENT * v
        v += a * h
        posRef.current += v * h
        dt -= h
      }
      if (Math.abs(posRef.current - cible) < 0.002 && Math.abs(v) < 0.02) { poser(cible); return }
      poser(posRef.current)
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
    drag.current = { x: e.clientX, pos0: posRef.current, deplace: false, echantillons: [] }
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
    const maintenant = performance.now()
    d.echantillons.push({ t: maintenant, pos: v })
    while (d.echantillons.length > 2 && maintenant - d.echantillons[0].t > FENETRE_VITESSE_MS) d.echantillons.shift()
  }
  const onUp = () => {
    const d = drag.current
    drag.current = null
    if (!d?.deplace) return
    clicSupprime.current = true
    window.setTimeout(() => { clicSupprime.current = false }, 0)

    // Vitesse au lâcher (paires/s) ; nulle si le doigt s'est arrêté avant de lever.
    const e = d.echantillons
    const maintenant = performance.now()
    let v = 0
    if (e.length >= 2 && maintenant - e[e.length - 1].t < 80) {
      const dt = (e[e.length - 1].t - e[0].t) / 1000
      if (dt > 0.005) v = (e[e.length - 1].pos - e[0].pos) / dt
    }
    // Atterrissage projeté (élan qui s'éteint), borné pour rester contrôlable.
    const projete = posRef.current + Math.max(-PORTEE_MAX, Math.min(PORTEE_MAX, v / FROTTEMENT))

    const n = entierDisponible(projete)
    if (n === null) { retour(); return }
    const paire = PAIRES[mod12(n)]
    const cle = clePourMode(paire, majeur, disponibles) ?? clePourMode(paire, !majeur, disponibles)
    if (!cle) { retour(); return }
    if (cle === tonalite || onSelect(cle)) animerVers(n, v)
    else retour()
  }

  // ── Rendu ────────────────────────────────────────────────────────────────
  const centre = Math.round(pos)
  const separateurs: React.ReactNode[] = []
  const items: React.ReactNode[] = []

  for (let k = -3; k <= 3; k++) {
    const n = centre + k
    const angle = (n - pos) * PAS_DEG
    const abs = Math.abs(angle)
    const rad = angle * Math.PI / 180

    // Traits radiaux entre deux secteurs (la roue tourne visiblement).
    const sep = (n - pos + 0.5) * PAS_DEG * Math.PI / 180
    separateurs.push(
      <line key={`s${n}`}
        x1={CX + (R_MIN - EP / 2) * Math.sin(sep)} y1={CY - (R_MIN - EP / 2) * Math.cos(sep)}
        x2={CX + (R_MAJ + EP / 2) * Math.sin(sep)} y2={CY - (R_MAJ + EP / 2) * Math.cos(sep)}
        stroke="var(--border-c)" strokeWidth={1} opacity={0.9} />,
    )

    if (abs > 75) continue
    const paire = PAIRES[mod12(n)]
    const facteur = Math.max(0.72, 1 - abs / 140)
    const opaciteBase = Math.max(0.45, 1 - abs / 110)

    const etiquette = (estMaj: boolean) => {
      const cles = estMaj ? paire.maj : paire.min
      const cle = clePourMode(paire, estMaj, disponibles)
      const affichee = cle ?? cles[0]
      const r = estMaj ? R_MAJ : R_MIN
      const x = CX + r * Math.sin(rad)
      const y = CY - r * Math.cos(rad)
      if (y > H - 4) return null
      const choisie = cles.includes(tonalite)
      const taille = (estMaj ? 24 : 20) * facteur
      // Pastille proportionnée au texte, avec une vraie marge autour.
      const largeur = (affichageTonalite(affichee).length * 0.56 * taille + (estMaj ? 40 : 26))
      const hauteur = taille * (estMaj ? 1.85 : 1.9)
      return (
        <g key={`${n}-${estMaj ? 'M' : 'm'}`}
          role="button" tabIndex={cle ? 0 : -1} aria-label={affichageTonalite(affichee)} aria-pressed={choisie}
          aria-disabled={!cle}
          onClick={() => { if (!clicSupprime.current && cle) choisir(n, cle) }}
          onKeyDown={e => { if (cle && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); choisir(n, cle) } }}
          style={{ cursor: cle ? 'pointer' : 'default', outline: 'none' }}
          opacity={cle ? opaciteBase : 0.22}>
          <rect x={x - largeur / 2} y={y - hauteur / 2} width={largeur} height={hauteur} rx={hauteur / 2}
            fill={choisie ? (estMaj ? COULEUR_MAJ : COULEUR_MIN) : 'transparent'}
            stroke={choisie ? '#fff' : 'none'} strokeWidth={2} strokeOpacity={0.85} />
          <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={taille} fontWeight={choisie ? 800 : 600}
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
      style={{ width: '100%', maxWidth: 460, display: 'block', margin: '0 auto', touchAction: 'pan-y', userSelect: 'none' }}>
      {/* Deux disques : majeures (violet) à l'extérieur, mineures (bleu) à l'intérieur */}
      <circle cx={CX} cy={CY} r={R_MAJ} fill="none" stroke={COULEUR_MAJ} strokeOpacity={0.16} strokeWidth={EP} />
      <circle cx={CX} cy={CY} r={R_MIN} fill="none" stroke={COULEUR_MIN} strokeOpacity={0.16} strokeWidth={EP} />
      {separateurs}
      {/* Fenêtre fixe : la paire au centre est celle qui sera choisie */}
      <rect x={CX - 55} y={5} width={110} height={H - 10} rx={26} fill="rgba(192,132,252,0.07)" stroke="#c084fc" strokeWidth={2} />
      {items}
    </svg>
  )
}
