// ─── Harmonie — activité « reconnaissance de cadences » ──────────────────────
//
// L'activité que le barème déclarait sans jamais l'implémenter : `niveaux.ts`
// donne au niveau 3 la tâche `choix_multiple` sur le type de cadence. Deux
// paliers — le niveau 3 diatonique, et un palier « tout » hors barème qui ajoute
// l'imparfaite et les quatre approches chromatiques.
//
// ⚠ DEUX QUESTIONS, DEUX AXES (décidé avec Matthieu). Le type de cadence et
// l'accord d'approche sont indépendants : une napolitaine peut précéder une
// parfaite, une demi ou une rompue. Les mesurer ensemble ferait qu'un élève qui
// entend la demi-cadence mais ne reconnaît pas l'accord aurait tout faux.
//
// ⚠ La question de l'approche ne se pose qu'au palier « tout » : au niveau 3 elle
// n'aurait qu'une réponse possible.
//
// ⚠ Ni chiffrage ni portée avant la réponse — ils donneraient la cadence. Même
// règle que le « ▶ A n'existe qu'après la réponse » de la détection.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import useProgressFirebase from '../../hooks/useProgressFirebase'
import { useModuleProgress } from '../../hooks/useModuleProgress'
import { ThemeToggleInline } from '../../ThemeContext'

import { arreter, chargerInstrument, jouerSuite } from './audio.ts'
import { ChiffrageBrut } from './ChiffrageEmpile.tsx'
import { chiffrageDe, chiffrer, romainChiffre } from './chiffrage.ts'
import { accordChromatique } from './chromatiques.ts'
import PorteeSATB, { type VuePortee } from './PorteeSATB.tsx'
import TogglePortee, { estVuePortee } from './TogglePortee.tsx'
import BoutonDemiVitesse, { DEMI_VITESSE } from './BoutonDemiVitesse.tsx'
import ToggleToutEnDo from './ToggleToutEnDo.tsx'
import {
  LIBELLES_MODE_SESSION,
  MODES_SESSION,
  estModeSession,
  type ModeSession,
} from './modeSession.ts'
import {
  APPROCHES,
  ITEMS_PAR_SESSION_CADENCES,
  LIBELLES_APPROCHE,
  LIBELLES_CADENCE,
  approchesDuPalier,
  construireSessionCadences,
  partitionDeCadence,
  questionApproche,
  itemDeLaReponse,
  realiserCadence,
  scorerCadences,
  typesDuPalier,
  type Approche,
  type Contexte,
  type ItemCadence,
  type MembreCadence,
  type Palier,
  type ReponseCadence,
  type TypeCadence,
} from './cadences.ts'
import { type Mode } from './types.ts'

const ACCENT = '#c084fc'
const SUCCES = '#34d399'
const ERREUR = '#f87171'
const BPM = 58

type Ecran = 'reglages' | 'jeu' | 'bilan'

const LIBELLES_PALIER: Record<Palier, string> = {
  niveau3: 'Niveau 3',
  tout: 'Toutes',
}

const LIBELLES_CONTEXTE: Record<Contexte, string> = {
  nue: 'Cadence seule',
  phrase: 'Phrase',
}

