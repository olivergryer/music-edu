// ─── Harmonie — activité « détection d'erreur » ──────────────────────────────
//
// A se LIT, B s'ENTEND. L'élève lit le chiffrage, entend UNE version — celle où un
// accord a été substitué — et désigne l'accord qui s'écarte de ce qui est écrit.
// La tâche exige donc d'anticiper intérieurement les accords lus.
//
// RÈGLE ABSOLUE, qui structure tout l'écran : ▶ A (ce qui est écrit) n'existe
// QU'APRÈS la réponse. L'exposer avant transformerait l'audiation en simple
// comparaison de deux mémoires auditives. C'est le pendant du « jamais de son
// avant la réponse » du module Notes.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import useProgressFirebase from '../../hooks/useProgressFirebase'
import { useModuleProgress } from '../../hooks/useModuleProgress'
import { ThemeToggleInline } from '../../ThemeContext'
import ConsigneOverlayRaw, { consigneSeen } from '../../ConsigneOverlay'

const ConsigneOverlay = ConsigneOverlayRaw as unknown as React.ComponentType<
  Record<string, unknown>
>

import { arreter, chargerInstrument, jouerSuite } from './audio.ts'
import { chiffrer } from './chiffrage.ts'
import { realiserProgression } from './dispositions.ts'
import { niveauSpec } from './niveaux.ts'
import {
  ITEMS_PAR_SESSION,
  NIVEAU_MAX_DETECTION,
  NIVEAU_MIN_DETECTION,
  construireSession,
  decoderDrapeaux,
  encoderDrapeaux,
  fautesParType,
  scorerSession,
  type ItemDetection,
  type ReponseDetection,
} from './detection.ts'
import { lireDrapeaux } from './glyphe.ts'
import {
  CercleTierces,
  EcartEmpilement,
  GlypheColonne,
  LegendeColonne,
  type EtatTrace,
  type VersionJouee,
} from './Glyphes.tsx'
import { creerAccord, type Accord, type Mode, type Progression } from './types.ts'

const ACCENT = '#c084fc'
const SUCCES = '#34d399'
const ERREUR = '#f87171'
const BPM = 66

const LIBELLES_TYPE: Record<string, string> = {
  renversement: 'Basse changée',
  cardinalite: 'Septième ajoutée ou retirée',
  mode: 'Accord hors tonalité',
  degre_associe: 'Degré voisin, même fonction',
  fonction_proche: 'Fonction voisine',
  fonction_lointaine: 'Fonction éloignée',
}

type Ecran = 'reglages' | 'jeu' | 'bilan'

