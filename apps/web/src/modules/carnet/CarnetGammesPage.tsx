// ─── Carnet de gammes — /carnet/gammes ────────────────────────────────────────
//
// Page de travail pour la classe : niveau (menu), tonalité (roue des quintes),
// tableau des tempi, métronome (mini-barre sur téléphone, colonne sur grand écran),
// séances sauvegardées. Aucun lien vers cette page
// depuis l'appli ; <meta robots noindex> posée à l'affichage.

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { ThemeToggleInline } from '../../ThemeContext'
import RoueTonalites from './RoueTonalites.tsx'
import { CLES_CERCLE } from './quintes.ts'
import Metronome from './Metronome.tsx'
import { useLargeEcran } from './useLargeEcran.ts'
import TableauTempi, { type LigneTableau } from './TableauTempi.tsx'
import ListeSeances from './ListeSeances.tsx'
import AjoutExercice from './AjoutExercice.tsx'
import SourceDonnees from './SourceDonnees.tsx'
import { bornerTempo } from './CouronneTempo.tsx'
import type { FigureId } from './figures.ts'
import {
  EXERCICES, affichageTonalite, exercicesPour, labelExercice, niveauxDisponibles,
  tonalitesDisponibles, type LigneGamme,
} from './gammesData.ts'
import { appliquerUrlPerso, charger, lireCachePourSource, lireUrlPerso, type Source } from './sourceGammes.ts'
import {
  ajouterLocal, creerExercicePerso, lireExercicesPerso, pousserExercice, retirerLocal,
  supprimerExercice, synchroniserExercices, type ExercicePerso,
} from './exercicesPerso.ts'
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
  const [lignes, setLignes] = useState<LigneGamme[] | null>(() => lireCachePourSource(lireUrlPerso()))
  const [source, setSource] = useState<Source>(() => (lireUrlPerso() ? 'perso' : 'classe'))
  const [horsLigne, setHorsLigne] = useState(false)
  const [urlPerso, setUrlPerso] = useState<string | null>(lireUrlPerso)
  const [exosPerso, setExosPerso] = useState<ExercicePerso[]>(lireExercicesPerso)
  const [erreur, setErreur] = useState(false)

  const [niveau, setNiveau] = useState('')
  const [tonalite, setTonalite] = useState('')
  const [saisis, setSaisis] = useState<Record<string, string>>({})
  const [courante, setCourante] = useState<Seance | null>(null)
  const [sale, setSale] = useState(false)
  const [seances, setSeances] = useState<Seance[]>(lireSeances)
  const [tempo, setTempo] = useState(80)
  // Toujours « noire » à l'ouverture de la page : la figure n'est ni mémorisée ni imposée par les données.
  const [figure, setFigure] = useState<FigureId>('noire')
  const [message, setMessage] = useState('')
  const [exerciceActif, setExerciceActif] = useState<string | null>(null)
  const large = useLargeEcran(900)

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

  // Document de la classe (ou URL personnalisée) ; le cache s'affiche déjà, le réseau met à jour.
  useEffect(() => {
    let annule = false
    charger(lireUrlPerso())
      .then(c => {
        if (annule) return
        setLignes(c.lignes)
        setSource(c.source)
        setHorsLigne(c.horsLigne)
      })
      .catch(() => { if (!annule) setErreur(true) })
    return () => { annule = true }
  }, [])

  // Valide la sélection dès que les données changent (premier chargement, nouvelle source).
  useEffect(() => {
    if (!lignes) return
    const ns = niveauxDisponibles(lignes)
    if (!ns.length) return
    if (!niveau || (!courante && !ns.includes(niveau))) {
      const prefs = lirePrefs()
      const n = prefs.niveau && ns.includes(prefs.niveau) ? prefs.niveau : ns[0]
      setNiveau(n)
      setTonalite(tonalitePar(tonalitesDisponibles(lignes, n), prefs.tonalite))
    } else if (!courante && !tonalitesDisponibles(lignes, niveau).has(tonalite)) {
      setTonalite(tonalitePar(tonalitesDisponibles(lignes, niveau), tonalite))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lignes])

  // Fusion local ↔ Firestore à la connexion.
  useEffect(() => {
    if (!user) return
    synchroniser(user.uid).then(setSeances).catch(() => { /* hors ligne : on reste en local */ })
    synchroniserExercices(user.uid).then(setExosPerso).catch(() => { /* idem */ })
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
    const rang = (id: string) => { const i = EXERCICES.findIndex(e => e.id === id); return i < 0 ? EXERCICES.length : i }
    const estPerso = (id: string) => exosPerso.some(e => e.id === id)
    let base: Omit<LigneTableau, 'max' | 'precedent'>[]
    if (courante) {
      // Séance rouverte : objectifs et libellés mémorisés primant sur les données actuelles.
      base = [...new Set([...Object.keys(courante.objectifs), ...Object.keys(courante.saisis)])]
        .sort((a, b) => rang(a) - rang(b))
        .map(ex => ({
          exercice: ex,
          label: courante.libelles?.[ex] ?? labelExercice(ex),
          objectif: courante.objectifs[ex],
          perso: estPerso(ex),
        }))
    } else {
      const csv = exercicesPour(lignes, niveau, tonalite)
        .map(l => ({ exercice: l.exercice, label: l.libelle ?? labelExercice(l.exercice), objectif: l.tempo as number | undefined, perso: false }))
      const perso = exosPerso.filter(e => e.niveau === niveau)
        .map(e => ({ exercice: e.id, label: e.nom, objectif: e.objectif, perso: true }))
      base = [...csv, ...perso]
    }
    return base.map(b => ({
      ...b,
      ...statsExercice(seances, niveau, tonalite, b.exercice, { id: courante?.id ?? null, date: courante?.date ?? '' }),
    }))
  }, [lignes, niveau, tonalite, courante, seances, exosPerso])

  // ── Actions ────────────────────────────────────────────────────────────────

  const peutQuitter = () => !sale || window.confirm('Des tempi saisis ne sont pas sauvegardés. Continuer sans les garder ?')

  const repartirAZero = () => { setSaisis({}); setCourante(null); setSale(false); setExerciceActif(null) }

  const changerNiveau = (n: string) => {
    if (n === niveau && !courante) return
    if (!peutQuitter() || !lignes) return
    setNiveau(n)
    setTonalite(tonalitePar(tonalitesDisponibles(lignes, n), tonalite))
    repartirAZero()
  }

  /** Renvoie false si le changement est refusé (saisies non sauvegardées) : la roue revient en arrière. */
  const changerTonalite = (t: string): boolean => {
    if (t === tonalite && !courante) return true
    if (!peutQuitter()) return false
    setTonalite(t)
    repartirAZero()
    return true
  }

  const nouvelleSeance = () => { if (peutQuitter()) repartirAZero() }

  const ouvrir = (s: Seance) => {
    if (s.id !== courante?.id && !peutQuitter()) return
    setNiveau(s.niveau)
    setTonalite(s.tonalite)
    setSaisis(Object.fromEntries(Object.entries(s.saisis).map(([k, v]) => [k, String(v)])))
    setCourante(s)
    setSale(false)
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

  const envoyer = (t: number) => setTempo(bornerTempo(t))

  const ajouterExercice = (nom: string, objectif?: number) => {
    const e = creerExercicePerso(niveau, nom, objectif)
    setExosPerso(ajouterLocal(e))
    if (user) pousserExercice(user.uid, e).catch(() => { /* file d'attente Firestore */ })
  }

  const retirerExercice = (id: string) => {
    setExosPerso(retirerLocal(id))
    setSaisis(prev => { const { [id]: _, ...reste } = prev; return reste })
    if (user) supprimerExercice(user.uid, id).catch(() => { /* idem */ })
  }

  const appliquerSource = async (url: string | null): Promise<string | null> => {
    try {
      const c = await appliquerUrlPerso(url)
      setLignes(c.lignes)
      setSource(c.source)
      setHorsLigne(c.horsLigne)
      setUrlPerso(lireUrlPerso())
      return null
    } catch (e) {
      return e instanceof Error ? e.message : 'Chargement impossible.'
    }
  }

  // Ligne active : celle que remplit « Noter » (par défaut la première).
  const indexActif = Math.max(0, lignesTableau.findIndex(l => l.exercice === exerciceActif))
  const ligneActive = lignesTableau[indexActif] ?? null
  const noter = ligneActive ? {
    label: `Noter ${tempo} · ${ligneActive.label}`,
    onClick: () => {
      saisie(ligneActive.exercice, String(tempo))
      const suivante = lignesTableau[indexActif + 1]
      if (suivante) setExerciceActif(suivante.exercice)
    },
  } : null

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
    const libelles = Object.fromEntries(
      lignesTableau.filter(l => l.label !== labelExercice(l.exercice)).map(l => [l.exercice, l.label]),
    )
    const s: Seance = {
      id: courante?.id ?? nouvelId(),
      date: courante?.date ?? maintenant,
      maj: maintenant,
      niveau, tonalite, objectifs, saisis: nombresSaisis,
      ...(Object.keys(libelles).length && { libelles }),
      schemaVersion: 1,
    }
    setSeances(sauverLocal(s))
    setCourante(s)
    setSale(false)
    setMessage(user ? 'Séance sauvegardée.' : 'Séance sauvegardée sur cet appareil. Connecte-toi pour la retrouver partout.')
    if (user) pousserFirestore(user.uid, s).catch(() => { /* file d'attente Firestore */ })
  }

  // ── Rendu ──────────────────────────────────────────────────────────────────

  const tableau = (
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
        <TableauTempi lignes={lignesTableau} saisis={saisis} onSaisie={saisie} onEnvoyer={envoyer}
          onSupprimerPerso={retirerExercice} actif={ligneActive?.exercice ?? null} onActiver={setExerciceActif} />
      ) : (
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 14 }}>Aucun exercice défini pour cette tonalité à ce niveau.</p>
      )}
      {!courante && <AjoutExercice onAjouter={ajouterExercice} />}
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
  )

  const colonnePrincipale = lignes && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <section style={{ ...carte, padding: '8px 8px 4px' }} aria-label="Tonalité">
        <RoueTonalites tonalite={tonalite} disponibles={dispos} onSelect={changerTonalite} />
      </section>

      {tableau}

      <section style={carte}>
        <details>
          <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 16, minHeight: 44, display: 'flex', alignItems: 'center' }}>
            Mes séances ({seances.length})
          </summary>
          <div style={{ paddingTop: 8 }}>
            <ListeSeances seances={seances} ouverte={courante?.id ?? null} onOuvrir={ouvrir} onSupprimer={supprimer} />
            <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
              {user
                ? 'Tes séances sont synchronisées avec ton compte.'
                : <>Les séances sont gardées sur cet appareil. <Link to="/login" style={{ color: '#c084fc' }}>Connecte-toi</Link> pour les retrouver partout.</>}
            </p>
          </div>
        </details>
      </section>

      <section style={carte}>
        <SourceDonnees source={source} horsLigne={horsLigne} urlPerso={urlPerso} onAppliquer={appliquerSource} />
      </section>
    </div>
  )

  const metronome = (
    <Metronome tempo={tempo} onTempo={t => setTempo(bornerTempo(t))} figure={figure} onFigure={setFigure}
      compact={!large} noter={noter} />
  )

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', color: 'var(--text)', fontFamily: "'Poppins', 'Inter', 'Segoe UI', sans-serif" }}>
      <div style={{ maxWidth: large ? 980 : 560, margin: '0 auto', padding: `12px 12px ${large ? 48 : 120}px`, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontFamily: "'Righteous', 'Inter', sans-serif", fontWeight: 400, lineHeight: 1.15 }}>Carnet de gammes</h1>
            <Link to="/" style={{ fontSize: 12, color: 'var(--text-muted)' }}>Tessitura</Link>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {lignes && niveaux.length > 0 && (
              <select value={niveau} onChange={e => changerNiveau(e.target.value)} aria-label="Niveau"
                style={{ height: 44, minWidth: 84, padding: '0 10px', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer',
                  border: '2px solid #c084fc', background: 'var(--surface)', color: 'var(--text)' }}>
                {niveaux.map(n => <option key={n} value={n}>{n}</option>)}
                {niveau && !niveaux.includes(niveau) && <option value={niveau}>{niveau}</option>}
              </select>
            )}
            <ThemeToggleInline />
          </div>
        </header>

        {erreur && (
          <div style={{ ...carte, color: '#f87171' }}>
            Les données du carnet sont indisponibles. Vérifie ta connexion puis recharge la page.
          </div>
        )}
        {!lignes && !erreur && <div style={{ ...carte, color: 'var(--text-muted)' }}>Chargement…</div>}

        {lignes && (large ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 380px', gap: 16, alignItems: 'start' }}>
            {colonnePrincipale}
            <aside style={{ ...carte, position: 'sticky', top: 12 }} aria-label="Métronome">
              <h2 style={titreSection}>Métronome</h2>
              {metronome}
            </aside>
          </div>
        ) : (
          <>
            {colonnePrincipale}
            {metronome}
          </>
        ))}
      </div>
    </div>
  )
}
