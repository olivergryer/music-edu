import { useState, useRef, useEffect, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import TourGuide from './TourGuide'
import { PitchDetector } from 'pitchy'
import AccordeurStaff from './AccordeurStaff'
import ConsigneOverlay, { consigneSeen } from './ConsigneOverlay'
import SpectrePaneau from './SpectrePaneau'
import GenerateurAccord from './GenerateurAccord'
import JeuGamme from './JeuGamme'
import { INSTRUMENTS, loadInstrumentSamples, isOscillatorInstrument, playPhrase, playPhraseOscillator, phraseDurationMs } from './windEngine'
import {
  analyserBuffer, segmenter, calculerEcarts, courbebrute,
  scorePedagogique, scoreQualite, couleurJustesse,
  lireStructures, sauvegarderStructure, supprimerStructure,
  lireSessions, sauvegarderSession, supprimerSession,
  structureVersURL, urlVersStructure,
  transposerNom, computeSpectreParNote,
  TRANSPOSITIONS, uuid,
  NOTE_NAMES_FR, DEFAULT_STRUCTURES,
  frameRMS, preEmphasis, HZ_MIN, HZ_MAX,
  hzToMidi, midiToNoteName, centsTempere, centsCinqLimite, centsUtilisateur,
  buildEnharmonicScale, noteNameToPC, HARMONIQUE_OFFSETS,
} from './accordeurUtils'

// ─── Constantes canvas (toujours dark pour les graphes scientifiques) ───────────
const DIAPASON_DEFAULT        = 442
const SEUIL_DEFAULT           = 10
const SILENCE_MS_DEFAULT      = 40
const NOTE_JUMP_CENTS_DEFAULT = 30
const REFERENTIELS            = ['tempere', '5-limite', 'utilisateur']
const INTERVAL_NAMES          = [
  'Seconde mineure','Seconde majeure','Tierce mineure','Tierce majeure',
  'Quarte juste','Triton','Quinte juste','Sixte mineure',
  'Sixte majeure','Septième mineure','Septième majeure','Octave',
]
const TEMPERAMENT_TEMPERE     = Array(12).fill(0)
const USER_TEMP_KEY           = 'acc_temperament_user'
const USER_PRESETS_KEY        = 'acc_temperament_presets'
// Canvas colors (dark, used only in canvas 2D API)
const C_BG      = '#0D1026'
const C_SURFACE = '#131929'
const C_ACCENT  = '#4A6CF7'
const C_MUTED   = '#4b5563'
const C_MUTED2  = '#6b7280'
const C_TRITONE = '#FF8B3D'

// ─── Tutorial ────────────────────────────────────────────────────────────────────
const ACC_TUTO_KEY = 'acc_tuto_v1'
const TUTO_TOTAL_ACC = 5
const ACC_COLOR = '#FF8B3D'

function AccordeurTutorial({ onDone }) {
  const [slide, setSlide] = useState(0)
  const [modeLive, setModeLive] = useState(true)

  function renderVisual() {
    if (slide === 0) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <svg width="120" height="80" viewBox="0 0 120 80" fill="none">
            <path d="M10 70 A55 55 0 0 1 110 70" stroke="rgba(255,139,61,0.2)" strokeWidth="12" strokeLinecap="round" fill="none"/>
            <path d="M10 70 A55 55 0 0 1 75 18" stroke={ACC_COLOR} strokeWidth="12" strokeLinecap="round" fill="none"/>
            <circle cx="60" cy="70" r="5" fill={ACC_COLOR}/>
            <line x1="60" y1="65" x2="75" y2="22" stroke={ACC_COLOR} strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
          <div style={{ display: 'flex', gap: 20, alignItems: 'baseline' }}>
            <span style={{ fontSize: 48, fontWeight: 900, color: ACC_COLOR, letterSpacing: 2 }}>Sol</span>
            <span style={{ fontSize: 22, fontWeight: 700, color: '#6b7280' }}>4</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#34d399' }}>+2.1¢</div>
        </div>
      )
    }
    if (slide === 1) {
      const opts = [
        { id: true,  label: '♩ Live',          desc: 'Note + cents en direct' },
        { id: false, label: '● Enregistrement', desc: 'Analyse une phrase entière' },
      ]
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 280 }}>
          {opts.map(o => {
            const sel = modeLive === o.id
            return (
              <div key={String(o.id)} role="button" onClick={() => setModeLive(o.id)} style={{
                borderRadius: 16, padding: '16px 18px', cursor: 'pointer',
                background: sel ? 'rgba(255,139,61,0.15)' : 'rgba(255,255,255,0.03)',
                border: `2px solid ${sel ? ACC_COLOR : 'rgba(255,255,255,0.08)'}`,
                transition: 'all 0.15s',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: sel ? '#ffb385' : '#6b7280' }}>{o.label}</span>
                  {sel && <div style={{ width: 10, height: 10, borderRadius: 5, background: ACC_COLOR }}/>}
                </div>
                <div style={{ fontSize: 11, color: sel ? '#ffd0a8' : '#6b7280', lineHeight: 1.4 }}>{o.desc}</div>
              </div>
            )
          })}
        </div>
      )
    }
    if (slide === 2) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 280 }}>
          {[
            { label: 'Tempéré',    desc: 'Système standard occidental', color: '#6b7280' },
            { label: 'Harmonique', desc: 'Intonation juste 5-limite',   color: ACC_COLOR },
            { label: 'Utilisateur',desc: 'Tempérament personnalisé',    color: '#c084fc' },
          ].map((r, i) => (
            <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 12, background: i === 0 ? 'rgba(255,139,61,0.12)' : 'rgba(255,255,255,0.03)', border: `1.5px solid ${i === 0 ? ACC_COLOR : 'rgba(255,255,255,0.07)'}` }}>
              <div style={{ width: 8, height: 8, borderRadius: 4, background: r.color, flexShrink: 0 }}/>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#e5e7eb' }}>{r.label}</div>
                <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>{r.desc}</div>
              </div>
            </div>
          ))}
        </div>
      )
    }
    if (slide === 3) {
      return (
        <div style={{ width: 280 }}>
          <svg width="280" height="80" viewBox="0 0 280 80" fill="none">
            {[15, 25, 35, 45, 55].map(y => <line key={y} x1="10" y1={y} x2="270" y2={y} stroke="#374151" strokeWidth="0.8"/>)}
            {[
              { x: 40, y: 55, c: '#34d399', label: 'Sol' },
              { x: 80, y: 45, c: '#34d399', label: 'La' },
              { x: 120, y: 35, c: '#fbbf24', label: 'Si' },
              { x: 160, y: 25, c: '#34d399', label: 'Do' },
              { x: 200, y: 35, c: '#f87171', label: 'Ré' },
            ].map(n => (
              <g key={n.x}>
                <ellipse cx={n.x} cy={n.y} rx="10" ry="6.5" fill={n.c} opacity="0.85" transform={`rotate(-15 ${n.x} ${n.y})`}/>
                <line x1={n.x + 9} y1={n.y - 5} x2={n.x + 9} y2={n.y - 28} stroke={n.c} strokeWidth="1.5" opacity="0.85"/>
              </g>
            ))}
          </svg>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {[
              { label: 'Score', val: '4/5', color: '#34d399' },
              { label: 'Qualité', val: '83%', color: ACC_COLOR },
            ].map(s => (
              <div key={s.label} style={{ flex: 1, textAlign: 'center', padding: '10px 0', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: s.color }}>{s.val}</div>
                <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )
    }
    if (slide === 4) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <svg width="100" height="110" viewBox="0 0 20 22" fill="none" style={{ opacity: 0.9 }}>
            {[3, 8, 13, 18].map(x => <line key={x} x1={x} y1="1" x2={x} y2="21" stroke={ACC_COLOR} strokeWidth="1.5" strokeLinecap="round"/>)}
            {[5, 10, 15, 20].map(y => <line key={y} x1="1" y1={y} x2="20" y2={y} stroke={ACC_COLOR} strokeWidth="1.5"/>)}
            <circle cx="3" cy="7.5" r="2.5" fill={ACC_COLOR}/>
            <circle cx="8" cy="12.5" r="2.5" fill={ACC_COLOR}/>
            <circle cx="13" cy="7.5" r="2.5" fill={ACC_COLOR}/>
            <circle cx="18" cy="2.5" r="2.5" fill={ACC_COLOR}/>
          </svg>
          <div style={{ display: 'flex', gap: 8 }}>
            {['Flûte', 'Hautbois', 'Clarinette'].map(i => (
              <div key={i} style={{ padding: '6px 12px', borderRadius: 8, background: 'rgba(255,139,61,0.12)', border: `1px solid rgba(255,139,61,0.3)`, fontSize: 11, fontWeight: 600, color: '#ffb385' }}>{i}</div>
            ))}
          </div>
        </div>
      )
    }
  }

  const SLIDES = [
    { title: 'Accordeur chromatique',   body: 'Détecte ta note en temps réel. Enregistre une phrase entière et analyse ta justesse note par note.' },
    { title: 'Mode de départ',           body: 'Live : note + cents affichés en direct. Enregistrement : joue une phrase complète puis consulte l\'analyse.' },
    { title: 'Référentiels de justesse', body: 'Tempéré : standard occidental. Harmonique : ratios naturels 5-limite. Choisis une tonique pour activer ces modes.' },
    { title: 'Analyse de phrase',        body: 'Après l\'enregistrement, la portée affiche chaque note colorée selon la justesse. Score et qualité calculés automatiquement.' },
    { title: 'Générateur d\'accords',   body: 'Écoute un accord de référence avec flûte, hautbois ou clarinette. Compare les intonations tempérée, harmonique et personnalisée.' },
  ]

  const { title, body } = SLIDES[slide]

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: '#030712', color: '#f9fafb',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
      padding: '24px 20px 80px', overflowY: 'auto',
    }}>
      {/* Dots + Ignorer */}
      <div style={{ width: '100%', maxWidth: 480, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {Array.from({ length: TUTO_TOTAL_ACC }).map((_, i) => (
            <div key={i} style={{
              width: i === slide ? 20 : 7, height: 7, borderRadius: 4,
              background: i <= slide ? ACC_COLOR : 'rgba(255,255,255,0.1)',
              transition: 'width 0.25s, background 0.25s',
            }}/>
          ))}
        </div>
        <button onClick={() => onDone({ modeLive })} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: '4px 8px' }}>
          Ignorer
        </button>
      </div>

      {/* Visual */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 0' }}>
        {renderVisual()}
      </div>

      {/* Text */}
      <div style={{ width: '100%', maxWidth: 400, textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: '#f9fafb', marginBottom: 10 }}>{title}</div>
        <div style={{ fontSize: 14, fontWeight: 500, color: '#d1d5db', lineHeight: 1.6 }}>{body}</div>
      </div>

      {/* Navigation */}
      <div style={{ width: '100%', maxWidth: 400, display: 'flex', gap: 10 }}>
        {slide > 0 && (
          <button onClick={() => setSlide(s => s - 1)} style={{ flex: 1, padding: '14px 0', borderRadius: 16, border: `2px solid rgba(255,139,61,0.3)`, background: 'none', color: ACC_COLOR, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            ← Précédent
          </button>
        )}
        <button
          onClick={() => slide < TUTO_TOTAL_ACC - 1 ? setSlide(s => s + 1) : onDone({ modeLive })}
          style={{ flex: 2, padding: '14px 0', borderRadius: 16, border: 'none', background: `linear-gradient(135deg,#b45309,${ACC_COLOR})`, color: '#fff', fontSize: 15, fontWeight: 900, cursor: 'pointer', boxShadow: `0 8px 24px rgba(255,139,61,0.35)` }}
        >
          {slide < TUTO_TOTAL_ACC - 1 ? 'Suivant →' : '▶ Commencer !'}
        </button>
      </div>
    </div>
  )
}

function HelpModal({ onTuto, onTour, onClose }) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200 }}/>
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 201, width: 'min(320px, 90vw)',
        background: '#0a0f1a', border: '1.5px solid rgba(255,139,61,0.3)',
        borderRadius: 20, padding: '28px 24px', textAlign: 'center',
      }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: '#f9fafb', marginBottom: 6 }}>Aide</div>
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 24 }}>Comment puis-je t'aider ?</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={onTuto} style={{ padding: '14px 0', borderRadius: 14, border: 'none', background: `linear-gradient(135deg,#b45309,${ACC_COLOR})`, color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
            ▶ Relancer le tutoriel
          </button>
          <button onClick={onTour} style={{ padding: '14px 0', borderRadius: 14, border: `2px solid rgba(255,139,61,0.35)`, background: 'none', color: ACC_COLOR, fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
            Bulles explicatives
          </button>
        </div>
        <button onClick={onClose} style={{ marginTop: 16, background: 'none', border: 'none', color: '#6b7280', fontSize: 12, cursor: 'pointer' }}>Fermer</button>
      </div>
    </>
  )
}

