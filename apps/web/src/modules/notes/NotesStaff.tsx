// ─── Portée VexFlow + couche custom (spec §6) ─────────────────────────────────
//
// VexFlow pré-rend la portée + les HAMPES en une passe (durées neutres). Les têtes
// NATIVES sont masquées et redessinées en ellipses sur une couche custom — comme
// AccordeurStaff — car VexFlow pose le `fill` des têtes en style inline (impossible
// à surcharger de façon fiable après coup ; cf. galère colorisation Rythme, résolue
// par contrôle direct des têtes). On maîtrise ainsi couleur (hauteur/juste/faux) et
// on recolore SANS re-render VexFlow entre deux items d'une ligne (§13.4).
//
// La ligne est rendue à sa largeur naturelle dans un viewport plus étroit, et on la
// fait DÉFILER pour garder la note courante au CENTRE horizontal (empan stable) :
// première note centrée, décalage progressif à chaque validation.

import { useEffect, useRef, useState } from 'react'
import { Renderer, Stave, StaveNote, Voice, Formatter } from 'vexflow'
import { useTheme } from '../../ThemeContext'
import { toVexKey } from './diatonic.ts'
import { stringColorOf } from './strings.ts'
import type { Clef, NoteItem } from './types.ts'

export type CellResult = 'correct' | 'wrong' | null