export default function CadencesPage() {
  const navigate = useNavigate()
  const { addSession } = useProgressFirebase()
  const mp = useModuleProgress('harmonie')

  const [ecran, setEcran] = useState<Ecran>('reglages')
  const [palier, setPalier] = useState<Palier>('niveau3')
  // Le mineur est le cadre idiomatique des accords chromatiques ; c'est donc lui
  // que l'écran propose d'abord dès que le palier les contient.
  const [modeSession, setModeSession] = useState<ModeSession>('majeur')
  const [contexte, setContexte] = useState<Contexte>('phrase')

  const [items, setItems] = useState<ItemCadence[]>([])
  const [rang, setRang] = useState(0)
  const [typeRepondu, setTypeRepondu] = useState<TypeCadence | null>(null)
  const [approcheRepondue, setApprocheRepondue] = useState<Approche | null>(null)
  const [enLecture, setEnLecture] = useState(false)
  const [indexCourant, setIndexCourant] = useState<number | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [vuePortee, setVuePortee] = useState<VuePortee>('masquee')
  const [toutEnDo, setToutEnDo] = useState(false)
  // La graine de la session : `itemDeLaReponse` la réemploie, donc l'exemple
  // fabriqué est le même à chaque écoute.
  const graineRef = useRef(1)

  const reponsesRef = useRef<ReponseCadence[]>([])
  const debutMsRef = useRef<number | null>(null)
  const sessionMsRef = useRef(0)
  const finLectureRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!mp.loaded) return
    const p = mp.progress.payload as {
      cadenceMode?: unknown
      cadencePalier?: Palier
      cadenceContexte?: Contexte
      porteeVue?: unknown
      toutEnDo?: unknown
    }
    if (estModeSession(p.cadenceMode)) setModeSession(p.cadenceMode)
    if (p.cadencePalier) setPalier(p.cadencePalier)
    if (p.cadenceContexte) setContexte(p.cadenceContexte)
    if (estVuePortee(p.porteeVue)) setVuePortee(p.porteeVue)
    if (typeof p.toutEnDo === 'boolean') setToutEnDo(p.toutEnDo)
  }, [mp.loaded, mp.progress.payload])

  useEffect(() => () => arreter(), [])

  const item = items[rang]
  const avecApproche = questionApproche(palier)
  // La réponse est complète quand les questions posées ont toutes reçu un choix.
  const repondu = typeRepondu !== null && (!avecApproche || approcheRepondue !== null)

  // « Tout en do » : l'item SONNÉ est ramené sur do ; la portée suit la vue
  // « En Ut » — donc la mineur en mineur, armure vide (cf. `ToggleToutEnDo`).
  const itemSonne = useMemo(
    () => (item ? (toutEnDo ? { ...item, tonique: TONIQUE_UT[item.mode] } : item) : null),
    [item, toutEnDo],
  )
  const vuePorteeEffective: VuePortee = toutEnDo && vuePortee !== 'masquee' ? 'ut' : vuePortee

  const hauteurs = useMemo(() => (itemSonne ? realiserCadence(itemSonne) : []), [itemSonne])

  const ecouter = useCallback(async (facteurTempo = 1) => {
    if (hauteurs.length === 0) return
    if (finLectureRef.current) clearTimeout(finLectureRef.current)
    setEnLecture(true)
    try {
      const duree = await jouerSuite(hauteurs, {
        bpm: BPM * facteurTempo,
        onAccord: (i: number) => setIndexCourant(i),
      })
      finLectureRef.current = setTimeout(() => {
        setEnLecture(false)
        setIndexCourant(null)
        if (debutMsRef.current === null) debutMsRef.current = performance.now()
      }, duree + 150)
    } catch (e) {
      setErreur(`Lecture impossible : ${String(e)}`)
      setEnLecture(false)
    }
  }, [hauteurs])

  // ⚠ APRÈS LA RÉPONSE SEULEMENT. Un exemple de la cadence RÉPONDUE, dans la même
  // tonalité et le même mode : c'est la seule façon d'entendre une confusion entre
  // deux types de cadence. Ce sera un AUTRE exemple — une parfaite ne se change
  // pas en rompue, ce sont deux fins différentes.
  const ecouterMaReponse = useCallback(() => {
    if (!itemSonne || typeRepondu === null) return
    const fabrique = itemDeLaReponse(
      itemSonne,
      palier,
      contexte,
      typeRepondu,
      approcheRepondue ?? 'aucune',
      graineRef.current,
    )
    void jouerSuite(realiserCadence(fabrique), { bpm: BPM })
  }, [itemSonne, palier, contexte, typeRepondu, approcheRepondue])

  function commencer() {
    setErreur(null)
    const graine = Math.floor(Math.random() * 1_000_000)
    graineRef.current = graine
    try {
      const session = construireSessionCadences(modeSession, palier, contexte, graine)
      reponsesRef.current = []
      sessionMsRef.current = performance.now()
      setItems(session)
      setRang(0)
      setTypeRepondu(null)
      setApprocheRepondue(null)
      setIndexCourant(null)
      debutMsRef.current = null
      mp.startSession({ activite: 'cadences', mode: modeSession, palier, contexte, graine })
      setEcran('jeu')
      chargerInstrument('piano').catch(() => setErreur('Chargement du son impossible.'))
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
    }
  }

  // L'item ne se referme que lorsque TOUTES les questions ont reçu une réponse.
  function enregistrer(type: TypeCadence, approche: Approche | null) {
    if (!item) return
    const rtMs = Math.round(performance.now() - (debutMsRef.current ?? sessionMsRef.current))

    reponsesRef.current.push({
      index: rang,
      attenduType: item.type,
      attendueApproche: item.approche,
      reponduType: type,
      reponduApproche: approche,
      rtMs,
    })

    // bits 0-2 type attendu · 3-5 type répondu · 6-8 approche attendue
    // 9-11 approche répondue · 12 palier
    const iType = (t: TypeCadence) => typesDuPalier('tout').indexOf(t)
    const iApp = (a: Approche | null) => (a === null ? 7 : APPROCHES.indexOf(a))
    const flags =
      (iType(item.type) & 0b111) |
      ((iType(type) & 0b111) << 3) |
      ((iApp(item.approche) & 0b111) << 6) |
      ((iApp(approche) & 0b111) << 9) |
      ((palier === 'tout' ? 1 : 0) << 12)

    mp.recordItem({
      index: rang,
      expected: iType(item.type),
      answered: iType(type),
      rtMs,
      flags,
    })
  }

  function repondreType(choix: TypeCadence) {
    if (repondu || !item) return
    setTypeRepondu(choix)
    if (!avecApproche) enregistrer(choix, null)
  }

  function repondreApproche(choix: Approche) {
    if (repondu || typeRepondu === null) return
    setApprocheRepondue(choix)
    enregistrer(typeRepondu, choix)
  }

  function suivant() {
    arreter()
    setIndexCourant(null)
    if (rang + 1 >= items.length) {
      void terminer()
      return
    }
    setRang(rang + 1)
    setTypeRepondu(null)
    setApprocheRepondue(null)
    debutMsRef.current = null
  }

  async function terminer() {
    const resume = scorerCadences(reponsesRef.current)
    const durationMs = Math.round(performance.now() - sessionMsRef.current)
    const t = mp.progress.totals
    const cle = palier === 'niveau3' ? 'cadences:3' : 'cadences:tout'

    try {
      await mp.commitSession({
        summary: {
          score: resume.score,
          itemCount: resume.itemCount,
          accuracy: resume.precisionType,
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
              best: Math.max(mp.progress.levels[cle]?.best ?? 0, resume.precisionType),
              attempts: (mp.progress.levels[cle]?.attempts ?? 0) + 1,
              lastAt: Date.now(),
            },
          },
          payload: {
            cadenceMode: modeSession,
            cadencePalier: palier,
            cadenceContexte: contexte,
            porteeVue: vuePortee,
            toutEnDo,
          },
        },
      })
    } catch (e) {
      console.warn('Harmonie cadences commit', e)
    }

    const p = resume.precisionType
    const medal = p >= 0.9 ? 'or' : p >= 0.75 ? 'argent' : 'bronze'
    try {
      await addSession({
        module: 'harmonie',
        xpEarned: Math.max(5, Math.round(p * resume.itemCount * 3)),
        medal,
        details: { level: LIBELLES_PALIER[palier], items: resume.itemCount, mode: 'Cadences' },
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
            Écoute et nomme la cadence. Au palier « toutes », une seconde question porte sur
            l’accord qui l’approche — napolitaine ou sixte augmentée.
          </p>

          <Bloc titre="Cadences">
            <div className="flex" style={{ gap: 6 }}>
              {(['niveau3', 'tout'] as Palier[]).map((p) => (
                <Segment
                  key={p}
                  actif={p === palier}
                  onClick={() => {
                    setPalier(p)
                    // Le chromatisme s'entend d'abord en mineur : c'est là qu'il
                    // est idiomatique. L'élève peut toujours repasser en majeur.
                    if (p === 'tout') setModeSession('mineur')
                  }}
                >
                  {LIBELLES_PALIER[p]}
                </Segment>
              ))}
            </div>
            <p className="text-app-muted" style={{ fontSize: 12, margin: '8px 0 0', lineHeight: 1.5 }}>
              {palier === 'niveau3'
                ? `${typesDuPalier('niveau3').map((t) => LIBELLES_CADENCE[t]).join(' · ')} — compte au barème.`
                : 'Les cinq cadences et les quatre accords d’approche — hors barème.'}
            </p>
          </Bloc>

          <Bloc titre="Mode">
            <div className="flex" style={{ gap: 6 }}>
              {MODES_SESSION.map((m) => (
                <Segment key={m} actif={m === modeSession} onClick={() => setModeSession(m)}>
                  {LIBELLES_MODE_SESSION[m]}
                </Segment>
              ))}
            </div>
          </Bloc>

          <Bloc titre="Contexte">
            <div className="flex" style={{ gap: 6 }}>
              {(['nue', 'phrase'] as Contexte[]).map((c) => (
                <Segment key={c} actif={c === contexte} onClick={() => setContexte(c)}>
                  {LIBELLES_CONTEXTE[c]}
                </Segment>
              ))}
            </div>
            <p className="text-app-muted" style={{ fontSize: 12, margin: '8px 0 0', lineHeight: 1.5 }}>
              {contexte === 'nue'
                ? 'La tonique, puis la cadence — court, mais la demi-cadence y perd son élan.'
                : 'Quelques accords mènent à la cadence : c’est ainsi qu’elle s’entend vraiment.'}
            </p>
          </Bloc>

          <button onClick={commencer} style={boutonPlein}>
            Commencer
          </button>
        </main>
      </Cadre>
    )
  }

  if (ecran === 'bilan') {
    const resume = scorerCadences(reponsesRef.current)
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
              cadences reconnues · {LIBELLES_PALIER[palier].toLowerCase()}
            </div>
          </div>

          {/* Les deux mesures ne s'additionnent jamais : rater l'accord d'approche
              n'est pas rater la cadence, et cela ne se travaille pas pareil. */}
          {resume.approchesPosees > 0 && (
            <Bloc titre="Accords d’approche">
              <div
                className="bg-surface-2"
                style={{ borderRadius: 10, padding: '12px 14px', fontSize: 13, lineHeight: 1.55 }}
              >
                <strong style={{ color: ACCENT }}>
                  {Math.round(resume.precisionApproche * 100)} %
                </strong>{' '}
                sur {resume.approchesPosees} item{resume.approchesPosees > 1 ? 's' : ''}
                <div className="text-app-muted" style={{ fontSize: 12, marginTop: 6 }}>
                  Compté à part : reconnaître la cadence et reconnaître l’accord qui l’amène sont
                  deux compétences, et elles ne se corrigent pas de la même façon.
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

  const typeJuste = typeRepondu === item.type
  const approcheJuste = approcheRepondue === item.approche

  return (
    <Cadre onRetour={() => setEcran('reglages')}>
      <main className="px-4 pb-8 flex flex-col gap-4">
        <Erreur texte={erreur} />

        <div className="flex items-center justify-between">
          <span className="text-app-muted" style={{ fontSize: 13 }}>
            {rang + 1} / {items.length}
          </span>
          <span className="text-app-muted" style={{ fontSize: 13 }}>
            {LIBELLES_PALIER[palier].toLowerCase()} · {item.mode}
          </span>
        </div>

        {/* ⚠ Le « ▶ ½ » n'existe que tant que l'élève cherche. */}
        <div className="flex" style={{ gap: 8 }}>
        <button
          onClick={() => void ecouter()}
          disabled={enLecture}
          style={{ ...boutonPlein, flex: 1, opacity: enLecture ? 0.6 : 1 }}
        >
          {enLecture ? '▶ …' : '▶ Écouter'}
        </button>
          {!repondu && (
            <BoutonDemiVitesse
              onClick={() => void ecouter(DEMI_VITESSE)}
              disabled={enLecture}
            />
          )}
        </div>

        <div className="flex justify-end">
          <ToggleToutEnDo actif={toutEnDo} onChange={setToutEnDo} />
        </div>

        {/* Les positions. Avant la réponse elles ne montrent RIEN du contenu — un
            chiffrage donnerait la cadence. Le trait marque où elle commence. */}
        <div className="flex flex-wrap justify-center items-end" style={{ gap: 6 }}>
          {item.membres.map((membre, i) => (
            <Case
              key={i}
              membre={membre}
              mode={item.mode}
              position={i + 1}
              devoile={repondu}
              courant={i === indexCourant}
              debutCadence={i === item.debutCadence && item.debutCadence > 0}
            />
          ))}
        </div>

        {/* Question 1 — la cadence. */}
        <Question titre="Quelle cadence ?">
          {typesDuPalier(palier).map((t) => (
            <Choix
              key={t}
              label={LIBELLES_CADENCE[t]}
              onClick={() => repondreType(t)}
              choisi={typeRepondu === t}
              bonne={repondu && t === item.type}
              fausse={repondu && typeRepondu === t && t !== item.type}
              inerte={typeRepondu !== null}
            />
          ))}
        </Question>

        {/* Question 2 — l'accord d'approche, une fois la cadence nommée. */}
        {avecApproche && typeRepondu !== null && (
          <Question titre="Approchée par ?">
            {approchesDuPalier(palier).map((a) => (
              <Choix
                key={a}
                label={LIBELLES_APPROCHE[a]}
                onClick={() => repondreApproche(a)}
                choisi={approcheRepondue === a}
                bonne={repondu && a === item.approche}
                fausse={repondu && approcheRepondue === a && a !== item.approche}
                inerte={approcheRepondue !== null}
              />
            ))}
          </Question>
        )}

        {repondu && (
          <div
            className="bg-surface border-app"
            style={{ borderWidth: 1, borderStyle: 'solid', borderRadius: 12, padding: '14px 16px' }}
          >
            <div
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: typeJuste && (!avecApproche || approcheJuste) ? SUCCES : ERREUR,
              }}
            >
              {typeJuste ? 'Cadence trouvée' : `C’était une ${LIBELLES_CADENCE[item.type].toLowerCase()}`}
            </div>
            {!typeJuste && (
              <button
                onClick={ecouterMaReponse}
                className="bg-surface-2 text-app border-app"
                style={{
                  width: '100%',
                  borderWidth: 1,
                  borderStyle: 'solid',
                  borderRadius: 12,
                  padding: '12px 10px',
                  minHeight: 48,
                  fontSize: 14,
                  marginTop: 10,
                }}
              >
                ▶ Entendre une {LIBELLES_CADENCE[typeRepondu ?? item.type].toLowerCase()}
              </button>
            )}

            {avecApproche && (
              <div className="text-app-muted" style={{ fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>
                {item.approche === 'aucune'
                  ? 'Aucun accord d’approche chromatique.'
                  : `Approche : ${LIBELLES_APPROCHE[item.approche].toLowerCase()}`}
                {!approcheJuste && approcheRepondue !== null && (
                  <> — tu as répondu « {LIBELLES_APPROCHE[approcheRepondue].toLowerCase()} ».</>
                )}
              </div>
            )}

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
                  partition={partitionDeCadence(item, vuePorteeEffective)}
                  indexCourant={indexCourant}
                  legende="Réalisation à quatre voix de la cadence"
                />
              </div>
            )}

            <button onClick={suivant} style={{ ...boutonPlein, marginTop: 14, width: '100%' }}>
              {rang + 1 >= items.length ? 'Voir le bilan' : 'Suivant'}
            </button>
          </div>
        )}

        {!repondu && (
          <p className="text-app-muted" style={{ fontSize: 12, margin: 0, textAlign: 'center' }}>
            {ITEMS_PAR_SESSION_CADENCES} cadences par session · rien n’est chronométré
          </p>
        )}
      </main>
    </Cadre>
  )
}

// ─── Éléments d'écran ────────────────────────────────────────────────────────

/**
 * Une position de la suite. Muette avant la réponse — le chiffrage donnerait la
 * cadence —, chiffrée après. Les accords chromatiques portent leur chiffre ET
 * leur nom : le chiffre seul serait ambigu, « +6 » désignant déjà le V⁷ au 2ᵉ
 * renversement dans la table française.
 */
function Case({
  membre,
  mode,
  position,
  devoile,
  courant,
  debutCadence,
}: {
  membre: MembreCadence
  mode: Mode
  position: number
  devoile: boolean
  courant: boolean
  debutCadence: boolean
}) {
  const chromatique = membre.sorte === 'chromatique' ? accordChromatique(membre.nom) : null

  return (
    <div className="flex items-end" style={{ gap: 6 }}>
      {debutCadence && (
        <span
          aria-hidden="true"
          style={{ width: 1, height: 40, background: 'var(--border-c)', display: 'inline-block' }}
        />
      )}
      <div
        className="bg-surface"
        style={{
          border: `${courant ? 2 : 1}px solid ${courant ? ACCENT : 'var(--border-c)'}`,
          borderRadius: 12,
          minWidth: 52,
          minHeight: 56,
          padding: '6px 8px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          color: courant ? ACCENT : 'var(--text)',
        }}
      >
        {!devoile ? (
          <span style={{ fontSize: 15, color: 'var(--text-muted)' }}>{position}</span>
        ) : chromatique ? (
          <>
            <ChiffrageBrut
              symbole={chromatique.romain}
              etages={chromatique.chiffrage.etages}
              aria={chromatique.libelle}
              taille={15}
              couleur={courant ? ACCENT : 'var(--text)'}
            />
            <span className="text-app-muted" style={{ fontSize: 9, textAlign: 'center' }}>
              {chromatique.libelle}
            </span>
          </>
        ) : membre.sorte === 'diatonique' ? (
          <ChiffrageBrut
            symbole={romainChiffre(membre.accord.degre, mode)}
            etages={chiffrageDe(membre.accord).etages}
            aria={chiffrer(membre.accord, mode)}
            taille={15}
            couleur={courant ? ACCENT : 'var(--text)'}
          />
        ) : null}
      </div>
    </div>
  )
}

function Question({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section>
      <h2
        className="text-app-muted"
        style={{ fontSize: 13, margin: '0 0 8px', fontWeight: 500, textAlign: 'center' }}
      >
        {titre}
      </h2>
      <div className="flex flex-wrap justify-center" style={{ gap: 8 }}>
        {children}
      </div>
    </section>
  )
}

function Choix({
  label,
  onClick,
  choisi,
  bonne,
  fausse,
  inerte,
}: {
  label: string
  onClick: () => void
  choisi: boolean
  bonne: boolean
  fausse: boolean
  inerte: boolean
}) {
  let bordure = 'var(--border-c)'
  let fond: string | undefined
  if (bonne) {
    bordure = SUCCES
    fond = 'rgba(52,211,153,0.14)'
  } else if (fausse) {
    bordure = ERREUR
    fond = 'rgba(248,113,113,0.14)'
  } else if (choisi) {
    bordure = ACCENT
  }

  return (
    <button
      onClick={onClick}
      disabled={inerte}
      className="bg-surface text-app"
      style={{
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: bordure,
        background: fond,
        borderRadius: 12,
        padding: '12px 14px',
        minHeight: 52,
        minWidth: 104,
        fontSize: 14,
        fontWeight: 600,
        color: 'var(--text)',
        opacity: inerte && !bonne && !fausse && !choisi ? 0.45 : 1,
      }}
    >
      {label}
    </button>
  )
}

function Segment({
  actif,
  onClick,
  children,
}: {
  actif: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={actif ? '' : 'bg-surface-2 text-app border-app'}
      style={{
        borderWidth: 1,
        borderStyle: 'solid',
        borderRadius: 10,
        padding: '10px 16px',
        minHeight: 44,
        minWidth: 52,
        fontSize: 14,
        flex: 1,
        ...(actif ? { background: ACCENT, borderColor: ACCENT, color: '#0d1026', fontWeight: 600 } : {}),
      }}
    >
      {children}
    </button>
  )
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
          Cadences
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
