// ─── Session audio de la page : moteur du spike + phrase + annotation (brief UI v1, § 4-5, 9) ──
// Le moteur (MoteurWeb) reste celui du spike. Ce hook le pilote avec un planning de phrase,
// suit les notes de l'élève (Live), applique les réglages à chaud et annote les résultats.
// Aucun état React par image : le stroboscope passe par une référence lue en rAF.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Reglage } from './dsp/reglages.ts'
import type { EtatStrobe } from './dsp/types.ts'
import { annoterNote, annoterNotes, type ContexteAnnotation, type NoteAnnotee } from './annotation.ts'
import { MoteurWeb, type Resultat } from './moteurAudio.ts'
import { SuiviNotes } from './notesLive.ts'
import type { EntreeSlot, Phrase } from './phrase.ts'
import { construirePlanningPhrase, type PlanningPhrase } from './planningPhrase.ts'
import type { ModeAffichage } from './protocole.ts'
import { realiserPhrase } from './realisation.ts'
import { echoEffectif, type PolitiqueEcho, type ReglagesAccordeur } from './reglagesLocaux.ts'
import { cleAppareil, lireLatence, memoriserLatence } from './temps.ts'

export type EtatSession = 'repos' | 'demarrage' | 'joue' | 'analyse'
const DUREE_DEROULEE_S = 590        // le Worker garde au plus 600 s de micro

export interface OptionsDemarrage {
  phrase: Phrase
  departSlot?: number
  avecDecompte?: boolean
  mode: ModeAffichage
  /** « Tenir l'accord » : l'entrée 0 de `phrase` sonne sans fin. */
  tenir?: boolean
}

/** Phrase d'un seul accord pour « Tenir l'accord » : l'entrée choisie est l'entrée 0. */
export function phraseTenue(base: Phrase, entree: EntreeSlot): Phrase {
  return { ...base, mesure: '4/4', nbMesures: 1, boucle: true, decompte: 0, entrees: { 0: { ...entree, formule: 'tenu' } } }
}

