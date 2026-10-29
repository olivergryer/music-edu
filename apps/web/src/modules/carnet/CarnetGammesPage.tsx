// ─── Carnet de gammes — /carnet/gammes ────────────────────────────────────────
//
// Page de travail pour la classe : niveau + tonalité (cercle des quintes),
// métronome, tableau des tempi, séances sauvegardées. Aucun lien vers cette page
// depuis l'appli ; <meta robots noindex> posée à l'affichage.

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { ThemeToggleInline } from '../../ThemeContext'
import CercleQuintes, { CLES_CERCLE } from './CercleQuintes.tsx'
import Metronome from './Metronome.tsx'
import TableauTempi, { type LigneTableau } from './TableauTempi.tsx'
import ListeSeances from './ListeSeances.tsx'
import { bornerTempo } from './TempoKnob.tsx'
import type { FigureId } from './figures.ts'
import {
  EXERCICES, affichageTonalite, exercicesPour, labelExercice, niveauxDisponibles,
  parserGammesCsv, tonalitesDisponibles, type LigneGamme,
} from './gammesData.ts'
import {
  lireSeances, nouvelId, pousserFirestore, sauverLocal, statsExercice, supprimerFirestore,
  supprimerLocal, synchroniser, type Seance,
} from './carnetStorage.ts'

const CLE_PREFS = 'carnet-gammes-prefs-v1'

function lirePrefs(): { niveau?: string; tonalite?: string } {
  try { return JSON.parse(localStorage.getItem(CLE_PREFS) ?? '{}') } catch { return {} }
}

function tonalitePar(dispos: Set<string>, souhaitee?: string): string {
  if (souhaitee && dispos.has(souhaitee)) return souhaitee
  if (dispos.has('Do M')) return 'Do M'
  return CLES_CERCLE.find(c => dispos.has(c)) ?? [...dispos][0] ?? ''
}

const carte: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: 16, padding: 16, boxShadow: 'var(--shadow)',
}
const titreSection: React.CSSProperties = {
  margin: '0 0 12px', fontSize: 16, fontWeight: 700, color: 'var(--text)',
}

