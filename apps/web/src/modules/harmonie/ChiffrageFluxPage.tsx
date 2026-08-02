// ─── Harmonie — activité « chiffrage en flux », niveaux 6 et 7 ───────────────
//
// La tâche `identification` : l'élève nomme le degré ET l'état de chaque accord.
// C'est la seule activité où les quatre canaux de `metrique.ts` se remplissent —
// partout ailleurs la réponse est un choix, donc il n'y a pas d'écart à mesurer.
//
// Saisie en DEUX GESTES (décidé avec Matthieu) : la roue figée donne le degré,
// puis une bande donne l'état. La bande est bornée par le niveau ET par le degré
// choisi — au niveau 6 la septième n'est offerte que sur V et II.
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
import { chiffrageDe, romainChiffre } from './chiffrage.ts'
import { realiserProgression } from './dispositions.ts'
import { niveauSpec } from './niveaux.ts'
import RoueFigee from './RoueFigee.tsx'
import { SECTEURS, type SecteurRoue } from './roue.ts'
import {
  ITEMS_PAR_SESSION_FLUX,
  NIVEAU_MAX_FLUX,
  NIVEAU_MIN_FLUX,
  accordSaisi,
  construireSessionFlux,
  degresPossibles,
  etatsPossibles,
  evaluerFlux,
  scorerFlux,
  type EtatAccord,
  type ItemFlux,
  type ReponseFlux,
} from './flux.ts'
import { creerAccord, type Accord, type Degre, type Diagnostic, type Mode } from './types.ts'

