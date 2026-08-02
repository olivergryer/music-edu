// ─── Harmonie — activité « choix binaire », niveaux 2, 4 et 5 ────────────────
//
// Un seul écran pour trois niveaux : la tâche est la même (`choix_binaire`), la
// question change. Dominante ou sous-dominante (2), fondamental ou renversé (4),
// avec ou sans septième (5).
//
// ⚠ LE CHIFFRAGE N'EST JAMAIS AFFICHÉ AVANT LA RÉPONSE — il donnerait le degré,
// la basse et la septième, c'est-à-dire les trois questions à la fois. L'accord
// interrogé est désigné par sa POSITION seule ; le chiffrage n'apparaît qu'au
// feedback. C'est la même règle que le « ▶ A après la réponse » de la détection.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import useProgressFirebase from '../../hooks/useProgressFirebase'
import { useModuleProgress } from '../../hooks/useModuleProgress'
import { ThemeToggleInline } from '../../ThemeContext'

import { arreter, chargerInstrument, jouerSuite } from './audio.ts'
import { chiffrer } from './chiffrage.ts'
import { realiserProgression } from './dispositions.ts'
import { niveauSpec } from './niveaux.ts'
import {
  ITEMS_PAR_SESSION_BINAIRE,
  NIVEAUX_BINAIRE,
  construireSessionBinaire,
  scorerBinaire,
  specBinaire,
  type ItemBinaire,
  type Reponse,
  type ReponseBinaire,
} from './binaire.ts'
import { creerAccord, type Mode } from './types.ts'

const ACCENT = '#c084fc'
const SUCCES = '#34d399'
const ERREUR = '#f87171'
const BPM = 64

type Ecran = 'reglages' | 'jeu' | 'bilan'

