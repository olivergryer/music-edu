import { useEffect, useRef, useState } from 'react'
import { Renderer, Stave, StaveNote, Voice, Formatter, Accidental } from 'vexflow'
import { transposerMidi, buildEnharmonicVexScale } from './accordeurUtils'
import { useTheme } from './ThemeContext'

function midiToVexKey(midi, vexScale) {
  const name   = vexScale[((midi % 12) + 12) % 12] ?? 'c'
  const octave = Math.floor(midi / 12) - 1
  return `${name}/${octave}`
}

// Nom affiché type "G4", "Bb3" depuis la clé VexFlow ("g/4", "bb/3")
function vexKeyToLabel(key) {
  const [part, oct] = key.split('/')
  const letter = part[0].toUpperCase()
  const acc    = part.slice(1)            // "" | "#" | "b" | "##" | "bb"
  return `${letter}${acc}${oct}`
}

// ─── Coût lignes supplémentaires (clé de sol) ─────────────────────────────────
function ledgerCost(midi) {
  if (midi < 59) return (59 - midi)
  if (midi > 81) return (midi - 81)
  return 0
}

function bestOctaveShift(midis) {
  if (!midis.length) return 0
  let best = 0, bestCost = Infinity
  for (const shift of [-12, 0, 12]) {
    const cost = midis.reduce((s, m) => s + ledgerCost(m + shift), 0)
    if (cost < bestCost) { bestCost = cost; best = shift }
  }
  return best
}

const STAVE_MARGIN      = 140
const PX_PER_NOTE       = 28   // plancher minimal d'espacement par note
const PX_PER_BEAT       = 56   // espacement proportionnel à la durée (à calibrer)
const MAX_NOTES_DISPLAY = 30

// Palette résolue en hex selon le thème (var() ne fonctionne pas en attribut SVG)
function themePalette(dark) {
  return {
    stave:  dark ? '#9CA3AF' : '#6B7280',
    head:   dark ? '#F4F5F7' : '#0D1026',
    text:   dark ? '#9CA3AF' : '#6B7280',
    target: dark ? '#9CA3AF' : '#6B7280',
    zero:   dark ? '#475569' : '#CBD5E1',
  }
}

const STAVE_Y      = 58
const VALUES_Y     = 182    // descendu de 5 interlignes (~50px)
const ZERO_Y       = 238
const SPARK_HALF   = 18     // px pour ±SPARK_SCALE cents
const SPARK_SCALE  = 50     // ¢ pleine échelle sparkline
const MU_COEFF     = 0.25   // px de déplacement vertical par cent (à calibrer)
const HEAD_RX      = 7.6    // tête de note : plus elliptique, −20% vs initial
const HEAD_RY      = 4.8

const TOGGLE_KEY   = 'accordeur_visu_toggles'
const DEFAULT_TOG  = { couleur: true, halo: true, cible: true, sparkline: true, valeurs: true }

// Durée réelle (ms) → type VexFlow
function durationToVex(ms) {
  if (ms >= 1400) return { dur: 'w', beats: 4 }
  if (ms >= 700)  return { dur: 'h', beats: 2 }
  if (ms >= 350)  return { dur: 'q', beats: 1 }
  if (ms >= 175)  return { dur: '8', beats: 0.5 }
  return { dur: '16', beats: 0.25 }
}

// ─── Interpolation couleur continue selon |μ| en cents ────────────────────────
const COLOR_STOPS = [
  { c: 0,  rgb: [0x1D, 0x9E, 0x75] },
  { c: 10, rgb: [0xBA, 0x75, 0x17] },
  { c: 20, rgb: [0xD8, 0x5A, 0x30] },
  { c: 30, rgb: [0x99, 0x3C, 0x1D] },
]
function couleurEcart(muCents) {
  const a = Math.abs(muCents)
  if (a <= COLOR_STOPS[0].c) return rgbStr(COLOR_STOPS[0].rgb)
  const last = COLOR_STOPS[COLOR_STOPS.length - 1]
  if (a >= last.c) return rgbStr(last.rgb)
  for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
    const s0 = COLOR_STOPS[i], s1 = COLOR_STOPS[i + 1]
    if (a >= s0.c && a <= s1.c) {
      const t = (a - s0.c) / (s1.c - s0.c)
      return rgbStr([
        Math.round(s0.rgb[0] + (s1.rgb[0] - s0.rgb[0]) * t),
        Math.round(s0.rgb[1] + (s1.rgb[1] - s0.rgb[1]) * t),
        Math.round(s0.rgb[2] + (s1.rgb[2] - s0.rgb[2]) * t),
      ])
    }
  }
  return rgbStr(last.rgb)
}
function rgbStr([r, g, b]) { return `rgb(${r},${g},${b})` }

