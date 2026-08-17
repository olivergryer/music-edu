// ─── Démo animée du décompte (activités 1 & 2 du module Rythme) ──────────────
// Les élèves ne savent pas QUAND partir : le décompte affiche 1, 2, 3, 4 et le
// rythme démarre sur le temps qui SUIT le 4. Un texte décrit mal cet instant ;
// une animation le montre. Ce composant rejoue donc la séquence en boucle, à un
// tempo volontairement lent, en reprenant les codes visuels exacts de l'écran de
// jeu (chiffre bleu 72 px, cadre qui flashe, libellés « Prépare-toi… » etc.)
// pour que l'élève reconnaisse ensuite ce qu'il voit.
//
// Autonome : aucun état partagé avec RythmApp, aucun son (la démo s'affiche dans
// la consigne, avant le déverrouillage audio — le bip est figuré visuellement).

import { useEffect, useRef, useState } from 'react'
import RythmStaffRaw from '../RythmStaff'
import { RYTHME } from '../content/rythme'

// RythmStaff est en JSX (props non typées) : cast pour l'interop TS — même
// convention que NotesPage.tsx / DetectionPage.tsx pour ConsigneOverlay.
const RythmStaff = RythmStaffRaw as unknown as React.ComponentType<Record<string, unknown>>

const ACCENT = '#4A6CF7'

const BPM = 52                     // lent : la démo sert à comprendre, pas à suivre
const BEAT_MS = 60000 / BPM
const PAUSE_MS = 1100              // respiration avant de reboucler
const MAX_BOUCLES = 2              // puis on attend un appui sur « Revoir »

// Motif fixe : 4 noires en 4/4. Le plus lisible possible — l'objet de la démo
// est le départ, pas la difficulté rythmique.
const FIGURES = [{ dur: 'q' }, { dur: 'q' }, { dur: 'q' }, { dur: 'q' }]
const NB_NOTES = FIGURES.length

// Étapes de la timeline. `beat` = index du temps depuis le début (0-based).
// Temps 0..3 = décompte (chiffres 1 à 4) ; temps 4..7 = le rythme joué.
type Etape =
  | { type: 'decompte'; chiffre: number }
  | { type: 'joue'; note: number }
  | { type: 'pause' }

function etapeAt(beat: number): Etape {
  if (beat < 4) return { type: 'decompte', chiffre: beat + 1 }
  if (beat < 4 + NB_NOTES) return { type: 'joue', note: beat - 4 }
  return { type: 'pause' }
}

const TOTAL_BEATS = 4 + NB_NOTES

