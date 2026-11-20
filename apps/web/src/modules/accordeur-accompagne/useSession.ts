// ─── Session audio de la page : moteur du spike + phrase + annotation (brief UI v1, § 4-5, 9) ──
// Le moteur (MoteurWeb) reste celui du spike. Ce hook le pilote avec un planning de phrase,
// suit les notes de l'élève (Live), applique les réglages à chaud et annote les résultats.
// Aucun état React par image : le stroboscope passe par une référence lue en rAF.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Reglage } from './dsp/reglages.ts'
import type { EtatStrobe, NoteFinale, Planning, TrameAnalyse } from './dsp/types.ts'
import type { ReglagesSegmentation } from '../../profilsSegmentation.ts'
import { notesDepuisSegments, pointsAncien, segmentsAncien, type NoteAncien } from './ancienMoteur.ts'
import { decalageOptimal, nombreDeTetes } from './decalage.ts'
import { ajouterCorrection, appliquerCorrections, type Correction } from './corrections.ts'
import type { PointHauteur } from './sparklines.ts'
import { annoterNote, annoterNotes, type ContexteAnnotation, type NoteAnnotee } from './annotation.ts'
import { MoteurWeb, type Resultat } from './moteurAudio.ts'
import { SuiviNotes } from './notesLive.ts'
import type { EntreeSlot, Phrase } from './phrase.ts'
import { construirePlanningPhrase, type PlanningPhrase } from './planningPhrase.ts'
import type { DepuisRecalcul, ModeAffichage, MoteurDetection, VersRecalcul } from './protocole.ts'
import { cleTrames, type ReglagesNouveau } from './reglagesNouveau.ts'
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

/** Prise conservée après l'arrêt : de quoi la ré-analyser avec l'un ou l'autre moteur, sans rejouer. */
interface Prise {
  micro: Float32Array; fs: number; offset: number     // offset : échantillons (retard de boucle)
  planning: Planning                                  // planning tel que le Worker l'a modifié
  ctx: ContexteAnnotation
  pp: PlanningPhrase                                  // pour passer du temps du planning aux temps musicaux
}
type BrutAncien = { hz: Float32Array; clarity: Float32Array; rms: Float32Array }
interface ResultatNouveau { trames: TrameAnalyse[]; notes: NoteFinale[]; reglages: ReglagesNouveau }
const DELAI_RECALCUL_MS = 500
type SansId<T> = T extends unknown ? Omit<T, 'id'> : never

