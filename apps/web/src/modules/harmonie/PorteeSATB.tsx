// ─── Le système à quatre voix — ce qui a sonné, écrit ────────────────────────
//
// Clef de sol : soprano et alto · clef de fa : ténor et basse. C'est la
// disposition de `dispositions.ts`, qui range déjà ses hauteurs dans cet ordre
// (basse, ténor, alto, soprano) et les tient dans les tessitures du quatuor.
//
// ⚠ CET ÉCRAN NE S'AFFICHE QU'EN CORRECTION. Il donne le corrigé : le montrer
// pendant que l'élève cherche reviendrait à lui donner la réponse — même règle
// que le « ▶ A n'existe qu'après la réponse » de la détection.
//
// Deux vues, choisies par `TogglePortee` :
//   `tonalite` — la tonalité réellement entendue, avec son armure
//   `ut`       — remis en Do majeur / la mineur, donc SANS ARMURE : la sensible du
//                mineur apparaît alors en altération accidentelle, ce qui est
//                précisément ce qu'on veut faire lire.
//
// Deux rendus séparés, comme dans `NotesStaff` : un effet LOURD qui construit la
// portée (VexFlow), un effet LÉGER qui ne fait que recolorer. L'accord courant
// s'illumine ainsi au fil de la réécoute sans reconstruire le SVG à chaque note.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Accidental, Formatter, Renderer, Stave, StaveConnector, StaveNote, Voice } from 'vexflow'

import { useTheme } from '../../ThemeContext'
import { realiserProgression } from './dispositions.ts'
import {
  TONIQUE_UT,
  armureVex,
  cleVex,
  ecrireAccord,
  transposerVersUt,
} from './notation.ts'
import { type Progression } from './types.ts'

const ACCENT = '#c084fc'
const ERREUR = '#f87171'

export type VuePortee = 'masquee' | 'tonalite' | 'ut'

// Ordre des voix tel que `realiserProgression` les rend.
const BASSE = 0
const TENOR = 1
const ALTO = 2
const SOPRANO = 3

// Marges verticales calculées sur les TESSITURES déclarées, pas sur l'habitude :
// le soprano monte à MIDI 84 (do6, trois lignes supplémentaires au-dessus de la
// clef de sol) et la basse descend à 36 (do1, sous la clef de fa). Sans cette
// réserve, les extrêmes seraient rognés par le cadre SVG.
const Y_SOL = 34
const Y_FA = 126
const HAUTEUR = 224
const LARGEUR_ACCORD = 56
// Clef + armure : jusqu'à sept altérations (mi♭ mineur, sol♯ mineur).
const MARGE_CLEF = 120

function palette(dark: boolean) {
  // Même raison que dans `NotesStaff` : sur le fond très sombre, une portée gris
  // moyen fait disparaître les lignes supplémentaires.
  return { trait: dark ? '#C2C9D6' : '#6B7280', tete: dark ? '#F4F5F7' : '#0D1026' }
}