export default function DemoDecompte() {
  const [beat, setBeat] = useState(0)      // temps courant ; TOTAL_BEATS = pause finale
  const [flash, setFlash] = useState(false)
  const [enCours, setEnCours] = useState(true)
  const [passage, setPassage] = useState(0) // n° du passage ; sa variation relance la chaîne

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const reducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  // Nettoie toute la chaîne de timers — appelé au démontage et à chaque relance.
  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
  }

  useEffect(() => {
    if (reducedMotion || !enCours) return

    const timers: ReturnType<typeof setTimeout>[] = []
    const push = (fn: () => void, delay: number) => { timers.push(setTimeout(fn, delay)) }
    timersRef.current = timers

    // Un passage complet : un temps toutes les BEAT_MS, flash de 130 ms à chaque temps.
    for (let k = 0; k < TOTAL_BEATS; k++) {
      push(() => { setBeat(k); setFlash(true) }, k * BEAT_MS)
      push(() => setFlash(false), k * BEAT_MS + 130)
    }

    // Fin du passage : pause, puis rebouclage — ou arrêt après MAX_BOUCLES.
    push(() => setBeat(TOTAL_BEATS), TOTAL_BEATS * BEAT_MS)
    push(() => {
      if (passage + 1 < MAX_BOUCLES) setPassage(passage + 1)
      else setEnCours(false)
    }, TOTAL_BEATS * BEAT_MS + PAUSE_MS)

    return () => { timers.forEach(clearTimeout) }
  }, [enCours, passage, reducedMotion])

  const rejouer = () => {
    clearTimers()
    setBeat(0)
    setPassage(0)
    setEnCours(true)
  }

  const etape = etapeAt(beat)
  const estDecompte = etape.type === 'decompte'
  // `enJeu` : on est sur un temps du rythme — la zone de frappe s'allume et le
  // doigt entre en scène. TS a besoin du prédicat pour accéder à `etape.note`.
  const enJeu = etape.type === 'joue'
  const dernierTempsDecompte = estDecompte && etape.chiffre === 4

  // La portée est visible d'emblée : c'est le comportement PAR DÉFAUT du jeu
  // (`revealBeat` vaut 1 → `setRevealed(true)` dès le lancement, RythmApp.jsx).
  // La révélation tardive est une option de score ; la démo ne doit pas la
  // montrer, l'élève a d'abord besoin de comprendre le cas normal.

  const libelle = estDecompte
    ? (dernierTempsDecompte ? RYTHME.demo.etapeDernierTemps : RYTHME.demo.etapeDecompte)
    : enJeu
      ? RYTHME.demo.etapeDepart
      : ''

  // ── Variante sans animation ────────────────────────────────────────────────
  if (reducedMotion) {
    return (
      <div style={cadre(false)}>
        <div style={titreStyle}>{RYTHME.demo.titre}</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, margin: '10px 0 8px' }}>
          {[1, 2, 3, 4].map(n => (
            <span key={n} style={{ fontSize: 26, fontWeight: 900, color: ACCENT }}>{n}</span>
          ))}
          <span style={{ fontSize: 26, fontWeight: 900, color: '#34d399' }}>♪</span>
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--text-muted)' }}>
          {RYTHME.demo.legendeStatique}
        </div>
      </div>
    )
  }

  return (
    <div style={cadre(flash && enCours)}>
      <div style={titreStyle}>{RYTHME.demo.titre}</div>

      {/* Bandeau haut : chiffre du décompte OU mention « À toi » — hauteur fixe
          pour que la portée ne saute pas d'une étape à l'autre. */}
      <div style={{
        height: 62, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        {estDecompte ? (
          <span style={{
            fontSize: 46, fontWeight: 900, lineHeight: 1,
            color: dernierTempsDecompte ? '#fbbf24' : ACCENT,
          }}>
            {etape.chiffre}
          </span>
        ) : etape.type === 'joue' ? (
          <span style={{ fontSize: 20, fontWeight: 900, color: '#34d399' }}>
            {RYTHME.demo.etapeDepart}
          </span>
        ) : null}
      </div>

      {/* Portée : visible du début à la fin, notes surlignées une à une */}
      <div style={{
        borderRadius: 12,
        border: `2px solid ${flash && enCours ? ACCENT : 'var(--border-c)'}`,
        background: 'var(--surface-2)',
        padding: '4px 2px 0',
        transition: 'border-color 0.08s',
      }}>
        <RythmStaff
          figures={FIGURES}
          timeSig="4/4"
          activeIdx={etape.type === 'joue' ? etape.note : -1}
          width={260}
          height={92}
          showClef={false}
          showTimeSig={true}
          compact={true}
        />
      </div>

      {/* Zone de frappe miniature — réplique du bandeau de l'écran de jeu :
          bleu éteint pendant le décompte, vif au départ. La main ne s'y pose
          qu'une fois le décompte terminé : son apparition est en elle-même le
          signal du départ. */}
      <div style={{
        position: 'relative', height: BANDE_H, marginTop: 6,
        borderRadius: 12, overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: enJeu
          ? 'linear-gradient(135deg,#4A6CF7,#8B5CF6)'
          : 'linear-gradient(135deg,#3b4fd4,#2040b5)',
        transition: 'background 0.2s',
      }}>
        {/* Onde de contact : deux cercles concentriques qui se propagent depuis
            le point d'appui, relancés à chaque frappe (key = n° de note). */}
        {enJeu && (
          <span key={`onde-${etape.note}`} style={ondeConteneur}>
            <span style={onde(0)} />
            <span style={onde(120)} />
          </span>
        )}

        {/* Main en surimpression. DEUX mouvements distincts sur deux éléments :
              · l'extérieur ENTRE une fois quand le rythme démarre — aucune `key`
                ne change dessus, donc React ne le remonte jamais ;
              · l'intérieur boucle la frappe, avec une durée EXACTEMENT égale à
                un temps et le contact posé à 0 % des keyframes.
            C'est ce verrouillage de phase qui règle la désynchronisation : tant
            que la frappe était relancée à chaque note, le contact tombait au
            pourcentage où il était placé dans l'animation (26 %, soit 130 ms
            trop tard). Ici l'animation démarre une seule fois, à la première
            note, et chaque itération retombe d'elle-même sur le temps. */}
        {enJeu && (
          <span
            style={{
              position: 'absolute',
              left: `calc(50% - ${CONTACT_PX_X}px)`,
              top: BANDE_CONTACT_Y - CONTACT_PX_Y,
              opacity: 0.9, pointerEvents: 'none',
              animation: reducedMotion ? undefined : 'demo-main-entree 0.18s ease-out both',
            }}
          >
            <span
              style={{
                display: 'block',
                animation: reducedMotion
                  ? undefined
                  : `demo-main-frappe ${BEAT_MS}ms linear infinite`,
              }}
            >
              <MainSvg />
            </span>
          </span>
        )}
      </div>

      <div style={{
        fontSize: 12, fontWeight: 600, minHeight: 17,
        color: dernierTempsDecompte ? '#fbbf24' : 'var(--text-muted)',
      }}>
        {libelle}
      </div>

      {!enCours && (
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={rejouer}
          style={{
            marginTop: 8, minHeight: 44, width: '100%',
            borderRadius: 12, border: `1.5px solid ${ACCENT}55`,
            background: 'none', color: ACCENT,
            fontSize: 13, fontWeight: 800, cursor: 'pointer',
          }}
        >
          {RYTHME.demo.rejouer}
        </button>
      )}
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────
// Silhouette plate, dans la convention « appuie ici » des systèmes de design
// (Material et consorts) : une seule couleur, formes arrondies, index tendu,
// ni dégradé ni contour. Ce parti pris n'est pas décoratif — à petite taille et
// en surimpression sur un fond coloré, un rendu volumétrique se délite, alors
// qu'une silhouette reste lisible. Le dessin est original, aucun actif sous
// licence n'est repris.
//
// La main est dessinée verticalement (index vers le haut) puis pivotée de −25°
// autour de la pulpe : le point de contact reste fixe quel que soit l'angle, ce
// qui permet de caler l'onde dessus sans recalcul.
//
// Repères (viewBox 120×110) : pulpe de l'index = (34, 6).
const MAIN_W = 120
const MAIN_H = 110
const CONTACT_X = 34
const CONTACT_Y = 6
const ANGLE = -25
const MAIN_COULEUR = '#ffffff'

// Échelle de rendu : à taille native la main écraserait un bandeau de ~270 px.
const MAIN_SCALE = 0.72
// Position de la pulpe une fois le SVG mis à l'échelle, en pixels CSS.
const CONTACT_PX_X = CONTACT_X * MAIN_SCALE
const CONTACT_PX_Y = CONTACT_Y * MAIN_SCALE

function MainSvg() {
  return (
    <svg
      width={MAIN_W * MAIN_SCALE}
      height={MAIN_H * MAIN_SCALE}
      viewBox="0 0 120 110"
      fill="none"
      aria-hidden="true"
    >
      <g transform={`rotate(${ANGLE} ${CONTACT_X} ${CONTACT_Y})`} fill={MAIN_COULEUR}>
        {/* Silhouette d'un seul tenant : index tendu vers le haut, puis les
            trois doigts repliés et le pouce, tracés comme des bosses arrondies
            sur le contour de la main — c'est le profil qui rend la posture
            lisible, pas le détail interne. */}
        <path
          d="M26 6
             a8 8 0 0 1 16 0
             v46
             h6
             a10 10 0 0 1 10 -10
             a10 10 0 0 1 10 10
             v2
             a9 9 0 0 1 9 -9
             a9 9 0 0 1 9 9
             v4
             a8.5 8.5 0 0 1 8.5 -8.5
             a8.5 8.5 0 0 1 8.5 8.5
             v22
             a30 30 0 0 1 -30 30
             h-20
             a26 26 0 0 1 -20 -9
             l-20 -24
             a8 8 0 0 1 12 -10
             l6 7
             z"
        />
      </g>
    </svg>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────
// Bandeau volontairement haut : la main arrive en biais par le bas-droite, il
// lui faut de la place sous le point de contact pour que l'index ET une partie
// de la paume restent visibles avant d'être coupés par le bord.
const BANDE_H = 74
const BANDE_CONTACT_Y = 20

// L'onde naît au point de contact de la pulpe. La main étant positionnée à
// `calc(50% - CONTACT_X)`, la pulpe tombe exactement sur le centre du bandeau.
const ondeConteneur: React.CSSProperties = {
  position: 'absolute',
  left: '50%',
  top: BANDE_CONTACT_Y,
  width: 0, height: 0, pointerEvents: 'none',
}

function onde(delayMs: number): React.CSSProperties {
  return {
    position: 'absolute', left: 0, top: 0,
    width: 66, height: 66, borderRadius: '50%',
    border: '2px solid rgba(255,255,255,0.9)',
    animation: `demo-onde 0.75s ease-out ${delayMs}ms both`,
  }
}

const titreStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 800, letterSpacing: 0.4,
  textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 2,
}

function cadre(actif: boolean): React.CSSProperties {
  return {
    borderRadius: 16,
    border: `1px solid ${actif ? `${ACCENT}66` : 'var(--border-c)'}`,
    background: 'var(--surface-2)',
    padding: '12px 12px 14px',
    textAlign: 'center',
    transition: 'border-color 0.08s',
  }
}
