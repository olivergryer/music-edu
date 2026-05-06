import { useEffect, useRef } from 'react'
import { Renderer, Stave, StaveNote, Voice, Formatter } from 'vexflow'

export default function IntervalleStaff({ notes, width = 260, height = 110 }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!ref.current || !notes?.length) return
    ref.current.innerHTML = ''

    try {
      const renderer = new Renderer(ref.current, Renderer.Backends.SVG)
      renderer.resize(width, height)
      const ctx = renderer.getContext()

      const stave = new Stave(8, 14, width - 16)
      stave.addClef('treble')
      stave.setStyle({ strokeStyle: '#4b5563', fillStyle: '#4b5563' })
      stave.setContext(ctx).draw()

      const vexNotes = notes.map(key => {
        const note = new StaveNote({ keys: [key], duration: 'q' })
        note.setStyle({ fillStyle: '#c084fc', strokeStyle: '#c084fc' })
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
        svg.querySelectorAll('text').forEach(t => { t.style.fill = '#6b7280' })
      }
    } catch (err) {
      console.warn('VexFlow intervalle:', err.message ?? err)
    }
  }, [notes, width, height])

  return <div ref={ref} className="w-full mx-auto mb-2" style={{ maxWidth: width }} />
}