// ─── Info tooltip ───────────────────────────────────────────────────────────────
function InfoTip({ text }) {
  const [show, setShow] = useState(false)
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginTop: 6 }}>
      <button
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        onClick={() => setShow(v => !v)}
        style={{ background: 'none', border: '1px solid #374151', borderRadius: '50%', width: 16, height: 16, padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'auto', flexShrink: 0 }}
        aria-label="Information"
      >
        <svg width="10" height="10" viewBox="0 0 10 10">
          <circle cx="5" cy="5" r="4.5" fill="none" stroke="#6b7280" strokeWidth="1"/>
          <text x="5" y="7.5" textAnchor="middle" fontSize="6.5" fill="#6b7280" fontFamily="serif" fontWeight="bold">i</text>
        </svg>
      </button>
      {show && (
        <span style={{
          position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)',
          background: '#1f2937', color: '#d1d5db', border: '1px solid #374151',
          borderRadius: 6, padding: '4px 8px', fontSize: 10, whiteSpace: 'nowrap',
          zIndex: 100, pointerEvents: 'none', lineHeight: 1.4,
        }}>
          {text}
        </span>
      )}
    </span>
  )
}

// ─── Bouton ─────────────────────────────────────────────────────────────────────
function Btn({ children, onClick, disabled, variant = 'primary', className = '' }) {
  const variants = {
    primary:   'bg-rhythm text-white',
    secondary: 'bg-surface text-rhythm border border-app',
    danger:    'bg-red-900 text-red-300',
    ghost:     'bg-transparent text-app-muted text-xs',
  }
  return (
    <button
      className={`rounded-xl font-bold transition-opacity px-5 py-3 text-sm border-none ${variants[variant]} ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

// ─── Graphe canvas centré sur 0 ─────────────────────────────────────────────────
function GrapheCents({ data, labelX, couleurs, tritoneMask, width = 460, height = 90, title }) {
  const ref = useRef(null)
  const [tooltip, setTooltip] = useState(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !data?.length) return
    const ctx2 = canvas.getContext('2d')
    const W = width, H = height
    ctx2.clearRect(0, 0, W, H)

    ctx2.fillStyle = C_SURFACE
    ctx2.fillRect(0, 0, W, H)

    ctx2.strokeStyle = '#374151'
    ctx2.lineWidth   = 1
    ctx2.setLineDash([4, 4])
    ctx2.beginPath()
    ctx2.moveTo(0, H / 2)
    ctx2.lineTo(W, H / 2)
    ctx2.stroke()
    ctx2.setLineDash([])

    const maxAbs = Math.max(30, ...data.map(d => Math.abs(d.value)))
    const scale  = (H / 2 - 8) / maxAbs

    if (Array.isArray(data[0]?.value)) {
      ctx2.strokeStyle = couleurs?.[0] ?? C_ACCENT
      ctx2.lineWidth   = 1.5
      ctx2.beginPath()
      data.forEach((pt, i) => {
        const x = (i / (data.length - 1)) * W
        const y = H / 2 - pt.value * scale
        i === 0 ? ctx2.moveTo(x, y) : ctx2.lineTo(x, y)
      })
      ctx2.stroke()
    } else {
      const barW = Math.max(8, W / data.length - 4)
      data.forEach((pt, i) => {
        const x    = (i + 0.5) * (W / data.length)
        const barH = Math.abs(pt.value) * scale
        const y    = pt.value >= 0 ? H / 2 - barH : H / 2
        ctx2.fillStyle = couleurs?.[i] ?? C_ACCENT
        ctx2.beginPath()
        ctx2.roundRect?.(x - barW / 2, y, barW, barH || 1, 3) ?? ctx2.rect(x - barW / 2, y, barW, barH || 1)
        ctx2.fill()

        if (tritoneMask?.[i]) {
          ctx2.fillStyle = C_TRITONE
          ctx2.font      = 'bold 11px Inter,sans-serif'
          ctx2.textAlign = 'center'
          const markerY  = pt.value >= 0 ? H / 2 - barH - 10 : H / 2 + barH + 12
          ctx2.fillText('?', x, Math.max(12, Math.min(H - 4, markerY)))
        }

        if (labelX?.[i]) {
          ctx2.fillStyle = C_MUTED2
          ctx2.font      = '9px Inter,sans-serif'
          ctx2.textAlign = 'center'
          ctx2.fillText(labelX[i], x, H - 2)
        }
      })
    }

    if (title) {
      ctx2.fillStyle = C_MUTED
      ctx2.font      = '9px Inter,sans-serif'
      ctx2.textAlign = 'left'
      ctx2.fillText(title, 4, 10)
    }

    ;[-30, -20, -10, 10, 20, 30].forEach(c => {
      const y = H / 2 - c * scale
      if (y < 0 || y > H) return
      ctx2.strokeStyle = '#1f2937'
      ctx2.lineWidth   = 0.5
      ctx2.beginPath()
      ctx2.moveTo(0, y)
      ctx2.lineTo(W, y)
      ctx2.stroke()
      ctx2.fillStyle  = '#374151'
      ctx2.font       = '8px Inter,sans-serif'
      ctx2.textAlign  = 'right'
      ctx2.fillText(`${c > 0 ? '+' : ''}${c}¢`, W - 2, y - 1)
    })
  }, [data, couleurs, labelX, tritoneMask, width, height, title])

  const handleMouseMove = (e) => {
    if (!tritoneMask?.some(Boolean) || !data?.length) { setTooltip(null); return }
    const rect = ref.current.getBoundingClientRect()
    const mouseX = (e.clientX - rect.left) * (width / rect.width)
    const idx = Math.floor(mouseX / (width / data.length))
    if (idx >= 0 && idx < data.length && tritoneMask[idx]) {
      setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    } else {
      setTooltip(null)
    }
  }

  return (
    <div className="relative inline-block">
      <canvas
        ref={ref} width={width} height={height}
        className="rounded-lg block"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
      />
      {tooltip && (
        <div
          className="absolute text-xs rounded-lg pointer-events-none z-10 leading-snug border"
          style={{
            left: tooltip.x + 10, top: Math.max(0, tooltip.y - 38),
            background: '#1f2937', color: '#f9fafb',
            padding: '5px 8px', maxWidth: 210, border: '1px solid #374151',
          }}
        >
          Intervalle ambigu en intonation pure — deux valeurs possibles (±9.8 ¢)
        </div>
      )}
    </div>
  )
}

// ─── VU-mètre arc SVG ────────────────────────────────────────────────────────────
function VuMetre({ cents, seuil }) {
  const CX = 120, CY = 112, R = 90
  const active = cents !== null && cents !== undefined
  const couleur = active ? couleurJustesse(cents, seuil) : '#374151'
  const rotation = active ? (cents / 50) * 90 : 0

  const svgPt = (deg, r) => ({
    x: CX + r * Math.cos(deg * Math.PI / 180),
    y: CY + r * Math.sin(deg * Math.PI / 180),
  })

  // Arc: 180° (left) → 270° (top) → 0° (right), clockwise, sweep=1, large-arc=0
  const arcPath = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`

  const ticks = [-50, -30, -20, -10, 0, 10, 20, 30, 50]

  return (
    <svg viewBox="0 0 240 130" style={{ width: '100%', maxWidth: 260, display: 'block', margin: '0 auto' }}>
      <path d={arcPath} fill="none" stroke="#1f2937" strokeWidth="10" strokeLinecap="round" />
      {ticks.map(c => {
        // -50¢ → SVG 180°, 0¢ → SVG 270° (top), +50¢ → SVG 0°/360°
        const angle = (270 + (c / 50) * 90 + 360) % 360
        const outer = svgPt(angle, R)
        const inner = svgPt(angle, R - (c === 0 || Math.abs(c) === 50 ? 14 : 8))
        return (
          <line key={c}
            x1={outer.x.toFixed(2)} y1={outer.y.toFixed(2)}
            x2={inner.x.toFixed(2)} y2={inner.y.toFixed(2)}
            stroke={c === 0 ? '#6b7280' : '#374151'} strokeWidth={c === 0 ? 1.5 : 1}
          />
        )
      })}
      <g transform={`rotate(${rotation}, ${CX}, ${CY})`} style={{ transition: 'transform 0.08s ease-out' }}>
        <line x1={CX} y1={CY} x2={CX} y2={CY - R + 10} stroke={couleur} strokeWidth="2.5" strokeLinecap="round" />
      </g>
      <circle cx={CX} cy={CY} r="6" fill="#374151" />
      <text x={CX - R - 6} y={CY + 16} fontSize="9" fill="#4b5563" textAnchor="middle">-50¢</text>
      <text x={CX} y={CY - R - 6} fontSize="9" fill="#4b5563" textAnchor="middle">0</text>
      <text x={CX + R + 6} y={CY + 16} fontSize="9" fill="#4b5563" textAnchor="middle">+50¢</text>
    </svg>
  )
}

// ─── Knob tempérament ────────────────────────────────────────────────────────────
function TemperamentKnob({ label, value, onChange, disabled = false }) {
  const SIZE = 64
  const STROKE = 6
  const R = (SIZE - STROKE) / 2
  const CX = SIZE / 2
  const CY = SIZE / 2
  const MIN_VAL = -50
  const MAX_VAL = 50
  const START_ANGLE = 225   // degrés depuis 3h (axe x+), sens horaire
  const SWEEP = 270         // degrés total

  const valToAngle = v => START_ANGLE + ((v - MIN_VAL) / (MAX_VAL - MIN_VAL)) * SWEEP

  const polarToXY = (angleDeg, r) => {
    const rad = (angleDeg - 90) * Math.PI / 180
    return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) }
  }

  const arcPath = (a1, a2, r) => {
    const p1 = polarToXY(a1, r)
    const p2 = polarToXY(a2, r)
    const large = (a2 - a1 + 360) % 360 > 180 ? 1 : 0
    return `M ${p1.x} ${p1.y} A ${r} ${r} 0 ${large} 1 ${p2.x} ${p2.y}`
  }

  const angle = valToAngle(value)
  const trackPath = arcPath(START_ANGLE, START_ANGLE + SWEEP, R)
  const fillPath  = arcPath(START_ANGLE, angle, R)

  const dragRef = useRef(null)
  const [editing, setEditing] = useState(false)
  const [inputVal, setInputVal] = useState('')

  const onPointerDown = e => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startY: e.clientY, startVal: value }
  }
  const onPointerMove = e => {
    if (!dragRef.current) return
    const delta = (dragRef.current.startY - e.clientY) * 0.4
    const next = Math.max(MIN_VAL, Math.min(MAX_VAL, dragRef.current.startVal + delta))
    onChange(Math.round(next * 10) / 10)
  }
  const onPointerUp = () => { dragRef.current = null }

  const commitInput = () => {
    const n = parseFloat(inputVal)
    if (!isNaN(n)) onChange(Math.max(MIN_VAL, Math.min(MAX_VAL, Math.round(n * 10) / 10)))
    setEditing(false)
  }

  const accent = disabled ? '#4b5563' : value === 0 ? '#9ca3af' : '#FF8B3D'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, opacity: disabled ? 0.45 : 1 }}>
      {/* SVG knob */}
      <svg
        width={SIZE} height={SIZE}
        style={{ cursor: disabled ? 'default' : 'ns-resize', touchAction: 'none', userSelect: 'none' }}
        onPointerDown={disabled ? undefined : onPointerDown}
        onPointerMove={disabled ? undefined : onPointerMove}
        onPointerUp={disabled ? undefined : onPointerUp}
        onPointerCancel={disabled ? undefined : onPointerUp}
      >
        <path d={trackPath} fill="none" stroke="#1e293b" strokeWidth={STROKE} strokeLinecap="round" />
        {value !== 0 && !disabled && <path d={fillPath} fill="none" stroke={accent} strokeWidth={STROKE} strokeLinecap="round" />}
        {(() => { const p = polarToXY(angle, R); return <circle cx={p.x} cy={p.y} r={STROKE / 2 + 1} fill={accent} /> })()}
        <circle cx={CX} cy={CY} r={R - STROKE - 4} fill="#0a0f1a" />
      </svg>
      {/* Cadre numérique */}
      {!disabled && editing ? (
        <input
          autoFocus
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onBlur={commitInput}
          onKeyDown={e => { if (e.key === 'Enter') commitInput(); if (e.key === 'Escape') setEditing(false) }}
          style={{
            width: 56, textAlign: 'center', fontSize: 11, fontWeight: 700,
            background: '#0a0f1a', color: '#f9fafb', border: '1px solid #FF8B3D',
            borderRadius: 4, padding: '2px 4px', outline: 'none',
          }}
        />
      ) : (
        <button
          onClick={disabled ? undefined : () => { setInputVal(value.toFixed(1)); setEditing(true) }}
          style={{
            width: 56, textAlign: 'center', fontSize: 11, fontWeight: 700,
            background: '#0a0f1a', color: accent,
            border: `1px solid ${disabled ? '#1e293b' : value === 0 ? '#374151' : '#FF8B3D'}`,
            borderRadius: 4, padding: '2px 4px', cursor: disabled ? 'default' : 'text',
            minHeight: 'auto',
          }}
        >
          {value > 0 ? '+' : ''}{value.toFixed(1)}¢
        </button>
      )}
      <span style={{ fontSize: 9, color: '#d1d5db', textAlign: 'center', lineHeight: 1.2, maxWidth: 64 }}>
        {label}
      </span>
    </div>
  )
}

