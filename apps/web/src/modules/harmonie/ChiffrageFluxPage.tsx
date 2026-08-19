// ─── Harmonie — activité « chiffrage en flux », niveaux 6 et 7 ───────────────
//
// La tâche `identification` : l'élève nomme le degré ET l'état de chaque accord.
// C'est la seule activité où les quatre canaux de `metrique.ts` se remplissent —
// partout ailleurs la réponse est un choix, donc il n'y a pas d'écart à mesurer.
//
// Saisie en UN SEUL GESTE (décidé avec Matthieu) : on appuie sur le degré, on
// glisse verticalement pour l'état, on relâche. Vers le haut les renversements du
// trois sons, vers le bas l'accord de septième de plus en plus renversé — l'ordre
// est celui d'`echelleEtats`. L'échelle est bornée par le niveau ET par le degré
// choisi : au niveau 6 la septième n'est offerte que sur V et II.
//
// « En flux » désigne le flux de la MUSIQUE : la suite s'écoute d'un bloc, autant
// de fois qu'on veut, et l'élève remplit à son rythme. Pas de chronomètre — il
// mesurerait la dextérité de saisie plutôt que l'oreille.
//
// ⚠ Au niveau 7 la tonique NE SONNE PAS (`contexteTonal: false`) : l'élève doit
// l'établir lui-même. C'est la difficulté propre du niveau, pas un oubli.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import useProgressFirebase from '../../hooks/useProgressFirebase'
import { useModuleProgress } from '../../hooks/useModuleProgress'
import { ThemeToggleInline } from '../../ThemeContext'

import { arreter, chargerInstrument, jouerSuite } from './audio.ts'
import ChiffrageEmpile from './ChiffrageEmpile.tsx'
import { chiffrageplat, romainChiffre } from './chiffrage.ts'
import { realiserProgression } from './dispositions.ts'
import { CercleTierces, type EtatTrace, type VersionJouee } from './Glyphes.tsx'
import { lireDrapeaux } from './glyphe.ts'
import {
  INTRO_DEFAUT,
  avecIntro,
  estIntro,
  evenementsAccord,
  type FormeAccord,
  type Intro,
} from './intro.ts'
import { useEcouteAccord } from './useEcouteAccord.ts'
import ToggleIntro from './ToggleIntro.tsx'
import BoutonDemiVitesse, { DEMI_VITESSE } from './BoutonDemiVitesse.tsx'
import ToggleToutEnDo from './ToggleToutEnDo.tsx'
import {
  LIBELLES_MODE_SESSION,
  MODES_SESSION,
  estModeSession,
  type ModeSession,
} from './modeSession.ts'

import { niveauSpec } from './niveaux.ts'
import { partitionDeProgression } from './notation.ts'
import PorteeSATB, { type VuePortee } from './PorteeSATB.tsx'
import TogglePortee, { estVuePortee } from './TogglePortee.tsx'
import RoueFigee from './RoueFigee.tsx'
import { SECTEURS, type SecteurRoue } from './roue.ts'
import {
  ITEMS_PAR_SESSION_FLUX,
  NIVEAU_MAX_FLUX,
  NIVEAU_MIN_FLUX,
  accordSaisi,
  construireSessionFlux,
  degresPossibles,
  echelleEtats,
  evaluerFlux,
  scorerFlux,
  type EtatAccord,
  type ItemFlux,
  type ReponseFlux,
  type ResultatAccord,
} from './flux.ts'
import { creerAccord, type Accord, type Degre, type Diagnostic, type Mode } from './types.ts'

const ACCENT = '#c084fc'
const SUCCES = '#34d399'
const ERREUR = '#f87171'
const BPM = 60

// Six crans à parcourir au niveau 7 : le pas par défaut (30 px) sortirait de la
// roue. 28 px les tient dans ±84 px, bien à l'intérieur d'un rayon de 130.
const SEUIL_DRAG_PX = 28

// ⚠ CORRESPONDANCE À NE PAS INVERSER. `CercleTierces` vient de la détection
// d'erreur, où `ecrit` est la partition (la référence, tracée en contour) et
// `entendu` ce qui a réellement sonné (l'écart, en aplat coloré). En flux, c'est
// le SON qui fait référence et l'élève qui dévie : on garde donc le sens visuel
// et non le nom des champs.
const CORRIGE: VersionJouee = 'ecrit' // ce qui était attendu — le contour
const MA_VERSION: VersionJouee = 'entendu' // ce que l'élève a chiffré — l'aplat