// Texte cents : "+14¢", "−22¢", "0¢" (moins typographique U+2212)
function fmtCents(mu) {
  const r = Math.round(mu)
  if (r === 0) return '0¢'
  return (r > 0 ? '+' : '−') + Math.abs(r) + '¢'
}

// Réduit une série à n points répartis uniformément
function downsample(arr, n) {
  if (!arr || arr.length <= n) return arr ?? []
  const out = []
  for (let i = 0; i < n; i++) out.push(arr[Math.round(i * (arr.length - 1) / (n - 1))])
  return out
}

const SVGNS = 'http://www.w3.org/2000/svg'
function svgEl(tag, attrs) {
  const e = document.createElementNS(SVGNS, tag)
  for (const k in attrs) e.setAttribute(k, attrs[k])
  return e
}

export default function AccordeurStaff({ notes, transpoKey = 'C', tonicName = 'Do', containerWidth = 500, height = 300, notePx = 52 }) {
  const ref = useRef(null)
  const { dark } = useTheme()
  const C = themePalette(dark)

  const [tog, setTog] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(TOGGLE_KEY))
      return raw ? { ...DEFAULT_TOG, ...raw } : DEFAULT_TOG
    } catch { return DEFAULT_TOG }
  })

  const toggle = (k) => setTog(prev => {
    const next = { ...prev, [k]: !prev[k] }
    try { localStorage.setItem(TOGGLE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
    return next
  })

  // Mobile (notePx ≤ 30) : spacing ~1/3 desktop, marge clef réduite
  const isMobile      = notePx <= 30
  const beatPx        = isMobile ? 19 : PX_PER_BEAT
  const noteFloorPx   = isMobile ? 10 : PX_PER_NOTE
  const staveMarginPx = isMobile ? 80 : STAVE_MARGIN

  const displayedNotes = notes?.slice(0, MAX_NOTES_DISPLAY) ?? []
  // Largeur proportionnelle à la durée totale (compact), plancher par note
  const totalBeats = displayedNotes.reduce(
    (a, n) => a + durationToVex(Math.max(200, n.finMs - n.debutMs)).beats, 0)
  const contentW   = Math.max(totalBeats * beatPx, displayedNotes.length * noteFloorPx)
  const staveWidth  = staveMarginPx + contentW

  useEffect(() => {
    if (!ref.current || !displayedNotes.length) return
    ref.current.innerHTML = ''

    try {
      const renderer = new Renderer(ref.current, Renderer.Backends.SVG)
      renderer.resize(staveWidth, height)
      const ctx = renderer.getContext()
      ctx.setFont('Arial', 9)

      const vexScale    = buildEnharmonicVexScale(tonicName)
      const midisTranspo = displayedNotes.map(n => transposerMidi(n.midiCible, transpoKey))
      const octaveShift  = bestOctaveShift(midisTranspo)

      const stave = new Stave(10, STAVE_Y, staveWidth - 20)
      if (octaveShift === 12)       stave.addClef('treble', 'default', '8vb')
      else if (octaveShift === -12) stave.addClef('treble', 'default', '8va')
      else                          stave.addClef('treble')
      stave.setContext(ctx).draw()

      const interline = stave.getSpacingBetweenLines?.() ?? 10
      const maxOffset = interline * 0.5

      // ── StaveNotes (têtes natives masquées ensuite) ──────────────────────────
      const keys = []
      const vexNotes = displayedNotes.map(note => {
        const midiDisplay = transposerMidi(note.midiCible, transpoKey) + octaveShift
        const key         = midiToVexKey(midiDisplay, vexScale)
        keys.push(key)
        const vexPart  = key.split('/')[0]
        const hasSharp = vexPart.includes('#')
        const hasFlat  = vexPart.length > 1 && !hasSharp
        const { dur }  = durationToVex(Math.max(200, note.finMs - note.debutMs))

        const sn = new StaveNote({ keys: [key], duration: dur })
        if (hasSharp)      sn.addModifier(new Accidental('#'), 0)
        else if (hasFlat)  sn.addModifier(new Accidental('b'), 0)
        return sn
      })

      const voice = new Voice({ num_beats: totalBeats, beat_value: 4 })
      voice.setMode(Voice.Mode.SOFT)
      voice.addTickables(vexNotes)

      const noteWidth = stave.getX() + stave.getWidth() - stave.getNoteStartX() - 10
      new Formatter().joinVoices([voice]).format([voice], noteWidth)
      voice.draw(ctx, stave)

      const svg = ref.current.querySelector('svg')
      if (!svg) return
      svg.style.background = 'transparent'

      // Recolore + affine les traits VexFlow (portée, hampes, altérations)
      svg.querySelectorAll('path').forEach(p => {
        const s = p.getAttribute('stroke') ?? ''
        const f = p.getAttribute('fill') ?? ''
        if (!s || s === '#000000' || s === 'black') p.setAttribute('stroke', C.stave)
        if (!f || f === '#000000' || f === 'black') p.setAttribute('fill', C.stave)
        const w = parseFloat(p.getAttribute('stroke-width') || '1')
        p.setAttribute('stroke-width', (w * 0.7).toFixed(2))
      })
      svg.querySelectorAll('text').forEach(t => {
        t.setAttribute('fill', C.stave)
        t.style.fill = C.stave
      })

      // Masque têtes + altérations natives — redessinées par la couche custom
      svg.querySelectorAll('.vf-notehead, .vf-accidental').forEach(n => { n.style.opacity = '0' })

      // ── Couche personnalisée ─────────────────────────────────────────────────
      const layer = svgEl('g', { class: 'custom-layer' })
      const gNames  = svgEl('g', { class: 'note-names' })
      const gHalos  = svgEl('g', { class: 'halos' })
      const gTargets = svgEl('g', { class: 'targets' })
      const gHeads  = svgEl('g', { class: 'heads' })
      const gAcc    = svgEl('g', { class: 'accidentals' })
      const gValues = svgEl('g', { class: 'values' })
      const gSpark  = svgEl('g', { class: 'sparkline-zone' })

      // Centres X de chaque note (pour largeur des sparklines)
      const centersX = vexNotes.map(sn => (sn.getNoteHeadBeginX() + sn.getNoteHeadEndX()) / 2)

      vexNotes.forEach((sn, i) => {
        const note    = displayedNotes[i]
        const cx      = centersX[i]
        const targetY = sn.getYs()[0]
        const couleur = tog.couleur ? couleurEcart(note.muCents) : C.head
        const offset  = Math.max(-maxOffset, Math.min(maxOffset, note.muCents * MU_COEFF))
        const headY   = targetY - offset   // Y SVG inversé : +cents (trop haut) → Y plus petit

        // 1. Nom de la note (toujours affiché — pas de toggle dédié)
        const nameT = svgEl('text', {
          x: cx, y: STAVE_Y - 14, 'text-anchor': 'middle',
          'font-size': '11', fill: C.text, 'font-family': 'Arial, sans-serif',
        })
        nameT.textContent = vexKeyToLabel(keys[i])
        gNames.appendChild(nameT)

        // 2. Halo de variabilité — une seule ellipse douce, opacité ∝ σ
        if (tog.halo) {
          const ryO = 6 + Math.min(note.sigmaCents, 40) * 0.5
          const rxO = ryO * 0.5
          const op  = 0.12 + Math.min(note.sigmaCents / 30, 1) * 0.18
          gHalos.appendChild(svgEl('ellipse', {
            cx, cy: headY, rx: rxO, ry: ryO,
            fill: tog.couleur ? couleur : C.stave, opacity: op.toFixed(3),
          }))
        }

        // 3. Repère de position cible + trait de liaison (lisibilité de l'écart μ)
        if (tog.cible) {
          gTargets.appendChild(svgEl('line', {
            x1: cx - HEAD_RX, y1: targetY, x2: cx + HEAD_RX, y2: targetY,
            stroke: C.target, 'stroke-width': '1',
          }))
          if (Math.abs(headY - targetY) > 1) {
            gTargets.appendChild(svgEl('line', {
              x1: cx, y1: targetY, x2: cx, y2: headY,
              stroke: C.target, 'stroke-width': '1', opacity: '0.5',
            }))
          }
        }

        // 4. Tête de note redessinée
        gHeads.appendChild(svgEl('ellipse', {
          cx, cy: headY, rx: HEAD_RX, ry: HEAD_RY, fill: couleur,
          transform: `rotate(-20 ${cx} ${headY})`,
        }))

        // 4b. Altération redessinée (alignée sur la tête déplacée)
        const vexPart = keys[i].split('/')[0]
        const glyph   = vexPart.includes('#') ? '♯' : (vexPart.length > 1 ? '♭' : null)
        if (glyph) {
          const accT = svgEl('text', {
            x: cx - HEAD_RX - 5, y: headY + 4, 'text-anchor': 'end',
            'font-size': '14', fill: couleur, 'font-family': 'Arial, sans-serif',
          })
          accT.textContent = glyph
          gAcc.appendChild(accT)
        }

        // 5. Valeur en cents
        if (tog.valeurs) {
          const valT = svgEl('text', {
            x: cx, y: VALUES_Y, 'text-anchor': 'middle',
            'font-size': '11', 'font-weight': '500',
            fill: tog.couleur ? couleur : C.text, 'font-family': 'Arial, sans-serif',
          })
          valT.textContent = fmtCents(note.muCents)
          gValues.appendChild(valT)
        }
      })

      // 6 + 7. Sparklines + ligne 0¢
      if (tog.sparkline) {
        gSpark.appendChild(svgEl('line', {
          x1: 10, y1: ZERO_Y, x2: staveWidth - 10, y2: ZERO_Y,
          stroke: C.zero, 'stroke-width': '1', 'stroke-dasharray': '2,3',
        }))
        const zlab = svgEl('text', {
          x: 4, y: ZERO_Y + 3, 'font-size': '9', fill: C.text, 'font-family': 'Arial, sans-serif',
        })
        zlab.textContent = '0¢'
        gSpark.appendChild(zlab)

        vexNotes.forEach((sn, i) => {
          const note = displayedNotes[i]
          const pts  = downsample(note.centsSeries, 20)
          if (pts.length < 2) return
          const cx = centersX[i]
          let w = noteFloorPx
          if (i > 0)                    w = Math.min(w, Math.abs(cx - centersX[i - 1]) * 0.9)
          if (i < centersX.length - 1)  w = Math.min(w, Math.abs(centersX[i + 1] - cx) * 0.9)
          const x0 = cx - w / 2
          const couleur = tog.couleur ? couleurEcart(note.muCents) : C.text
          const coords = pts.map((c, j) => {
            const x = x0 + (w * j) / (pts.length - 1)
            const cl = Math.max(-SPARK_SCALE, Math.min(SPARK_SCALE, c))
            const y = ZERO_Y - (cl / SPARK_SCALE) * SPARK_HALF
            return `${x.toFixed(1)},${y.toFixed(1)}`
          }).join(' ')
          gSpark.appendChild(svgEl('polyline', {
            points: coords, fill: 'none', stroke: couleur, 'stroke-width': '1.2',
          }))
        })
      }

      layer.appendChild(gNames)
      layer.appendChild(gHalos)
      layer.appendChild(gTargets)
      layer.appendChild(gHeads)
      layer.appendChild(gAcc)
      layer.appendChild(gValues)
      layer.appendChild(gSpark)
      svg.appendChild(layer)
    } catch (err) {
      console.warn('AccordeurStaff VexFlow:', err.message ?? err)
    }
  }, [notes, transpoKey, tonicName, staveWidth, height, tog, dark]) // eslint-disable-line react-hooks/exhaustive-deps

  const TOGGLES = [
    { k: 'couleur',   label: 'Couleur' },
    { k: 'halo',      label: 'Halo' },
    { k: 'cible',     label: 'Cible' },
    { k: 'sparkline', label: 'Sparkline' },
    { k: 'valeurs',   label: 'Valeurs ¢' },
  ]

  return (
    <div className="w-full" style={{ maxWidth: containerWidth }}>
      <div className="flex flex-wrap gap-2 mb-3">
        {TOGGLES.map(({ k, label }) => (
          <button
            key={k}
            onClick={() => toggle(k)}
            style={{
              minHeight: 44,
              padding: '6px 14px',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 500,
              border: `1px solid ${tog[k] ? '#7c3aed' : 'var(--border-c)'}`,
              background: tog[k] ? 'rgba(124,58,237,0.18)' : 'var(--surface)',
              color: tog[k] ? '#c084fc' : 'var(--text-muted)',
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="w-full overflow-x-auto overflow-y-hidden">
        <div ref={ref} style={{ width: staveWidth, minWidth: staveWidth }} />
      </div>
    </div>
  )
}
