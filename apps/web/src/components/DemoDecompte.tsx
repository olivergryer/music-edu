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

const BPM = 66                     // plus lent que le jeu réel : lisibilité
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
  const dernierTempsDecompte = estDecompte && etape.chiffre === 4
  // La portée se révèle au 3e temps, comme le réglage « Révélation » par défaut.
  const porteeVisible = beat >= 2

  const libelle = estDecompte
    ? (dernierTempsDecompte ? RYTHME.demo.etapeDernierTemps
      : porteeVisible ? RYTHME.demo.etapeMemorise
      : RYTHME.demo.etapeDecompte)
    : etape.type === 'joue'
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

      {/* Portée : révélée au 3e temps, puis notes surlignées une à une */}
      <div style={{
        borderRadius: 12,
        border: `2px solid ${flash && enCours ? ACCENT : 'var(--border-c)'}`,
        background: 'var(--surface-2)',
        padding: '4px 2px 0',
        opacity: porteeVisible ? 1 : 0.25,
        transition: 'opacity 0.25s, border-color 0.08s',
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

      {/* Doigt fantôme : n'apparaît que sur les temps joués */}
      <div style={{ height: 22, marginTop: 2 }}>
        {etape.type === 'joue' && (
          <span style={{
            fontSize: 13, fontWeight: 700, color: '#34d399',
            opacity: flash ? 1 : 0.45, transition: 'opacity 0.1s',
          }}>
            👆 {RYTHME.demo.doigt}
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

// ── Styles ───────────────────────────────────────────────────────────────────
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