const ACCENT = '#c084fc'
const SUCCES = '#34d399'
const ERREUR = '#f87171'
const BPM = 60

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
  const [mode, setMode] = useState<Mode>('majeur')
  const [niveau, setNiveau] = useState<number>(NIVEAU_MIN_FLUX)
  const [items, setItems] = useState<ItemFlux[]>([])
  const [rang, setRang] = useState(0)
  const [saisies, setSaisies] = useState<(Accord | null)[]>([])
  const [curseur, setCurseur] = useState(0)
  const [degreEnCours, setDegreEnCours] = useState<Degre | null>(null)
  const [valide, setValide] = useState(false)
  const [enLecture, setEnLecture] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const reponsesRef = useRef<ReponseFlux[]>([])
  const debutMsRef = useRef<number | null>(null)
  const sessionMsRef = useRef(0)
  const finLectureRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!mp.loaded) return
    const p = mp.progress.payload as { fluxMode?: Mode; fluxNiveau?: number }
    if (p.fluxMode) setMode(p.fluxMode)
    if (typeof p.fluxNiveau === 'number' && NIVEAUX.includes(p.fluxNiveau)) setNiveau(p.fluxNiveau)
  }, [mp.loaded, mp.progress.payload])

  useEffect(() => () => arreter(), [])

  const item = items[rang]
  const spec = niveauSpec(niveau)

  // La roue porte les degrés du niveau. Les secteurs absents du vocabulaire
  // restent muets plutôt que d'être retirés : sept secteurs, toujours au même
  // endroit, pour que le geste ne change pas d'un niveau à l'autre.
  const secteurs = useMemo<SecteurRoue[]>(() => {
    const autorises = degresPossibles(niveau)
    return Array.from({ length: SECTEURS }, (_, i) => {
      const degre = (i + 1) as Degre
      const ouvert = autorises.includes(degre)
      return {
        cle: String(degre),
        label: ouvert ? romainChiffre(degre, mode) : '·',
        qualites: ouvert ? ['degré'] : [],
        defaut: ouvert ? 0 : null,
      }
    })
  }, [niveau, mode])

  const etats = useMemo<EtatAccord[]>(
    () => (degreEnCours === null ? [] : etatsPossibles(niveau, degreEnCours)),
    [niveau, degreEnCours],
  )

  const aJouer = useMemo(() => {
    if (!item) return []
    const suite = realiserProgression(item.progression)
    if (!spec.contexteTonal) return suite
    const [tonique] = realiserProgression({
      ...item.progression,
      accords: [creerAccord(0, { degre: 1 })],
    })
    return [tonique, ...suite]
  }, [item, spec.contexteTonal])

  const ecouter = useCallback(async () => {
    if (aJouer.length === 0) return
    if (finLectureRef.current) clearTimeout(finLectureRef.current)
    setEnLecture(true)
    try {
      const duree = await jouerSuite(aJouer, { bpm: BPM })
      finLectureRef.current = setTimeout(() => {
        setEnLecture(false)
        if (debutMsRef.current === null) debutMsRef.current = performance.now()
      }, duree + 150)
    } catch (e) {
      setErreur(`Lecture impossible : ${String(e)}`)
      setEnLecture(false)
    }
  }, [aJouer])

  function commencer() {
    setErreur(null)
    const graine = Math.floor(Math.random() * 1_000_000)
    try {
      const session = construireSessionFlux(mode, niveau, graine)
      reponsesRef.current = []
      sessionMsRef.current = performance.now()
      setItems(session)
      setRang(0)
      setSaisies(Array(session[0].progression.accords.length).fill(null))
      setCurseur(0)
      setDegreEnCours(null)
      setValide(false)
      debutMsRef.current = null
      mp.startSession({ activite: 'flux', mode, niveau, graine })
      setEcran('jeu')
      chargerInstrument('piano').catch(() => setErreur('Chargement du son impossible.'))
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
    }
  }

  function choisirDegre({ cle }: { cle: string }) {
    if (valide) return
    setDegreEnCours(Number(cle) as Degre)
  }

  function choisirEtat(etat: EtatAccord) {
    if (valide || degreEnCours === null) return
    const suivantes = [...saisies]
    suivantes[curseur] = accordSaisi(degreEnCours, etat, curseur)
    setSaisies(suivantes)
    setDegreEnCours(null)

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
    setDegreEnCours(null)
    reponsesRef.current.push({
      index: rang,
      resultats,
      justes,
      total: item.progression.accords.length,
      rtMs,
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
    setDegreEnCours(null)
    setValide(false)
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
          payload: { fluxMode: mode, fluxNiveau: niveau },
        },
      })
    } catch (e) {
      console.warn('Harmonie flux commit', e)
    }

    const p = resume.precisionAccords
    const medal = p >= 0.9 ? 'or' : p >= 0.75 ? 'argent' : 'bronze'
    const xpEarned = Math.max(5, Math.round(p * resume.itemCount * 5))
    try {
      await addSession({ module: 'harmonie', xpEarned, medal })
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
            <p className="text-app-muted" style={{ fontSize: 12, margin: '8px 0 0', lineHeight: 1.5 }}>
              {niveauSpec(niveau).contexteTonal
                ? 'La tonique sonne avant la suite.'
                : 'La tonique ne sonne pas : à toi de l’établir à l’oreille.'}
            </p>
          </Bloc>

          <Bloc titre="Mode">
            <div className="flex" style={{ gap: 6 }}>
              {(['majeur', 'mineur'] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={m === mode ? '' : 'bg-surface-2 text-app border-app'}
                  style={{
                    ...segment,
                    ...(m === mode
                      ? { background: ACCENT, borderColor: ACCENT, color: '#0d1026', fontWeight: 600 }
                      : {}),
                  }}
                >
                  {m}
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

        <button
          onClick={() => void ecouter()}
          disabled={enLecture}
          style={{ ...boutonPlein, opacity: enLecture ? 0.6 : 1 }}
        >
          {enLecture ? '▶ …' : '▶ Écouter'}
        </button>

        {/* Les cases à chiffrer. Toucher une case y ramène le curseur. */}
        <div className="flex flex-wrap justify-center" style={{ gap: 8 }}>
          {saisies.map((saisie, i) => {
            const resultat = resultats[i]
            const actif = i === curseur && !valide
            let bordure = actif ? ACCENT : 'var(--border-c)'
            if (valide) bordure = resultat?.exact ? SUCCES : ERREUR

            return (
              <button
                key={i}
                onClick={() => {
                  if (valide) return
                  setCurseur(i)
                  setDegreEnCours(null)
                }}
                disabled={valide}
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
              Accord {curseur + 1} —{' '}
              {degreEnCours === null ? 'choisis le degré' : 'choisis l’état'}
            </p>

            {degreEnCours === null ? (
              <RoueFigee
                secteurs={secteurs}
                onSelect={choisirDegre}
                indice="Touche le degré entendu"
                taille={260}
              />
            ) : (
              <div className="flex flex-col" style={{ gap: 10 }}>
                <div className="flex flex-wrap justify-center" style={{ gap: 8 }}>
                  {etats.map((etat) => {
                    const apercu = accordSaisi(degreEnCours, etat, curseur)
                    return (
                      <button
                        key={`${etat.renversement}-${etat.septieme}`}
                        onClick={() => choisirEtat(etat)}
                        className="bg-surface border-app"
                        style={{
                          borderWidth: 1,
                          borderStyle: 'solid',
                          borderRadius: 12,
                          padding: '12px 14px',
                          minWidth: 66,
                          minHeight: 60,
                        }}
                        aria-label={chiffrageDe(apercu).etages.join(' sur ')}
                      >
                        <ChiffrageEmpile accord={apercu} mode={mode} taille={18} />
                      </button>
                    )
                  })}
                </div>
                <button onClick={() => setDegreEnCours(null)} style={boutonCreux}>
                  ← Changer de degré
                </button>
              </div>
            )}

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
                <div
                  key={r.index}
                  className="text-app-muted"
                  style={{ fontSize: 13, marginTop: 6, lineHeight: 1.5 }}
                >
                  Accord {r.index + 1} —{' '}
                  {r.diagnostic
                    ? LIBELLES_DIAGNOSTIC[r.diagnostic]
                    : 'case laissée vide'}
                </div>
              ))}

            <button onClick={suivant} style={{ ...boutonPlein, marginTop: 14, width: '100%' }}>
              {rang + 1 >= items.length ? 'Voir le bilan' : 'Suivant'}
            </button>
          </div>
        )}
      </main>
    </Cadre>
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
