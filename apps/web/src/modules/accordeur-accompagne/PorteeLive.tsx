// ─── Portée live (brief UI v1, § 5.3) ────────────────────────────────────────────────
// Clef et armure gravées par VexFlow (effet lourd, seulement quand clef, armure, thème ou largeur
// changent) ; les mesures, les têtes de notes, les altérations, les lignes supplémentaires et les
// liaisons sont dessinées directement (couche légère : recoloration sans regravure).
// Chaque mesure est exactement au-dessus de ses slots : x = X0 + temps × largeur d'un slot.

import { useEffect, useMemo, useRef } from 'react'
import { Renderer, Stave } from 'vexflow'
import { useTheme } from '../../ThemeContext'
import type { NoteAnnotee } from './annotation.ts'
import { couleurEcart } from './couleurs.ts'
import {
  alterationsAffichees, armureParLettre, lignesSupplementaires, nbAlterations, noteEcrite, positionPortee, tonaliteEcrite,
  type Cle,
} from './notation.ts'
import { coupuresDeTour, decouperNote, liaisons, type Morceau } from './portee.ts'
import { nbSlots, tempsParMesure, type Phrase } from './phrase.ts'
import { tempsMusical, type PlanningPhrase } from './planningPhrase.ts'

export const STAVE_Y = 20
export const Y_HAUT = STAVE_Y + 40          // première ligne (haut) de la portée VexFlow
export const Y_BAS = Y_HAUT + 40            // ligne du bas
export const HAUTEUR_PORTEE = 190
const DEMI = 5                              // demi-interligne en px