export default function CarnetGammesPage() {
  const { user } = useAuth()
  const [lignes, setLignes] = useState<LigneGamme[] | null>(null)
  const [erreur, setErreur] = useState(false)

  const [niveau, setNiveau] = useState('')
  const [tonalite, setTonalite] = useState('')
  const [saisis, setSaisis] = useState<Record<string, string>>({})
  const [courante, setCourante] = useState<Seance | null>(null)
  const [sale, setSale] = useState(false)
  const [seances, setSeances] = useState<Seance[]>(lireSeances)
  const [tempo, setTempo] = useState(80)
  const [figure, setFigure] = useState<FigureId>('noire')
  const [message, setMessage] = useState('')

  // Page confidentielle : hors index des moteurs de recherche.
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    const titre = document.title
    document.title = 'Carnet de gammes — Tessitura'
    return () => { meta.remove(); document.title = titre }
  }, [])

  // Chargement du CSV de référence.
  useEffect(() => {
    let annule = false
    fetch('/carnet-gammes.csv')
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.text() })
      .then(t => {
        if (annule) return
        const l = parserGammesCsv(t)
        if (!l.length) { setErreur(true); return }
        const niveaux = niveauxDisponibles(l)
        const prefs = lirePrefs()
        const n = prefs.niveau && niveaux.includes(prefs.niveau) ? prefs.niveau : niveaux[0]
        setLignes(l)
        setNiveau(n)
        setTonalite(tonalitePar(tonalitesDisponibles(l, n), prefs.tonalite))
      })
      .catch(() => { if (!annule) setErreur(true) })
    return () => { annule = true }
  }, [])

  // Fusion local ↔ Firestore à la connexion.
  useEffect(() => {
    if (!user) return
    synchroniser(user.uid).then(setSeances).catch(() => { /* hors ligne : on reste en local */ })
  }, [user])

  useEffect(() => {
    if (!niveau) return
    try { localStorage.setItem(CLE_PREFS, JSON.stringify({ niveau, tonalite })) } catch { /* ignore */ }
  }, [niveau, tonalite])

  useEffect(() => {
    if (!message) return
    const t = window.setTimeout(() => setMessage(''), 3500)
    return () => window.clearTimeout(t)
  }, [message])

  const niveaux = useMemo(() => (lignes ? niveauxDisponibles(lignes) : []), [lignes])
  const dispos = useMemo(() => (lignes ? tonalitesDisponibles(lignes, niveau) : new Set<string>()), [lignes, niveau])

  const lignesTableau: LigneTableau[] = useMemo(() => {
    if (!lignes) return []
    const figureCsv = (ex: string) => lignes.find(l => l.niveau === niveau && l.tonalite === tonalite && l.exercice === ex)?.figure
    // Séance rouverte : ses objectifs mémorisés priment sur le CSV actuel.
    const base: { exercice: string; objectif?: number }[] = courante
      ? [...new Set([...Object.keys(courante.objectifs), ...Object.keys(courante.saisis)])]
          .map(ex => ({ exercice: ex, objectif: courante.objectifs[ex] }))
      : exercicesPour(lignes, niveau, tonalite).map(l => ({ exercice: l.exercice, objectif: l.tempo }))
    const rang = (id: string) => { const i = EXERCICES.findIndex(e => e.id === id); return i < 0 ? 99 : i }
    return base.sort((a, b) => rang(a.exercice) - rang(b.exercice)).map(b => ({
      exercice: b.exercice,
      label: labelExercice(b.exercice),
      objectif: b.objectif,
      figure: figureCsv(b.exercice),
      ...statsExercice(seances, niveau, tonalite, b.exercice, { id: courante?.id ?? null, date: courante?.date ?? '' }),
    }))
  }, [lignes, niveau, tonalite, courante, seances])

  // ── Actions ────────────────────────────────────────────────────────────────

  const peutQuitter = () => !sale || window.confirm('Des tempi saisis ne sont pas sauvegardés. Continuer sans les garder ?')

  const repartirAZero = () => { setSaisis({}); setCourante(null); setSale(false) }

  const changerNiveau = (n: string) => {
    if (n === niveau && !courante) return
    if (!peutQuitter() || !lignes) return
    setNiveau(n)
    setTonalite(tonalitePar(tonalitesDisponibles(lignes, n), tonalite))
    repartirAZero()
  }

  const changerTonalite = (t: string) => {
    if (t === tonalite && !courante) return
    if (!peutQuitter()) return
    setTonalite(t)
    repartirAZero()
  }

  const nouvelleSeance = () => { if (peutQuitter()) repartirAZero() }

  const ouvrir = (s: Seance) => {
    if (s.id !== courante?.id && !peutQuitter()) return
    setNiveau(s.niveau)
    setTonalite(s.tonalite)
    setSaisis(Object.fromEntries(Object.entries(s.saisis).map(([k, v]) => [k, String(v)])))
    setCourante(s)
    setSale(false)
    if (s.figure) setFigure(s.figure)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const supprimer = (s: Seance) => {
    setSeances(supprimerLocal(s.id))
    if (user) supprimerFirestore(user.uid, s.id).catch(() => { /* file d'attente Firestore */ })
    if (s.id === courante?.id) repartirAZero()
  }

  const saisie = (exercice: string, valeur: string) => {
    setSaisis(prev => ({ ...prev, [exercice]: valeur }))
    setSale(true)
  }

  const envoyer = (t: number, f?: FigureId) => {
    setTempo(bornerTempo(t))
    if (f) setFigure(f)
  }

  const nombresSaisis = Object.fromEntries(
    Object.entries(saisis).map(([k, v]) => [k, parseInt(v, 10)]).filter(([, n]) => Number.isFinite(n) && (n as number) > 0),
  ) as Record<string, number>
  const peutSauver = Object.keys(nombresSaisis).length > 0

  const sauvegarder = () => {
    if (!peutSauver) return
    const maintenant = new Date().toISOString()
    const objectifs = Object.fromEntries(
      lignesTableau.filter(l => l.objectif !== undefined).map(l => [l.exercice, l.objectif as number]),
    )
    const s: Seance = {
      id: courante?.id ?? nouvelId(),
      date: courante?.date ?? maintenant,
      maj: maintenant,
      niveau, tonalite, objectifs, saisis: nombresSaisis, figure,
      schemaVersion: 1,
    }
    setSeances(sauverLocal(s))
    setCourante(s)
    setSale(false)
    setMessage(user ? 'Séance sauvegardée.' : 'Séance sauvegardée sur cet appareil. Connecte-toi pour la retrouver partout.')
    if (user) pousserFirestore(user.uid, s).catch(() => { /* file d'attente Firestore */ })
  }

  // ── Rendu ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: "'Poppins', 'Inter', 'Segoe UI', sans-serif" }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '16px 16px 48px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, fontFamily: "'Righteous', 'Inter', sans-serif", fontWeight: 400 }}>Carnet de gammes</h1>
            <Link to="/" style={{ fontSize: 12, color: 'var(--text-muted)' }}>Tessitura</Link>
          </div>
          <ThemeToggleInline />
        </header>

        {erreur && (
          <div style={{ ...carte, color: '#f87171' }}>
            Les données du carnet sont indisponibles. Vérifie ta connexion puis recharge la page.
          </div>
        )}
        {!lignes && !erreur && <div style={{ ...carte, color: 'var(--text-muted)' }}>Chargement…</div>}

        {lignes && (
          <>
            {/* Niveau */}
            <section style={carte}>
              <h2 style={titreSection}>Niveau</h2>
              <div role="radiogroup" aria-label="Niveau" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {niveaux.map(n => (
                  <button key={n} role="radio" aria-checked={n === niveau} onClick={() => changerNiveau(n)}
                    style={{ minWidth: 56, minHeight: 44, padding: '0 14px', borderRadius: 12, cursor: 'pointer', fontSize: 15, fontWeight: 700,
                      border: `2px solid ${n === niveau ? '#c084fc' : 'var(--border-c)'}`,
                      background: n === niveau ? '#7c3aed' : 'var(--surface-2)', color: n === niveau ? '#fff' : 'var(--text)' }}>
                    {n}
                  </button>
                ))}
              </div>
            </section>

            {/* Cercle des quintes + métronome */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, alignItems: 'start' }}>
              <section style={carte}>
                <h2 style={titreSection}>Tonalité</h2>
                <CercleQuintes tonalite={tonalite} disponibles={dispos} onSelect={changerTonalite} />
              </section>
              <section style={carte}>
                <h2 style={titreSection}>Métronome</h2>
                <Metronome tempo={tempo} onTempo={t => setTempo(bornerTempo(t))} figure={figure} onFigure={setFigure} />
              </section>
            </div>

            {/* Tableau */}
            <section style={carte}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                <h2 style={{ ...titreSection, margin: 0 }}>
                  {niveau} · {tonalite ? affichageTonalite(tonalite) : '—'}
                  {courante && <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)' }}> — séance du {new Date(courante.date).toLocaleDateString('fr-FR')}</span>}
                </h2>
                {courante && (
                  <button onClick={nouvelleSeance}
                    style={{ minHeight: 44, padding: '0 14px', borderRadius: 12, border: '1px solid var(--border-c)', background: 'var(--surface-2)',
                      color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    Nouvelle séance
                  </button>
                )}
              </div>
              {lignesTableau.length ? (
                <TableauTempi lignes={lignesTableau} saisis={saisis} onSaisie={saisie} onEnvoyer={envoyer} />
              ) : (
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 14 }}>Aucun exercice défini pour cette tonalité à ce niveau.</p>
              )}
              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
                <button onClick={sauvegarder} disabled={!peutSauver}
                  style={{ width: '100%', maxWidth: 360, minHeight: 52, borderRadius: 14, border: 'none', fontSize: 16, fontWeight: 700,
                    cursor: peutSauver ? 'pointer' : 'not-allowed', background: peutSauver ? '#7c3aed' : 'var(--surface-2)',
                    color: peutSauver ? '#fff' : 'var(--text-muted)' }}>
                  {courante ? 'Mettre à jour la séance' : 'Sauvegarder la séance'}
                </button>
                {!peutSauver && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Saisis au moins un tempo atteint.</span>}
                <span role="status" style={{ fontSize: 13, color: '#34d399', minHeight: 18, textAlign: 'center' }}>{message}</span>
              </div>
            </section>

            {/* Séances */}
            <section style={carte}>
              <h2 style={titreSection}>Mes séances</h2>
              <ListeSeances seances={seances} ouverte={courante?.id ?? null} onOuvrir={ouvrir} onSupprimer={supprimer} />
              <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                {user
                  ? 'Tes séances sont synchronisées avec ton compte.'
                  : <>Les séances sont gardées sur cet appareil. <Link to="/login" style={{ color: '#c084fc' }}>Connecte-toi</Link> pour les retrouver partout.</>}
              </p>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
