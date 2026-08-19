// ─── Harmonie — activité « reconnaissance d'intervalles » ────────────────────
//
// HORS BARÈME : ne touche pas à `NIVEAUX`, a sa propre échelle (facile / moyen /
// complet). Prérequis conseillé avant la dictée de basse, sans en être un niveau.
//
// La roue porte les sept nombres ; le glissement vertical donne la qualité — et
// **pas le même vocabulaire selon le secteur** : Majeure/mineure sur 2de, 3ce, 6te
// et 7e, diminuée/juste/augmentée sur unisson, 4te et 5te. Sur les secteurs à
// qualité il n'existe pas de repos : le clic sec ne valide rien, délibérément.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import useProgressFirebase from '../../hooks/useProgressFirebase'
import { useModuleProgress } from '../../hooks/useModuleProgress'
import { ThemeToggleInline } from '../../ThemeContext'

import { arreter, chargerInstrument, jouerSuite } from './audio.ts'
import RoueFigee from './RoueFigee.tsx'
import {
  ITEMS_PAR_SESSION_INTERVALLES,
  LABELS_POOL,
  POOLS,
  SECTEURS_INTERVALLES,
  construireSessionIntervalles,
  memeIntervalle,
  nomIntervalle,
  scorerIntervalles,
  type IntervalleNomme,
  type ItemIntervalle,
  type NiveauIntervalles,
  type QualiteIntervalle,
  type ReponseIntervalle,
} from './intervalles.ts'

const ACCENT = '#c084fc'
const SUCCES = '#34d399'
const ERREUR = '#f87171'
const BPM = 84

type Ecran = 'reglages' | 'jeu' | 'bilan'