const OK = '#34d399'
const ERR = '#f87171'
const PITCH_COLORS = ['#ef4444', '#f59e0b', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7']
const HEAD_RX = 7.2
const HEAD_RY = 4.7
const LINE_PX = 10        // espacement VexFlow entre deux lignes de portée
const TOP_MARGIN = 22     // marge au-dessus de la 6e ligne supplémentaire
const LEDGERS_ABOVE = 6   // lignes suppl. potentielles au-dessus (flûte / violon)

function palette(dark: boolean) {
  // Portée + lignes supplémentaires : plus clair en dark pour un contraste net sur
  // le fond très sombre (#030712), sinon les lignes supplémentaires disparaissent.
  return { stave: dark ? '#C2C9D6' : '#6B7280', head: dark ? '#F4F5F7' : '#0D1026' }
}

const SVGNS = 'http://www.w3.org/2000/svg'
function svgEl(tag: string, attrs: Record<string, string>) {
  const e = document.createElementNS(SVGNS, tag)
  for (const k in attrs) e.setAttribute(k, attrs[k])
  return e
}

interface Props {
  items: NoteItem[]
  clef: Clef
  cursorIndex: number
  results: CellResult[]
  coloriser?: boolean
  /** Instrument à cordes : colore chaque tête selon sa corde (prioritaire sur `coloriser`). */
  stringColorId?: string
  height?: number
  notePx?: number
}

interface Geom {
  heads: SVGEllipseElement[]
  centersX: number[]
  cursorEl: SVGPathElement | null
  cursorY: number
}

export default function NotesStaff({
  items, clef, cursorIndex, results, coloriser = false, stringColorId, height = 210, notePx = 84,
}: Props) {
  // Portée ANCRÉE EN HAUT : marge supérieure + place pour 6 lignes supplémentaires
  // au-dessus (flûte / violon en clef de sol montent très haut). En remontant la
  // portée on dégage de l'espace en bas pour la roue de saisie. Position CONSTANTE
  // (dérivée de constantes, pas de la hauteur) → la portée ne bouge jamais.
  const staveY = TOP_MARGIN + LEDGERS_ABOVE * LINE_PX
  const viewportRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const geomRef = useRef<Geom>({ heads: [], centersX: [], cursorEl: null, cursorY: 0 })
  const [viewportW, setViewportW] = useState(360)
  const { dark } = useTheme()

  const idsKey = items.map(i => i.id).join('|')
  const contentW = Math.max(viewportW, items.length * notePx + 140)

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const update = () => { const w = el.clientWidth; if (w > 0) setViewportW(w) }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ── Rendu VexFlow (lourd) — ligne/clef/thème/largeur ──────────────────────────
  useEffect(() => {
    const host = innerRef.current
    if (!host || items.length === 0) return
    host.innerHTML = ''
    const C = palette(dark)

    try {
      const renderer = new Renderer(host, Renderer.Backends.SVG)
      renderer.resize(contentW, height)
      const ctx = renderer.getContext()

      const stave = new Stave(10, staveY, contentW - 20)
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

      // Portée + hampes + LIGNES SUPPLÉMENTAIRES au thème (path/line/rect : VexFlow
      // peut dessiner les lignes supplémentaires hors <path>).
      svg.querySelectorAll('path, line, rect').forEach(p => {
        const s = p.getAttribute('stroke') ?? '', f = p.getAttribute('fill') ?? ''
        const stroked = !s || s === '#000000' || s === 'black'
        if (stroked) {
          p.setAttribute('stroke', C.stave)
          // Épaissit portée/hampes/LIGNES SUPPLÉMENTAIRES pour une meilleure lisibilité.
          const sw = parseFloat(p.getAttribute('stroke-width') || '1')
          p.setAttribute('stroke-width', String(Math.max(sw, 1.8)))
        }
        if (f === '#000000' || f === 'black') p.setAttribute('fill', C.stave)
      })
      svg.querySelectorAll('text').forEach(t => t.setAttribute('fill', C.stave))

      // Têtes natives masquées → redessinées en ellipses (couche custom, contrôlables).
      svg.querySelectorAll('.vf-notehead').forEach(n => { (n as SVGElement).style.opacity = '0' })

      const layer = svgEl('g', { class: 'notes-heads' })
      const heads: SVGEllipseElement[] = []
      const centersX: number[] = []
      vexNotes.forEach(sn => {
        const cx = (sn.getNoteHeadBeginX() + sn.getNoteHeadEndX()) / 2
        const cy = sn.getYs()[0] ?? 60
        centersX.push(cx)
        const e = svgEl('ellipse', {
          cx: String(cx), cy: String(cy), rx: String(HEAD_RX), ry: String(HEAD_RY),
          transform: `rotate(-20 ${cx} ${cy})`, fill: C.head,
        }) as SVGEllipseElement
        layer.appendChild(e)
        heads.push(e)
      })
      svg.appendChild(layer)

      const cursorY = (stave.getBottomY?.() ?? 130) + 6
      const cursorEl = svgEl('path', { fill: '#c084fc', d: 'M -7 12 L 7 12 L 0 0 Z' }) as SVGPathElement
      svg.appendChild(cursorEl)

      geomRef.current = { heads, centersX, cursorEl, cursorY }
      applyColors(geomRef.current, results, coloriser, stringColorId, items, C.head)
      applyCursor(geomRef.current, cursorIndex)
      applyScroll(innerRef.current, geomRef.current, cursorIndex, viewportW, contentW)
    } catch (err) {
      console.warn('NotesStaff VexFlow:', (err as Error).message ?? err)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, clef, dark, contentW, height])

  // ── Couleurs des têtes (résultats / hauteur / corde) — pas de re-render VexFlow ─
  useEffect(() => {
    applyColors(geomRef.current, results, coloriser, stringColorId, items, palette(dark).head)
    applyCursor(geomRef.current, cursorIndex)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, cursorIndex, coloriser, stringColorId, dark])

  // ── Défilement : note courante au centre horizontal (empan stable) ─────────────
  useEffect(() => {
    applyScroll(innerRef.current, geomRef.current, cursorIndex, viewportW, contentW)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorIndex, viewportW, contentW, idsKey])

  return (
    <div ref={viewportRef} style={{ width: '100%', overflow: 'hidden' }}>
      <div ref={innerRef} style={{ width: contentW, willChange: 'transform', transition: 'transform 0.32s ease' }} />
    </div>
  )
}

function applyColors(geom: Geom, results: CellResult[], coloriser: boolean, stringColorId: string | undefined, items: NoteItem[], headColor: string) {
  geom.heads.forEach((head, i) => {
    const r = results[i]
    const idx = items[i]?.diatonicIndex ?? 0
    const stringColor = stringColorId ? stringColorOf(idx, stringColorId) : undefined
    const color = r === 'correct' ? OK
      : r === 'wrong' ? ERR
      : stringColor ?? (coloriser ? PITCH_COLORS[((idx % 7) + 7) % 7] : headColor)
    head.setAttribute('fill', color)
  })
}

function applyCursor(geom: Geom, cursorIndex: number) {
  const { cursorEl, centersX, cursorY } = geom
  if (!cursorEl) return
  const cx = centersX[cursorIndex]
  cursorEl.setAttribute('opacity', cx == null ? '0' : '1')
  if (cx != null) cursorEl.setAttribute('transform', `translate(${cx} ${cursorY})`)
}

function applyScroll(inner: HTMLDivElement | null, geom: Geom, cursorIndex: number, viewportW: number, contentW: number) {
  if (!inner) return
  const cx = geom.centersX[cursorIndex] ?? contentW / 2
  const tx = viewportW / 2 - cx   // note courante au centre horizontal ; décalage progressif
  inner.style.transform = `translateX(${tx}px)`
}