export default function DetectionPage() {
  const navigate = useNavigate()
  const { addSession } = useProgressFirebase()
  const mp = useModuleProgress('harmonie')

  const [showConsigne, setShowConsigne] = useState(() => !consigneSeen('harmonie'))
  const [ecran, setEcran] = useState<Ecran>('reglages')

  const [mode, setMode] = useState<Mode>('majeur')
  const [niveau, setNiveau] = useState(4) // dans [NIVEAU_MIN_DETECTION, NIVEAU_MAX_DETECTION]

  const [items, setItems] = useState<ItemDetection[]>([])
  const [rang, setRang] = useState(0)
  const [repondu, setRepondu] = useState<number | null>(null)
  const [enLecture, setEnLecture] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  // Trajectoire sur le cercle des tierces — correction seulement.
  const [trace, setTrace] = useState<EtatTrace>({ phase: 'statique' })
  const [versionJouee, setVersionJouee] = useState<VersionJouee>('entendu')

  const reponsesRef = useRef<ReponseDetection[]>([])
  const grainesRef = useRef(1)
  const debutMsRef = useRef<number | null>(null)
  const affichageMsRef = useRef(0)
  const sessionMsRef = useRef(0)
  const finLectureRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Réglages relus de la dernière session.
  useEffect(() => {
    if (!mp.loaded) return
    const p = mp.progress.payload as { dernierMode?: Mode; dernierNiveau?: number }
    if (p.dernierMode) setMode(p.dernierMode)
    if (typeof p.dernierNiveau === 'number') setNiveau(p.dernierNiveau)
  }, [mp.loaded, mp.progress.payload])

  useEffect(() => () => arreter(), [])

  const item = items[rang]
  const spec = niveauSpec(niveau)

  // La tonalité change à chaque item : sans cela, tout se jouerait en do et
  // l'élève pourrait s'appuyer sur une mémoire de hauteurs absolues au lieu
  // d'entendre des fonctions. TODO Matthieu — à confirmer en classe.
  const progressionEcrite = useMemo<Progression | null>(
    () => (item ? { ...item.progression, tonique: (grainesRef.current + rang * 7) % 12 } : null),
    [item, rang],
  )

  const realisationEcrite = useMemo(
    () => (progressionEcrite ? realiserProgression(progressionEcrite) : []),
    [progressionEcrite],
  )
  const realisationEntendue = useMemo(
    () =>
      progressionEcrite && item
        ? realiserProgression({ ...progressionEcrite, accords: item.accordsEntendus })
        : [],
    [progressionEcrite, item],
  )

  // Contexte tonal : la tonique sonne avant l'item quand le niveau l'exige.
  const avecContexte = useCallback(
    (accords: number[][]): number[][] => {
      if (!spec.contexteTonal || !progressionEcrite) return accords
      const [tonique] = realiserProgression({
        ...progressionEcrite,
        accords: [creerAccord(0, { degre: 1 })],
      })
      return [tonique, ...accords]
    },
    [spec.contexteTonal, progressionEcrite],
  )

  // Le contexte tonal sonne EN TÊTE de la suite : l'index que renvoie `onAccord`
  // est alors décalé d'un cran par rapport à la progression.
  const decalageContexte = spec.contexteTonal ? 1 : 0

  const jouer = useCallback(
    async (accords: number[][], quelle: VersionJouee, decalage: number, anime: boolean) => {
      if (finLectureRef.current) clearTimeout(finLectureRef.current)
      setEnLecture(true)
      if (anime) {
        setVersionJouee(quelle)
        setTrace({ phase: 'lecture', index: -1 })
      }
      try {
        const duree = await jouerSuite(accords, {
          bpm: BPM,
          onAccord: anime
            ? (i: number) => setTrace({ phase: 'lecture', index: i - decalage })
            : undefined,
        })
        finLectureRef.current = setTimeout(() => {
          setEnLecture(false)
          // À la dernière note, la persistance cède : tout le parcours reste
          // affiché, seul état où l'écart complet se lit sans réécouter.
          if (anime) setTrace({ phase: 'figee' })
          // Le chrono de réponse part à la FIN de la première écoute : c'est là que
          // la décision commence, pas à l'affichage de l'item.
          if (debutMsRef.current === null) debutMsRef.current = performance.now()
        }, duree + 150)
      } catch (e) {
        setErreur(`Lecture impossible : ${String(e)}`)
        setEnLecture(false)
      }
    },
    [],
  )

  // ⚠ `anime` vaut `repondu !== null` : AVANT la réponse, la trajectoire reste
  // muette. L'animer donnerait les degrés entendus un par un, donc la réponse —
  // même règle que « ▶ A n'existe qu'après la réponse ».
  const ecouterEntendu = useCallback(() => {
    void jouer(avecContexte(realisationEntendue), 'entendu', decalageContexte, repondu !== null)
  }, [jouer, avecContexte, realisationEntendue, decalageContexte, repondu])

  const ecouterEcrit = useCallback(() => {
    void jouer(avecContexte(realisationEcrite), 'ecrit', decalageContexte, repondu !== null)
  }, [jouer, avecContexte, realisationEcrite, decalageContexte, repondu])

  // ── Démarrage ──────────────────────────────────────────────────────────────
  async function commencer() {
    setErreur(null)
    const graine = Math.floor(Math.random() * 1_000_000)
    grainesRef.current = graine
    try {
      const session = construireSession(mode, niveau, graine)
      reponsesRef.current = []
      sessionMsRef.current = performance.now()
      setItems(session)
      setRang(0)
      setRepondu(null)
      setTrace({ phase: 'statique' })
      debutMsRef.current = null
      affichageMsRef.current = performance.now()
      mp.startSession({ mode, niveau, graine })
      setEcran('jeu')
      // Le clic sur « Commencer » est le geste utilisateur qui débloque l'audio.
      chargerInstrument('piano').catch(() => setErreur('Chargement du son impossible.'))
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
    }
  }

  // ── Réponse ────────────────────────────────────────────────────────────────
  function repondre(index: number) {
    if (repondu !== null || !item) return
    const rtMs = Math.round(performance.now() - (debutMsRef.current ?? affichageMsRef.current))
    const correct = index === item.indexPerturbe
    // Encodé UNE fois : les mêmes bits partent en base et alimentent les glyphes
    // du bilan. Cf. `ReponseDetection.flags`.
    const flags = encoderDrapeaux(item, mode)

    setRepondu(index)
    reponsesRef.current.push({
      index: rang,
      attendu: item.indexPerturbe,
      repondu: index,
      correct,
      rtMs,
      type: item.perturbation.type,
      difficulte: item.perturbation.difficulte,
      flags,
    })
    mp.recordItem({
      index: rang,
      expected: item.indexPerturbe,
      answered: index,
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
    setRang(rang + 1)
    setRepondu(null)
    setTrace({ phase: 'statique' })
    debutMsRef.current = null
    affichageMsRef.current = performance.now()
  }

  // ── Fin de session : 2 écritures Firestore + XP globale ────────────────────
  async function terminer() {
    const resume = scorerSession(reponsesRef.current)
    const durationMs = Math.round(performance.now() - sessionMsRef.current)
    const t = mp.progress.totals
    const cle = String(niveau)

    try {
      await mp.commitSession({
        summary: resume,
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
          payload: { dernierMode: mode, dernierNiveau: niveau },
        },
      })
    } catch (e) {
      console.warn('Harmonie commit', e)
    }

    const medal = resume.accuracy >= 0.9 ? 'or' : resume.accuracy >= 0.75 ? 'argent' : 'bronze'
    const xpEarned = Math.max(5, Math.round(resume.accuracy * resume.itemCount * 3))
    try {
      await addSession({ module: 'harmonie', xpEarned, medal })
    } catch {
      /* hors ligne : la session per-module est déjà persistée */
    }

    setEcran('bilan')
  }

  // ── Rendu ──────────────────────────────────────────────────────────────────
  return (
    <div
      className="bg-app min-h-dvh flex flex-col"
      style={{ maxWidth: 540, margin: '0 auto', width: '100%' }}
    >
      {showConsigne && (
        <ConsigneOverlay
          storageKey="harmonie"
          icon="🎹"
          title="Détection d’erreur"
          lines={[
            'Une suite d’accords est ÉCRITE à l’écran. Lis-la et imagine-la dans ta tête.',
            'Écoute ensuite : un seul accord ne correspond pas à ce qui est écrit.',
            'Touche l’accord fautif. Tu pourras entendre la version écrite après ta réponse.',
          ]}
          onStart={() => setShowConsigne(false)}
          onClose={() => setShowConsigne(false)}
        />
      )}

      <header className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => (ecran === 'reglages' ? navigate('/') : setEcran('reglages'))}
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
            fontSize: 22,
            color: 'var(--text)',
            margin: 0,
            flex: 1,
          }}
        >
          Harmonie
        </h1>
        <ThemeToggleInline />
      </header>

      {erreur && (
        <div
          className="mx-4 mb-3"
          style={{
            background: 'rgba(248,113,113,0.12)',
            border: `1px solid ${ERREUR}`,
            borderRadius: 10,
            padding: '10px 14px',
            fontSize: 13,
            color: ERREUR,
          }}
        >
          {erreur}
        </div>
      )}

      {ecran === 'reglages' && (
        <EcranReglages
          mode={mode}
          niveau={niveau}
          onMode={setMode}
          onNiveau={setNiveau}
          onCommencer={commencer}
        />
      )}

      {ecran === 'jeu' && item && progressionEcrite && (
        <EcranJeu
          item={item}
          mode={mode}
          rang={rang}
          total={items.length}
          repondu={repondu}
          enLecture={enLecture}
          trace={trace}
          versionJouee={versionJouee}
          onEcouterEntendu={ecouterEntendu}
          onEcouterEcrit={ecouterEcrit}
          onRepondre={repondre}
          onSuivant={suivant}
        />
      )}

      {ecran === 'bilan' && (
        <EcranBilan
          reponses={reponsesRef.current}
          onRejouer={() => setEcran('reglages')}
          onHub={() => navigate('/')}
        />
      )}
    </div>
  )
}