const NIVEAUX = Array.from(
  { length: NIVEAU_MAX_FLUX - NIVEAU_MIN_FLUX + 1 },
  (_, i) => NIVEAU_MIN_FLUX + i,
)

// Les sept diagnostics ne s'agrègent PAS : `couture` et `sonorite_sur_fonction`
// valent une remédiation, `degre_voisin` presque rien.
const LIBELLES_DIAGNOSTIC: Record<Diagnostic, string> = {
  exact: 'Exact',
  basse_non_entendue: 'Bon degré, basse non entendue',
  cardinalite: 'Bon degré, septième mal comptée',
  degre_voisin: 'Degré voisin, même fonction',
  couture: 'Confusion VII / II — sonorité proche, fonctions opposées',
  sonorite_sur_fonction: 'Sonorité entendue, fonction manquée',
  erreur_franche: 'Erreur franche',
}

type Ecran = 'reglages' | 'jeu' | 'bilan'

export default function ChiffrageFluxPage() {
  const navigate = useNavigate()
  const { addSession } = useProgressFirebase()
  const mp = useModuleProgress('harmonie')

  const [ecran, setEcran] = useState<Ecran>('reglages')
  const [modeSession, setModeSession] = useState<ModeSession>('majeur')
  const [niveau, setNiveau] = useState<number>(NIVEAU_MIN_FLUX)
  const [items, setItems] = useState<ItemFlux[]>([])
  const [rang, setRang] = useState(0)
  const [saisies, setSaisies] = useState<(Accord | null)[]>([])
  const [curseur, setCurseur] = useState(0)
  const [valide, setValide] = useState(false)
  const [enLecture, setEnLecture] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  // Correction : l'accord dont on regarde l'écart, et l'état de la trajectoire.
  const [focus, setFocus] = useState<number | null>(null)
  const [trace, setTrace] = useState<EtatTrace>({ phase: 'statique' })
  const [versionJouee, setVersionJouee] = useState<VersionJouee>(CORRIGE)
  const [vuePortee, setVuePortee] = useState<VuePortee>('masquee')
  const [intro, setIntro] = useState<Intro>(INTRO_DEFAUT)
  const [toutEnDo, setToutEnDo] = useState(false)

  const reponsesRef = useRef<ReponseFlux[]>([])
  const debutMsRef = useRef<number | null>(null)
  const sessionMsRef = useRef(0)
  const finLectureRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!mp.loaded) return
    const p = mp.progress.payload as {
      fluxMode?: unknown
      fluxNiveau?: number
      porteeVue?: unknown
      introTonale?: unknown
      toutEnDo?: unknown
    }
    if (estModeSession(p.fluxMode)) setModeSession(p.fluxMode)
    if (typeof p.fluxNiveau === 'number' && NIVEAUX.includes(p.fluxNiveau)) setNiveau(p.fluxNiveau)
    // Réglages communs aux quatre activités du module.
    if (estVuePortee(p.porteeVue)) setVuePortee(p.porteeVue)
    if (estIntro(p.introTonale)) setIntro(p.introTonale)
    if (typeof p.toutEnDo === 'boolean') setToutEnDo(p.toutEnDo)
  }, [mp.loaded, mp.progress.payload])

  useEffect(() => () => arreter(), [])

  const item = items[rang]
  const spec = niveauSpec(niveau)

  // ⚠ `mode` est celui de l'ITEM, `modeSession` celui du réglage. La ROUE en
  // dépend : ses libellés de degrés (III vs iii, VII°) sont ceux du mode courant.
  const mode: Mode =
    item ? item.progression.mode : modeSession === 'mineur' ? 'mineur' : 'majeur'

  // Le chiffrage plat sert de CLÉ : c'est le libellé que la roue renvoie. Un test
  // (`harmonieFlux.test.ts`) épingle son unicité par degré — deux états au même
  // chiffrage rendraient l'un d'eux inatteignable.
  const echelles = useMemo(() => {
    const table = new Map<Degre, { etats: EtatAccord[]; repos: number; libelles: string[] }>()
    for (const degre of degresPossibles(niveau)) {
      const { etats, repos } = echelleEtats(niveau, degre)
      table.set(degre, {
        etats,
        repos,
        libelles: etats.map((e) => chiffrageplat(accordSaisi(degre, e, 0))),
      })
    }
    return table
  }, [niveau])

  // La roue porte les degrés du niveau. Les secteurs absents du vocabulaire
  // restent muets plutôt que d'être retirés : sept secteurs, toujours au même
  // endroit, pour que le geste ne change pas d'un niveau à l'autre.
  const secteurs = useMemo<SecteurRoue[]>(
    () =>
      Array.from({ length: SECTEURS }, (_, i) => {
        const degre = (i + 1) as Degre
        const echelle = echelles.get(degre)
        return {
          cle: String(degre),
          label: echelle ? romainChiffre(degre, mode) : '·',
          qualites: echelle ? echelle.libelles : [],
          defaut: echelle ? echelle.repos : null,
        }
      }),
    [echelles, mode],
  )

  // « Tout en do » : la progression SONNÉE est ramenée sur do ; la portée suit la
  // vue « En Ut » — donc la mineur en mineur, armure vide (cf. `ToggleToutEnDo`).
  const progressionSonnee = useMemo(
    () => (item ? (toutEnDo ? { ...item.progression, tonique: 0 } : item.progression) : null),
    [item, toutEnDo],
  )
  const vuePorteeEffective: VuePortee = toutEnDo && vuePortee !== 'masquee' ? 'ut' : vuePortee

  const realisationAttendue = useMemo(
    () => (progressionSonnee ? realiserProgression(progressionSonnee) : []),
    [progressionSonnee],
  )

  // Ce que l'élève a chiffré, réalisé à quatre voix comme le corrigé. Vide tant
  // que la grille n'est pas complète — la validation l'exige de toute façon.
  const realisationSaisie = useMemo(() => {
    if (!progressionSonnee || saisies.length === 0 || saisies.some((a) => a === null)) return []
    return realiserProgression({ ...progressionSonnee, accords: saisies as Accord[] })
  }, [progressionSonnee, saisies])

  // L'accord de tonique réalisé, ou `null` au niveau 7 : la tonique n'y sonne
  // pas, et le réglage d'intro y reste donc sans effet.
  const toniqueRealisee = useMemo<number[] | null>(() => {
    if (!spec.contexteTonal || !progressionSonnee) return null
    const [tonique] = realiserProgression({
      ...progressionSonnee,
      accords: [creerAccord(0, { degre: 1 })],
    })
    return tonique
  }, [spec.contexteTonal, progressionSonnee])

  // L'intro sonne EN TÊTE : les index rendus par `onAccord` sont décalés
  // d'autant, et c'est le plan de lecture qui porte ce décalage.
  const planDe = useCallback(
    (accords: number[][]) => avecIntro(accords, toniqueRealisee, intro),
    [toniqueRealisee, intro],
  )

  /**
   * ⚠ La trajectoire ne s'anime QU'APRÈS validation. L'animer pendant que l'élève
   * cherche lui donnerait les degrés un par un, donc toute la réponse — même règle
   * que le « ▶ A n'existe qu'après la réponse » de la détection.
   */
  const ecouter = useCallback(
    async (quelle: VersionJouee, facteurTempo = 1) => {
      const base = quelle === CORRIGE ? realisationAttendue : realisationSaisie
      if (base.length === 0) return

      const anime = valide
      if (finLectureRef.current) clearTimeout(finLectureRef.current)
      setEnLecture(true)
      if (anime) {
        setVersionJouee(quelle)
        setTrace({ phase: 'lecture', index: -1 })
      }
      const plan = planDe(base)
      try {
        const duree = await jouerSuite(plan.accords, {
          bpm: BPM * facteurTempo,
          durees: plan.durees,
          tenues: plan.tenues,
          onAccord: anime
            ? (i: number) => setTrace({ phase: 'lecture', index: i - plan.decalage })
            : undefined,
        })
        finLectureRef.current = setTimeout(() => {
          setEnLecture(false)
          // À la dernière note la persistance cède : tout le parcours reste affiché.
          if (anime) setTrace({ phase: 'figee' })
          if (debutMsRef.current === null) debutMsRef.current = performance.now()
        }, duree + 150)
      } catch (e) {
        setErreur(`Lecture impossible : ${String(e)}`)
        setEnLecture(false)
      }
    },
    [realisationAttendue, realisationSaisie, planDe, valide],
  )

  // Écoute d'un accord isolé : appui = plaqué, glissé vers le haut = arpégé.
  // On entend la version qui a SONNÉ, jamais la saisie de l'élève.
  const ecouterAccord = useCallback(
    (index: number, forme: FormeAccord) => {
      const hauteurs = realisationAttendue[index]
      if (!hauteurs) return
      const plan = evenementsAccord(hauteurs, forme)
      void jouerSuite(plan.accords, { bpm: BPM, durees: plan.durees, tenues: plan.tenues })
    },
    [realisationAttendue],
  )
  const gesteEcoute = useEcouteAccord(ecouterAccord)

  function commencer() {
    setErreur(null)
    const graine = Math.floor(Math.random() * 1_000_000)
    try {
      const session = construireSessionFlux(modeSession, niveau, graine)
      reponsesRef.current = []
      sessionMsRef.current = performance.now()
      setItems(session)
      setRang(0)
      setSaisies(Array(session[0].progression.accords.length).fill(null))
      setCurseur(0)
      setValide(false)
      setFocus(null)
      setTrace({ phase: 'statique' })
      debutMsRef.current = null
      mp.startSession({ activite: 'flux', mode: modeSession, niveau, graine })
      setEcran('jeu')
      chargerInstrument('piano').catch(() => setErreur('Chargement du son impossible.'))
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
    }
  }

  // Le geste complet arrive d'un bloc : `cle` = le degré, `qualite` = le chiffrage
  // atteint par le glissement.
  function chiffrer({ cle, qualite }: { cle: string; qualite: string }) {
    if (valide) return
    const degre = Number(cle) as Degre
    const echelle = echelles.get(degre)
    if (!echelle) return
    const i = echelle.libelles.indexOf(qualite)
    if (i < 0) return

    const suivantes = [...saisies]
    suivantes[curseur] = accordSaisi(degre, echelle.etats[i], curseur)
    setSaisies(suivantes)

    // Avance à la première case encore vide, sinon reste en place.
    const vide = suivantes.findIndex((a) => a === null)
    setCurseur(vide === -1 ? curseur : vide)
  }

  function valider() {
    if (!item || valide) return
    const rtMs = Math.round(performance.now() - (debutMsRef.current ?? sessionMsRef.current))
    const resultats = evaluerFlux(item.progression.accords, saisies, mode)
    const justes = resultats.filter((r) => r.exact).length

    setValide(true)
    // La correction s'ouvre sur la première faute comparable. Suite parfaite : rien
    // à pointer, on fige d'emblée la trajectoire entière.
    const premiereFaute = resultats.findIndex((r) => !r.exact && r.vecteur !== null)
    setFocus(premiereFaute === -1 ? null : premiereFaute)
    setTrace(premiereFaute === -1 ? { phase: 'figee' } : { phase: 'statique' })
    setVersionJouee(CORRIGE)
    reponsesRef.current.push({
      index: rang,
      resultats,
      justes,
      total: item.progression.accords.length,
      rtMs,
      // Le mode de CET item : l'indice de déduction lit une matrice par item.
      mode,
    })

    // bits 0-3 accords justes · bits 4-7 total · bits 8-11 niveau
    const flags =
      (justes & 0b1111) | ((item.progression.accords.length & 0b1111) << 4) | ((niveau & 0b1111) << 8)

    mp.recordItem({
      index: rang,
      expected: item.progression.accords.length,
      answered: justes,
      rtMs,
      flags,
    })
  }

  function suivant() {
    arreter()
    if (rang + 1 >= items.length) {
      void terminer()
      return
    }
    const prochain = rang + 1
    setRang(prochain)
    setSaisies(Array(items[prochain].progression.accords.length).fill(null))
    setCurseur(0)
    setValide(false)
    setFocus(null)
    setTrace({ phase: 'statique' })
    debutMsRef.current = null
  }

  async function terminer() {
    const resume = scorerFlux(reponsesRef.current, mode)
    const durationMs = Math.round(performance.now() - sessionMsRef.current)
    const t = mp.progress.totals
    const cle = `flux:${niveau}`

    try {
      await mp.commitSession({
        summary: {
          score: resume.score,
          itemCount: resume.itemCount,
          accuracy: resume.precisionAccords,
          medianRtMs: resume.medianRtMs,
        },
        progressPatch: {
          totals: {
            sessions: t.sessions + 1,
            items: t.items + resume.itemCount,
            timeMs: t.timeMs + durationMs,
          },
          levels: {
            [cle]: {
              best: Math.max(mp.progress.levels[cle]?.best ?? 0, resume.precisionAccords),
              attempts: (mp.progress.levels[cle]?.attempts ?? 0) + 1,
              lastAt: Date.now(),
            },
          },
          payload: {
            fluxMode: modeSession,
            fluxNiveau: niveau,
            porteeVue: vuePortee,
            introTonale: intro,
            toutEnDo,
          },
        },
      })
    } catch (e) {
      console.warn('Harmonie flux commit', e)
    }

    const p = resume.precisionAccords
    const medal = p >= 0.9 ? 'or' : p >= 0.75 ? 'argent' : 'bronze'
    const xpEarned = Math.max(5, Math.round(p * resume.itemCount * 5))
    try {
      await addSession({
        module: 'harmonie', xpEarned, medal,
        details: { level: `Niveau ${niveau}`, items: resume.itemCount, mode: 'Chiffrage en flux' },
      })
    } catch {
      /* hors ligne : la session per-module est déjà persistée */
    }

    setEcran('bilan')
  }

  // ── Rendu ──────────────────────────────────────────────────────────────────

  if (ecran === 'reglages') {
    return (
      <Cadre onRetour={() => navigate('/harmonie')}>
        <main className="px-4 pb-8 flex flex-col gap-5">
          <Erreur texte={erreur} />
          <p className="text-app-muted" style={{ fontSize: 14, margin: 0, lineHeight: 1.5 }}>
            Écoute la suite autant de fois que tu veux, puis chiffre chaque accord : le degré à la
            roue, l’état sur la bande. Tu valides quand tu as fini — rien n’est chronométré.
          </p>

          <Bloc titre="Niveau">
            <div className="flex flex-wrap" style={{ gap: 6 }}>
              {NIVEAUX.map((n) => (
                <button
                  key={n}
                  onClick={() => setNiveau(n)}
                  className={n === niveau ? '' : 'bg-surface-2 text-app border-app'}
                  style={{
                    ...segment,
                    ...(n === niveau
                      ? { background: ACCENT, borderColor: ACCENT, color: '#0d1026', fontWeight: 600 }
                      : {}),
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </Bloc>

          <Bloc titre="Intro tonale">
            <ToggleIntro
              intro={intro}
              onChange={setIntro}
              actif={niveauSpec(niveau).contexteTonal}
            />
          </Bloc>

          <Bloc titre="Mode">
            <div className="flex" style={{ gap: 6 }}>
              {MODES_SESSION.map((m) => (
                <button
                  key={m}
                  onClick={() => setModeSession(m)}
                  className={m === modeSession ? '' : 'bg-surface-2 text-app border-app'}
                  style={{
                    ...segment,
                    ...(m === modeSession
                      ? { background: ACCENT, borderColor: ACCENT, color: '#0d1026', fontWeight: 600 }
                      : {}),
                  }}
                >
                  {LIBELLES_MODE_SESSION[m]}
                </button>
              ))}
            </div>
          </Bloc>

          <button onClick={commencer} style={boutonPlein}>
            Commencer
          </button>
        </main>
      </Cadre>
    )
  }

  if (ecran === 'bilan') {
    const resume = scorerFlux(reponsesRef.current, mode)
    return (
      <Cadre onRetour={() => setEcran('reglages')}>
        <main className="px-4 pb-8 flex flex-col gap-5">
          <div
            className="bg-surface border-app"
            style={{
              borderWidth: 1,
              borderStyle: 'solid',
              borderRadius: 14,
              padding: '20px 16px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 40, fontWeight: 700, color: ACCENT }}>{resume.score} %</div>
            <div className="text-app-muted" style={{ fontSize: 14, marginTop: 4 }}>
              accords exactement chiffrés · niveau {niveau}
            </div>
            <div className="text-app-muted" style={{ fontSize: 12, marginTop: 4 }}>
              {reponsesRef.current.filter((r) => r.justes === r.total).length} /{' '}
              {resume.itemCount} suites entièrement justes
            </div>
          </div>

          {resume.parDiagnostic.length > 0 && (
            <Bloc titre="Par type de faute">
              <div className="flex flex-col" style={{ gap: 6 }}>
                {resume.parDiagnostic.map((d) => (
                  <div
                    key={d.diagnostic}
                    className="flex items-center justify-between bg-surface-2"
                    style={{ borderRadius: 10, padding: '9px 12px', fontSize: 13, gap: 10 }}
                  >
                    <span>{LIBELLES_DIAGNOSTIC[d.diagnostic]}</span>
                    <span style={{ fontFamily: 'monospace', color: ERREUR }}>{d.nombre}</span>
                  </div>
                ))}
              </div>
              <p className="text-app-muted" style={{ fontSize: 11, margin: '8px 0 0', lineHeight: 1.5 }}>
                Ces catégories ne s’additionnent pas : confondre VII et II n’est pas la même faute
                que se tromper de basse, et elles ne se corrigent pas de la même façon.
              </p>
            </Bloc>
          )}

          {/* La donnée que seule cette activité peut produire. */}
          {resume.indiceDeduction > 0 && (
            <Bloc titre="Oreille ou grammaire ?">
              <div
                className="bg-surface-2"
                style={{ borderRadius: 10, padding: '12px 14px', fontSize: 13, lineHeight: 1.55 }}
              >
                Indice de déduction :{' '}
                <strong style={{ color: ACCENT }}>
                  {Math.round(resume.indiceDeduction * 100)} %
                </strong>
                <div className="text-app-muted" style={{ fontSize: 12, marginTop: 6 }}>
                  Mesuré sur tes seules fautes : à quel point tu as répondu l’enchaînement le plus
                  attendu plutôt que ce qui a réellement sonné. Élevé, c’est le signe qu’on devine
                  par le style au lieu d’écouter.
                </div>
              </div>
            </Bloc>
          )}

          <button onClick={() => setEcran('reglages')} style={boutonPlein}>
            Rejouer
          </button>
          <button onClick={() => navigate('/harmonie')} style={boutonCreux}>
            Changer d’activité
          </button>
        </main>
      </Cadre>
    )
  }

  if (!item) return null

  const complet = saisies.every((a) => a !== null)
  const resultats = valide ? evaluerFlux(item.progression.accords, saisies, mode) : []

  return (
    <Cadre onRetour={() => setEcran('reglages')}>
      <main className="px-4 pb-8 flex flex-col gap-4">
        <Erreur texte={erreur} />

        <div className="flex items-center justify-between">
          <span className="text-app-muted" style={{ fontSize: 13 }}>
            {rang + 1} / {items.length}
          </span>
          <span className="text-app-muted" style={{ fontSize: 13 }}>
            niveau {niveau} · {mode}
          </span>
        </div>

        {!valide ? (
          // ⚠ Le « ▶ ½ » n'existe que pendant l'exercice : à la correction, les
          // deux boutons servent à comparer, pas à ralentir.
          <div className="flex" style={{ gap: 8 }}>
            <button
              onClick={() => void ecouter(CORRIGE)}
              disabled={enLecture}
              style={{ ...boutonPlein, flex: 1, opacity: enLecture ? 0.6 : 1 }}
            >
              {enLecture ? '▶ …' : '▶ Écouter'}
            </button>
            <BoutonDemiVitesse
              onClick={() => void ecouter(CORRIGE, DEMI_VITESSE)}
              disabled={enLecture}
            />
          </div>
        ) : (
          // Deux écoutes en regard : ce qui a sonné, et ce que l'élève en a écrit.
          // Le cercle suit celle qu'on lance.
          <div className="flex" style={{ gap: 8 }}>
            <button
              onClick={() => void ecouter(CORRIGE)}
              disabled={enLecture}
              style={{
                ...boutonPlein,
                flex: 1,
                fontSize: 15,
                opacity: enLecture ? 0.6 : 1,
              }}
            >
              ▶ Corrigé
            </button>
            <button
              onClick={() => void ecouter(MA_VERSION)}
              disabled={enLecture || realisationSaisie.length === 0}
              style={{
                ...boutonCreux,
                flex: 1,
                fontSize: 15,
                opacity: enLecture || realisationSaisie.length === 0 ? 0.6 : 1,
              }}
            >
              ▶ Ma version
            </button>
          </div>
        )}

        <div className="flex justify-end">
          <ToggleToutEnDo actif={toutEnDo} onChange={setToutEnDo} />
        </div>

        {/* Les cases. Avant validation elles portent le curseur ; après, elles
            choisissent l'accord dont le cercle montre l'écart. */}
        <div className="flex flex-wrap justify-center" style={{ gap: 8 }}>
          {saisies.map((saisie, i) => {
            const resultat = resultats[i]
            const actif = valide ? i === focus : i === curseur
            let bordure = actif ? ACCENT : 'var(--border-c)'
            if (valide) bordure = resultat?.exact ? SUCCES : ERREUR

            return (
              <button
                key={i}
                {...gesteEcoute(i)}
                onClick={() => {
                  if (!valide) {
                    setCurseur(i)
                    return
                  }
                  setFocus(i)
                  setTrace({ phase: 'statique' })
                }}
                className="bg-surface"
                style={{
                  borderWidth: actif ? 2 : 1,
                  borderStyle: 'solid',
                  borderColor: bordure,
                  borderRadius: 12,
                  padding: '10px 10px',
                  minWidth: 66,
                  minHeight: 62,
                  color: 'var(--text)',
                }}
              >
                {saisie ? (
                  <ChiffrageEmpile accord={saisie} mode={mode} taille={17} />
                ) : (
                  <span style={{ fontSize: 17, color: 'var(--text-muted)' }}>—</span>
                )}
                {valide && !resultat?.exact && (
                  <div style={{ marginTop: 4 }}>
                    <ChiffrageEmpile
                      accord={item.progression.accords[i]}
                      mode={mode}
                      taille={12}
                      couleur={SUCCES}
                    />
                  </div>
                )}
              </button>
            )
          })}
        </div>

        {!valide && (
          <>
            <p className="text-app-muted" style={{ fontSize: 12, margin: 0, textAlign: 'center' }}>
              Accord {curseur + 1} — appuie sur le degré, glisse pour l’état
            </p>

            <RoueFigee
              secteurs={secteurs}
              onSelect={chiffrer}
              indice="Appuie sur le degré · glisse ↑ renversements · ↓ septième"
              taille={260}
              seuilPx={SEUIL_DRAG_PX}
            />

            <button
              onClick={valider}
              disabled={!complet}
              className={complet ? '' : 'bg-surface-2 text-app border-app'}
              style={{
                borderWidth: 1,
                borderStyle: 'solid',
                borderColor: complet ? ACCENT : 'var(--border-c)',
                borderRadius: 12,
                padding: '14px 20px',
                minHeight: 52,
                fontSize: 16,
                fontWeight: 600,
                ...(complet ? { background: ACCENT, color: '#0d1026' } : { opacity: 0.5 }),
              }}
            >
              Valider
            </button>
          </>
        )}

        {valide && (
          <div
            className="bg-surface border-app"
            style={{ borderWidth: 1, borderStyle: 'solid', borderRadius: 12, padding: '14px 16px' }}
          >
            <div
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: resultats.every((r) => r.exact) ? SUCCES : ERREUR,
              }}
            >
              {resultats.filter((r) => r.exact).length} / {resultats.length} accords exacts
            </div>

            {resultats
              .filter((r) => !r.exact)
              .map((r) => (
                <button
                  key={r.index}
                  onClick={() => {
                    setFocus(r.index)
                    setTrace({ phase: 'statique' })
                  }}
                  className="text-app-muted"
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    padding: '4px 0',
                    minHeight: 32,
                    fontSize: 13,
                    lineHeight: 1.5,
                    color: r.index === focus ? 'var(--text)' : undefined,
                  }}
                >
                  Accord {r.index + 1} —{' '}
                  {r.diagnostic ? LIBELLES_DIAGNOSTIC[r.diagnostic] : 'case laissée vide'}
                </button>
              ))}

            {/* Le cercle des tierces : les deux trajectoires en regard, et l'écart
                de l'accord en focus. Il s'anime au fil de la réécoute. */}
            <Correction
              item={item}
              resultats={resultats}
              focus={focus}
              mode={mode}
              trace={trace}
              versionJouee={versionJouee}
            />

            {/* La portée, sur la version qu'on écoute. Elle suit les mêmes boutons
                que le cercle : deux lectures d'un même geste. */}
            <div style={{ marginTop: 14 }}>
              <TogglePortee
                vue={vuePorteeEffective}
                onChange={setVuePortee}
                sansTonalite={toutEnDo}
              />
            </div>
            {vuePorteeEffective !== 'masquee' && (
              <div style={{ marginTop: 10 }}>
                <PorteeSATB
                  partition={partitionDeProgression(
                    versionJouee === CORRIGE
                      ? item.progression
                      : { ...item.progression, accords: saisies as Accord[] },
                    vuePorteeEffective,
                  )}
                  indexCourant={trace.phase === 'lecture' ? trace.index : null}
                  fautes={resultats.filter((r) => !r.exact).map((r) => r.index)}
                  legende={`Réalisation à quatre voix — ${
                    versionJouee === CORRIGE ? 'le corrigé' : 'ta version'
                  }`}
                />
              </div>
            )}

            <button onClick={suivant} style={{ ...boutonPlein, marginTop: 14, width: '100%' }}>
              {rang + 1 >= items.length ? 'Voir le bilan' : 'Suivant'}
            </button>
          </div>
        )}
      </main>
    </Cadre>
  )
}

// ─── La correction visuelle ──────────────────────────────────────────────────
//
// Le cercle des tierces montre DEUX trajectoires : celle qui a sonné et celle que
// l'élève a écrite. L'une est jouée et s'anime, l'autre reste en fantôme — c'est
// leur superposition qui fait voir où la lecture a décroché.
//
// À la différence de la détection, qui n'a qu'un accord fautif par item, une suite
// peut en compter plusieurs : l'écart tracé porte sur l'accord EN FOCUS, changé en
// touchant une case ou une ligne de diagnostic.

/** Aucun écart. Sert quand la suite est juste : le cercle reste alors en teinte interne. */
const VECTEUR_NUL = { angulaire: 0, radial: 0, cardinalite: 0, arcFranchi: false } as const

function Correction({
  item,
  resultats,
  focus,
  mode,
  trace,
  versionJouee,
}: {
  item: ItemFlux
  resultats: ResultatAccord[]
  focus: number | null
  mode: Mode
  trace: EtatTrace
  versionJouee: VersionJouee
}) {
  const attendus = item.progression.accords
  const cible = focus === null ? null : resultats[focus]

  // La validation exige une grille complète : `repondu` est renseigné partout. Le
  // filtre n'est là que pour ne pas relier deux degrés à travers un trou si cette
  // garantie tombait un jour.
  const degresSaisis = resultats.flatMap((r) => (r.repondu ? [r.repondu.degre] : []))
  const ecart = { vecteur: cible?.vecteur ?? VECTEUR_NUL }
  const reference = cible?.attendu ?? attendus[0]

  return (
    <div style={{ marginTop: 12 }}>
      <CercleTierces
        ecrit={reference}
        entendu={cible?.repondu ?? reference}
        degresEcrits={attendus.map((a) => a.degre)}
        degresEntendus={degresSaisis}
        mode={mode}
        drapeaux={ecart}
        trace={trace}
        version={versionJouee}
        taille={196}
      />

      <div
        className="text-app-muted"
        style={{ fontSize: 12, marginTop: 8, textAlign: 'center', lineHeight: 1.5 }}
      >
        {cible && cible.repondu
          ? `Accord ${cible.index + 1} — ${lireDrapeaux(ecart)}`
          : 'Trait plein : la version qui joue · pointillé : l’autre'}
      </div>
    </div>
  )
}

// ─── Éléments partagés ───────────────────────────────────────────────────────

const segment: React.CSSProperties = {
  borderWidth: 1,
  borderStyle: 'solid',
  borderRadius: 10,
  padding: '10px 16px',
  minHeight: 44,
  minWidth: 52,
  fontSize: 14,
}

const boutonPlein: React.CSSProperties = {
  background: ACCENT,
  border: 'none',
  borderRadius: 12,
  padding: '14px 20px',
  minHeight: 52,
  fontSize: 16,
  fontWeight: 600,
  color: '#0d1026',
}

const boutonCreux: React.CSSProperties = {
  background: 'var(--surface-2)',
  border: '1px solid var(--border-c)',
  borderRadius: 12,
  padding: '12px 20px',
  minHeight: 48,
  fontSize: 15,
  color: 'var(--text)',
}

function Bloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-app-muted" style={{ fontSize: 12, margin: '0 0 8px', fontWeight: 500 }}>
        {titre}
      </h2>
      {children}
    </section>
  )
}

function Cadre({ onRetour, children }: { onRetour: () => void; children: React.ReactNode }) {
  return (
    <div
      className="bg-app min-h-dvh flex flex-col"
      style={{ maxWidth: 540, margin: '0 auto', width: '100%' }}
    >
      <header className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={onRetour}
          aria-label="Retour"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border-c)',
            borderRadius: 10,
            width: 40,
            height: 40,
            color: 'var(--text)',
          }}
        >
          ←
        </button>
        <h1
          style={{
            fontFamily: "'Righteous', sans-serif",
            fontSize: 20,
            color: 'var(--text)',
            margin: 0,
            flex: 1,
          }}
        >
          Chiffrage en flux
        </h1>
        <ThemeToggleInline />
      </header>
      {children}
    </div>
  )
}

function Erreur({ texte }: { texte: string | null }) {
  if (!texte) return null
  return (
    <div
      style={{
        background: 'rgba(248,113,113,0.12)',
        border: `1px solid ${ERREUR}`,
        borderRadius: 10,
        padding: '10px 14px',
        fontSize: 13,
        color: ERREUR,
      }}
    >
      {texte}
    </div>
  )
}