export function useSession(reg: ReglagesAccordeur, politiqueEcho: PolitiqueEcho) {
  const moteur = useRef<MoteurWeb | null>(null)
  const ppRef = useRef<PlanningPhrase | null>(null)
  const ctxRef = useRef<ContexteAnnotation | null>(null)
  const suivi = useRef(new SuiviNotes())
  const strobeRef = useRef<EtatStrobe[]>([])
  const rmsRef = useRef(0)
  const gainBase = useRef(0.1)
  const phraseCourante = useRef<Phrase | null>(null)
  const [etat, setEtat] = useState<EtatSession>('repos')
  const [erreur, setErreur] = useState<string | null>(null)
  const [latenceMs, setLatenceMs] = useState<number | null>(null)
  const [coupures, setCoupures] = useState(0)
  const [notesLive, setNotesLive] = useState<NoteAnnotee[]>([])
  const [noteEnCours, setNoteEnCours] = useState<NoteAnnotee | null>(null)
  const [notesFinales, setNotesFinales] = useState<NoteAnnotee[] | null>(null)
  const [resultat, setResultat] = useState<Resultat | null>(null)
  const [version, setVersion] = useState(0)             // change à chaque nouveau planning (tours, départ)

  const contexte = (phrase: Phrase, pp: PlanningPhrase): ContexteAnnotation => ({
    phrase, real: realiserPhrase(phrase), planning: pp.planning, ref: reg.ref, diapason: reg.diapason, tempUser: reg.tempUser,
  })

  const demarrer = useCallback(async (o: OptionsDemarrage) => {
    if (moteur.current) return
    setErreur(null); setNotesFinales(null); setResultat(null); setNotesLive([]); setNoteEnCours(null); setLatenceMs(null); setCoupures(0)
    suivi.current.reinitialiser()
    const phrase = o.tenir ? phraseTenue(o.phrase, o.phrase.entrees[o.departSlot ?? 0] ?? o.phrase.entrees[0]) : o.phrase
    phraseCourante.current = phrase
    const m = new MoteurWeb()
    moteur.current = m
    setEtat('demarrage')
    const memo = lireLatence(cleAppareil({ userAgent: navigator.userAgent, sampleRate: 48000 }))
    try {
      await m.demarrer({
        planningPhrase: fs => {
          const pp = construirePlanningPhrase(phrase, {
            sampleRate: fs, diapason: reg.diapason, tempUser: reg.tempUser, departSlot: o.tenir ? 0 : o.departSlot,
            avecDecompte: o.avecDecompte && !o.tenir, dureeS: DUREE_DEROULEE_S, tenuInfini: o.tenir,
          })
          ppRef.current = pp
          ctxRef.current = contexte(phrase, pp)
          gainBase.current = pp.planning.gain / Math.max(phrase.volume, 1e-6)
          return pp.planning
        },
        mode: o.mode, echo: echoEffectif(politiqueEcho), sessionIOS: 'defaut', analyse: true, diapason: reg.diapason,
        latenceMemoriseeMs: memo ?? undefined,
      }, {
        trame: t => { suivi.current.ajouter(t) },
        strobe: (etats, rms, c) => { strobeRef.current = etats; rmsRef.current = rms; if (c) setCoupures(c) },
        latence: ms => {
          setLatenceMs(ms)
          memoriserLatence(cleAppareil({ userAgent: navigator.userAgent, sampleRate: ppRef.current?.planning.sampleRate ?? 48000 }), ms)
        },
        erreur: msg => setErreur(msg),
      })
      setVersion(v => v + 1)
      setEtat('joue')
    } catch (e) {
      moteur.current = null
      setEtat('repos')
      const msg = String((e as Error)?.message ?? e)
      setErreur(/Permission|NotAllowed|denied/i.test(msg) ? 'micro-refuse' : /NotFound|Requested device/i.test(msg) ? 'micro-absent' : msg)
    }
  }, [reg, politiqueEcho])

  const arreter = useCallback(async () => {
    const m = moteur.current
    if (!m) return
    setEtat('analyse')
    try {
      const r = await m.arreter()
      const c = ctxRef.current
      setResultat(r)
      if (c) setNotesFinales(annoterNotes(r.notes, c, false))
      if (r.latenceMs) setLatenceMs(r.latenceMs)
    } catch (e) {
      setErreur(String((e as Error)?.message ?? e))
    } finally {
      moteur.current = null
      strobeRef.current = []
      setEtat('repos')
    }
  }, [])

  // notes en direct : rafraîchies à 10 Hz au plus
  useEffect(() => {
    if (etat !== 'joue') return
    const id = setInterval(() => {
      const c = ctxRef.current
      if (!c) return
      const brutes = suivi.current.notes
      setNotesLive(annoterNotes(brutes, c, true))
      const en = suivi.current.enCours
      setNoteEnCours(en && en.ouverte ? annoterNote(en, c, true) : null)
    }, 100)
    return () => clearInterval(id)
  }, [etat])

  useEffect(() => () => { void moteur.current?.arreter().catch(() => undefined) }, [])

  const reglerSon = useCallback((entree: number, role: string, r: Reglage) => { moteur.current?.reglerSon(entree, role, r) }, [])
  const definirVolume = useCallback((v: number) => { moteur.current?.definirGain(gainBase.current * v) }, [])

  /** « Tenir l'accord » : changement de structure (tonalité, degré, qualité…), pris à la frontière suivante. */
  const changerAccordTenu = useCallback((entree: EntreeSlot) => {
    const m = moteur.current, base = phraseCourante.current, pp = ppRef.current
    if (!m || !base || !pp) return
    const tc = (m.tempsCourant() ?? 0) + 0.2
    const phrase = phraseTenue(base, entree)
    phraseCourante.current = phrase
    const nouveau = construirePlanningPhrase(phrase, {
      sampleRate: pp.planning.sampleRate, diapason: reg.diapason, tempUser: reg.tempUser, t0Force: tc, tenuInfini: true, dureeS: DUREE_DEROULEE_S,
    })
    ppRef.current = { ...pp, planning: nouveau.planning }
    ctxRef.current = contexte(phrase, ppRef.current)
    m.remplacerPlanning(nouveau.planning, tc)
  }, [reg])

  const tempsAudible = useCallback((): number | null => moteur.current?.tempsAudible() ?? null, [])
  const tempsCourant = useCallback((): number | null => moteur.current?.tempsCourant() ?? null, [])

  return useMemo(() => ({
    etat, erreur, latenceMs, coupures, notesLive, noteEnCours, notesFinales, resultat, version,
    strobeRef, rmsRef, ppRef, ctxRef,
    demarrer, arreter, reglerSon, definirVolume, changerAccordTenu, tempsAudible, tempsCourant,
    effacer: () => { setNotesFinales(null); setResultat(null); setNotesLive([]); setNoteEnCours(null); suivi.current.reinitialiser() },
  }), [etat, erreur, latenceMs, coupures, notesLive, noteEnCours, notesFinales, resultat, version, demarrer, arreter, reglerSon, definirVolume, changerAccordTenu, tempsAudible, tempsCourant])
}