export default function ChoixBinairePage() {
  const navigate = useNavigate()
  const { addSession } = useProgressFirebase()
  const mp = useModuleProgress('harmonie')

  const [ecran, setEcran] = useState<Ecran>('reglages')
  const [mode, setMode] = useState<Mode>('majeur')
  const [niveau, setNiveau] = useState<number>(NIVEAUX_BINAIRE[0])
  const [items, setItems] = useState<ItemBinaire[]>([])
  const [rang, setRang] = useState(0)
  const [repondu, setRepondu] = useState<Reponse | null>(null)
  const [enLecture, setEnLecture] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const reponsesRef = useRef<ReponseBinaire[]>([])
  const debutMsRef = useRef<number | null>(null)
  const sessionMsRef = useRef(0)
  const finLectureRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!mp.loaded) return
    const p = mp.progress.payload as { binaireMode?: Mode; binaireNiveau?: number }
    if (p.binaireMode) setMode(p.binaireMode)
    if (typeof p.binaireNiveau === 'number' && NIVEAUX_BINAIRE.includes(p.binaireNiveau)) {
      setNiveau(p.binaireNiveau)
    }
  }, [mp.loaded, mp.progress.payload])

  useEffect(() => () => arreter(), [])

  const item = items[rang]
  const spec = specBinaire(niveau)

  const aJouer = useMemo(() => {
    if (!item) return []
    const suite = realiserProgression(item.progression)
    if (!niveauSpec(item.niveau).contexteTonal) return suite
    const [tonique] = realiserProgression({
      ...item.progression,
      accords: [creerAccord(0, { degre: 1 })],
    })
    return [tonique, ...suite]
  }, [item])

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
      const session = construireSessionBinaire(mode, niveau, graine)
      reponsesRef.current = []
      sessionMsRef.current = performance.now()
      setItems(session)
      setRang(0)
      setRepondu(null)
      debutMsRef.current = null
      mp.startSession({ activite: 'binaire', mode, niveau, graine })
      setEcran('jeu')
      chargerInstrument('piano').catch(() => setErreur('Chargement du son impossible.'))
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
    }
  }

  function repondre(choix: Reponse) {
    if (repondu !== null || !item) return
    const rtMs = Math.round(performance.now() - (debutMsRef.current ?? sessionMsRef.current))
    const correct = choix === item.reponse

    setRepondu(choix)
    reponsesRef.current.push({ index: rang, attendu: item.reponse, repondu: choix, correct, rtMs })

    // bit 0 attendu · bit 1 répondu · bits 2-5 position visée · bits 6-9 niveau
    const flags =
      item.reponse | (choix << 1) | ((item.cible & 0b1111) << 2) | ((niveau & 0b1111) << 6)

    mp.recordItem({ index: rang, expected: item.reponse, answered: choix, rtMs, flags })
  }

  function suivant() {
    arreter()
    if (rang + 1 >= items.length) {
      void terminer()
      return
    }
    setRang(rang + 1)
    setRepondu(null)
    debutMsRef.current = null
  }

  async function terminer() {
    const resume = scorerBinaire(reponsesRef.current)
    const durationMs = Math.round(performance.now() - sessionMsRef.current)
    const t = mp.progress.totals
    const cle = `binaire:${niveau}`

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
          payload: { binaireMode: mode, binaireNiveau: niveau },
        },
      })
    } catch (e) {
      console.warn('Harmonie binaire commit', e)
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

  if (ecran === 'reglages') {
    return (
      <Cadre onRetour={() => navigate('/harmonie')}>
        <main className="px-4 pb-8 flex flex-col gap-5">
          <Erreur texte={erreur} />
          <p className="text-app-muted" style={{ fontSize: 14, margin: 0, lineHeight: 1.5 }}>
            Tu entends une suite courte. Un seul accord est visé, désigné par sa position — et la
            question dépend du niveau. Deux réponses possibles, autant de l’une que de l’autre sur
            une session.
          </p>

          <Bloc titre="Niveau">
            <div className="flex flex-wrap" style={{ gap: 6 }}>
              {NIVEAUX_BINAIRE.map((n) => (
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
              {spec.question} — {spec.aide}
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
    const resume = scorerBinaire(reponsesRef.current)
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
              {reponsesRef.current.filter((r) => r.correct).length} / {resume.itemCount} · niveau{' '}
              {niveau}
            </div>
            {/* Les réponses étaient équilibrées : sous 50 %, on fait moins bien
                que le hasard, ce qui se dit. */}
            <div className="text-app-muted" style={{ fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>
              {resume.score < 50
                ? 'Sous 50 % : les deux réponses étaient à parts égales, il y a un contresens à corriger.'
                : 'Les deux réponses étaient à parts égales sur la session.'}
            </div>
          </div>

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

  const juste = repondu !== null && repondu === item.reponse
  const accordVise = item.progression.accords[item.cible]

  return (
    <Cadre onRetour={() => setEcran('reglages')}>
      <main className="px-4 pb-8 flex flex-col gap-4">
        <Erreur texte={erreur} />

        <div className="flex items-center justify-between">
          <span className="text-app-muted" style={{ fontSize: 13 }}>
            {rang + 1} / {items.length}
          </span>
          <span className="text-app-muted" style={{ fontSize: 13 }}>
            niveau {niveau}
          </span>
        </div>

        {/* Les positions, sans chiffrage : il donnerait les trois réponses. */}
        <div className="flex flex-wrap justify-center" style={{ gap: 8 }}>
          {item.progression.accords.map((accord, i) => {
            const vise = i === item.cible
            return (
              <div
                key={accord.id}
                className="bg-surface"
                style={{
                  border: `${vise ? 2 : 1}px solid ${vise ? ACCENT : 'var(--border-c)'}`,
                  borderRadius: 12,
                  minWidth: 56,
                  minHeight: 56,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: vise ? 20 : 15,
                  fontWeight: vise ? 700 : 400,
                  color: vise ? ACCENT : 'var(--text-muted)',
                  opacity: vise || repondu !== null ? 1 : 0.5,
                }}
              >
                {repondu !== null && vise ? chiffrer(accord, mode) : vise ? '?' : i + 1}
              </div>
            )
          })}
        </div>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)' }}>{spec.question}</div>
          <div className="text-app-muted" style={{ fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>
            {spec.aide}
          </div>
        </div>

        <button
          onClick={() => void ecouter()}
          disabled={enLecture}
          style={{ ...boutonPlein, opacity: enLecture ? 0.6 : 1 }}
        >
          {enLecture ? '▶ …' : '▶ Écouter'}
        </button>

        <div className="flex" style={{ gap: 10 }}>
          {spec.options.map((label, i) => {
            const choix = i as Reponse
            const estBonne = repondu !== null && choix === item.reponse
            const estChoisie = repondu === choix
            let bordure = 'var(--border-c)'
            let fond: string | undefined
            if (estBonne) {
              bordure = SUCCES
              fond = 'rgba(52,211,153,0.14)'
            } else if (estChoisie) {
              bordure = ERREUR
              fond = 'rgba(248,113,113,0.14)'
            }

            return (
              <button
                key={label}
                onClick={() => repondre(choix)}
                disabled={repondu !== null}
                className="bg-surface text-app"
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderStyle: 'solid',
                  borderColor: bordure,
                  background: fond,
                  borderRadius: 12,
                  padding: '16px 12px',
                  minHeight: 64,
                  fontSize: 15,
                  fontWeight: 600,
                  color: 'var(--text)',
                  opacity: repondu !== null && !estBonne && !estChoisie ? 0.45 : 1,
                }}
              >
                {label}
              </button>
            )
          })}
        </div>

        {repondu !== null && (
          <div
            className="bg-surface border-app"
            style={{ borderWidth: 1, borderStyle: 'solid', borderRadius: 12, padding: '14px 16px' }}
          >
            <div style={{ fontSize: 16, fontWeight: 600, color: juste ? SUCCES : ERREUR }}>
              {juste ? 'Juste' : `C’était « ${spec.options[item.reponse]} »`}
            </div>
            <div className="text-app-muted" style={{ fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>
              L’accord {item.cible + 1} était un {chiffrer(accordVise, mode)}.
            </div>

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
  padding: '14px 20px',
  minHeight: 52,
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
          Choix binaire
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