const CLES_MAJEUR = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#']
const BEMOLS_MAJEUR = ['C', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb']
const CLES_MINEUR = ['Am', 'Em', 'Bm', 'F#m', 'C#m', 'G#m', 'D#m', 'A#m']
const BEMOLS_MINEUR = ['Am', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm', 'Abm']

function nomArmureVexflow(n: number, mineur: boolean): string {
  const k = Math.min(7, Math.abs(n))
  return n >= 0 ? (mineur ? CLES_MINEUR : CLES_MAJEUR)[k] : (mineur ? BEMOLS_MINEUR : BEMOLS_MAJEUR)[k]
}

/** Largeur réservée à gauche pour clef + armure (en px). */
export function largeurPrefixe(phrase: Phrase, transpo: string): number {
  const e = tonaliteEcrite(phrase.entrees[0].tonalite, transpo)
  return 64 + 12 * Math.abs(nbAlterations(e.nomTonique, e.mode))
}

export interface TeteAffichee {
  piece: Morceau<{ tOn: number; tOff: number }>
  note: NoteAnnotee
  tour: number
  x: number; y: number; pos: number
  couleur: string
  signe: 'diese' | 'bemol' | 'becarre' | null
  nom: string
}

/** Calcule les têtes à afficher (toutes les notes, tous les tours) : logique de placement sans React. */
export function calculerTetes(notes: NoteAnnotee[], phrase: Phrase, pp: PlanningPhrase, cle: Cle, transpo: string, seuil: number, X0: number, LS: number): TeteAffichee[] {
  if (!notes.length) return []
  const n = nbSlots(phrase), pm = tempsParMesure(phrase.mesure)
  const armure = armureParLettre(...(() => { const e = tonaliteEcrite(phrase.entrees[0].tonalite, transpo); return [e.nomTonique, e.mode] as const })())
  const ordre = [...notes].sort((a, b) => a.tOn - b.tOn)
  const maxBeat = Math.max(...ordre.map(x => tempsMusical(pp, x.tOff))) + 1
  const coupures = coupuresDeTour(phrase, maxBeat)
  const brut: { piece: Morceau<{ tOn: number; tOff: number }>; note: NoteAnnotee; tour: number; liee: boolean }[] = []
  for (const note of ordre) {
    const mOn = tempsMusical(pp, note.tOn), mOff = tempsMusical(pp, note.tOff)
    if (mOff < 0) continue                                   // pendant le décompte
    const tour = Math.floor(mOn / n)
    for (const piece of decouperNote({ tOn: Math.max(0, mOn), tOff: Math.max(mOn + 0.05, mOff) }, coupures, pm)) {
      brut.push({ piece, note, tour: Math.floor((piece.debut + 1e-6) / n), liee: piece.lieeAvant })
    }
    void tour
  }
  const ecrites = brut.map(b => {
    const e = tonaliteEcrite(phrase.entrees[b.note.entree]?.tonalite ?? phrase.entrees[0].tonalite, transpo)
    return noteEcrite(b.note.midi, e)
  })
  const signes = alterationsAffichees(brut.map((b, i) => ({ lettre: ecrites[i].lettre, alt: ecrites[i].alt, octave: ecrites[i].octave, mesure: Math.floor((b.piece.debut + 1e-6) / pm), liee: b.liee })), armure)
  return brut.map((b, i) => {
    const pos = positionPortee(ecrites[i].diatonique, cle)
    const tour = b.tour
    return {
      piece: b.piece, note: b.note, tour, pos,
      x: X0 + (b.piece.debut - tour * n) * LS + 6, y: Y_BAS - pos * DEMI,
      couleur: couleurEcart(b.note.ecart, seuil), signe: signes[i], nom: ecrites[i].nom,
    }
  })
}

interface Props {
  phrase: Phrase
  transpo: string
  cle: Cle
  seuil: number
  X0: number
  LS: number
  tetes: TeteAffichee[]
  /** Têtes du tour précédent, en gris, qui disparaissent quand la tête de lecture les atteint. */
  tetesAnciennes: TeteAffichee[]
  registrerAncienne: (cle: string, el: SVGGElement | null, beat: number) => void
  onNote?: (t: TeteAffichee) => void
  /** Note ouverte dans la bulle : entourée d'un anneau. */
  selection?: NoteAnnotee | null
}

export default function PorteeLive({ phrase, transpo, cle, seuil, X0, LS, tetes, tetesAnciennes, registrerAncienne, onNote, selection }: Props) {
  const { dark } = useTheme()
  const hote = useRef<HTMLDivElement>(null)
  const e0 = tonaliteEcrite(phrase.entrees[0].tonalite, transpo)
  const nAlt = nbAlterations(e0.nomTonique, e0.mode)
  const largeur = X0 + nbSlots(phrase) * LS + 24
  const pm = tempsParMesure(phrase.mesure)
  const nMesures = phrase.nbMesures
  const couleurPortee = dark ? '#C2C9D6' : '#6B7280'
  void seuil

  // gravure VexFlow : clef + armure (effet lourd)
  useEffect(() => {
    const h = hote.current
    if (!h) return
    h.innerHTML = ''
    try {
      const r = new Renderer(h, Renderer.Backends.SVG)
      r.resize(X0, HAUTEUR_PORTEE)
      const ctx = r.getContext()
      const st = new Stave(0, STAVE_Y, X0 - 2)
      st.addClef(cle === 'sol' ? 'treble' : 'bass')
      if (nAlt !== 0) st.addKeySignature(nomArmureVexflow(nAlt, e0.mode === 'mineur'))
      st.setContext(ctx).draw()
      const svg = h.querySelector('svg')
      if (svg) {
        ;(svg as SVGSVGElement).style.background = 'transparent'
        ;(svg as SVGSVGElement).style.fill = couleurPortee      // glyphes (clef, altérations) sans attribut fill : ils héritent
        svg.querySelectorAll('path, line, rect').forEach(p => {
          const s = p.getAttribute('stroke') ?? '', f = p.getAttribute('fill') ?? ''
          if (!s || s === '#000000' || s === 'black') p.setAttribute('stroke', couleurPortee)
          if (f === '#000000' || f === 'black') p.setAttribute('fill', couleurPortee)
        })
      }
    } catch { /* gravure impossible : la portée reste lisible sans clef */ }
  }, [cle, nAlt, e0.mode, X0, dark, couleurPortee])

  const liens = useMemo(() => {
    const out: { d: string; k: string }[] = []
    const groupes = new Map<NoteAnnotee, TeteAffichee[]>()
    for (const t of tetes) { const a = groupes.get(t.note) ?? []; a.push(t); groupes.set(t.note, a) }
    for (const [, g] of groupes) {
      g.sort((a, b) => a.piece.debut - b.piece.debut)
      for (const [i, j] of liaisons(g.map(x => x.piece))) {
        const a = g[i], b = g[j]
        if (a.tour !== b.tour) continue
        const dessous = a.pos >= 4
        const dy = dessous ? 8 : -8
        out.push({ k: `${a.x}-${b.x}`, d: `M${a.x + 6} ${a.y + dy} Q${(a.x + b.x) / 2} ${a.y + dy * 2.6} ${b.x - 6} ${b.y + dy}` })
      }
    }
    return out
  }, [tetes])

  const rendre = (t: TeteAffichee, gris: boolean, k: string) => {
    const c = gris ? '#9ca3af' : t.couleur
    return (
      <g key={k} opacity={gris ? 0.5 : t.note.provisoire ? 0.92 : 1} onPointerDown={e => e.stopPropagation()} onClick={() => onNote?.(t)} style={{ cursor: onNote ? 'pointer' : 'default' }}>
        {lignesSupplementaires(t.pos).map(p => <line key={p} x1={t.x - 12} x2={t.x + 12} y1={Y_BAS - p * DEMI} y2={Y_BAS - p * DEMI} stroke={couleurPortee} strokeWidth={2} />)}
        {t.signe && <text x={t.x - 17} y={t.y + 5} textAnchor="middle" fontSize={17} fill={couleurPortee}>{t.signe === 'diese' ? '♯' : t.signe === 'bemol' ? '♭' : '♮'}</text>}
        {!gris && selection === t.note && <circle cx={t.x} cy={t.y} r={13} fill="none" stroke="var(--text)" strokeWidth={1.6} strokeDasharray="3 2" />}
        <ellipse cx={t.x} cy={t.y} rx={7.2} ry={4.9} transform={`rotate(-20 ${t.x} ${t.y})`} fill={c} stroke="var(--text)" strokeWidth={0.8} style={{ transition: 'fill .4s' }} />
        <rect x={t.x - 12} y={t.y - 12} width={24} height={24} fill="transparent" />
        <title>{`${t.nom}${t.note.provisoire ? ' (provisoire)' : ''}`}</title>
      </g>
    )
  }

  return (
    <div style={{ position: 'relative', width: largeur, height: HAUTEUR_PORTEE }}>
      <div ref={hote} style={{ position: 'absolute', left: 0, top: 0, width: X0, height: HAUTEUR_PORTEE }} aria-hidden="true" />
      <svg width={largeur} height={HAUTEUR_PORTEE} style={{ position: 'absolute', left: 0, top: 0 }} role="img" aria-label="Portée : notes jouées par l’élève">
        {[0, 1, 2, 3, 4].map(i => <line key={i} x1={X0 - 2} x2={largeur - 12} y1={Y_HAUT + i * 10} y2={Y_HAUT + i * 10} stroke={couleurPortee} strokeWidth={1.5} />)}
        {Array.from({ length: nMesures + 1 }, (_, m) => {
          const x = X0 + m * pm * LS
          return <line key={m} x1={x} x2={x} y1={Y_HAUT} y2={Y_BAS} stroke={couleurPortee} strokeWidth={m === 0 || m === nMesures ? 2 : 1.2} />
        })}
        {tetesAnciennes.map((t, i) => {
          const k = `a${i}`
          return <g key={k} ref={el => registrerAncienne(k, el, t.piece.debut - t.tour * nbSlots(phrase))}>{rendre(t, true, k)}</g>
        })}
        {liens.map(l => <path key={l.k} d={l.d} fill="none" stroke="var(--text-muted)" strokeWidth={1.4} />)}
        {tetes.map((t, i) => rendre(t, false, `t${i}`))}
      </svg>
    </div>
  )
}