export default function IntervallesPage() {
  const navigate = useNavigate()
  const { addSession } = useProgressFirebase()
  const mp = useModuleProgress('harmonie')

  const [ecran, setEcran] = useState<Ecran>('reglages')
  const [niveau, setNiveau] = useState<NiveauIntervalles>('facile')
  const [items, setItems] = useState<ItemIntervalle[]>([])
  const [rang, setRang] = useState(0)
  const [repondu, setRepondu] = useState<IntervalleNomme | null>(null)
  const [enLecture, setEnLecture] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const reponsesRef = useRef<ReponseIntervalle[]>([])
  const debutMsRef = useRef<number | null>(null)
  const sessionMsRef = useRef(0)
  const finLectureRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!mp.loaded) return
    const p = mp.progress.payload as { intervallesNiveau?: NiveauIntervalles }
    if (p.intervallesNiveau && p.intervallesNiveau in POOLS) setNiveau(p.intervallesNiveau)
  }, [mp.loaded, mp.progress.payload])

  useEffect(() => () => arreter(), [])

  const item = items[rang]

  const ecouter = useCallback(async () => {
    if (!item) return
    if (finLectureRef.current) clearTimeout(finLectureRef.current)
    setEnLecture(true)
    const [grave, aigu] = item.hauteurs
    // Arpégé : deux événements successifs. Plaqué : un seul, les deux sons ensemble.
    const suite = item.presentation === 'arpege' ? [[grave], [aigu]] : [[grave, aigu]]
    try {
      const duree = await jouerSuite(suite, { bpm: BPM })
      finLectureRef.current = setTimeout(() => {
        setEnLecture(false)
        if (debutMsRef.current === null) debutMsRef.current = performance.now()
      }, duree + 150)
    } catch (e) {
      setErreur(`Lecture impossible : ${String(e)}`)
      setEnLecture(false)
    }
  }, [item])

  function commencer() {
    setErreur(null)
    const graine = Math.floor(Math.random() * 1_000_000)
    try {
      const session = construireSessionIntervalles(niveau, graine)
      reponsesRef.current = []
      sessionMsRef.current = performance.now()
      setItems(session)
      setRang(0)
      setRepondu(null)
      debutMsRef.current = null
      mp.startSession({ activite: 'intervalles', niveau, graine })
      setEcran('jeu')
      chargerInstrument('piano').catch(() => setErreur('Chargement du son impossible.'))
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e))
    }
  }

  function saisir({ cle, qualite }: { cle: string; qualite: string }) {
    if (repondu !== null || !item) return

    const reponse: IntervalleNomme = {
      nombre: Number(cle),
      qualite: qualite as QualiteIntervalle,
    }
    const rtMs = Math.round(performance.now() - (debutMsRef.current ?? sessionMsRef.current))
    const correct = memeIntervalle(item.intervalle, reponse)

    setRepondu(reponse)
    reponsesRef.current.push({
      index: rang,
      attendu: item.intervalle,
      repondu: reponse,
      correct,
      nombreJuste: reponse.nombre === item.intervalle.nombre,
      rtMs,
      presentation: item.presentation,
    })

    // bits 0-2 nombre attendu (1-7) · bits 3-5 nombre répondu · bit 6 juste
    // · bit 7 présentation plaquée
    const flags =
      (item.intervalle.nombre & 0b111) |
      ((reponse.nombre & 0b111) << 3) |
      ((correct ? 1 : 0) << 6) |
      ((item.presentation === 'plaque' ? 1 : 0) << 7)

    mp.recordItem({
      index: rang,
      expected: item.intervalle.nombre,
      answered: reponse.nombre,
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
    debutMsRef.current = null
  }

  async function terminer() {
    const resume = scorerIntervalles(reponsesRef.current)
    const durationMs = Math.round(performance.now() - sessionMsRef.current)
    const t = mp.progress.totals
    const cle = `intervalles:${niveau}`

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
          payload: { intervallesNiveau: niveau },
        },
      })
    } catch (e) {
      console.warn('Harmonie intervalles commit', e)
    }

    const medal = resume.accuracy >= 0.9 ? 'or' : resume.accuracy >= 0.75 ? 'argent' : 'bronze'
    const xpEarned = Math.max(5, Math.round(resume.accuracy * resume.itemCount * 3))
    try {
      await addSession({
        module: 'harmonie', xpEarned, medal,
        details: { level: `Niveau ${niveau}`, items: resume.itemCount, mode: 'Intervalles' },
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
            Deux notes sonnent, tantôt l’une après l’autre, tantôt ensemble. Touche le nombre sur la
            roue, puis glisse pour la qualité. Sur l’unisson, la quarte et la quinte, un simple clic
            donne « juste ».
          </p>

          <section>
            <h2
              className="text-app-muted"
              style={{ fontSize: 12, margin: '0 0 8px', fontWeight: 500 }}
            >
              Difficulté
            </h2>
            <div className="flex flex-wrap" style={{ gap: 6 }}>
              {(Object.keys(POOLS) as NiveauIntervalles[]).map((n) => (
                <button
                  key={n}
                  onClick={() => setNiveau(n)}
                  className={n === niveau ? '' : 'bg-surface-2 text-app border-app'}
                  style={{
                    borderWidth: 1,
                    borderStyle: 'solid',
                    borderRadius: 10,
                    padding: '10px 16px',
                    minHeight: 44,
                    fontSize: 14,
                    ...(n === niveau
                      ? { background: ACCENT, borderColor: ACCENT, color: '#0d1026', fontWeight: 600 }
                      : {}),
                  }}
                >
                  {LABELS_POOL[n]}
                </button>
              ))}
            </div>
            <p className="text-app-muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
              {POOLS[niveau].length} intervalles : {POOLS[niveau].map(nomIntervalle).join(' · ')}
            </p>
          </section>

          <button onClick={commencer} style={boutonPlein}>
            Commencer
          </button>
        </main>
      </Cadre>
    )
  }

  if (ecran === 'bilan') {
    const resume = scorerIntervalles(reponsesRef.current)
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
            {/* Deux compétences distinctes : mesurer l'écart, puis en nommer la couleur. */}
            <div className="text-app-muted" style={{ fontSize: 13, marginTop: 6 }}>
              {Math.round(resume.precisionNombre * 100)} % de bons nombres — la qualité est l’autre
              moitié du travail
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

  const juste = repondu !== null && memeIntervalle(item.intervalle, repondu)

  return (
    <Cadre onRetour={() => setEcran('reglages')}>
      <main className="px-4 pb-8 flex flex-col gap-4">
        <Erreur texte={erreur} />

        <div className="flex items-center justify-between">
          <span className="text-app-muted" style={{ fontSize: 13 }}>
            {rang + 1} / {items.length}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: ACCENT }}>
            {item.presentation === 'arpege' ? 'Arpégé' : 'Plaqué'}
          </span>
        </div>

        <button
          onClick={() => void ecouter()}
          disabled={enLecture}
          style={{ ...boutonPlein, opacity: enLecture ? 0.6 : 1 }}
        >
          {enLecture ? '▶ …' : '▶ Écouter'}
        </button>

        {repondu === null ? (
          <RoueFigee
            secteurs={SECTEURS_INTERVALLES}
            onSelect={saisir}
            indice="Touche le nombre · glisse pour la qualité"
          />
        ) : (
          <div
            className="bg-surface border-app"
            style={{ borderWidth: 1, borderStyle: 'solid', borderRadius: 12, padding: '14px 16px' }}
          >
            <div style={{ fontSize: 16, fontWeight: 600, color: juste ? SUCCES : ERREUR }}>
              {juste ? nomIntervalle(item.intervalle) : `C’était une ${nomIntervalle(item.intervalle)}`}
            </div>

            {!juste && (
              <div
                className="text-app-muted"
                style={{ fontSize: 13, marginTop: 6, lineHeight: 1.5 }}
              >
                Tu as répondu {nomIntervalle(repondu)}.
                {repondu.nombre === item.intervalle.nombre
                  ? ' Le nombre est juste — c’est la qualité qui a manqué.'
                  : ' L’écart lui-même n’est pas le bon.'}
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
          Intervalles
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
