// ─── Harmonie — activité « dictée de basse », niveau 1 ───────────────────────
//
// L'élève entend une suite courte et nomme les basses à la roue figée. C'est le
// prérequis de tout le module : qui n'entend pas la basse ne peut rien chiffrer.
//
// La tonique sonne AVANT l'item et la tonalité est écrite en toutes lettres
// (décidé avec Matthieu) : on mesure l'audition de la basse, pas l'oreille absolue.
// L'altération vient de l'ARMURE — le vocabulaire [1, 4, 5] à l'état fondamental
// n'en produit aucune, c'est la transposition qui la fait apparaître.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import useProgressFirebase from '../../hooks/useProgressFirebase'
import { useModuleProgress } from '../../hooks/useModuleProgress'
import { ThemeToggleInline } from '../../ThemeContext'

import { arreter, chargerInstrument, jouerSuite } from './audio.ts'
import { realiserProgression } from './dispositions.ts'
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

import { partitionDeProgression } from './notation.ts'
import PorteeSATB, { type VuePortee } from './PorteeSATB.tsx'
import TogglePortee, { estVuePortee } from './TogglePortee.tsx'
import RoueFigee from './RoueFigee.tsx'
import { LETTRES, nomNote, nomTonalite, type Alteration, type NoteNommee } from './tonalites.ts'
import { type SecteurRoue } from './roue.ts'
import {
  hauteursDesBasses,
  ITEMS_PAR_SESSION_DICTEE,
  NIVEAU_DICTEE,
  compterJustes,
  construireSessionDictee,
  evaluerBasseNommee,
  lireErreurBasse,
  scorerDictee,
  type ItemDictee,
  type ReponseDictee,
} from './dictee.ts'
import { creerAccord, type Mode } from './types.ts'

const ACCENT = '#c084fc'
const SUCCES = '#34d399'
const ERREUR = '#f87171'
const BPM = 60

// Les sept lettres, do en haut, sens horaire — même disposition que la roue de
// Notes, pour que le geste soit déjà connu. Le glissement vertical altère.
const SECTEURS_NOTES: SecteurRoue[] = LETTRES.map((lettre) => ({
  cle: lettre,
  label: { do: 'Do', re: 'Ré', mi: 'Mi', fa: 'Fa', sol: 'Sol', la: 'La', si: 'Si' }[lettre],
  qualites: ['♭', '♮', '♯'],
  defaut: 1, // ♮ au repos : le clic sec donne la note naturelle
}))

const ALTERATIONS: Record<string, Alteration> = { '♭': -1, '♮': 0, '♯': 1 }

type Ecran = 'reglages' | 'jeu' | 'bilan'

