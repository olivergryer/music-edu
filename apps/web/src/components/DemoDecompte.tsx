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

const BPM = 44                     // très lent : la démo sert à comprendre, pas à suivre
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

      {/* Zone de frappe miniature — réplique du bandeau « Tape n'importe où » de
          l'écran de jeu : bleu éteint pendant le décompte, vif au départ.
          Le doigt ne s'y pose qu'une fois le décompte terminé : son apparition
          est en elle-même le signal du départ. */}
      <div style={{
        position: 'relative', height: 52, marginTop: 6,
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

        {/* Doigt en surimpression — opacité réduite pour laisser lire la zone */}
        {enJeu && (
          <span
            key={`doigt-${etape.note}`}
            style={{
              position: 'absolute', left: '50%', top: DOIGT_OFFSET_Y,
              transform: 'translateX(-50%)',
              opacity: 0.42, pointerEvents: 'none',
              animation: 'demo-doigt-appui 0.5s ease-out',
            }}
          >
            <DoigtSvg />
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

// ── Doigt ────────────────────────────────────────────────────────────────────
// Index tendu VERS LE BAS (poing au-dessus), vu de trois quarts : c'est la
// posture réelle d'un tap sur écran. Le volume vient de dégradés superposés
// (corps, ombre latérale, reflet) plutôt que d'un aplat — à 42 % d'opacité un
// aplat deviendrait illisible, un dégradé garde sa forme.
//
// Repères géométriques (viewBox 40×46), utilisés pour caler l'onde :
//   · centre horizontal du SVG : x = 20
//   · pulpe de l'index (point de contact) : x = 15, y = 43
const DOIGT_W = 40
const DOIGT_H = 46
const PULPE_X = 15   // décalage de la pulpe par rapport au centre : 20 - 15 = 5 px
const PULPE_Y = 43

function DoigtSvg() {
  return (
    <svg width={DOIGT_W} height={DOIGT_H} viewBox="0 0 40 46" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="demo-doigt-corps" x1="8" y1="6" x2="34" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#ffffff" />
          <stop offset="45%"  stopColor="#ece1d6" />
          <stop offset="100%" stopColor="#b39a86" />
        </linearGradient>
        <linearGradient id="demo-doigt-ombre" x1="22" y1="10" x2="36" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#8a6f5c" stopOpacity="0" />
          <stop offset="100%" stopColor="#6b5344" stopOpacity="0.7" />
        </linearGradient>
        <radialGradient id="demo-doigt-reflet" cx="0.35" cy="0.3" r="0.55">
          <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Poing replié, en arrière-plan */}
      <rect x="13" y="4" width="24" height="27" rx="9" fill="url(#demo-doigt-corps)" />
      <rect x="13" y="4" width="24" height="27" rx="9" fill="url(#demo-doigt-ombre)" />
      <rect x="13" y="4" width="24" height="27" rx="9" stroke="#5c4636" strokeOpacity="0.45" strokeWidth="1.2" />
      {/* Plis des phalanges */}
      <path d="M24 13h11M24 20h12M25 27h10" stroke="#8a6f5c" strokeOpacity="0.35" strokeWidth="1.1" strokeLinecap="round" />

      {/* Index tendu vers le bas — la pulpe touche l'écran */}
      <rect x="9" y="13" width="12" height="30" rx="6" fill="url(#demo-doigt-corps)" />
      <rect x="9" y="13" width="12" height="30" rx="6" fill="url(#demo-doigt-ombre)" />
      <rect x="9" y="13" width="12" height="30" rx="6" stroke="#5c4636" strokeOpacity="0.5" strokeWidth="1.3" />
      {/* Reflet sur la face éclairée de l'index — donne l'arrondi */}
      <ellipse cx="13" cy="25" rx="3" ry="9" fill="url(#demo-doigt-reflet)" />
      {/* Ongle, esquissé */}
      <ellipse cx="15" cy="37" rx="3.6" ry="4.4" fill="#fff" opacity="0.3" />
    </svg>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────
// Le SVG est remonté de 4 px pour que la pulpe presse au tiers bas du bandeau.
const DOIGT_OFFSET_Y = -4

// L'onde naît au point de contact de la pulpe, pas au centre du bandeau.
const ondeConteneur: React.CSSProperties = {
  position: 'absolute',
  left: `calc(50% - ${DOIGT_W / 2 - PULPE_X}px)`,
  top: PULPE_Y + DOIGT_OFFSET_Y,
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
