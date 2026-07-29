// ─── Portée VexFlow + couche custom (spec §6) ─────────────────────────────────
//
// VexFlow pré-rend la portée + têtes NOIRES À HAMPES en une passe (durées neutres).
// La ligne est rendue à sa largeur naturelle dans un viewport plus étroit ; on la
// fait DÉFILER (translateX) pour garder la note courante centrée → empan visuel
// STABLE, y compris sur iPhone portrait. Le défilement et la colorisation des têtes
// vivent sur le DOM/CSS : AUCUN re-render VexFlow entre deux items d'une ligne
// (§13.4). Colorisation par hauteur = toggle (OFF par défaut §6).

import { useEffect, useRef, useState } from 'react'
import { Renderer, Stave, StaveNote, Voice, Formatter } from 'vexflow'
import { useTheme } from '../../ThemeContext'
import { toVexKey } from './diatonic.ts'
import type { Clef, NoteItem } from './types.ts'

export type CellResult = 'correct' | 'wrong' | null

const OK = '#34d399'
const ERR = '#f87171'
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
  notePx?: number
}

interface Geom {
  heads: Element[]
  centersX: number[]
  cursorEl: SVGPathElement | null
  cursorY: number
}

export default function NotesStaff({
  items, clef, cursorIndex, results, coloriser = false, height = 200, notePx = 84,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const geomRef = useRef<Geom>({ heads: [], centersX: [], cursorEl: null, cursorY: 0 })
  const [viewportW, setViewportW] = useState(360)
  const { dark } = useTheme()

  const idsKey = items.map(i => i.id).join('|')
  const contentW = Math.max(viewportW, items.length * notePx + 120)

  // Largeur réelle du viewport (responsive mobile/desktop).
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const update = () => { const w = el.clientWidth; if (w > 0) setViewportW(w) }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ── Rendu VexFlow (lourd) — ligne/clef/thème/largeur/colorisation ─────────────
  useEffect(() => {
    const host = innerRef.current
    if (!host || items.length === 0) return
    host.innerHTML = ''
    const C = palette(dark)

    try {
      const renderer = new Renderer(host, Renderer.Backends.SVG)
      renderer.resize(contentW, height)
      const ctx = renderer.getContext()

      const stave = new Stave(10, 36, contentW - 20)
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

      // Portée + hampes au thème (les têtes sont recolorées ensuite par applyVisuals).
      svg.querySelectorAll('path').forEach(p => {
        const s = p.getAttribute('stroke') ?? '', f = p.getAttribute('fill') ?? ''
        if (!s || s === '#000000' || s === 'black') p.setAttribute('stroke', C.stave)
        if (!f || f === '#000000' || f === 'black') p.setAttribute('fill', C.stave)
      })
      svg.querySelectorAll('text').forEach(t => t.setAttribute('fill', C.stave))

      const heads = Array.from(svg.querySelectorAll('.vf-notehead'))
      const centersX = vexNotes.map(sn => (sn.getNoteHeadBeginX() + sn.getNoteHeadEndX()) / 2)

      const cursorY = (stave.getBottomY?.() ?? 130) + 6
      const cursorEl = document.createElementNS(SVGNS, 'path')
      cursorEl.setAttribute('fill', '#c084fc')
      cursorEl.setAttribute('d', 'M -7 12 L 7 12 L 0 0 Z')
      svg.appendChild(cursorEl)

      geomRef.current = { heads, centersX, cursorEl, cursorY }
      applyVisuals(geomRef.current, results, cursorIndex, coloriser, items, C.head)
      applyScroll(innerRef.current, geomRef.current, cursorIndex, viewportW, contentW)
    } catch (err) {
      console.warn('NotesStaff VexFlow:', (err as Error).message ?? err)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, clef, dark, contentW, height, coloriser])

  // ── Couleurs des têtes (résultats) — pas de re-render VexFlow ──────────────────
  useEffect(() => {
    applyVisuals(geomRef.current, results, cursorIndex, coloriser, items, palette(dark).head)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, cursorIndex, coloriser])

  // ── Défilement : garder la note courante centrée (empan stable) ────────────────
  useEffect(() => {
    applyScroll(innerRef.current, geomRef.current, cursorIndex, viewportW, contentW)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorIndex, viewportW, contentW, idsKey])

  return (
    <div ref={viewportRef} style={{ width: '100%', overflow: 'hidden' }}>
      <div ref={innerRef} style={{ width: contentW, willChange: 'transform', transition: 'transform 0.28s ease' }} />
    </div>
  )
}

function setFill(el: Element, color: string) {
  el.setAttribute('fill', color)
  const s = (el as unknown as { style?: CSSStyleDeclaration }).style
  if (s) s.fill = color // certains navigateurs : VexFlow pose fill en style inline
}

function setHeadFill(head: Element, color: string) {
  setFill(head, color)
  head.querySelectorAll('path').forEach(p => setFill(p, color))
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
    cursorEl.setAttribute('opacity', cx == null ? '0' : '1')
    if (cx != null) cursorEl.setAttribute('transform', `translate(${cx} ${cursorY})`)
  }
}

function applyScroll(inner: HTMLDivElement | null, geom: Geom, cursorIndex: number, viewportW: number, contentW: number) {
  if (!inner) return
  const cx = geom.centersX[cursorIndex] ?? contentW / 2
  let tx = viewportW / 2 - cx          // centre la note courante
  if (contentW > viewportW) tx = Math.max(viewportW - contentW, Math.min(0, tx)) // clamp aux bords
  inner.style.transform = `translateX(${tx}px)`
}