export default function DicteeBassePage() {
  const navigate = useNavigate()
  const onQuitter = () => navigate('/harmonie')
  const { addSession } = useProgressFirebase()
  const mp = useModuleProgress('harmonie')

  const [ecran, setEcran] = useState<Ecran>('reglages')
  const [modeSession, setModeSession] = useState<ModeSession>('majeur')
  const [items, setItems] = useState<ItemDictee[]>([])
  const [rang, setRang] = useState(0)
  const [saisies, setSaisies] = useState<(NoteNommee | null)[]>([])
  const [curseur, setCurseur] = useState(0)
  const [valide, setValide] = useState(false)
  const [enLecture, setEnLecture] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  // Réglages communs aux quatre activités du module.
  const [vuePortee, setVuePortee] = useState<VuePortee>('masquee')
  const [intro, setIntro] = useState<Intro>(INTRO_DEFAUT)
  const [toutEnDo, setToutEnDo] = useState(false)

  const reponsesRef = useRef<ReponseDictee[]>([])
  const debutMsRef = useRef<number | null>(null)
  const sessionMsRef = useRef(0)
  const finLectureRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!mp.loaded) return
    const p = mp.progress.payload as {
      dicteeMode?: unknown
      porteeVue?: unknown
      introTonale?: unknown
      toutEnDo?: unknown
    }
    if (estModeSession(p.dicteeMode)) setModeSession(p.dicteeMode)
    if (estVuePortee(p.porteeVue)) setVuePortee(p.porteeVue)
    if (estIntro(p.introTonale)) setIntro(p.introTonale)
    if (typeof p.toutEnDo === 'boolean') setToutEnDo(p.toutEnDo)
  }, [mp.loaded, mp.progress.payload])

  useEffect(() => () => arreter(), [])

  const item = items[rang]

  // ⚠ `mode` est celui de l'ITEM, `modeSession` celui du réglage : en « les deux »
  // ils diffèrent, et tout l'affichage doit suivre l'item.
  const mode: Mode =
    item ? item.progression.mode : modeSession === 'mineur' ? 'mineur' : 'majeur'

  // La tonique se pose en tête : `NIVEAUX[1].contexteTonal` vaut true. Sa forme
  // — arpégée ou rien — est le réglage `intro`, commun au module.
  // « Tout en do » : la progression SONNÉE est ramenée sur do. La portée, elle,
  // suit la vue « En Ut » — donc la mineur en mineur, armure vide (cf.
  // `ToggleToutEnDo`). Le son et l'écrit divergent alors volontairement.
  const progressionSonnee = useMemo(
    () => (item ? (toutEnDo ? { ...item.progression, tonique: 0 } : item.progression) : null),
    [item, toutEnDo],
  )
  const vuePorteeEffective: VuePortee =
    toutEnDo && vuePortee !== 'masquee' ? 'ut' : vuePortee

  const realisationSonnee = useMemo(
    () => (progressionSonnee ? realiserProgression(progressionSonnee) : []),
    [progressionSonnee],
  )

  const aJouer = useMemo(() => {
    if (!item || !progressionSonnee) return null
    const suite = realisationSonnee
    const [tonique] = realiserProgression({
      ...progressionSonnee,
      accords: [creerAccord(0, { degre: 1 })],
    })
    return avecIntro(suite, tonique, intro)
  }, [item, progressionSonnee, realisationSonnee, intro])

  const ecouter = useCallback(async (facteurTempo = 1) => {
    if (!aJouer || aJouer.accords.length === 0) return
    if (finLectureRef.current) clearTimeout(finLectureRef.current)
    setEnLecture(true)
    try {
      const duree = await jouerSuite(aJouer.accords, {
        bpm: BPM * facteurTempo,
        durees: aJouer.durees,
        tenues: aJouer.tenues,
      })
      finLectureRef.current = setTimeout(() => {
        setEnLecture(false)
        if (debutMsRef.current === null) debutMsRef.current = performance.now()
      }, duree + 150)
    } catch (e) {
      setErreur(`Lecture impossible : ${String(e)}`)
      setEnLecture(false)
    }
  }, [aJouer])

  // Écoute d'un accord isolé : appui = plaqué, glissé vers le haut = arpégé.
  // ⚠ Entendre chaque accord séparément allège nettement la dictée — demandé
  // explicitement, à revoir si ça gêne en classe.
  const ecouterAccord = useCallback(
    (index: number, forme: FormeAccord) => {
      const hauteurs = realisationSonnee[index]
      if (!hauteurs) return
      const plan = evenementsAccord(hauteurs, forme)
      void jouerSuite(plan.accords, { bpm: BPM, durees: plan.durees, tenues: plan.tenues })
    },
    [realisationSonnee],
  )
  const gesteEcoute = useEcouteAccord(ecouterAccord)

  // ⚠ APRÈS LA RÉPONSE SEULEMENT. Entendre les deux lignes de basse — la sienne et
  // la bonne — jouées à l'identique : c'est la comparaison qui instruit, pas la
  // correction écrite seule. Les basses sonnent NUES (décidé avec Matthieu), sans
  // les accords : c'est la ligne qu'on compare.
  const referencesBasses = useMemo(
    () => realisationSonnee.map((accord) => accord[0]),
    [realisationSonnee],
  )
  const ecouterBasses = useCallback(
    (lesquelles: 'saisies' | 'attendues') => {
      if (!item) return
      const notes = lesquelles === 'saisies' ? saisies : item.basses
      const accords = hauteursDesBasses(notes, referencesBasses)
      if (accords.length === 0) return
      void jouerSuite(accords, { bpm: BPM })
    },
    [item, saisies, referencesBasses],
  )

  function commencer() {
    setErreur(null)
    const graine = Math.floor(Math.random() * 1_000_000)
    try {
      const session = construireSessionDictee(modeSession, graine)
      reponsesRef.current = []
      sessionMsRef.current = performance.now()
      setItems(session)
      setRang(0)
      setSaisies(Array(session[0].basses.length).fill(null))
      setCurseur(0)
      setValide(false)
      debutMsRef.current = null
      mp.startSession({ activite: 'basse', mode: modeSession, graine })
      setEcran('jeu')
      // Le clic sur « Commencer » est le geste utilisateur qui débloque l'audio.
      chargerInstrument('piano').catch(() => setErreur('Chargement du son impossible.'))
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
    }
  }

  function saisir({ cle, qualite }: { cle: string; qualite: string }) {
    if (valide || !item) return
    const note: NoteNommee = {
      lettre: cle as NoteNommee['lettre'],
      alteration: ALTERATIONS[qualite] ?? 0,
    }
    const suivantes = [...saisies]
    suivantes[curseur] = note
    setSaisies(suivantes)
    // Avance au premier emplacement encore vide, sinon reste en place.
    const vide = suivantes.findIndex((n) => n === null)
    setCurseur(vide === -1 ? curseur : vide)
  }

  function valider() {
    if (!item || valide) return
    const rtMs = Math.round(performance.now() - (debutMsRef.current ?? sessionMsRef.current))
    const justes = compterJustes(item.basses, saisies)
    const total = item.basses.length

    setValide(true)
    reponsesRef.current.push({ index: rang, correct: justes === total, rtMs, justes, total })

    // bits 0-3 justesse de chaque basse · bits 4-7 tonique · bit 8 mode
    let flags = (item.progression.tonique & 0b1111) << 4
    if (mode === 'mineur') flags |= 1 << 8
    item.basses.forEach((b, i) => {
      const r = saisies[i]
      if (r && r.lettre === b.lettre && r.alteration === b.alteration) flags |= 1 << i
    })

    mp.recordItem({ index: rang, expected: total, answered: justes, rtMs, flags })
  }

  function suivant() {
    arreter()
    if (rang + 1 >= items.length) {
      void terminer()
      return
    }
    const prochain = rang + 1
    setRang(prochain)
    setSaisies(Array(items[prochain].basses.length).fill(null))
    setCurseur(0)
    setValide(false)
    debutMsRef.current = null
  }

  async function terminer() {
    const resume = scorerDictee(reponsesRef.current)
    const durationMs = Math.round(performance.now() - sessionMsRef.current)
    const t = mp.progress.totals
    // Clés préfixées : quatre activités partagent la même carte `levels`.
    const cle = 'basse:1'

    try {
      await mp.commitSession({
        summary: {
          score: resume.score,
          itemCount: resume.itemCount,
          accuracy: resume.accuracy,
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
              best: Math.max(mp.progress.levels[cle]?.best ?? 0, resume.accuracy),
              attempts: (mp.progress.levels[cle]?.attempts ?? 0) + 1,
              lastAt: Date.now(),
            },
          },
          payload: { dicteeMode: modeSession, porteeVue: vuePortee, introTonale: intro, toutEnDo },
        },
      })
    } catch (e) {
      console.warn('Harmonie dictée commit', e)
    }

    const medal = resume.accuracy >= 0.9 ? 'or' : resume.accuracy >= 0.75 ? 'argent' : 'bronze'
    const xpEarned = Math.max(5, Math.round(resume.accuracy * resume.itemCount * 3))
    try {
      await addSession({
        module: 'harmonie', xpEarned, medal,
        details: { level: `Niveau ${NIVEAU_DICTEE}`, items: resume.itemCount, mode: 'Dictée de basse' },
      })
    } catch {
      /* hors ligne : la session per-module est déjà persistée */
    }

    setEcran('bilan')
  }

  // ── Rendu ──────────────────────────────────────────────────────────────────

  if (ecran === 'reglages') {
    return (
      <Cadre onRetour={onQuitter}>
      <main className="px-4 pb-8 flex flex-col gap-5">
        <Erreur texte={erreur} />
        <p className="text-app-muted" style={{ fontSize: 14, margin: 0, lineHeight: 1.5 }}>
          Tu entends une suite courte. Note la <strong style={{ color: 'var(--text)' }}>basse</strong>{' '}
          de chaque accord — la note la plus grave.{' '}
          {intro === 'arpegee'
            ? 'La tonique se pose d’abord et la tonalité est écrite'
            : 'La tonalité est écrite'}{' '}
          : c’est elle qui donne les dièses et les bémols.
        </p>

        <section>
          <h2 className="text-app-muted" style={{ fontSize: 12, margin: '0 0 8px', fontWeight: 500 }}>
            Mode
          </h2>
          <div className="flex" style={{ gap: 6 }}>
            {MODES_SESSION.map((m) => (
              <button
                key={m}
                onClick={() => setModeSession(m)}
                className={m === modeSession ? '' : 'bg-surface-2 text-app border-app'}
                style={{
                  borderWidth: 1,
                  borderStyle: 'solid',
                  borderRadius: 10,
                  padding: '10px 16px',
                  minHeight: 44,
                  fontSize: 14,
                  ...(m === modeSession
                    ? { background: ACCENT, borderColor: ACCENT, color: '#0d1026', fontWeight: 600 }
                    : {}),
                }}
              >
                {LIBELLES_MODE_SESSION[m]}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-app-muted" style={{ fontSize: 12, margin: '0 0 8px', fontWeight: 500 }}>
            Intro tonale
          </h2>
          <ToggleIntro intro={intro} onChange={setIntro} />
        </section>

        <button
          onClick={commencer}
          style={{
            background: ACCENT,
            border: 'none',
            borderRadius: 12,
            padding: '14px 20px',
            minHeight: 52,
            fontSize: 16,
            fontWeight: 600,
            color: '#0d1026',
          }}
        >
          Commencer
        </button>
        <button
          onClick={onQuitter}
          className="bg-surface-2 text-app border-app"
          style={{
            borderWidth: 1,
            borderStyle: 'solid',
            borderRadius: 12,
            padding: '12px 20px',
            minHeight: 48,
            fontSize: 15,
          }}
        >
          Changer d’activité
        </button>
      </main>
      </Cadre>
    )
  }

  if (ecran === 'bilan') {
    const resume = scorerDictee(reponsesRef.current)
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
            {reponsesRef.current.filter((r) => r.correct).length} / {resume.itemCount} suites
            entièrement justes
          </div>
          {/* Plus fine que le taux d'items : on peut rater une basse sur quatre. */}
          <div className="text-app-muted" style={{ fontSize: 13, marginTop: 6 }}>
            {Math.round(resume.precisionNotes * 100)} % des basses justes
          </div>
        </div>

        <button
          onClick={() => setEcran('reglages')}
          style={{
            background: ACCENT,
            border: 'none',
            borderRadius: 12,
            padding: '14px 20px',
            minHeight: 52,
            fontSize: 16,
            fontWeight: 600,
            color: '#0d1026',
          }}
        >
          Rejouer
        </button>
        <button
          onClick={onQuitter}
          className="bg-surface-2 text-app border-app"
          style={{
            borderWidth: 1,
            borderStyle: 'solid',
            borderRadius: 12,
            padding: '14px 20px',
            minHeight: 52,
            fontSize: 15,
          }}
        >
          Changer d’activité
        </button>
      </main>
      </Cadre>
    )
  }

  if (!item) return null

  const complet = saisies.every((n) => n !== null)
  const erreurs = valide ? evaluerBasseNommee(item.basses, saisies) : []

  return (
    <Cadre onRetour={() => setEcran('reglages')}>
    <main className="px-4 pb-8 flex flex-col gap-4">
      <Erreur texte={erreur} />

      <div className="flex items-center justify-between">
        <span className="text-app-muted" style={{ fontSize: 13 }}>
          {rang + 1} / {items.length}
        </span>
        <span style={{ fontSize: 14, fontWeight: 600, color: ACCENT }}>
          {nomTonalite(item.progression.tonique, mode)}
        </span>
      </div>

      {/* ⚠ Le « ▶ ½ » n'existe que tant que l'élève note ses basses. */}
      <div className="flex" style={{ gap: 8 }}>
        <button
          onClick={() => void ecouter()}
          disabled={enLecture}
          style={{
            flex: 1,
            background: ACCENT,
            border: 'none',
            borderRadius: 12,
            padding: '14px 20px',
            minHeight: 52,
            fontSize: 16,
            fontWeight: 600,
            color: '#0d1026',
            opacity: enLecture ? 0.6 : 1,
          }}
        >
          {enLecture ? '▶ …' : '▶ Écouter'}
        </button>
        {!valide && (
          <BoutonDemiVitesse onClick={() => void ecouter(DEMI_VITESSE)} disabled={enLecture} />
        )}
      </div>

      <div className="flex justify-end">
        <ToggleToutEnDo actif={toutEnDo} onChange={setToutEnDo} />
      </div>

      {/* Les emplacements de basse — toucher l'un d'eux y ramène le curseur. */}
      <div className="flex flex-wrap justify-center" style={{ gap: 8 }}>
        {saisies.map((note, i) => {
          const attendue = item.basses[i]
          const juste = valide && note && note.lettre === attendue.lettre && note.alteration === attendue.alteration
          let bordure = i === curseur && !valide ? ACCENT : 'var(--border-c)'
          if (valide) bordure = juste ? SUCCES : ERREUR

          return (
            <button
              key={i}
              {...gesteEcoute(i)}
              onClick={() => !valide && setCurseur(i)}
              className="bg-surface text-app"
              style={{
                borderWidth: i === curseur && !valide ? 2 : 1,
                borderStyle: 'solid',
                borderColor: bordure,
                borderRadius: 12,
                padding: '10px 12px',
                minWidth: 68,
                minHeight: 60,
                fontSize: 18,
                fontWeight: 600,
                color: 'var(--text)',
              }}
            >
              {note ? nomNote(note) : '—'}
              {valide && !juste && (
                <div style={{ fontSize: 12, fontWeight: 400, color: SUCCES, marginTop: 3 }}>
                  {nomNote(attendue)}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {!valide && (
        <RoueFigee
          secteurs={SECTEURS_NOTES}
          onSelect={saisir}
          indice="Touche la note · glisse vers le haut pour ♯, vers le bas pour ♭"
        />
      )}

      {!valide && (
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
              color: erreurs.length === 0 ? SUCCES : ERREUR,
            }}
          >
            {erreurs.length === 0
              ? 'Toutes les basses sont justes'
              : `${erreurs.length} basse${erreurs.length > 1 ? 's' : ''} à revoir`}
          </div>

          {/* Les deux lignes en regard. La comparaison est le point : on entend
              où sa propre basse s'écarte. */}
          <div className="flex" style={{ gap: 8, marginTop: 12 }}>
            <button
              onClick={() => ecouterBasses('saisies')}
              className="bg-surface-2 text-app border-app"
              style={{
                flex: 1,
                borderWidth: 1,
                borderStyle: 'solid',
                borderRadius: 12,
                padding: '12px 10px',
                minHeight: 48,
                fontSize: 14,
              }}
            >
              ▶ Mes basses
            </button>
            <button
              onClick={() => ecouterBasses('attendues')}
              className="bg-surface-2 text-app border-app"
              style={{
                flex: 1,
                borderWidth: 1,
                borderStyle: 'solid',
                borderRadius: 12,
                padding: '12px 10px',
                minHeight: 48,
                fontSize: 14,
                color: SUCCES,
              }}
            >
              ▶ Les bonnes
            </button>
          </div>

          {erreurs.map((e) => (
            <div
              key={e.index}
              className="text-app-muted"
              style={{ fontSize: 13, marginTop: 6, lineHeight: 1.5 }}
            >
              Basse {e.index + 1} — {lireErreurBasse(e)}
            </div>
          ))}

          {/* La suite écrite : c'est là que l'élève voit la basse qu'il cherchait
              À SA PLACE, sous les trois voix supérieures. */}
          <div style={{ marginTop: 14 }}>
            <TogglePortee
              vue={vuePorteeEffective}
              onChange={setVuePortee}
              sansTonalite={toutEnDo}
            />
            {vuePorteeEffective !== 'masquee' && (
              <div style={{ marginTop: 10 }}>
                <PorteeSATB
                  partition={partitionDeProgression(item.progression, vuePorteeEffective)}
                  fautes={erreurs.map((e) => e.index)}
                />
              </div>
            )}
          </div>

          <button
            onClick={suivant}
            style={{
              marginTop: 14,
              width: '100%',
              background: ACCENT,
              border: 'none',
              borderRadius: 12,
              padding: '14px 20px',
              minHeight: 52,
              fontSize: 16,
              fontWeight: 600,
              color: '#0d1026',
            }}
          >
            {rang + 1 >= items.length ? 'Voir le bilan' : 'Suivant'}
          </button>
        </div>
      )}
    </main>
    </Cadre>
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
          Dictée de basse
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