// ─── Réglages ────────────────────────────────────────────────────────────────

function EcranReglages({
  mode,
  niveau,
  onMode,
  onNiveau,
  onCommencer,
}: {
  mode: Mode
  niveau: number
  onMode: (m: Mode) => void
  onNiveau: (n: number) => void
  onCommencer: () => void
}) {
  const spec = niveauSpec(niveau)
  const niveaux = Array.from(
    { length: NIVEAU_MAX_DETECTION - NIVEAU_MIN_DETECTION + 1 },
    (_, i) => NIVEAU_MIN_DETECTION + i,
  )

  return (
    <main className="px-4 pb-8 flex flex-col gap-5">
      <p className="text-app-muted" style={{ fontSize: 14, margin: 0, lineHeight: 1.5 }}>
        Lis la suite d’accords, imagine-la, puis écoute : un accord ne correspond pas. À toi de
        dire lequel.
      </p>

      <Bloc titre="Mode">
        <Segments
          options={[
            { valeur: 'majeur', label: 'Majeur' },
            { valeur: 'mineur', label: 'Mineur' },
          ]}
          actif={mode}
          onChange={(v) => onMode(v as Mode)}
        />
      </Bloc>

      <Bloc titre="Niveau">
        <Segments
          options={niveaux.map((n) => ({ valeur: String(n), label: String(n) }))}
          actif={String(niveau)}
          onChange={(v) => onNiveau(Number(v))}
        />
        <p className="text-app-muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
          Degrés : {spec.vocabulaire.join(', ')} · renversements : {spec.renversements.join(', ')}
          {spec.septiemeSur.length > 0 && ` · septième sur ${spec.septiemeSur.join(', ')}`}
        </p>
      </Bloc>

      <button
        onClick={onCommencer}
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
        Commencer — {ITEMS_PAR_SESSION} accords à démasquer
      </button>
    </main>
  )
}