export default function PorteeSATB({
  progression,
  vue,
  indexCourant = null,
  fautes = [],
}: {
  progression: Progression
  /** `masquee` n'est pas rendu ici : l'appelant ne monte pas le composant. */
  vue: Exclude<VuePortee, 'masquee'>
  /** Accord en train de sonner, illuminé. */
  indexCourant?: number | null
  /** Index des accords à marquer en rouge. */
  fautes?: readonly number[]
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const hoteRef = useRef<HTMLDivElement>(null)
  const groupesRef = useRef<SVGElement[][]>([])
  const [largeurVue, setLargeurVue] = useState(320)
  const [echec, setEchec] = useState(false)
  const { dark } = useTheme()

  const accords = progression.accords
  const contenuLargeur = Math.max(largeurVue, accords.length * LARGEUR_ACCORD + MARGE_CLEF)

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const mesurer = () => {
      const l = el.clientWidth
      if (l > 0) setLargeurVue(l)
    }
    mesurer()
    const ro = new ResizeObserver(mesurer)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Les hauteurs écrites, dans la tonalité de la vue. La remise en Ut TRANSPOSE
  // la réalisation au lieu de la recalculer : le registre et la disposition sont
  // ceux qu'on a entendus, seule l'armure change.
  const { hauteurs, toniqueEcrite } = useMemo(() => {
    const realisation = realiserProgression(progression)
    if (vue === 'tonalite') {
      return { hauteurs: realisation, toniqueEcrite: progression.tonique }
    }
    return {
      hauteurs: transposerVersUt(realisation, progression.tonique, progression.mode),
      toniqueEcrite: TONIQUE_UT[progression.mode],
    }
  }, [progression, vue])

  // ── Effet LOURD : la portée ────────────────────────────────────────────────
  useEffect(() => {
    const hote = hoteRef.current
    if (!hote || accords.length === 0) return
    hote.innerHTML = ''
    groupesRef.current = []
    const C = palette(dark)

    try {
      const renderer = new Renderer(hote, Renderer.Backends.SVG)
      renderer.resize(contenuLargeur, HAUTEUR)
      const ctx = renderer.getContext()

      const armure = armureVex(toniqueEcrite, progression.mode)
      const sol = new Stave(4, Y_SOL, contenuLargeur - 12).addClef('treble').addKeySignature(armure)
      const fa = new Stave(4, Y_FA, contenuLargeur - 12).addClef('bass').addKeySignature(armure)
      sol.setContext(ctx).draw()
      fa.setContext(ctx).draw()

      // L'accolade fait le système : sans elle, deux portées empilées ne se lisent
      // pas comme quatre voix simultanées.
      new StaveConnector(sol, fa).setType('brace').setContext(ctx).draw()
      new StaveConnector(sol, fa).setType('singleLeft').setContext(ctx).draw()

      // Une note par voix et par accord, orthographiée depuis L'ACCORD et non
      // depuis le MIDI — `notation.ts` explique pourquoi on ne devine jamais.
      const ecrites = accords.map((accord, i) =>
        ecrireAccord(hauteurs[i], accord, toniqueEcrite, progression.mode),
      )

      const notesParVoix = [SOPRANO, ALTO, TENOR, BASSE].map((voix, rang) =>
        ecrites.map(
          (notes) =>
            new StaveNote({
              clef: rang < 2 ? 'treble' : 'bass',
              keys: [cleVex(notes[voix])],
              duration: 'h',
              // Hampes opposées dans chaque portée : c'est ce qui rend les deux
              // voix distinctes quand elles se croisent ou se serrent.
              stemDirection: rang % 2 === 0 ? 1 : -1,
            }),
        ),
      )

      const voix = notesParVoix.map((notes) => {
        const v = new Voice({ numBeats: accords.length * 2, beatValue: 4 })
        v.setMode(Voice.Mode.SOFT)
        v.addTickables(notes)
        return v
      })

      // VexFlow décide seul des altérations à IMPRIMER, armure comprise : c'est
      // ce qui évite un dièse redondant sur une sensible déjà à l'armure.
      Accidental.applyAccidentals(voix, armure)

      // Les voix se joignent PAR PORTÉE (soprano+alto, ténor+basse) puis se
      // formatent ensemble : les quatre restent alignées dans le temps sans que
      // les altérations d'une clef n'écartent les notes de l'autre.
      const utile = sol.getX() + sol.getWidth() - sol.getNoteStartX() - 16
      new Formatter()
        .joinVoices([voix[0], voix[1]])
        .joinVoices([voix[2], voix[3]])
        .format(voix, Math.max(80, utile))

      voix[0].draw(ctx, sol)
      voix[1].draw(ctx, sol)
      voix[2].draw(ctx, fa)
      voix[3].draw(ctx, fa)

      const svg = hote.querySelector('svg') as SVGSVGElement | null
      if (svg) {
        svg.style.background = 'transparent'
        // Portée, hampes, lignes supplémentaires et clefs au thème. Même balayage
        // que `NotesStaff` : VexFlow pose du noir en dur.
        svg.querySelectorAll('path, line, rect').forEach((p) => {
          const s = p.getAttribute('stroke') ?? ''
          const f = p.getAttribute('fill') ?? ''
          if (!s || s === '#000000' || s === 'black') p.setAttribute('stroke', C.trait)
          if (f === '#000000' || f === 'black') p.setAttribute('fill', C.trait)
        })
        svg.querySelectorAll('text').forEach((t) => t.setAttribute('fill', C.trait))
      }

      // Un groupe d'éléments SVG par accord : de quoi recolorer sans redessiner.
      groupesRef.current = accords.map((_, i) =>
        notesParVoix
          .map((notes) => notes[i].getSVGElement())
          .filter((el): el is SVGElement => el !== undefined),
      )
      setEchec(false)
    } catch (e) {
      // Un plantage de gravure ne doit pas emporter l'écran de correction : le
      // cercle et les chiffrages, eux, restent lisibles.
      console.warn('PorteeSATB', e)
      setEchec(true)
    }
  }, [accords, hauteurs, toniqueEcrite, progression.mode, contenuLargeur, dark])

  // ── Effet LÉGER : la couleur ───────────────────────────────────────────────
  useEffect(() => {
    const C = palette(dark)
    groupesRef.current.forEach((groupe, i) => {
      const couleur = i === indexCourant ? ACCENT : fautes.includes(i) ? ERREUR : C.tete
      groupe.forEach((el) => {
        el.setAttribute('fill', couleur)
        el.setAttribute('stroke', couleur)
        el.querySelectorAll('path, rect, ellipse, text').forEach((n) => {
          n.setAttribute('fill', couleur)
          n.setAttribute('stroke', couleur)
        })
      })
    })
    // `contenuLargeur` et `accords` sont des dépendances de l'effet LOURD : quand
    // il regrave, les groupes changent d'identité et la couleur doit être reposée.
  }, [indexCourant, fautes, dark, hauteurs, toniqueEcrite, contenuLargeur, accords])

  return (
    <div
      ref={viewportRef}
      style={{ width: '100%', overflowX: 'auto', overflowY: 'hidden' }}
      role="img"
      aria-label={`Réalisation à quatre voix, ${
        vue === 'ut' ? 'remise en Ut' : 'dans la tonalité entendue'
      }`}
    >
      <div ref={hoteRef} style={{ width: contenuLargeur }} />
      {echec && (
        <div className="text-app-muted" style={{ fontSize: 12, textAlign: 'center', padding: 8 }}>
          Portée indisponible.
        </div>
      )}
    </div>
  )
}