// ─── Composant principal ─────────────────────────────────────────────────────────
export default function AccordeurPage() {
  const [searchParams] = useSearchParams()

  const [diapason,    setDiapason]    = useState(() => { const v = parseFloat(localStorage.getItem('acc_diapason')); return isNaN(v) ? DIAPASON_DEFAULT : v })
  const [transpoKey,  setTranspoKey]  = useState(() => localStorage.getItem('acc_transpo') || 'C')
  const [referentiel, setReferentiel] = useState(() => localStorage.getItem('acc_ref') || '5-limite')
  const [seuil,       setSeuil]       = useState(() => { const v = parseInt(localStorage.getItem('acc_seuil')); return isNaN(v) ? SEUIL_DEFAULT : v })
  const [structureId, setStructureId] = useState(null)

  const [silenceDurationMs, setSilenceDurationMs] = useState(() => { const v = parseInt(localStorage.getItem('acc_silence')); return isNaN(v) ? SILENCE_MS_DEFAULT : v })
  const [noteJumpCents,     setNoteJumpCents]     = useState(() => { const v = parseInt(localStorage.getItem('acc_noteJump')); return isNaN(v) ? NOTE_JUMP_CENTS_DEFAULT : v })
  const [clarityThreshold,  setClarityThreshold]  = useState(() => { const v = parseFloat(localStorage.getItem('acc_clarity')); return isNaN(v) ? 0.82 : v })
  const [gateLevel,         setGateLevel]         = useState(() => { const v = parseFloat(localStorage.getItem('acc_gate')); return isNaN(v) ? 0.02 : v })
  const gateLevelRef = useRef(0.02)

  const [modeLive,    setModeLive]   = useState(true)
  const [liveNote,    setLiveNote]   = useState(null)
  const [liveActive,  setLiveActive] = useState(false)
  const liveStreamRef   = useRef(null)
  const liveAudioCtxRef = useRef(null)
  const liveAnalyserRef = useRef(null)
  const liveRafRef      = useRef(null)
  const liveDetectorRef = useRef(null)
  const liveParamsRef   = useRef({})

  const [ouvertPanel,     setOuvertPanel]     = useState(null)
  const generatorPcsRef = useRef(new Set())

  const [showSpectre,    setShowSpectre]    = useState(false)
  const spectreAnalyserRef = useRef(null)
  const spectreParNoteRef  = useRef(null)
  const liveHzRef          = useRef(null)

  const [phase,  setPhase]  = useState('pret')
  const serieRef        = useRef([])
  const audioBufferRef  = useRef(null)
  const [notes,  setNotes]  = useState([])
  const [courbe, setCourbe] = useState([])
  const [scoreP, setScoreP] = useState(null)
  const [scoreQ, setScoreQ] = useState(null)
  const [erreur, setErreur] = useState(null)

  const [dirty,      setDirty]      = useState(false)
  const [vue,        setVue]        = useState('portee')
  const [showCourbe, setShowCourbe] = useState(true)
  const [showBarres, setShowBarres] = useState(true)
  const [showSigma,  setShowSigma]  = useState(true)

  const [structures,    setStructures]    = useState(() => lireStructures())
  const [showStructMgr, setShowStructMgr] = useState(false)
  const [newStructNom,  setNewStructNom]  = useState('')
  const [newStructRows, setNewStructRows] = useState([{ indexNote: 1, tonique: 'Do' }])

  const [sessions,     setSessions]    = useState(() => lireSessions())
  const [showReglages, setShowReglages] = useState(false)
  const [warnRef,      setWarnRef]      = useState(false)
  const [showTutorial, setShowTutorial] = useState(() => { try { return !localStorage.getItem(ACC_TUTO_KEY) } catch { return true } })
  const [showConsigne, setShowConsigne] = useState(() => !consigneSeen('accordeur')) // consigne d'arrivée (après le tuto)
  const [showHelp,     setShowHelp]     = useState(false)
  const [showTour,     setShowTour]     = useState(false)
  const warnRefTimer = useRef(null)

  const [userTemperament, setUserTemperament] = useState(() => {
    try { const v = JSON.parse(localStorage.getItem(USER_TEMP_KEY)); return Array.isArray(v) && v.length === 12 ? v : TEMPERAMENT_TEMPERE.slice() } catch { return TEMPERAMENT_TEMPERE.slice() }
  })
  const [userPresets, setUserPresets] = useState(() => {
    try { return JSON.parse(localStorage.getItem(USER_PRESETS_KEY)) || [] } catch { return [] }
  })
  const [newPresetNom, setNewPresetNom] = useState('')
  const [importStr,    setImportStr]    = useState('')

  // ── Samples ──
  const [instrument,     setInstrument]     = useState(() => localStorage.getItem('accordeur_instrument_preference') || 'flute')
  const [sampleMap,      setSampleMap]      = useState(null)
  const [sampleLoadPct,  setSampleLoadPct]  = useState(0)
  const [sampleLoading,  setSampleLoading]  = useState(false)
  const [sampleError,    setSampleError]    = useState(false)

  // Enregistrement brut (Blob MediaRecorder, éphémère)
  const recordingBlobRef    = useRef(null)
  const reecouteAudioRef    = useRef(null)
  const [hasRecordingBlob,  setHasRecordingBlob] = useState(false)
  const [isReplaying,       setIsReplaying]       = useState(false)

  // Version juste
  const [versionJustePlaying, setVersionJustePlaying] = useState(false)
  const stopVersionJusteRef   = useRef(null)

  const mediaRecorderRef = useRef(null)
  const chunksRef        = useRef([])
  const streamRef        = useRef(null)
  const vuRef            = useRef(null)
  const animRef          = useRef(null)
  const analyserRef      = useRef(null)

  useEffect(() => {
    const s = searchParams.get('s')
    if (!s) return
    const struct = urlVersStructure(s)
    sauvegarderStructure(struct)
    setStructures(lireStructures())
    setStructureId(struct.id)
  }, [])

  useEffect(() => {
    const t = searchParams.get('t')
    if (!t) return
    try {
      const offsets = JSON.parse(atob(t))
      if (Array.isArray(offsets) && offsets.length === 12) {
        setUserTemperament(offsets)
        setReferentiel('utilisateur')
      }
    } catch {}
  }, [])

  const recalculer = useCallback(() => {
    if (!audioBufferRef.current) return
    const s = analyserBuffer(audioBufferRef.current, { clarityThreshold, rmsGate: gateLevel })
    serieRef.current = s
    const struct    = [...DEFAULT_STRUCTURES, ...structures].find(x => x.id === structureId)
    const tonikMidi = struct ? (noteNameToPC(struct.toniques[0]?.tonique ?? 'Do') + 60) : 60
    const segs      = segmenter(s, diapason, { silenceDurationMs, noteJumpCents })
    const notesCalc = calculerEcarts(segs, referentiel, tonikMidi, diapason, userTemperament)
    const courbeB   = courbebrute(s, referentiel, tonikMidi, diapason, userTemperament)
    setNotes(notesCalc)
    setCourbe(courbeB)
    setScoreP(scorePedagogique(notesCalc, seuil))
    setScoreQ(scoreQualite(notesCalc))
    setDirty(false)
  }, [clarityThreshold, gateLevel, referentiel, seuil, silenceDurationMs, noteJumpCents, diapason, structureId, structures, userTemperament])

  useEffect(() => {
    if (!audioBufferRef.current) return
    setDirty(true)
  }, [clarityThreshold, gateLevel, referentiel, seuil, silenceDurationMs, noteJumpCents, diapason, structureId, structures, userTemperament])

  useEffect(() => {
    const struct = [...DEFAULT_STRUCTURES, ...structures].find(x => x.id === structureId)
    const tonicConcertName = struct?.toniques?.[0]?.tonique ?? 'Do'
    const tonicConcertPC   = noteNameToPC(tonicConcertName)
    const transpoOffset    = TRANSPOSITIONS[transpoKey]?.offset ?? 0
    const tonicDisplayPC   = ((tonicConcertPC + transpoOffset) % 12 + 12) % 12
    liveParamsRef.current = {
      diapason, referentiel, clarityThreshold, gateLevel, transpoOffset,
      enharmonicScale: buildEnharmonicScale(NOTE_NAMES_FR[tonicDisplayPC]),
      tonikMidi: struct ? (tonicConcertPC + 60) : null,
      userTemperament,
    }
  }, [diapason, referentiel, clarityThreshold, gateLevel, structureId, structures, transpoKey, userTemperament])

  useEffect(() => {
    localStorage.setItem('accordeur_instrument_preference', instrument)
    setSampleMap(null)
    setSampleError(false)
    setSampleLoadPct(0)
    setSampleLoading(true)
    loadInstrumentSamples(instrument, p => setSampleLoadPct(p))
      .then(map => {
        setSampleMap(map)
        setSampleLoading(false)
        if (!isOscillatorInstrument(instrument) && map.size === 0) setSampleError(true)
      })
      .catch(() => { setSampleLoading(false); setSampleError(true) })
  }, [instrument])

  // Stopper version juste si le référentiel change
  useEffect(() => { stopVersionJusteRef.current?.() }, [referentiel])

  // Cleanup version juste au démontage
  useEffect(() => () => stopVersionJusteRef.current?.(), [])

  useEffect(() => { localStorage.setItem('acc_diapason', diapason) }, [diapason])
  useEffect(() => { localStorage.setItem('acc_transpo',  transpoKey) }, [transpoKey])
  useEffect(() => { localStorage.setItem('acc_ref',      referentiel) }, [referentiel])
  useEffect(() => { localStorage.setItem(USER_TEMP_KEY,    JSON.stringify(userTemperament)) }, [userTemperament])
  useEffect(() => { localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(userPresets)) }, [userPresets])
  useEffect(() => { localStorage.setItem('acc_seuil',    seuil) }, [seuil])
  useEffect(() => { localStorage.setItem('acc_silence',  silenceDurationMs) }, [silenceDurationMs])
  useEffect(() => { localStorage.setItem('acc_noteJump', noteJumpCents) }, [noteJumpCents])
  useEffect(() => { localStorage.setItem('acc_clarity',  clarityThreshold) }, [clarityThreshold])
  useEffect(() => { localStorage.setItem('acc_gate',     gateLevel) }, [gateLevel])

  useEffect(() => {
    demarrerLive()
    return () => arreterLive()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const demarrerEnregistrement = useCallback(async () => {
    setErreur(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false })
      streamRef.current = stream
      const audioCtx  = new AudioContext()
      const source    = audioCtx.createMediaStreamSource(stream)
      const analyser  = audioCtx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = { analyser, audioCtx }

      const VU_SCALE = 5
      const drawVU = () => {
        animRef.current = requestAnimationFrame(drawVU)
        const canvas = vuRef.current
        if (!canvas) return
        const ctx2  = canvas.getContext('2d')
        const data  = new Uint8Array(analyser.fftSize)
        analyser.getByteTimeDomainData(data)
        let sum = 0
        for (let k = 0; k < data.length; k++) { const s = (data[k] - 128) / 128; sum += s * s }
        const rms  = Math.sqrt(sum / data.length)
        const W    = canvas.width, H = canvas.height
        ctx2.clearRect(0, 0, W, H)
        ctx2.fillStyle = C_SURFACE
        ctx2.fillRect(0, 0, W, H)
        const barW = Math.min(rms * VU_SCALE * W, W)
        const grad = ctx2.createLinearGradient(0, 0, W, 0)
        grad.addColorStop(0,   '#34d399')
        grad.addColorStop(0.6, '#fbbf24')
        grad.addColorStop(1,   '#f87171')
        ctx2.fillStyle = grad
        ctx2.fillRect(0, 0, barW, H)
        const gateX = Math.min(gateLevelRef.current * VU_SCALE * W, W - 1)
        ctx2.strokeStyle = '#f9fafb'
        ctx2.lineWidth   = 1.5
        ctx2.setLineDash([3, 3])
        ctx2.beginPath()
        ctx2.moveTo(gateX, 0)
        ctx2.lineTo(gateX, H)
        ctx2.stroke()
        ctx2.setLineDash([])
      }
      drawVU()

      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.start()
      mediaRecorderRef.current = recorder
      setPhase('enregistrement')
    } catch (e) {
      setErreur('Microphone inaccessible : ' + e.message)
    }
  }, [])

  const arreterEnregistrement = useCallback(async () => {
    setPhase('analyse')
    cancelAnimationFrame(animRef.current)
    const recorder = mediaRecorderRef.current
    const stream   = streamRef.current
    const { audioCtx } = analyserRef.current ?? {}
    await new Promise(resolve => { recorder.onstop = resolve; recorder.stop() })
    stream.getTracks().forEach(t => t.stop())
    audioCtx?.close()

    const blob       = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
    recordingBlobRef.current = blob
    setHasRecordingBlob(true)
    const arrayBuf   = await blob.arrayBuffer()
    const decodeCtx  = new AudioContext()
    let audioBuffer
    try {
      audioBuffer = await decodeCtx.decodeAudioData(arrayBuf)
    } catch (e) {
      setErreur('Décodage audio échoué : ' + e.message)
      setPhase('pret')
      decodeCtx.close()
      return
    }
    decodeCtx.close()

    const serieCalc = analyserBuffer(audioBuffer, { clarityThreshold, rmsGate: gateLevel })
    const struct    = [...DEFAULT_STRUCTURES, ...structures].find(s => s.id === structureId)
    const tonikMidi = struct ? (noteNameToPC(struct.toniques[0]?.tonique ?? 'Do') + 60) : 60
    const segments  = segmenter(serieCalc, diapason, { silenceDurationMs, noteJumpCents })
    const notesAv   = calculerEcarts(segments, referentiel, tonikMidi, diapason, userTemperament)
    const courbeB   = courbebrute(serieCalc, referentiel, tonikMidi, diapason, userTemperament)

    audioBufferRef.current = audioBuffer
    serieRef.current = serieCalc
    spectreParNoteRef.current = computeSpectreParNote(audioBuffer, notesAv)
    setNotes(notesAv)
    setCourbe(courbeB)
    setScoreP(scorePedagogique(notesAv, seuil))
    setScoreQ(scoreQualite(notesAv))
    setDirty(false)
    setPhase('resultats')
  }, [structures, structureId, referentiel, diapason, seuil, silenceDurationMs, noteJumpCents, clarityThreshold, gateLevel])

  const demarrerLive = useCallback(async () => {
    setErreur(null)
    try {
      const stream   = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false })
      liveStreamRef.current = stream
      const audioCtx = new AudioContext()
      liveAudioCtxRef.current = audioCtx
      const source   = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 2048
      source.connect(analyser)
      liveAnalyserRef.current = analyser
      liveDetectorRef.current = PitchDetector.forFloat32Array(2048)

      const spectreAnalyser = audioCtx.createAnalyser()
      spectreAnalyser.fftSize = 4096
      source.connect(spectreAnalyser)
      spectreAnalyserRef.current = spectreAnalyser

      const buf = new Float32Array(2048)
      let lastUpdate = 0
      const loop = () => {
        liveRafRef.current = requestAnimationFrame(loop)
        const now = performance.now()
        if (now - lastUpdate < 100) return
        lastUpdate = now
        analyser.getFloatTimeDomainData(buf)
        const { diapason: d, referentiel: r, clarityThreshold: ct, gateLevel: gl, tonikMidi, transpoOffset: tOff, enharmonicScale: scale, userTemperament: uTemp } = liveParamsRef.current
        const rms = frameRMS(buf)
        if (rms < gl) return
        const emp = preEmphasis(buf)
        const [hz, clarity] = liveDetectorRef.current.findPitch(emp, audioCtx.sampleRate)
        if (clarity < ct || hz < HZ_MIN || hz > HZ_MAX) return
        const midi        = Math.round(hzToMidi(hz, d))
        const pcRaw = ((midi % 12) + 12) % 12
        if (generatorPcsRef.current?.size && generatorPcsRef.current.has(pcRaw)) return
        const midiDisplay = midi + (tOff ?? 0)
        const pc          = ((midiDisplay % 12) + 12) % 12
        const octave      = Math.floor(midiDisplay / 12) - 1
        const nom         = scale?.[pc] ?? midiToNoteName(midi).name
        const muCents = tonikMidi !== null && r === '5-limite'
          ? centsCinqLimite(hz, tonikMidi, d)
          : tonikMidi !== null && r === 'utilisateur'
            ? centsUtilisateur(hz, tonikMidi, d, uTemp)
            : centsTempere(hz, d)
        liveHzRef.current = hz
        setLiveNote({ nom, octave, muCents })
      }
      loop()
      setLiveActive(true)
    } catch (e) {
      setErreur('Microphone inaccessible : ' + e.message)
    }
  }, [])

  const arreterLive = useCallback(() => {
    cancelAnimationFrame(liveRafRef.current)
    liveStreamRef.current?.getTracks().forEach(t => t.stop())
    liveAudioCtxRef.current?.close()
    spectreAnalyserRef.current = null
    liveHzRef.current = null
    setLiveActive(false)
    setLiveNote(null)
  }, [])

  const basculerMode = useCallback((live) => {
    if (!live) arreterLive()
    setModeLive(live)
  }, [arreterLive])

  const chargerFichier = useCallback(async (file) => {
    if (!file) return
    setErreur(null)
    setPhase('analyse')
    try {
      const arrayBuf  = await file.arrayBuffer()
      const decodeCtx = new AudioContext()
      let audioBuffer
      try {
        audioBuffer = await decodeCtx.decodeAudioData(arrayBuf)
      } catch (e) {
        setErreur('Format audio non supporté : ' + e.message)
        setPhase('pret')
        decodeCtx.close()
        return
      }
      decodeCtx.close()

      const struct    = [...DEFAULT_STRUCTURES, ...structures].find(s => s.id === structureId)
      const tonikMidi = struct ? (noteNameToPC(struct.toniques[0]?.tonique ?? 'Do') + 60) : 60
      const serieCalc = analyserBuffer(audioBuffer, { clarityThreshold, rmsGate: gateLevel })
      const segments  = segmenter(serieCalc, diapason, { silenceDurationMs, noteJumpCents })
      const notesAv   = calculerEcarts(segments, referentiel, tonikMidi, diapason, userTemperament)
      const courbeB   = courbebrute(serieCalc, referentiel, tonikMidi, diapason, userTemperament)

      audioBufferRef.current = audioBuffer
      serieRef.current = serieCalc
      setNotes(notesAv)
      setCourbe(courbeB)
      setScoreP(scorePedagogique(notesAv, seuil))
      setScoreQ(scoreQualite(notesAv))
      setDirty(false)
      setPhase('resultats')
    } catch (e) {
      setErreur('Erreur lecture fichier : ' + e.message)
      setPhase('pret')
    }
  }, [structures, structureId, referentiel, diapason, seuil, silenceDurationMs, noteJumpCents, clarityThreshold, gateLevel])

  const sauvegarderResultats = useCallback(() => {
    const struct = structures.find(s => s.id === structureId)
    const session = {
      id: uuid(), date: new Date().toISOString(),
      structureId: structureId ?? null, structureNom: struct?.nom ?? '—',
      referentiel, diapason, seuilCents: seuil,
      scoreNotes: scoreP?.label ?? '—', scoreQualite: scoreQ ?? 0,
      notes: notes.map(n => ({
        nom: n.nom, octave: n.octave, debutMs: n.debutMs, finMs: n.finMs,
        muCents: parseFloat(n.muCents.toFixed(2)), sigmaCents: parseFloat(n.sigmaCents.toFixed(2)),
      })),
      courbeBreute: courbe.slice(0, 500),
    }
    sauvegarderSession(session)
    setSessions(lireSessions())
  }, [notes, courbe, scoreP, scoreQ, structureId, structures, referentiel, diapason, seuil])

  const ajouterStructure = useCallback(() => {
    if (!newStructNom.trim()) return
    const s = { id: uuid(), nom: newStructNom.trim(), toniques: newStructRows, createdAt: new Date().toISOString(), public: true }
    sauvegarderStructure(s)
    setStructures(lireStructures())
    setNewStructNom('')
    setNewStructRows([{ indexNote: 1, tonique: 'Do' }])
  }, [newStructNom, newStructRows])

  const supprimerStruct = useCallback(id => {
    supprimerStructure(id)
    setStructures(lireStructures())
    if (structureId === id) setStructureId(null)
  }, [structureId])

  const _tonicStruct      = structureId ? [...DEFAULT_STRUCTURES, ...structures].find(s => s.id === structureId) : null
  const _tonicConcertName = _tonicStruct?.toniques?.[0]?.tonique ?? 'Do'
  const _tonicConcertPC   = noteNameToPC(_tonicConcertName)
  const _transpoOffset    = TRANSPOSITIONS[transpoKey]?.offset ?? 0
  const _tonicDisplayPC   = ((_tonicConcertPC + _transpoOffset) % 12 + 12) % 12
  const _tonicDisplayName = NOTE_NAMES_FR[_tonicDisplayPC]
  const enharmonicScale   = buildEnharmonicScale(_tonicDisplayName)

  const couleurs = notes.map(n => couleurJustesse(n.muCents, seuil))
  const labelsX  = notes.map(n => {
    const midiDisp = n.midiCible + _transpoOffset
    const pc       = ((midiDisp % 12) + 12) % 12
    const oct      = Math.floor(midiDisp / 12) - 1
    return `${enharmonicScale[pc]}${oct}`
  })
  const dataBarres = notes.map((n, i) => ({ value: n.muCents, label: labelsX[i] }))
  const dataSigma  = notes.map((n, i) => ({ value: n.sigmaCents, label: labelsX[i] }))
  const dataCourbe = courbe.map(p => ({ value: p.cents }))

  const muMoyen    = notes.length ? (notes.reduce((a, n) => a + n.muCents, 0) / notes.length).toFixed(1) : null
  const sigmaMoyen = notes.length ? (notes.reduce((a, n) => a + n.sigmaCents, 0) / notes.length).toFixed(1) : null

  function handleTutorialDone({ modeLive: ml } = {}) {
    try { localStorage.setItem(ACC_TUTO_KEY, '1') } catch {}
    setShowTutorial(false)
    if (ml !== undefined) basculerMode(ml)
    setInstrument('oscillator')
    localStorage.setItem('accordeur_instrument_preference', 'oscillator')
  }

  const ACC_TOUR_STEPS = [
    { tourId: 'toggle-mode',    title: 'Mode Live / Enregistrement', desc: 'Bascule entre l\'écoute en temps réel et l\'enregistrement d\'une phrase complète.' },
    { tourId: 'struct-ref',     title: 'Structure & référentiel',     desc: 'Sélectionne une tonique puis le référentiel — Tempéré, Harmonique ou Utilisateur.' },
    { tourId: 'lien-generateur',title: 'Générateur d\'accords',      desc: 'Écoute un accord de référence avec différents instruments et intonations.' },
    { tourId: 'btn-reglages',   title: 'Réglages',                   desc: 'Diapason, transposition, seuil de justesse, historique des sessions et tempéraments.' },
  ]

  const transpoNom = (nom) => {
    const idx = noteNameToPC(nom)
    const offset = TRANSPOSITIONS[transpoKey]?.offset ?? 0
    if (offset === 0) return nom
    return NOTE_NAMES_FR[((idx + offset) % 12 + 12) % 12]
  }

  const _selectedStruct = structureId ? [...DEFAULT_STRUCTURES, ...structures].find(s => s.id === structureId) : null
  const urlStructure = _selectedStruct && !_selectedStruct.readOnly
    ? `${window.location.origin}/accordeur?s=${structureVersURL(_selectedStruct)}`
    : null

  const inputCls = "w-full rounded-lg px-2.5 py-1.5 text-sm text-app border border-app bg-app outline-none"

  return (
    <div className="bg-app min-h-dvh flex flex-col items-center px-4 py-5">
      <div className="w-full max-w-xl">

        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-5">
          <Link to="/" className="bg-surface border border-app rounded-lg px-3 py-1.5 text-xs font-bold no-underline text-app">
            ← Tessitura
          </Link>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold m-0" style={{ color: '#FF8B3D' }}>Accordeur</h2>
            <Link
              to="/accordeur/generateur"
              title="Générateur d'accord"
              className="flex items-center justify-center rounded-lg border border-app bg-surface no-underline"
              style={{ width: 32, height: 32, color: '#FF8B3D' }}
            >
              <svg width="18" height="20" viewBox="0 0 20 22" fill="none">
                {[3, 8, 13, 18].map(x => (
                  <line key={x} x1={x} y1="1" x2={x} y2="21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                ))}
                {[5, 10, 15, 20].map(y => (
                  <line key={y} x1="1" y1={y} x2="20" y2={y} stroke="currentColor" strokeWidth="1.5" />
                ))}
                <circle cx="3" cy="7.5" r="2.5" fill="currentColor" />
                <circle cx="8" cy="12.5" r="2.5" fill="currentColor" />
                <circle cx="13" cy="7.5" r="2.5" fill="currentColor" />
                <circle cx="18" cy="2.5" r="2.5" fill="currentColor" />
              </svg>
            </Link>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setShowHelp(true)}
              title="Aide"
              data-tour="btn-aide"
              className="flex items-center justify-center rounded-lg border border-app bg-surface cursor-pointer"
              style={{ width: 32, height: 32, color: 'var(--text-muted)', fontWeight: 700, fontSize: 15 }}
            >?</button>
            <button
              onClick={() => setShowReglages(v => !v)}
              title="Réglages"
              data-tour="btn-reglages"
              className="flex items-center justify-center rounded-lg border border-app bg-surface cursor-pointer transition-opacity"
              style={{ width: 32, height: 32, color: 'var(--text-muted)', background: showReglages ? 'var(--surface-2)' : undefined }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
          </div>
        </div>

        {/* ── Drawer Réglages (overlay) ── */}
        {showReglages && (
          <>
            <div
              onClick={() => setShowReglages(false)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 40 }}
            />
            <div style={{
              position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 50,
              width: 'min(420px, 94vw)',
              background: 'var(--bg)', borderLeft: '1px solid var(--border-c)',
              overflowY: 'auto', padding: '20px 16px',
            }}>
              {/* Titre + fermer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>Réglages</span>
                <button
                  onClick={() => setShowReglages(false)}
                  className="bg-transparent border-none cursor-pointer text-app-muted text-xl"
                  style={{ lineHeight: 1 }}
                >✕</button>
              </div>

              {/* ── Suivi sessions ── */}
              <details open className="mb-4">
                <summary className="cursor-pointer text-xs font-semibold text-app-muted mb-2 list-none flex items-center gap-1">
                  Suivi des sessions
                </summary>
                <div className="mt-2">
                  {sessions.length === 0
                    ? <p className="text-app-muted text-xs">Aucune session sauvegardée.</p>
                    : (
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-xs">
                          <thead>
                            <tr className="text-app-muted border-b border-app">
                              {['Date', 'Structure', 'Notes', 'Qualité', 'Réf.', 'Seuil', ''].map(h => (
                                <th key={h} className="px-1 py-1 text-left font-semibold">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {[...sessions].reverse().map(s => (
                              <tr key={s.id} className="border-b border-app">
                                <td className="px-1 py-1.5 text-app-muted">{new Date(s.date).toLocaleDateString('fr')}</td>
                                <td className="px-1 py-1.5 text-app">{s.structureNom}</td>
                                <td className="px-1 py-1.5 text-success">{s.scoreNotes}</td>
                                <td className="px-1 py-1.5 text-pitch">{s.scoreQualite}%</td>
                                <td className="px-1 py-1.5 text-app-muted">{s.referentiel}</td>
                                <td className="px-1 py-1.5 text-app-muted">±{s.seuilCents}¢</td>
                                <td className="px-1 py-1.5">
                                  <button onClick={() => { supprimerSession(s.id); setSessions(lireSessions()) }}
                                    className="bg-transparent border-none text-red-400 cursor-pointer text-sm" style={{ minHeight: 'auto' }}>×</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                </div>
              </details>

              <hr style={{ border: 'none', borderTop: '1px solid var(--border-c)', margin: '16px 0' }} />

              {/* ── Réglages accord ── */}
              <details className="mb-4">
                <summary className="cursor-pointer text-xs font-semibold text-app-muted list-none mb-2">Réglages accord</summary>
                <div className="mt-2">
                  <div className="flex gap-2.5 items-end">
                    <label className="text-xs text-app-muted flex-none">
                      Diapason
                      <div className="flex items-center gap-1 mt-1">
                        <input type="number" min="400" max="480" step="0.1" value={diapason}
                          onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) setDiapason(v) }}
                          className="w-16 bg-app text-app border border-app rounded-md px-2 py-1.5 text-sm font-bold" />
                        <span className="text-app-muted text-xs">Hz</span>
                      </div>
                    </label>
                    <label className="text-xs text-app-muted flex-1">
                      Transposition
                      <select value={transpoKey} onChange={e => setTranspoKey(e.target.value)}
                        className="block mt-1 w-full bg-app text-app border border-app rounded-md px-2 py-1.5 text-xs">
                        {Object.entries(TRANSPOSITIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                    </label>
                    <label className="text-xs text-app-muted flex-none">
                      Seuil justesse
                      <div className="flex items-center gap-1 mt-1">
                        <input type="number" min="1" max="50" step="1" value={seuil}
                          onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v)) setSeuil(v) }}
                          className="w-12 bg-app text-app border border-app rounded-md px-2 py-1.5 text-sm font-bold" />
                        <span className="text-app-muted text-xs">¢</span>
                      </div>
                    </label>
                  </div>
                </div>
              </details>

              {/* ── Réglages segmentation ── */}
              <details className="mb-4">
                <summary className="cursor-pointer text-xs font-semibold text-app-muted list-none mb-2">Réglages segmentation</summary>
                <div className="mt-2">
                  <div className="flex gap-2.5 items-end mb-3">
                    {[
                      { label: 'Silence', val: silenceDurationMs, set: setSilenceDurationMs, min: 20, max: 300, step: 5, unit: 'ms', type: 'int' },
                      { label: 'Saut note', val: noteJumpCents, set: setNoteJumpCents, min: 20, max: 200, step: 5, unit: '¢', type: 'int' },
                      { label: 'Gate RMS', val: gateLevel, set: (v) => { setGateLevel(v); gateLevelRef.current = v }, min: 0, max: 0.15, step: 0.005, unit: '', type: 'float' },
                    ].map(({ label, val, set, min, max, step, unit, type }) => (
                      <label key={label} className="text-xs text-app-muted flex-1">
                        {label}
                        <div className="flex items-center gap-1 mt-1">
                          <input type="number" min={min} max={max} step={step} value={val}
                            onChange={e => { const v = type === 'int' ? parseInt(e.target.value) : parseFloat(e.target.value); if (!isNaN(v)) set(v) }}
                            className="w-full bg-app text-app border border-app rounded-md px-2 py-1.5 text-sm font-bold" />
                          {unit && <span className="text-app-muted text-xs whitespace-nowrap">{unit}</span>}
                        </div>
                      </label>
                    ))}
                  </div>
                  <label className="text-xs text-app-muted">
                    Seuil clarté
                    <div className="flex items-center gap-2 mt-1">
                      <input type="range" min="0.5" max="1.0" step="0.01" value={clarityThreshold}
                        onChange={e => setClarityThreshold(Number(e.target.value))}
                        className="flex-1" style={{ accentColor: '#FF8B3D' }} />
                      <span className="text-app font-bold min-w-9">{clarityThreshold.toFixed(2)}</span>
                    </div>
                    <div className="text-app-muted text-[10px] mt-0.5">Haut = moins de faux positifs</div>
                  </label>
                  {phase === 'resultats' && (
                    <InfoTip text="Modification active le bouton ↻ Recalculer sur la portée." />
                  )}
                </div>
              </details>

              <hr style={{ border: 'none', borderTop: '1px solid var(--border-c)', margin: '16px 0' }} />

              {/* ── Tempérament utilisateur ── */}
              <details>
                <summary style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', cursor: 'pointer', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" style={{ transition: 'transform .2s', flexShrink: 0 }} className="details-arrow"><path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  Tempérament
                </summary>
                <div style={{ marginTop: 12 }}>

                  {/* Préréglages */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <select
                      onChange={e => {
                        const v = e.target.value
                        if (v === 'tempere') setUserTemperament(TEMPERAMENT_TEMPERE.slice())
                        else if (v === 'harmonique') setUserTemperament([...HARMONIQUE_OFFSETS])
                        else {
                          const p = userPresets.find(x => x.id === v)
                          if (p) setUserTemperament([...p.offsets])
                        }
                      }}
                      defaultValue=""
                      className="flex-1 bg-app text-app border border-app rounded-md px-2 py-1.5 text-xs"
                    >
                      <option value="" disabled>Charger un préréglage…</option>
                      <option value="tempere">Tempéré égal</option>
                      <option value="harmonique">Harmonique (5-limite)</option>
                      {userPresets.length > 0 && <option disabled>──────────</option>}
                      {userPresets.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
                    </select>
                  </div>

                  {/* 12 knobs (index 11 = Octave, non réglable) */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px 8px', marginBottom: 14 }}>
                    {INTERVAL_NAMES.map((name, i) => (
                      <TemperamentKnob
                        key={i}
                        label={name}
                        value={userTemperament[i]}
                        disabled={i === 11}
                        onChange={v => setUserTemperament(prev => { const next = [...prev]; next[i] = v; return next })}
                      />
                    ))}
                  </div>

                  {/* Reset + Import sur même ligne */}
                  <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center' }}>
                    <button
                      onClick={() => setUserTemperament(TEMPERAMENT_TEMPERE.slice())}
                      className="text-xs text-app-muted bg-transparent border border-app rounded-md px-3 py-1.5 cursor-pointer"
                      style={{ flexShrink: 0 }}
                    >Réinitialiser</button>
                    <input
                      value={importStr}
                      onChange={e => setImportStr(e.target.value)}
                      placeholder="Lien ou code base64…"
                      className="flex-1 bg-app text-app border border-app rounded-md px-2 py-1.5 text-xs"
                    />
                    <button
                      onClick={() => {
                        try {
                          const raw = importStr.includes('?t=') ? importStr.split('?t=')[1].split('&')[0] : importStr.trim()
                          const offsets = JSON.parse(atob(raw))
                          if (Array.isArray(offsets) && offsets.length === 12) {
                            setUserTemperament(offsets)
                            setImportStr('')
                          }
                        } catch {}
                      }}
                      disabled={!importStr.trim()}
                      className="bg-app border border-app rounded-md px-3 py-1.5 text-xs cursor-pointer text-app-muted font-bold"
                      style={{ opacity: importStr.trim() ? 1 : 0.4, flexShrink: 0 }}
                    >Importer</button>
                  </div>

                  <hr style={{ border: 'none', borderTop: '1px solid var(--border-c)', margin: '10px 0' }} />

                  {/* Sauvegarder preset */}
                  <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                    <input
                      value={newPresetNom}
                      onChange={e => setNewPresetNom(e.target.value)}
                      placeholder="Nom du tempérament…"
                      className="flex-1 bg-app text-app border border-app rounded-md px-2 py-1.5 text-xs"
                    />
                    <button
                      disabled={!newPresetNom.trim()}
                      onClick={() => {
                        const p = { id: `tp-${Date.now()}`, nom: newPresetNom.trim(), offsets: [...userTemperament] }
                        setUserPresets(prev => [...prev, p])
                        setNewPresetNom('')
                      }}
                      className="bg-app text-app border border-app rounded-md px-3 py-1.5 text-xs cursor-pointer font-bold"
                      style={{ opacity: newPresetNom.trim() ? 1 : 0.4 }}
                    >Sauvegarder</button>
                  </div>

                  {/* Gérer presets */}
                  {userPresets.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      {userPresets.map(p => (
                        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 11 }}>
                          <span style={{ flex: 1, color: 'var(--text)' }}>{p.nom}</span>
                          <button
                            onClick={() => setUserTemperament([...p.offsets])}
                            className="bg-transparent border border-app rounded px-2 py-0.5 text-[10px] cursor-pointer text-app-muted"
                          >Charger</button>
                          <button
                            onClick={() => setUserPresets(prev => prev.filter(x => x.id !== p.id))}
                            className="bg-transparent border-none text-red-400 cursor-pointer text-sm"
                            style={{ minHeight: 'auto' }}
                          >×</button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Export */}
                  <button
                    onClick={() => {
                      const encoded = btoa(JSON.stringify(userTemperament))
                      const url = `${window.location.origin}/accordeur?t=${encoded}`
                      navigator.clipboard.writeText(url)
                    }}
                    className="text-xs bg-app border border-app rounded-md px-3 py-1.5 cursor-pointer text-app-muted"
                  >Copier le lien de partage</button>

                </div>
              </details>

            </div>
          </>
        )}

        {/* ── Zone enregistrement / Live ── */}
        <div className="bg-surface border border-app rounded-2xl p-6 mb-4 text-center">
          {/* Toggle Enregistrer / Live */}
          <div className="flex gap-1.5 mb-5" data-tour="toggle-mode">
            {[['rec', '● Enregistrer'], ['live', '♩ Live']].map(([v, label]) => (
              <button key={v}
                onClick={() => basculerMode(v === 'live')}
                className="flex-1 py-2 rounded-lg border-none font-bold text-sm cursor-pointer transition-colors"
                style={{
                  background: modeLive === (v === 'live') ? '#FF8B3D' : 'var(--surface-2)',
                  color:      modeLive === (v === 'live') ? '#fff' : 'var(--text-muted)',
                }}
              >{label}</button>
            ))}
            {(modeLive || phase === 'resultats') && (
              <button
                onClick={() => setShowSpectre(v => !v)}
                className="px-3 py-2 rounded-lg font-bold text-xs cursor-pointer border transition-colors"
                style={{
                  borderColor: showSpectre ? '#FF8B3D' : 'var(--border-c)',
                  background:  showSpectre ? 'rgba(255,139,61,0.12)' : 'var(--surface-2)',
                  color:       showSpectre ? '#FF8B3D' : 'var(--text-muted)',
                  whiteSpace: 'nowrap',
                }}
              >◈ Spectre</button>
            )}
          </div>

          {/* ── Live ── */}
          {modeLive && (() => {
            const liveCouleur = liveNote ? couleurJustesse(liveNote.muCents, seuil) : 'var(--text-muted)'
            const centsLabel  = liveNote ? `${liveNote.muCents >= 0 ? '+' : ''}${liveNote.muCents.toFixed(1)}¢` : '—'
            return (
              <>
                {!liveActive
                  ? <Btn onClick={demarrerLive} className="text-base px-9 py-3">▶ Démarrer</Btn>
                  : <Btn variant="secondary" onClick={arreterLive} className="text-sm">■ Arrêter</Btn>
                }
                <div className="mt-7 mb-2">
                  <div className="text-6xl font-black tracking-widest leading-none" style={{ color: liveCouleur }}>
                    {liveNote ? liveNote.nom : '—'}
                    <span className="text-2xl font-normal text-app-muted ml-1.5">
                      {liveNote ? liveNote.octave : ''}
                    </span>
                  </div>
                  <div className="text-2xl font-bold mt-1.5" style={{ color: liveCouleur }}>{centsLabel}</div>
                </div>
                <VuMetre cents={liveNote?.muCents ?? null} seuil={seuil} />
              </>
            )
          })()}

          {/* ── Enregistrement ── */}
          {!modeLive && phase === 'pret' && (
            <>
              <div className="text-app-muted text-sm mb-5">Prêt à enregistrer</div>
              <Btn onClick={demarrerEnregistrement} className="text-base px-10 py-3.5">● Enregistrer</Btn>
              <div className="mt-3.5 flex items-center justify-center gap-2">
                <span className="text-app-muted text-xs">ou</span>
                <label className="cursor-pointer text-xs text-app-muted font-semibold px-3.5 py-1.5 rounded-lg border border-app bg-app">
                  Charger un fichier audio
                  <input type="file" accept="audio/*" className="hidden" onChange={e => chargerFichier(e.target.files?.[0])} />
                </label>
              </div>
            </>
          )}

          {!modeLive && phase === 'enregistrement' && (
            <>
              <div className="text-red-400 font-bold text-sm mb-3">● Enregistrement en cours…</div>
              <canvas ref={vuRef} width={360} height={20} className="rounded-xl block mx-auto mb-5" />
              <Btn onClick={arreterEnregistrement} variant="secondary" className="text-base px-8 py-3">■ Arrêter</Btn>
            </>
          )}

          {!modeLive && phase === 'analyse' && (
            <div className="text-app-muted text-sm py-5">Analyse en cours…</div>
          )}

          {!modeLive && phase === 'resultats' && (
            <Btn variant="secondary" onClick={() => {
              stopVersionJusteRef.current?.()
              recordingBlobRef.current = null
              setHasRecordingBlob(false)
              setPhase('pret'); setNotes([]); setCourbe([])
              serieRef.current = []; audioBufferRef.current = null
            }} className="text-sm">
              ↺ Nouveau
            </Btn>
          )}

          {erreur && <div className="text-red-400 text-xs mt-3">{erreur}</div>}

          {/* ── Lien Générateur d'accords ── */}
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 16 }} data-tour="lien-generateur">
            <Link
              to="/accordeur/generateur"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#FF8B3D', fontSize: 12, fontWeight: 600, textDecoration: 'none', opacity: 0.85 }}
            >
              <svg width="14" height="16" viewBox="0 0 20 22" fill="none">
                {[3, 8, 13, 18].map(x => (
                  <line key={x} x1={x} y1="1" x2={x} y2="21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                ))}
                {[5, 10, 15, 20].map(y => (
                  <line key={y} x1="1" y1={y} x2="20" y2={y} stroke="currentColor" strokeWidth="1.5" />
                ))}
                <circle cx="3" cy="7.5" r="2.5" fill="currentColor" />
                <circle cx="8" cy="12.5" r="2.5" fill="currentColor" />
                <circle cx="13" cy="7.5" r="2.5" fill="currentColor" />
                <circle cx="18" cy="2.5" r="2.5" fill="currentColor" />
              </svg>
              <span style={{ lineHeight: 1.3 }}>Générateur<br />d'accords</span>
            </Link>
          </div>

          {/* ── Instrument + Réécouter + Version juste (mode enregistrement) ── */}
          {!modeLive && (
            <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border-c)' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Instrument</span>
                <select
                  value={instrument}
                  onChange={e => setInstrument(e.target.value)}
                  className="flex-1 bg-app text-app border border-app rounded-md px-2 py-1.5 text-xs"
                >
                  {Object.entries(INSTRUMENTS).map(([k, v]) => (
                    <option key={k} value={k} disabled={k !== 'oscillator'}>
                      {v.label}{k !== 'oscillator' ? ' (bientôt)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              {sampleLoading && (
                <div style={{ height: 3, borderRadius: 2, background: 'var(--border-c)', overflow: 'hidden', marginBottom: 10 }}>
                  <div style={{ height: '100%', width: `${Math.round(sampleLoadPct * 100)}%`, background: '#FF8B3D', borderRadius: 2, transition: 'width 0.15s' }} />
                </div>
              )}
              {sampleError && (
                <div style={{ fontSize: 10, color: '#f87171', marginBottom: 8 }}>
                  Samples indisponibles — lecture en sinusoïde.
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  disabled={!hasRecordingBlob}
                  onClick={() => {
                    if (isReplaying) {
                      reecouteAudioRef.current?.pause()
                      reecouteAudioRef.current = null
                      setIsReplaying(false)
                      return
                    }
                    if (!recordingBlobRef.current) return
                    const url   = URL.createObjectURL(recordingBlobRef.current)
                    const audio = new Audio(url)
                    audio.play()
                    setIsReplaying(true)
                    audio.onended = () => { URL.revokeObjectURL(url); setIsReplaying(false) }
                    reecouteAudioRef.current = audio
                  }}
                  className="flex-1 rounded-xl font-bold text-xs py-2 border border-app cursor-pointer transition-opacity"
                  style={{
                    background: isReplaying ? '#1e3a5f' : 'var(--surface-2)',
                    color: isReplaying ? '#60a5fa' : 'var(--text-muted)',
                    opacity: hasRecordingBlob ? 1 : 0.4,
                  }}
                >{isReplaying ? '■ Arrêter' : '▶ Réécouter'}</button>
                <button
                  disabled={!notes.length || sampleLoading}
                  onClick={() => {
                    if (versionJustePlaying) {
                      stopVersionJusteRef.current?.()
                      return
                    }
                    if (!notes.length) return
                    const struct    = [...DEFAULT_STRUCTURES, ...structures].find(x => x.id === structureId)
                    const tonikMidi = struct ? (noteNameToPC(struct.toniques[0]?.tonique ?? 'Do') + 60) : 60
                    const ctx = new AudioContext()
                    ctx.resume().catch(() => {})
                    const isOsc = isOscillatorInstrument(instrument)
                    const srcs = isOsc
                      ? playPhraseOscillator(ctx, notes, referentiel, tonikMidi, diapason)
                      : (sampleMap?.size > 0 ? playPhrase(ctx, notes, sampleMap, referentiel, tonikMidi, diapason) : playPhraseOscillator(ctx, notes, referentiel, tonikMidi, diapason))
                    setVersionJustePlaying(true)
                    const totalMs = phraseDurationMs(notes)
                    const timer = setTimeout(() => {
                      try { ctx.close() } catch {}
                      setVersionJustePlaying(false)
                      stopVersionJusteRef.current = null
                    }, totalMs + 500)
                    stopVersionJusteRef.current = () => {
                      clearTimeout(timer)
                      srcs.forEach(s => { try { s.stop() } catch {} })
                      try { ctx.close() } catch {}
                      setVersionJustePlaying(false)
                      stopVersionJusteRef.current = null
                    }
                  }}
                  className="flex-1 rounded-xl font-bold text-xs py-2 border-none cursor-pointer transition-opacity"
                  style={{
                    background: versionJustePlaying ? '#7f1d1d' : '#FF8B3D',
                    color: '#fff',
                    opacity: (!notes.length || sampleLoading) ? 0.4 : 1,
                    cursor: (!notes.length || sampleLoading) ? 'not-allowed' : 'pointer',
                  }}
                >
                  {versionJustePlaying ? '■ Arrêter' : sampleLoading ? 'Chargement…' : '♩ Version juste'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Résultats ── */}
        {phase === 'resultats' && notes.length > 0 && (
          <>
            <div className="flex gap-1.5 mb-3">
              {[['portee', 'Portée'], ['tableau', 'Tableau']].map(([v, label]) => (
                <button key={v} onClick={() => setVue(v)}
                  className="px-4 py-1.5 rounded-lg border font-bold text-xs cursor-pointer"
                  style={{
                    background: vue === v ? '#FF8B3D' : 'var(--surface)',
                    color:      vue === v ? '#fff' : 'var(--text-muted)',
                    borderColor: vue === v ? '#FF8B3D' : 'var(--border-c)',
                  }}
                >{label}</button>
              ))}
              <span className="ml-auto text-app-muted text-xs self-center">
                μ <strong className="text-app">{muMoyen}¢</strong>
                &nbsp;&nbsp;σ <strong className="text-app">{sigmaMoyen}¢</strong>
              </span>
            </div>

            {vue === 'portee' && (
              <div className="relative bg-surface border border-app rounded-xl p-4 mb-4">
                <AccordeurStaff notes={notes} seuil={seuil} transpoKey={transpoKey} tonicName={_tonicDisplayName} containerWidth={524} height={300} notePx={window.innerWidth <= 540 ? 26 : 52} />
                {dirty && (
                  <div className="absolute inset-0 rounded-xl flex items-center justify-center" style={{ background: 'rgba(13,16,38,0.72)' }}>
                    <Btn onClick={recalculer} className="text-sm px-7 py-2.5">↻ Recalculer</Btn>
                  </div>
                )}
              </div>
            )}

            {vue === 'tableau' && (
              <div className="relative bg-surface border border-app rounded-xl p-4 mb-4">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="text-app-muted border-b border-app">
                      <th className="px-2 py-1 text-left font-semibold">Note</th>
                      <th className="px-2 py-1 text-right font-semibold">μ (¢)</th>
                      <th className="px-2 py-1 text-right font-semibold">σ (¢)</th>
                      <th className="px-2 py-1 text-left font-semibold">Écart</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notes.map((note, i) => {
                      const couleur  = couleurJustesse(note.muCents, seuil)
                      const barScale = Math.min(Math.abs(note.muCents) / 30, 1)
                      return (
                        <tr key={i} className="border-b border-app">
                          <td className="px-2 py-2 font-bold" style={{ color: couleur }}>
                            {labelsX[i]}
                          </td>
                          <td className="px-2 py-2 text-right font-bold" style={{ color: couleur }}>
                            {note.muCents >= 0 ? '+' : ''}{note.muCents.toFixed(1)}
                          </td>
                          <td className="px-2 py-2 text-right text-app-muted">
                            {note.sigmaCents.toFixed(1)}
                          </td>
                          <td className="px-2 py-2 w-28">
                            <div className="relative h-2 bg-app rounded">
                              <div style={{
                                position: 'absolute',
                                left:   note.muCents < 0 ? `${(0.5 - barScale / 2) * 100}%` : '50%',
                                width:  `${barScale * 50}%`,
                                height: '100%',
                                background: couleur, borderRadius: 4, opacity: 0.8,
                              }} />
                              <div className="absolute left-1/2 top-0 w-px h-full bg-app-muted" />
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {dirty && (
                  <div className="absolute inset-0 rounded-xl flex items-center justify-center" style={{ background: 'rgba(13,16,38,0.72)' }}>
                    <Btn onClick={recalculer} className="text-sm px-7 py-2.5">↻ Recalculer</Btn>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-surface border border-app rounded-xl p-4 text-center">
                <div className="text-xs text-app-muted mb-1">Notes justes</div>
                <div className="text-3xl font-black text-success">{scoreP?.label}</div>
                <div className="text-xs text-app-muted">seuil ±{seuil}¢</div>
              </div>
              <div className="bg-surface border border-app rounded-xl p-4 text-center">
                <div className="text-xs text-app-muted mb-1">Score qualité</div>
                <div className="text-3xl font-black text-pitch">{scoreQ}%</div>
                <div className="text-xs text-app-muted">précision + stabilité</div>
              </div>
            </div>

            {referentiel === '5-limite' && (
              <div className="rounded-xl p-3.5 mb-4 text-xs leading-snug border"
                style={{ background: '#0c1220', borderColor: '#1e3a5f', color: '#93c5fd' }}>
                <div className="font-bold mb-1.5" style={{ color: '#60a5fa' }}>Limitation du modèle d'intonation pure</div>
                En intonation juste 5-limite, certaines notes possèdent deux valeurs pures légitimes selon leur rôle harmonique — notamment <strong>La</strong> et <strong>Ré</strong>. L'écart entre ces deux valeurs est de 21,5 cents (comma syntonique 81:80).
                <br /><br />
                Cet outil utilise une gamme de référence 5-limite diatonique fixe. Il ne réalise pas d'analyse harmonique contextuelle note-par-note.
                <br /><br />
                <em>En pratique : si votre phrase contient un La dans un contexte de IIe degré, la référence affichée peut différer de l'intonation pure idéale de ~21 cents.</em>
              </div>
            )}

            <div className="flex gap-2 mb-3 flex-wrap">
              {[
                { key: 'courbe', label: 'Courbe brute', val: showCourbe, set: setShowCourbe },
                { key: 'barres', label: 'μ par note',   val: showBarres, set: setShowBarres },
                { key: 'sigma',  label: 'σ par note',   val: showSigma,  set: setShowSigma  },
              ].map(({ key, label, val, set }) => (
                <button key={key} onClick={() => set(v => !v)}
                  className="px-3 py-1.5 rounded-lg border-none text-xs font-bold cursor-pointer transition-colors"
                  style={{
                    background: val ? '#FF8B3D' : 'var(--surface-2)',
                    color:      val ? '#fff' : 'var(--text-muted)',
                  }}
                >{label}</button>
              ))}
            </div>

            {showCourbe && courbe.length > 0 && <div className="mb-3"><GrapheCents data={dataCourbe} couleurs={[C_ACCENT]} width={500} height={90} title="Écart continu (¢)" /></div>}
            {showBarres && <div className="mb-3"><GrapheCents data={dataBarres} couleurs={couleurs} labelX={labelsX} width={500} height={100} title="Écart moyen μ par note (¢)" /></div>}
            {showSigma  && <div className="mb-3"><GrapheCents data={dataSigma} couleurs={couleurs} labelX={labelsX} width={500} height={100} title="Déviation σ par note (¢)" /></div>}

            <div className="text-center pt-2">
              <Btn onClick={sauvegarderResultats}>Sauvegarder cette session</Btn>
            </div>
          </>
        )}

        {phase === 'resultats' && notes.length === 0 && (
          <div className="text-app-muted text-sm text-center py-5">
            Aucune note détectée. Enregistre un extrait plus long ou vérifie le microphone.
          </div>
        )}

        {/* ── Structures de toniques + Référentiel ── */}
        <div className="bg-surface border border-app rounded-xl p-4 mb-4" data-tour="struct-ref">
          <div className="flex justify-between items-center mb-2.5">
            <span className="font-bold text-sm text-app">Structure de toniques</span>
            <Btn variant="ghost" onClick={() => setShowStructMgr(v => !v)}>
              {showStructMgr ? 'Fermer' : '+ Gérer'}
            </Btn>
          </div>

          <select
            value={structureId ?? ''}
            onChange={e => setStructureId(e.target.value || null)}
            className="w-full bg-app text-app border border-app rounded-md px-2.5 py-2 text-sm mb-3"
          >
            <option value="">— Aucune (tempéré simple) —</option>
            <optgroup label="Toniques simples">
              {DEFAULT_STRUCTURES.map(s => <option key={s.id} value={s.id}>{transpoNom(s.nom)}</option>)}
            </optgroup>
            {structures.length > 0 && (
              <optgroup label="Mes structures">
                {structures.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
              </optgroup>
            )}
          </select>

          <div className="flex gap-1.5">
            {REFERENTIELS.map(r => {
              const needsStructure = (r === '5-limite' || r === 'utilisateur') && structureId === null
              return (
                <button key={r}
                  onClick={() => {
                    if (needsStructure) {
                      clearTimeout(warnRefTimer.current)
                      setWarnRef(true)
                      warnRefTimer.current = setTimeout(() => setWarnRef(false), 3000)
                    } else {
                      setReferentiel(r)
                    }
                  }}
                  title={needsStructure ? 'Sélectionnez une structure tonale ci-dessus pour activer ce référentiel' : undefined}
                  className="flex-1 py-1.5 rounded-md border-none font-bold text-xs transition-colors"
                  style={{
                    background: referentiel === r ? '#FF8B3D' : 'var(--surface-2)',
                    color:      referentiel === r ? '#fff' : needsStructure ? 'var(--text-muted)' : 'var(--text-muted)',
                    opacity:    needsStructure ? 0.4 : 1,
                    cursor:     needsStructure ? 'not-allowed' : 'pointer',
                  }}
                >{r === 'tempere' ? 'Tempéré' : r === '5-limite' ? 'Harmonique' : 'Utilisateur'}</button>
              )
            })}
          </div>
          {(warnRef || (structureId === null && referentiel !== 'tempere')) && (
            <div style={{ fontSize: 11, color: '#fbbf24', marginTop: 6 }}>
              Référentiel Harmonique/Utilisateur nécessite une structure tonale — sélectionnez-en une ci-dessus.
            </div>
          )}

          {urlStructure && (
            <div className="mt-2.5 flex gap-2 items-center">
              <input readOnly value={urlStructure}
                className="flex-1 bg-app text-app-muted border border-app rounded-md px-2 py-1 text-[10px]"
              />
              <Btn variant="secondary" className="py-1! px-2.5! text-xs" onClick={() => navigator.clipboard.writeText(urlStructure)}>
                Copier
              </Btn>
            </div>
          )}

          {showStructMgr && (
            <div className="mt-3.5 pt-3.5 border-t border-app">
              {structures.map(s => (
                <div key={s.id} className="flex justify-between items-center mb-1.5 text-xs">
                  <span style={{ color: structureId === s.id ? '#FF8B3D' : 'var(--text)' }}>{s.nom}</span>
                  <div className="flex gap-1.5">
                    <Btn variant="secondary" className="py-0.5! px-2! text-xs" onClick={() => setStructureId(s.id)}>Sélectionner</Btn>
                    <Btn variant="danger" className="py-0.5! px-2! text-xs" onClick={() => supprimerStruct(s.id)}>×</Btn>
                  </div>
                </div>
              ))}
              <div className="mt-3 bg-app rounded-lg p-3">
                <div className="text-xs text-app-muted mb-2 font-semibold">Nouvelle structure</div>
                <input
                  value={newStructNom}
                  onChange={e => setNewStructNom(e.target.value)}
                  placeholder="Nom (ex: Sonate K331)"
                  className={inputCls + ' mb-2'}
                />
                {newStructRows.map((row, i) => (
                  <div key={i} className="flex gap-1.5 mb-1.5 items-center">
                    <input
                      type="number" min="1" value={row.indexNote}
                      onChange={e => setNewStructRows(rows => rows.map((r, j) => j === i ? { ...r, indexNote: Number(e.target.value) } : r))}
                      className={inputCls}
                      style={{ width: 50 }}
                    />
                    <select
                      value={row.tonique}
                      onChange={e => setNewStructRows(rows => rows.map((r, j) => j === i ? { ...r, tonique: e.target.value } : r))}
                      className={inputCls + ' flex-1'}
                    >
                      {NOTE_NAMES_FR.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                    {newStructRows.length > 1 && (
                      <button onClick={() => setNewStructRows(rows => rows.filter((_, j) => j !== i))}
                        className="bg-transparent border-none text-red-400 cursor-pointer text-base"
                        style={{ minHeight: 'auto' }}>×</button>
                    )}
                  </div>
                ))}
                <div className="flex gap-2 mt-2">
                  <Btn variant="ghost" onClick={() => setNewStructRows(rows => [...rows, { indexNote: rows.length + 1, tonique: 'Do' }])}>+ Tonique</Btn>
                  <Btn variant="primary" className="py-2! px-4! text-xs" onClick={ajouterStructure} disabled={!newStructNom.trim()}>Créer</Btn>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Outils pédagogiques ── */}
        {/* Jeu de gamme — masqué pour le moment
        {[
          {
            id: 'gamme', titre: 'Jeu de gamme',
            icone: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="18" x2="3" y2="6"/><line x1="8" y1="18" x2="8" y2="9"/><line x1="13" y1="18" x2="13" y2="5"/><line x1="18" y1="18" x2="18" y2="11"/><line x1="21" y1="18" x2="1" y2="18"/></svg>,
            content: <JeuGamme transpoKey={transpoKey} referentiel={referentiel} diapason={diapason} seuil={seuil} silenceDurationMs={silenceDurationMs} noteJumpCents={noteJumpCents} clarityThreshold={clarityThreshold} gateLevel={gateLevel} />,
          },
        ].map(({ id, titre, icone, content }) => (
          <div key={id} className="mt-2 border border-app rounded-xl overflow-hidden">
            <button
              onClick={() => setOuvertPanel(p => p === id ? null : id)}
              className="w-full flex items-center gap-2.5 bg-surface border-none px-4 py-3 cursor-pointer text-app text-sm font-semibold text-left"
            >
              <span style={{ color: '#FF8B3D' }}>{icone}</span>
              <span className="flex-1">{titre}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5"
                style={{ transform: ouvertPanel === id ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            {ouvertPanel === id && (
              <div className="p-4 bg-app border-t border-app">{content}</div>
            )}
          </div>
        ))}
        */}

      </div>

      {showSpectre && (
        <SpectrePaneau
          mode={modeLive ? 'live' : 'static'}
          spectreAnalyserRef={spectreAnalyserRef}
          spectreParNote={spectreParNoteRef.current}
          notes={notes}
          sampleRate={liveAudioCtxRef.current?.sampleRate ?? 44100}
          fundamentalHz={modeLive ? liveHzRef.current : null}
          muCents={liveNote?.muCents ?? null}
          onClose={() => setShowSpectre(false)}
        />
      )}
      {showTutorial && <AccordeurTutorial onDone={sel => handleTutorialDone(sel)} />}
      {!showTutorial && showConsigne && (
        <ConsigneOverlay
          storageKey="accordeur"
          icon="🎻"
          title="Accordeur"
          lines={[
            "Joue ou chante une note tenue : l'accordeur affiche la justesse en cents (±50¢).",
            "Choisis une tonique pour activer les référentiels tempéré / harmonique.",
          ]}
          warning={{ tone: "mic", text: "Autorise l'accès au micro et place-toi dans un endroit calme." }}
          startLabel="J'ai compris"
          onStart={() => setShowConsigne(false)}
          onClose={() => setShowConsigne(false)}
        />
      )}
      {showHelp && (
        <HelpModal
          onTuto={() => { setShowHelp(false); setShowTutorial(true) }}
          onTour={() => { setShowHelp(false); setShowTour(true) }}
          onClose={() => setShowHelp(false)}
        />
      )}
      {showTour && <TourGuide steps={ACC_TOUR_STEPS} onDone={() => setShowTour(false)} />}
    </div>
  )
}
