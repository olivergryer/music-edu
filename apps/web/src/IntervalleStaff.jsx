import { useEffect, useRef } from 'react'
import { Renderer, Stave, StaveNote, Voice, Formatter, Accidental } from 'vexflow'

export default function IntervalleStaff({ notes, width = 260, height = 150 }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!ref.current || !notes?.length) return
    ref.current.innerHTML = ''

    try {
      const renderer = new Renderer(ref.current, Renderer.Backends.SVG)
      renderer.resize(width, height)
      const ctx = renderer.getContext()

      const stave = new Stave(8, 30, width - 16)
      stave.addClef('treble')
      stave.setStyle({ strokeStyle: '#4b5563', fillStyle: '#4b5563' })
      stave.setContext(ctx).draw()

      const svgAfterStave = ref.current.querySelector('svg')
      const stavePaths = svgAfterStave ? new Set(svgAfterStave.querySelectorAll('path, rect, line')) : new Set()

      const vexNotes = notes.map(key => {
        const note = new StaveNote({ keys: [key], duration: 'q' })
        note.setStyle({ fillStyle: '#6b7280', strokeStyle: '#6b7280' })
        const accidental = key.split('/')[0].slice(1)
        if (accidental) {
          const acc = new Accidental(accidental)
          acc.setStyle({ fillStyle: '#6b7280', strokeStyle: '#6b7280' })
          note.addModifier(acc, 0)
        }
        return note
      })

      const voice = new Voice({ num_beats: notes.length, beat_value: 4 })
      voice.setMode(Voice.Mode.SOFT)
      voice.addTickables(vexNotes)

      const available = stave.getWidth() - (stave.getNoteStartX() - stave.getX()) - 10
      new Formatter().joinVoices([voice]).format([voice], available)
      voice.draw(ctx, stave)

      const svg = ref.current.querySelector('svg')
      if (svg) {
        svg.style.background = 'transparent'
        const COL = '#6b7280'
        const STAVE_COL = '#9ca3af'
        svg.querySelectorAll('path, rect, line').forEach(el => {
          const col = stavePaths.has(el) ? STAVE_COL : COL
          const s = el.getAttribute('stroke') ?? ''
          const f = el.getAttribute('fill') ?? ''
          if (!s || s === '#000000' || s === 'black') el.setAttribute('stroke', col)
          if (!f || f === '#000000' || f === 'black') el.setAttribute('fill', col)
        })
        svg.querySelectorAll('text').forEach(t => { t.style.fill = STAVE_COL })
      }
    } catch (err) {
      console.warn('VexFlow intervalle:', err.message ?? err)
    }
  }, [notes, width, height])

  return <div ref={ref} className="w-full mx-auto mb-2" style={{ maxWidth: width }} />
}