// ─── Jeu ─────────────────────────────────────────────────────────────────────

function EcranJeu({
  item,
  mode,
  rang,
  total,
  repondu,
  enLecture,
  trace,
  versionJouee,
  onEcouterEntendu,
  onEcouterEcrit,
  onRepondre,
  onSuivant,
}: {
  item: ItemDetection
  mode: Mode
  rang: number
  total: number
  repondu: number | null
  enLecture: boolean
  trace: EtatTrace
  versionJouee: VersionJouee
  onEcouterEntendu: () => void
  onEcouterEcrit: () => void
  onRepondre: (i: number) => void
  onSuivant: () => void
}) {
  const aRepondu = repondu !== null
  const juste = repondu === item.indexPerturbe

  // Décodé plutôt que lu sur l'item : le feedback et le bilan dessinent alors
  // depuis exactement les mêmes bits que ceux persistés en base.
  const drapeaux = useMemo(() => decoderDrapeaux(encoderDrapeaux(item, mode)), [item, mode])

  return (
    <main className="px-4 pb-8 flex flex-col gap-5">
      <div>
        <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
          <span className="text-app-muted" style={{ fontSize: 13 }}>
            {rang + 1} / {total}
          </span>
        </div>
        <div className="bg-surface-2" style={{ height: 6, borderRadius: 3, overflow: 'hidden' }}>
          <div
            style={{
              width: `${((rang + (aRepondu ? 1 : 0)) / total) * 100}%`,
              height: '100%',
              background: ACCENT,
              transition: 'width .25s',
            }}
          />
        </div>
      </div>

      <p className="text-app-muted" style={{ fontSize: 14, margin: 0, lineHeight: 1.5 }}>
        {aRepondu
          ? 'Écoute maintenant ce qui était écrit, et compare.'
          : 'Voici ce qui est écrit. Écoute, puis touche l’accord qui ne correspond pas.'}
      </p>

      {/* Les jetons de chiffrage SONT les cibles de réponse. */}
      <div className="flex flex-wrap" style={{ gap: 8 }}>
        {item.progression.accords.map((accord: Accord, i: number) => {
          const estFautif = i === item.indexPerturbe
          const estChoisi = repondu === i
          let bordure = 'var(--border-c)'
          let fond: string | undefined
          if (aRepondu && estFautif) {
            bordure = SUCCES
            fond = 'rgba(52,211,153,0.14)'
          } else if (aRepondu && estChoisi) {
            bordure = ERREUR
            fond = 'rgba(248,113,113,0.14)'
          }

          return (
            <button
              key={accord.id}
              onClick={() => onRepondre(i)}
              disabled={aRepondu}
              aria-label={`Accord ${i + 1} : ${chiffrer(accord, mode)}`}
              className="bg-surface text-app"
              style={{
                borderWidth: 1,
                borderStyle: 'solid',
                borderColor: bordure,
                background: fond,
                borderRadius: 12,
                padding: '12px 14px',
                minWidth: 64,
                minHeight: 60,
                fontSize: 19,
                fontWeight: 600,
                color: 'var(--text)',
                opacity: aRepondu && !estFautif && !estChoisi ? 0.45 : 1,
              }}
            >
              {chiffrer(accord, mode)}
              {aRepondu && estFautif && (
                <div style={{ fontSize: 12, fontWeight: 400, color: SUCCES, marginTop: 3 }}>
                  entendu {chiffrer(item.perturbation.substitut, mode)}
                </div>
              )}
            </button>
          )
        })}
      </div>

      <div className="flex flex-col" style={{ gap: 10 }}>
        <button
          onClick={onEcouterEntendu}
          disabled={enLecture}
          style={{
            background: aRepondu ? 'var(--surface-2)' : ACCENT,
            border: aRepondu ? '1px solid var(--border-c)' : 'none',
            borderRadius: 12,
            padding: '14px 20px',
            minHeight: 52,
            fontSize: 16,
            fontWeight: 600,
            color: aRepondu ? 'var(--text)' : '#0d1026',
            opacity: enLecture ? 0.6 : 1,
          }}
        >
          {enLecture ? '▶ …' : '▶ Écouter'}
        </button>

        {/* ▶ A n'existe QU'APRÈS la réponse — cf. en-tête du fichier. */}
        {aRepondu && (
          <button
            onClick={onEcouterEcrit}
            disabled={enLecture}
            className="bg-surface-2 text-app border-app"
            style={{
              borderWidth: 1,
              borderStyle: 'solid',
              borderRadius: 12,
              padding: '14px 20px',
              minHeight: 52,
              fontSize: 15,
              opacity: enLecture ? 0.6 : 1,
            }}
          >
            ▶ Écouter ce qui était écrit
          </button>
        )}
      </div>

      {aRepondu && (
        <div
          className="bg-surface border-app"
          style={{
            borderWidth: 1,
            borderStyle: 'solid',
            borderRadius: 12,
            padding: '14px 16px',
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 600, color: juste ? SUCCES : ERREUR }}>
            {juste ? 'Trouvé' : `C’était l’accord ${item.indexPerturbe + 1}`}
          </div>
          <div className="text-app-muted" style={{ fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>
            {LIBELLES_TYPE[item.perturbation.type] ?? item.perturbation.type} —{' '}
            {chiffrer(item.perturbation.original, mode)} devenu{' '}
            {chiffrer(item.perturbation.substitut, mode)}.
          </div>

          {/* Le cercle des tierces : le modèle du module rendu visible. Il montre
              l'écart au lieu de l'énoncer — le texte ci-dessus reste, le glyphe
              le complète. */}
          <div style={{ marginTop: 12 }}>
            <CercleTierces
              ecrit={item.perturbation.original}
              entendu={item.perturbation.substitut}
              degresEcrits={item.progression.accords.map((a: Accord) => a.degre)}
              degresEntendus={item.accordsEntendus.map((a: Accord) => a.degre)}
              mode={mode}
              drapeaux={drapeaux}
              trace={trace}
              version={versionJouee}
              taille={196}
            />
            <div style={{ marginTop: 8 }}>
              <EcartEmpilement
                ecrit={item.perturbation.original}
                entendu={item.perturbation.substitut}
                drapeaux={drapeaux}
              />
            </div>
            <div
              className="text-app-muted"
              style={{ fontSize: 12, marginTop: 10, textAlign: 'center' }}
            >
              {lireDrapeaux(drapeaux)}
            </div>
          </div>

          <button
            onClick={onSuivant}
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
            {rang + 1 >= total ? 'Voir le bilan' : 'Suivant'}
          </button>
        </div>
      )}
    </main>
  )
}

// ─── Bilan ───────────────────────────────────────────────────────────────────

function EcranBilan({
  reponses,
  onRejouer,
  onHub,
}: {
  reponses: ReponseDetection[]
  onRejouer: () => void
  onHub: () => void
}) {
  const resume = scorerSession(reponses)
  const parType = fautesParType(reponses)
  const medaille = resume.accuracy >= 0.9 ? 'Or' : resume.accuracy >= 0.75 ? 'Argent' : 'Bronze'

  return (
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
          {reponses.filter((r) => r.correct).length} / {resume.itemCount} · médaille {medaille}
        </div>
        <div className="text-app-muted" style={{ fontSize: 12, marginTop: 4 }}>
          temps de réponse médian {(resume.medianRtMs / 1000).toFixed(1)} s
        </div>
      </div>

      {/* La signature de la session. Chaque colonne est dessinée en DÉCODANT les
          bits persistés — jamais depuis l'`ItemDetection`. C'est le seul endroit
          où l'élève voit que ses fautes se ressemblent. */}
      {reponses.length > 0 && (
        <Bloc titre="Tes fautes en un coup d’œil">
          <div
            className="bg-surface-2 flex flex-col"
            style={{ borderRadius: 10, padding: '12px 10px', gap: 12 }}
          >
            <div className="flex flex-wrap justify-center" style={{ gap: 6 }}>
              {reponses.map((r) => (
                <div key={r.index} className="flex flex-col items-center">
                  <GlypheColonne drapeaux={decoderDrapeaux(r.flags)} taille={40} />
                  <span
                    style={{ fontSize: 12, lineHeight: 1, color: r.correct ? SUCCES : ERREUR }}
                  >
                    {r.correct ? '✓' : '✗'}
                  </span>
                </div>
              ))}
            </div>
            <LegendeColonne />
          </div>
        </Bloc>
      )}

      {/* C'est CETTE donnée qui dira si l'échelle de difficulté tient sur de
          vrais élèves — d'où sa présence dès la première version. */}
      {parType.length > 0 && (
        <Bloc titre="Par type d’altération">
          <div className="flex flex-col" style={{ gap: 6 }}>
            {parType.map((l) => (
              <div
                key={l.type}
                className="flex items-center justify-between bg-surface-2"
                style={{ borderRadius: 10, padding: '9px 12px', fontSize: 13 }}
              >
                <span>{LIBELLES_TYPE[l.type] ?? l.type}</span>
                <span
                  className="text-app-muted"
                  style={{ fontFamily: 'monospace', color: l.rates > 0 ? ERREUR : SUCCES }}
                >
                  {l.vus - l.rates}/{l.vus}
                </span>
              </div>
            ))}
          </div>
        </Bloc>
      )}

      <div className="flex flex-col" style={{ gap: 10 }}>
        <button
          onClick={onRejouer}
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
          onClick={onHub}
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
          Retour à l’accueil
        </button>
      </div>
    </main>
  )
}

// ─── Éléments partagés ───────────────────────────────────────────────────────

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

function Segments({
  options,
  actif,
  onChange,
}: {
  options: { valeur: string; label: string }[]
  actif: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-wrap" style={{ gap: 6 }}>
      {options.map((o) => (
        <button
          key={o.valeur}
          onClick={() => onChange(o.valeur)}
          className={o.valeur === actif ? '' : 'bg-surface-2 text-app border-app'}
          style={{
            borderWidth: 1,
            borderStyle: 'solid',
            borderRadius: 10,
            padding: '10px 16px',
            minHeight: 44,
            minWidth: 52,
            fontSize: 14,
            ...(o.valeur === actif
              ? { background: ACCENT, borderColor: ACCENT, color: '#0d1026', fontWeight: 600 }
              : {}),
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
