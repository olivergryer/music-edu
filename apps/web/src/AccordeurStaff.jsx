import { useEffect, useRef } from 'react'
import { Renderer, Stave, StaveNote, Voice, Formatter, Annotation, Accidental } from 'vexflow'
import { couleurJustesse, transposerMidi } from './accordeurUtils'

const NOTE_NAMES_VEX = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b']

function midiToVexKey(midi) {
  const name   = NOTE_NAMES_VEX[((midi % 12) + 12) % 12]
  const octave = Math.floor(midi / 12) - 1
  return `${name}/${octave}`
}

// ─── Coût lignes supplémentaires (clé de sol) ─────────────────────────────────
// Zone confortable : B3(59) – A5(81). Pénalité proportionnelle hors zone.
function ledgerCost(midi) {
  if (midi < 59) return (59 - midi)
  if (midi > 81) return (midi - 81)
  return 0
}

// ─── Décalage octave optimal pour minimiser les lignes supplémentaires ─────────
function bestOctaveShift(midis) {
  if (!midis.length) return 0
  let best = 0, bestCost = Infinity
  for (const shift of [-12, 0, 12]) {
    const cost = midis.reduce((s, m) => s + ledgerCost(m + shift), 0)
    if (cost < bestCost) { bestCost = cost; best = shift }
  }
  return best
}

// 72px par note + marge clef/armure
const NOTE_PX = 72
const STAVE_MARGIN = 140

export default function AccordeurStaff({ notes, seuil = 10, transpoKey = 'C', containerWidth = 500, height = 180 }) {
  const ref = useRef(null)

  const staveWidth = Math.max(containerWidth - 4, notes?.length * NOTE_PX + STAVE_MARGIN)

  useEffect(() => {
    if (!ref.current || !notes?.length) return
    ref.current.innerHTML = ''

    try {
      const renderer = new Renderer(ref.current, Renderer.Backends.SVG)
      renderer.resize(staveWidth, height)
      const ctx = renderer.getContext()
      ctx.setFont('Arial', 9)

      // ── Octave-fit ───────────────────────────────────────────────────────────
      const midisTranspo = notes.map(n => transposerMidi(n.midiCible, transpoKey))
      const octaveShift  = bestOctaveShift(midisTranspo)

      const staveY = 36
      const stave  = new Stave(10, staveY, staveWidth - 20)

      if (octaveShift === 12) {
        // Notes affichées une octave au-dessus → sons une octave plus bas → 8vb
        stave.addClef('treble', 'default', '8vb')
      } else if (octaveShift === -12) {
        // Notes affichées une octave en-dessous → sons une octave plus haut → 8va
        stave.addClef('treble', 'default', '8va')
      } else {
        stave.addClef('treble')
      }

      stave.setStyle({ strokeStyle: '#9ca3af', fillStyle: '#9ca3af' })
      stave.setContext(ctx).draw()

      // ── StaveNotes ───────────────────────────────────────────────────────────
      const vexNotes = notes.map(note => {
        const midiDisplay = transposerMidi(note.midiCible, transpoKey) + octaveShift
        const key         = midiToVexKey(midiDisplay)
        const couleur     = couleurJustesse(note.muCents, seuil)

        const sn = new StaveNote({ keys: [key], duration: 'q' })
        sn.setStyle({ fillStyle: couleur, strokeStyle: couleur })

        if (key.includes('#')) {
          const acc = new Accidental('#')
          acc.setStyle({ fillStyle: couleur, strokeStyle: couleur })
          sn.addModifier(acc, 0)
        }

        const centsLabel = (note.muCents >= 0 ? '+' : '') + note.muCents.toFixed(1) + '¢'
        const ann = new Annotation(centsLabel)
          .setFont('Arial', 8)
          .setVerticalJustification(Annotation.VerticalJustify.BOTTOM)
        ann.setStyle({ fillStyle: couleur, strokeStyle: couleur })
        sn.addModifier(ann, 0)

        return sn
      })

      const voice = new Voice({ num_beats: notes.length, beat_value: 4 })
      voice.setMode(Voice.Mode.SOFT)
      voice.addTickables(vexNotes)

      const noteWidth = stave.getX() + stave.getWidth() - stave.getNoteStartX() - 10
      new Formatter().joinVoices([voice]).format([voice], noteWidth)
      voice.draw(ctx, stave)

      // ── Barres σ (SVG natif) ─────────────────────────────────────────────────
      const svg = ref.current.querySelector('svg')
      if (svg) {
        svg.style.background = 'transparent'
        svg.querySelectorAll('text').forEach(t => { t.style.fill = '#6b7280' })

        vexNotes.forEach((sn, i) => {
          const note    = notes[i]
          const x       = sn.getAbsoluteX()
          const yCenter = staveY + 50
          const couleur = couleurJustesse(note.muCents, seuil)
          const barH    = Math.min(note.sigmaCents * 2 * 1.5, 40)
          if (barH < 2) return

          const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
          rect.setAttribute('x',       x - 2)
          rect.setAttribute('y',       yCenter - barH / 2)
          rect.setAttribute('width',   4)
          rect.setAttribute('height',  barH)
          rect.setAttribute('fill',    couleur)
          rect.setAttribute('opacity', '0.45')
          rect.setAttribute('rx',      2)
          svg.appendChild(rect)
        })
      }
    } catch (err) {
      console.warn('AccordeurStaff VexFlow:', err.message ?? err)
    }
  }, [notes, seuil, transpoKey, staveWidth, height])

  return (
    <div style={{ width: '100%', maxWidth: containerWidth, overflowX: 'auto', overflowY: 'hidden' }}>
      <div ref={ref} style={{ width: staveWidth, minWidth: staveWidth }} />
    </div>
  )
}