export function useSession(
  reg: ReglagesAccordeur, politiqueEcho: PolitiqueEcho, moteurChoisi: MoteurDetection,
  reglagesSeg: ReglagesSegmentation, reglagesNouveau: ReglagesNouveau,
) {
  const moteur = useRef<MoteurWeb | null>(null)
  const ppRef = useRef<PlanningPhrase | null>(null)
  const ctxRef = useRef<ContexteAnnotation | null>(null)
  const suivi = useRef(new SuiviNotes())
  const strobeRef = useRef<EtatStrobe[]>([])
  const rmsRef = useRef(0)
  const gainBase = useRef(0.1)
  const moteurDuRun = useRef<MoteurDetection>('nouveau')
  const brutesAncien = useRef<NoteAncien[]>([])
  const pointsLive = useRef<PointHauteur[]>([])
  const [points, setPoints] = useState<PointHauteur[]>([])
  const [corrections, setCorrections] = useState<Correction[]>([])
  const [decalageManuelMs, setDecalageManuelMs] = useState<number | null>(null)     // null = automatique
  const reglagesDuRun = useRef<ReglagesNouveau>(reglagesNouveau)
  const reglagesRef = useRef(reglagesSeg)
  reglagesRef.current = reglagesSeg
  const phraseCourante = useRef<Phrase | null>(null)
  const [etat, setEtat] = useState<EtatSession>('repos')
  const [erreur, setErreur] = useState<string | null>(null)
  const [latenceMs, setLatenceMs] = useState<number | null>(null)
  const [coupures, setCoupures] = useState(0)
  const [notesLive, setNotesLive] = useState<NoteAnnotee[]>([])
  const [noteEnCours, setNoteEnCours] = useState<NoteAnnotee | null>(null)
  const [prise, setPrise] = useState<Prise | null>(null)
  const [brutAncien, setBrutAncien] = useState<BrutAncien | null>(null)
  const [resNouveau, setResNouveau] = useState<ResultatNouveau | null>(null)
  const [calcul, setCalcul] = useState<string | null>(null)       // recalcul en cours (texte de progression)
  const recalcul = useRef<{ worker: Worker; id: number; type: 'ancien' | 'nouveau' } | null>(null)
  const compteurId = useRef(0)
  const reglagesNouveauRef = useRef(reglagesNouveau)
  reglagesNouveauRef.current = reglagesNouveau
  const [resultat, setResultat] = useState<Resultat | null>(null)
  const [version, setVersion] = useState(0)             // change à chaque nouveau planning (tours, départ)

  const contexte = (phrase: Phrase, pp: PlanningPhrase): ContexteAnnotation => ({
    phrase, real: realiserPhrase(phrase), planning: pp.planning, ref: reg.ref, diapason: reg.diapason, tempUser: reg.tempUser,
  })

  const demarrer = useCallback(async (o: OptionsDemarrage) => {
    if (moteur.current) return
    setErreur(null); setPrise(null); setBrutAncien(null); setResNouveau(null); setCalcul(null); arreterRecalcul(); brutesAncien.current = []; pointsLive.current = []; setPoints([]); setCorrections([]); setDecalageManuelMs(null); moteurDuRun.current = moteurChoisi; reglagesDuRun.current = reglagesNouveauRef.current; setResultat(null); setNotesLive([]); setNoteEnCours(null); setLatenceMs(null); setCoupures(0)
    suivi.current.reinitialiser()
    suivi.current.regler({ dureeMinS: reglagesNouveauRef.current.minNoteDurationMs / 1000, silenceFinS: reglagesNouveauRef.current.silenceDurationMs / 1000, sautCents: reglagesNouveauRef.current.noteJumpCents })
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
        latenceMemoriseeMs: memo ?? undefined, moteur: moteurChoisi, reglagesAncien: reglagesRef.current, reglagesNouveau: reglagesNouveauRef.current,
      }, {
        trame: t => {
          suivi.current.ajouter(t)
          if (moteurDuRun.current === 'nouveau') pointsLive.current.push({ t: t.t, hz: t.presence ? t.f0Hz : null })
        },
        strobe: (etats, rms, c) => { strobeRef.current = etats; rmsRef.current = rms; if (c) setCoupures(c) },
        latence: ms => {
          setLatenceMs(ms)
          memoriserLatence(cleAppareil({ userAgent: navigator.userAgent, sampleRate: ppRef.current?.planning.sampleRate ?? 48000 }), ms)
        },
        erreur: msg => setErreur(msg),
        notesAncien: (ns, pts, depuisT) => {
          brutesAncien.current = ns
          const a = pointsLive.current
          let i = a.length
          while (i > 0 && a[i - 1].t >= depuisT) i--
          a.length = i
          for (const p of pts) a.push(p)
        },
      })
      setVersion(v => v + 1)
      setEtat('joue')
    } catch (e) {
      moteur.current = null
      setEtat('repos')
      const msg = String((e as Error)?.message ?? e)
      setErreur(/Permission|NotAllowed|denied/i.test(msg) ? 'micro-refuse' : /NotFound|Requested device/i.test(msg) ? 'micro-absent' : msg)
    }
  }, [reg, politiqueEcho, moteurChoisi])

  const arreter = useCallback(async () => {
    const m = moteur.current
    if (!m) return
    setEtat('analyse')
    try {
      const r = await m.arreter()
      const c = ctxRef.current
      setResultat(r)
      if (c) {
        setPrise({ micro: r.micro, fs: r.sampleRate, offset: r.offsetMicro ?? 0, planning: r.planning, ctx: c, pp: ppRef.current! })
        if (moteurDuRun.current === 'ancien') { if (r.brut) setBrutAncien(r.brut) }
        else setResNouveau({ trames: r.trames, notes: r.notes, reglages: reglagesDuRun.current })
      }
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
      const ancien = moteurDuRun.current === 'ancien'
      const brutes = ancien ? brutesAncien.current : suivi.current.notes
      setNotesLive(annoterNotes(brutes, c, true))
      setPoints(pointsLive.current.slice())
      const en = ancien ? brutesAncien.current[brutesAncien.current.length - 1] : suivi.current.enCours
      setNoteEnCours(en && en.ouverte ? annoterNote(en, c, true) : null)
    }, 100)
    return () => clearInterval(id)
  }, [etat])

  // ancien moteur : nouveaux seuils pendant le jeu (Live), recalcul automatique après l'arrêt
  useEffect(() => { if (etat === 'joue' && moteurDuRun.current === 'ancien') moteur.current?.reglerAncien(reglagesSeg) }, [etat, reglagesSeg])
  // ── recalcul de la prise : autre moteur, ou autres réglages du nouveau moteur ──
  const arreterRecalcul = useCallback(() => {
    recalcul.current?.worker.terminate(); recalcul.current = null
  }, [])

  const lancerRecalcul = useCallback((msg: SansId<VersRecalcul>) => {
    arreterRecalcul()
    const worker = new Worker(new URL('./recalculPrise.worker.ts', import.meta.url), { type: 'module' })
    const id = ++compteurId.current
    recalcul.current = { worker, id, type: msg.type }
    setCalcul('Recalcul…')
    worker.onmessage = (e: MessageEvent<DepuisRecalcul>) => {
      const m = e.data
      if (m.id !== recalcul.current?.id) return
      if (m.type === 'progression') setCalcul(m.texte)
      else if (m.type === 'ancien') { setBrutAncien(m.brut); setCalcul(null); arreterRecalcul() }
      else if (m.type === 'nouveau') {
        setResNouveau({ trames: m.trames, notes: m.notes, reglages: (msg as Extract<VersRecalcul, { type: 'nouveau' }>).reglages }); setCalcul(null); arreterRecalcul()
      } else { setErreur(m.message); setCalcul(null); arreterRecalcul() }
    }
    worker.postMessage({ ...msg, id } as VersRecalcul)
  }, [arreterRecalcul])

  useEffect(() => {
    if (etat !== 'repos' || !prise) return
    const { micro, fs, offset, planning } = prise
    if (moteurChoisi === 'ancien') {
      if (brutAncien || recalcul.current?.type === 'ancien') return
      lancerRecalcul({ type: 'ancien', micro, fs })
      return
    }
    const demande = reglagesNouveau
    if (resNouveau && JSON.stringify(resNouveau.reglages) === JSON.stringify(demande)) return
    // réglages modifiés : on attend un instant (on tape souvent plusieurs valeurs de suite)
    const t = setTimeout(() => {
      const memeTrames = resNouveau && cleTrames(resNouveau.reglages) === cleTrames(demande)
      lancerRecalcul({ type: 'nouveau', micro, fs, offset, planning, diapason: reg.diapason, reglages: demande, trames: memeTrames ? resNouveau.trames : undefined })
    }, DELAI_RECALCUL_MS)
    return () => clearTimeout(t)
  }, [etat, prise, moteurChoisi, brutAncien, resNouveau, reglagesNouveau, reg.diapason, lancerRecalcul])

  // ── ancien moteur : segments, décalage temporel (préréglé au meilleur) et notes ──
  const segmentsA = useMemo(
    () => (prise && brutAncien ? segmentsAncien(brutAncien, prise.fs, reg.diapason, reglagesSeg) : null),
    [prise, brutAncien, reglagesSeg, reg.diapason],
  )
  const optionsNotes = useMemo(
    () => (prise ? { fs: prise.fs, offsetS: prise.offset / prise.fs, planning: prise.ctx.planning, reglages: reglagesSeg } : null),
    [prise, reglagesSeg],
  )
  const optimum = useMemo(
    () => (segmentsA && optionsNotes && prise ? decalageOptimal(segmentsA, optionsNotes, prise.ctx.phrase, prise.pp) : null),
    [segmentsA, optionsNotes, prise],
  )
  const decalageMs = moteurChoisi === 'ancien' ? (decalageManuelMs ?? optimum?.decalageMs ?? 0) : 0
  const decalageRef = useRef(0)
  decalageRef.current = decalageMs

  const notesFinales = useMemo(() => {
    if (!prise) return null
    if (moteurChoisi === 'ancien') {
      if (!segmentsA || !optionsNotes) return null
      const d = decalageMs / 1000
      const brutes = notesDepuisSegments(segmentsA, { ...optionsNotes, decalageS: d })
      return annoterNotes(appliquerCorrections(brutes, corrections, prise.ctx.planning, d), prise.ctx, false)
    }
    return resNouveau ? annoterNotes(appliquerCorrections(resNouveau.notes, corrections, prise.ctx.planning), prise.ctx, false) : null
  }, [prise, moteurChoisi, segmentsA, optionsNotes, decalageMs, resNouveau, corrections])

  const nbTetes = useMemo(() => (notesFinales && prise ? nombreDeTetes(notesFinales, prise.ctx.phrase, prise.pp) : 0), [notesFinales, prise])

  // sparkline après l'arrêt : trames de la prise avec le moteur affiché
  const pointsFinaux = useMemo((): PointHauteur[] => {
    if (!prise) return []
    if (moteurChoisi === 'ancien') return brutAncien ? pointsAncien(brutAncien, { fs: prise.fs, offsetS: prise.offset / prise.fs, reglages: reglagesSeg, decalageS: decalageMs / 1000 }) : []
    return resNouveau ? resNouveau.trames.map(t => ({ t: t.t, hz: t.presence ? t.f0Hz : null })) : []
  }, [prise, moteurChoisi, brutAncien, resNouveau, reglagesSeg, decalageMs])

  /** Une correction est enregistrée en temps de prise, sans décalage : elle suit sa note quand le curseur bouge. */
  const corriger = useCallback((c: Correction) => {
    const d = decalageRef.current / 1000
    const base = { ...c, tOn: c.tOn - d, tOff: c.tOff - d, ...(c.bout ? { bout: { t0: c.bout.t0 - d, t1: c.bout.t1 - d } } : {}) } as Correction
    setCorrections(l => ajouterCorrection(l, base))
  }, [])
  const reglerDecalage = useCallback((ms: number | null) => setDecalageManuelMs(ms), [])
  const reinitialiserCorrections = useCallback(() => setCorrections([]), [])

  useEffect(() => () => { recalcul.current?.worker.terminate() }, [])

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
    etat, erreur, latenceMs, coupures, notesLive, noteEnCours, notesFinales, resultat, version, calcul, priseDispo: !!prise,
    points: etat === 'joue' ? points : pointsFinaux, decalage: { ms: decalageMs, auto: decalageManuelMs === null, optimumMs: optimum?.decalageMs ?? null, actif: moteurChoisi === 'ancien' && !!segmentsA, tetes: nbTetes, notes: notesFinales?.length ?? 0 }, reglerDecalage, nbCorrections: corrections.length, corriger, reinitialiserCorrections,
    strobeRef, rmsRef, ppRef, ctxRef,
    demarrer, arreter, reglerSon, definirVolume, changerAccordTenu, tempsAudible, tempsCourant,
    effacer: () => { setCorrections([]); setDecalageManuelMs(null); setPoints([]); setPrise(null); setBrutAncien(null); setResNouveau(null); setCalcul(null); arreterRecalcul(); setResultat(null); setNotesLive([]); setNoteEnCours(null); suivi.current.reinitialiser() },
  }), [etat, erreur, latenceMs, coupures, notesLive, noteEnCours, notesFinales, resultat, version, calcul, prise, points, pointsFinaux, corrections, decalageMs, decalageManuelMs, optimum, segmentsA, moteurChoisi, nbTetes, reglerDecalage, corriger, reinitialiserCorrections, demarrer, arreter, reglerSon, definirVolume, changerAccordTenu, tempsAudible, tempsCourant])
}
