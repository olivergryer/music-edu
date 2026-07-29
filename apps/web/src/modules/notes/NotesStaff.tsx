// ─── Portée VexFlow + couche custom (spec §6) ─────────────────────────────────
//
// VexFlow pré-rend la portée + les têtes NOIRES À HAMPES (notation standard) en une
// passe. Le curseur, la colorisation des têtes (juste/faux, ou par hauteur) vivent
// sur la couche custom : ils sont appliqués par manipulation directe du SVG, SANS
// re-render VexFlow entre deux items d'une même ligne (§13.4). Durées neutres
// (noires) — hauteur seule en v1.

import { useEffect, useRef } from 'react'
import { Renderer, Stave, StaveNote, Voice, Formatter } from 'vexflow'
import { useTheme } from '../../ThemeContext'
import { toVexKey } from './diatonic.ts'
import type { Clef, NoteItem } from './types.ts'

export type CellResult = 'correct' | 'wrong' | null

const OK = '#34d399'
const ERR = '#f87171'

// Couleurs par degré (do…si) — utilisées seulement si `coloriser` (OFF par défaut §6).
const PITCH_COLORS = ['#ef4444', '#f59e0b', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7']

function palette(dark: boolean) {
  return { stave: dark ? '#9CA3AF' : '#6B7280', head: dark ? '#F4F5F7' : '#0D1026' }
}

const SVGNS = 'http://www.w3.org/2000/svg'

interface Props {
  items: NoteItem[]
  clef: Clef
  cursorIndex: number
  results: CellResult[]
  coloriser?: boolean
  height?: number
  width?: number
}

interface Geom {
  heads: Element[]
  centersX: number[]
  cursorEl: SVGPathElement | null
  cursorY: number
}

export default function NotesStaff({
  items, clef, cursorIndex, results, coloriser = false, height = 220, width = 520,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const geomRef = useRef<Geom>({ heads: [], centersX: [], cursorEl: null, cursorY: 0 })
  const { dark } = useTheme()

  // ── Rendu VexFlow (lourd) — uniquement quand la ligne/clef/thème change ────────
  useEffect(() => {
    const host = hostRef.current
    if (!host || items.length === 0) return
    host.innerHTML = ''
    const C = palette(dark)

    try {
      const renderer = new Renderer(host, Renderer.Backends.SVG)
      renderer.resize(width, height)
      const ctx = renderer.getContext()

      const stave = new Stave(10, 40, width - 20)
      stave.addClef(clef)
      stave.setContext(ctx).draw()

      const vexNotes = items.map(it => new StaveNote({ clef, keys: [toVexKey(it.diatonicIndex)], duration: 'q' }))
      const voice = new Voice({ numBeats: items.length, beatValue: 4 })
      voice.setMode(Voice.Mode.SOFT)
      voice.addTickables(vexNotes)
      const innerW = stave.getX() + stave.getWidth() - stave.getNoteStartX() - 20
      new Formatter().joinVoices([voice]).format([voice], Math.max(60, innerW))
      voice.draw(ctx, stave)

      const svg = host.querySelector('svg') as SVGSVGElement | null
      if (!svg) return
      svg.style.background = 'transparent'

      // Recolore portée + hampes selon le thème (les têtes seront recolorées ensuite).
      svg.querySelectorAll('path').forEach(p => {
        const s = p.getAttribute('stroke') ?? ''
        const f = p.getAttribute('fill') ?? ''
        if (!s || s === '#000000' || s === 'black') p.setAttribute('stroke', C.stave)
        if (!f || f === '#000000' || f === 'black') p.setAttribute('fill', C.stave)
      })
      svg.querySelectorAll('text').forEach(t => { t.setAttribute('fill', C.stave) })

      const heads = Array.from(svg.querySelectorAll('.vf-notehead'))
      const centersX = vexNotes.map(sn => (sn.getNoteHeadBeginX() + sn.getNoteHeadEndX()) / 2)

      // Curseur : petit triangle sous la portée, pointant vers la note courante.
      const cursorY = (stave.getBottomY?.() ?? 140) + 6
      const cursorEl = document.createElementNS(SVGNS, 'path')
      cursorEl.setAttribute('fill', '#c084fc')
      cursorEl.setAttribute('d', 'M -7 12 L 7 12 L 0 0 Z')
      svg.appendChild(cursorEl)

      geomRef.current = { heads, centersX, cursorEl, cursorY }
      applyVisuals(geomRef.current, results, cursorIndex, coloriser, items, C.head)
    } catch (err) {
      console.warn('NotesStaff VexFlow:', (err as Error).message ?? err)
    }
    // Rebuild seulement si la ligne (ids), la clef, le thème ou la largeur changent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.map(i => i.id).join('|'), clef, dark, width, height])

  // ── Mise à jour légère : couleurs de têtes + curseur (pas de re-render VexFlow) ─
  useEffect(() => {
    applyVisuals(geomRef.current, results, cursorIndex, coloriser, items, palette(dark).head)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, cursorIndex, coloriser])

  return (
    <div style={{ width: '100%', maxWidth: width, margin: '0 auto', overflow: 'hidden' }}>
      <div ref={hostRef} style={{ width, minWidth: width }} />
    </div>
  )
}

function setHeadFill(head: Element, color: string) {
  head.querySelectorAll('path').forEach(p => p.setAttribute('fill', color))
  ;(head as SVGElement).setAttribute?.('fill', color)
}

function applyVisuals(
  geom: Geom, results: CellResult[], cursorIndex: number,
  coloriser: boolean, items: NoteItem[], headColor: string,
) {
  geom.heads.forEach((head, i) => {
    const r = results[i]
    const color = r === 'correct' ? OK
      : r === 'wrong' ? ERR
      : coloriser ? PITCH_COLORS[((items[i]?.diatonicIndex % 7) + 7) % 7]
      : headColor
    setHeadFill(head, color)
  })

  const { cursorEl, centersX, cursorY } = geom
  if (cursorEl) {
    const cx = centersX[cursorIndex]
    if (cx == null) {
      cursorEl.setAttribute('opacity', '0')
    } else {
      cursorEl.setAttribute('opacity', '1')
      cursorEl.setAttribute('transform', `translate(${cx} ${cursorY})`)
    }
  }
}
