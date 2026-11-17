// ─── /accordeur/test-accompagne — page de test du spike (spec §7.2) ───────────
// Affichage minimal, sans design final. Réservée à IS_DEV (route déclarée dans App.jsx).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { midiToNoteName } from '../../accordeurUtils.js'
import { ACCORDS } from './dsp/synthese.ts'
import { DIAPASON_PAR_DEFAUT, hzVersMidi, type EtatStrobe, type Formule, type NoteFinale, type TrameAnalyse } from './dsp/types.ts'
import { fichiersExport, telecharger } from './exportSession.ts'
import { MoteurWeb, type Resultat, type SessionAudioIOS, type VarianteEcho } from './moteurAudio.ts'
import type { ModeAffichage } from './protocole.ts'

const carte: React.CSSProperties = { background: 'var(--bg-surface, #0a0f1a)', border: '1px solid var(--border, #1f2937)', borderRadius: 16, padding: 14, marginBottom: 12 }
const titre: React.CSSProperties = { fontSize: 13, fontWeight: 700, margin: '0 0 8px', color: '#c084fc' }
const champ: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, color: 'var(--text-muted, #6b7280)', flex: '1 1 130px' }
const entree: React.CSSProperties = { minHeight: 44, borderRadius: 10, border: '1px solid var(--border, #1f2937)', background: 'var(--bg, #030712)', color: 'var(--text, #f9fafb)', padding: '0 8px', fontSize: 14 }
const bouton = (actif = true, couleur = '#7c3aed'): React.CSSProperties => ({
  minHeight: 44, padding: '0 16px', borderRadius: 12, border: 'none', fontWeight: 700, fontSize: 14, cursor: actif ? 'pointer' : 'not-allowed',
  background: actif ? couleur : '#374151', color: '#fff', opacity: actif ? 1 : 0.6,
})

const p95 = (a: number[]) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(0.95 * s.length))] }
const f = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '—')

function nomNote(hz: number | null, diapason: number): { nom: string; cents: number } | null {
  if (!hz) return null
  const m = hzVersMidi(hz, diapason), r = Math.round(m)
  const n = midiToNoteName(r)
  return { nom: `${n.name}${n.octave}`, cents: (m - r) * 100 }
}

function Anneau({ e }: { e: EtatStrobe }) {
  const R = 26
  const x = 32 + R * Math.cos(e.angle), y = 32 + R * Math.sin(e.angle)
  return (
    <div style={{ textAlign: 'center', width: 78 }}>
      <svg width="64" height="64" viewBox="0 0 64 64" role="img" aria-label={`Voix ${e.voix + 1}, battement ${e.vitesseHz.toFixed(1)} Hz`}>
        <circle cx="32" cy="32" r={R} fill="none" stroke="#374151" strokeWidth="2" />
        <circle cx={x} cy={y} r={Math.max(3, Math.min(8, e.intensite * 40))} fill="#c084fc" />
      </svg>
      <div style={{ fontSize: 11, color: 'var(--text-muted, #9ca3af)' }}>voix {e.voix + 1} · m{e.m}</div>
      <div style={{ fontSize: 13, fontWeight: 700 }}>{e.vitesseHz > 0 ? '+' : ''}{e.vitesseHz.toFixed(1)} Hz</div>
    </div>
  )
}

export default function TestAccompagnePage() {
  const diapason = useMemo(() => { try { return parseFloat(localStorage.getItem('acc_diapason') ?? '') || DIAPASON_PAR_DEFAUT } catch { return DIAPASON_PAR_DEFAUT } }, [])
  const [accordId, setAccordId] = useState('I')
  const [accordage, setAccordage] = useState<'juste' | 'tempere'>('juste')
  const [formule, setFormule] = useState<Formule>('tenu')
  const [tempo, setTempo] = useState(90)
  const [niveau, setNiveau] = useState(-12)
  const [duree, setDuree] = useState(60)
  const [mode, setMode] = useState<ModeAffichage>('live')
  const [echo, setEcho] = useState<VarianteEcho>('desactivee')
  const [sessionIOS, setSessionIOS] = useState<SessionAudioIOS>('defaut')
  const [appareil, setAppareil] = useState('')
  const [volumeSysteme, setVolumeSysteme] = useState('')
  const [installation, setInstallation] = useState('haut-parleur intégré, appareil sur pupitre, ~1 m')
  const [obs, setObs] = useState({ hautParleur: false, ecouteur: false, crepitements: false, volumeFaible: false })

  const [statut, setStatut] = useState<'repos' | 'enCours' | 'analyse' | 'fini'>('repos')
  const [progression, setProgression] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [trame, setTrame] = useState<TrameAnalyse | null>(null)
  const [etats, setEtats] = useState<EtatStrobe[]>([])
  const [rmsMicro, setRmsMicro] = useState(0)
  const [coupures, setCoupures] = useState(0)
  const [latence, setLatence] = useState<{ ms: number; qualite: number } | null>(null)
  const [temps, setTemps] = useState<number[]>([])
  const [ecoule, setEcoule] = useState(0)
  const [resultat, setResultat] = useState<Resultat | null>(null)
  const [verite, setVerite] = useState<string | null>(null)

  const moteur = useRef(new MoteurWeb())
  const tempsRef = useRef<number[]>([])
  const debut = useRef(0)
  const minuteur = useRef<ReturnType<typeof setInterval> | null>(null)

  const arreter = useCallback(async () => {
    if (!moteur.current.enCours()) return
    if (minuteur.current) { clearInterval(minuteur.current); minuteur.current = null }
    setStatut('analyse')
    try {
      const r = await moteur.current.arreter()
      setResultat(r); setTemps(r.tempsCalculMs.length ? r.tempsCalculMs : tempsRef.current)
      setStatut('fini')
    } catch (e) { setErreur((e as Error).message); setStatut('repos') }
  }, [])

  const demarrer = useCallback(async (analyse: boolean, dureeS: number, formuleS: Formule) => {
    setErreur(null); setResultat(null); setTrame(null); setEtats([]); setLatence(null); setTemps([]); tempsRef.current = []; setProgression('')
    try {
      setStatut('enCours'); debut.current = performance.now(); setEcoule(0)
      await moteur.current.demarrer({
        planning: { accordId, accordage, formule: formuleS, tempo, duree: Math.max(dureeS + 5, 10), niveauDbfs: niveau, diapason },
        mode, echo, sessionIOS, analyse, diapason,
      }, {
        trame: (t, ms) => { setTrame(t); tempsRef.current.push(ms) },
        strobe: (e, rms, c) => { setEtats(e); setRmsMicro(rms); setCoupures(c) },
        latence: (ms, qualite) => setLatence({ ms, qualite }),
        progression: setProgression,
        erreur: setErreur,
      })
      minuteur.current = setInterval(() => {
        const s = (performance.now() - debut.current) / 1000
        setEcoule(s); setTemps([...tempsRef.current])
        if (s >= dureeS) void arreter()
      }, 250)
    } catch (e) { setErreur((e as Error).message); setStatut('repos') }
  }, [accordId, accordage, tempo, niveau, diapason, mode, echo, sessionIOS, arreter])

  useEffect(() => () => { if (minuteur.current) clearInterval(minuteur.current) }, [])

  const meta = () => ({
    appareil, 'volume système': volumeSysteme, installation, accord: accordId, accordage, formule, tempo: String(tempo),
    'niveau (dBFS crête)': String(niveau), mode, 'annulation d’écho': echo, 'session iOS': sessionIOS, diapason: String(diapason),
    'observation : haut-parleur': String(obs.hautParleur), 'observation : écouteur': String(obs.ecouteur),
    'observation : crépitements': String(obs.crepitements), 'observation : volume faible': String(obs.volumeFaible),
  })
  const exporter = () => {
    if (!resultat) return
    const prefixe = `accompagne-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}`
    fichiersExport(resultat, meta(), verite).forEach((fi, i) => setTimeout(() => telecharger(fi, prefixe), i * 400))
  }

  const lu = trame && nomNote(trame.f0Hz, diapason)
  const live = mode === 'live'
  const enCours = statut === 'enCours'

  return (
    <div style={{ maxWidth: 540, margin: '0 auto', padding: '16px 16px 80px', color: 'var(--text, #f9fafb)', fontFamily: "'Poppins','Inter',sans-serif" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Link to="/accordeur" style={{ fontSize: 12, fontWeight: 700, color: 'inherit', textDecoration: 'none' }}>← Accordeur</Link>
        <Link to="/accordeur/test-accompagne/eleve-synthetique" style={{ fontSize: 12, color: '#c084fc' }}>Élève synthétique →</Link>
      </div>
      <h1 style={{ fontFamily: "'Righteous','Inter',sans-serif", fontSize: 22, margin: '0 0 4px' }}>Test accompagné</h1>
      <p style={{ fontSize: 12, color: 'var(--text-muted, #6b7280)', margin: '0 0 12px' }}>Spike de faisabilité : playback d’accords et micro simultanés. Page de test, sans design final.</p>

      <section style={carte}>
        <h2 style={titre}>Réglages</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <label style={champ}>Accord<select style={entree} value={accordId} onChange={e => setAccordId(e.target.value)} disabled={enCours}>{Object.keys(ACCORDS).map(k => <option key={k}>{k}</option>)}</select></label>
          <label style={champ}>Accordage<select style={entree} value={accordage} onChange={e => setAccordage(e.target.value as 'juste' | 'tempere')} disabled={enCours}><option value="juste">Juste</option><option value="tempere">Tempéré</option></select></label>
          <label style={champ}>Formule<select style={entree} value={formule} onChange={e => setFormule(e.target.value as Formule)} disabled={enCours}>
            <option value="tenu">Tenu</option><option value="blanche">Blanche</option><option value="noire">Noire</option><option value="croche">Croche</option><option value="clignotant">Clignotant (2 s / 2 s)</option></select></label>
          <label style={champ}>Tempo<input style={entree} type="number" min={40} max={200} value={tempo} onChange={e => setTempo(+e.target.value)} disabled={enCours} /></label>
          <label style={champ}>Volume<select style={entree} value={niveau} onChange={e => setNiveau(+e.target.value)} disabled={enCours}><option value={-24}>Faible (−24 dBFS)</option><option value={-12}>Moyen (−12 dBFS)</option><option value={-6}>Fort (−6 dBFS)</option></select></label>
          <label style={champ}>Durée (s)<input style={entree} type="number" min={5} max={540} value={duree} onChange={e => setDuree(+e.target.value)} disabled={enCours} /></label>
          <label style={champ}>Affichage<select style={entree} value={mode} onChange={e => setMode(e.target.value as ModeAffichage)} disabled={enCours}><option value="live">Live</option><option value="fin">Fin</option></select></label>
          <label style={champ}>Annulation d’écho<select style={entree} value={echo} onChange={e => setEcho(e.target.value as VarianteEcho)} disabled={enCours}><option value="desactivee">Désactivée</option><option value="activee">Activée</option><option value="all">« all » (Chrome ≥ 141)</option></select></label>
          <label style={champ}>Session audio iOS<select style={entree} value={sessionIOS} onChange={e => setSessionIOS(e.target.value as SessionAudioIOS)} disabled={enCours}><option value="defaut">Par défaut</option><option value="play-and-record">play-and-record</option></select></label>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          <label style={champ}>Appareil / navigateur<input style={entree} value={appareil} onChange={e => setAppareil(e.target.value)} placeholder="iPad Air, Safari…" /></label>
          <label style={champ}>Volume système<input style={entree} value={volumeSysteme} onChange={e => setVolumeSysteme(e.target.value)} placeholder="50 %" /></label>
          <label style={{ ...champ, flexBasis: '100%' }}>Installation<input style={entree} value={installation} onChange={e => setInstallation(e.target.value)} /></label>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted, #6b7280)', margin: '8px 0 0' }}>Diapason : {diapason} Hz (réglage de l’Accordeur).</p>
      </section>

      <section style={carte}>
        <h2 style={titre}>Étape 0 — sortie audio</h2>
        <p style={{ fontSize: 12, margin: '0 0 8px' }}>Micro ouvert et son tenu : notez d’où sort le son.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 13, marginBottom: 8 }}>
          {([['hautParleur', 'Haut-parleur'], ['ecouteur', 'Écouteur'], ['crepitements', 'Crépitements'], ['volumeFaible', 'Volume faible']] as const).map(([k, l]) => (
            <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 44 }}>
              <input type="checkbox" checked={obs[k]} onChange={e => setObs({ ...obs, [k]: e.target.checked })} style={{ width: 20, height: 20 }} />{l}
            </label>
          ))}
        </div>
        <button style={bouton(statut === 'repos' || statut === 'fini', '#0ea5e9')} disabled={statut !== 'repos' && statut !== 'fini'}
          onClick={() => void demarrer(false, 3, 'tenu')}>Mesurer la latence (3 s)</button>
        <div style={{ fontSize: 13, marginTop: 8 }}>
          Latence de boucle : <b>{latence ? `${latence.ms.toFixed(1)} ms` : '—'}</b>{latence && <span style={{ color: 'var(--text-muted, #6b7280)' }}> (qualité du pic {latence.qualite.toFixed(0)})</span>}
        </div>
      </section>

      <section style={{ ...carte, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button style={bouton(statut === 'repos' || statut === 'fini')} disabled={statut !== 'repos' && statut !== 'fini'} onClick={() => void demarrer(true, duree, formule)}>Démarrer</button>
        <button style={bouton(enCours, '#dc2626')} disabled={!enCours} onClick={() => void arreter()}>Arrêter</button>
        <span style={{ fontSize: 13 }}>{enCours ? `Enregistrement en cours — ${ecoule.toFixed(0)} s` : statut === 'analyse' ? (progression || 'Analyse…') : statut === 'fini' ? 'Terminé' : 'Prêt'}</span>
      </section>

      {erreur && <div role="alert" style={{ ...carte, borderColor: '#f87171', color: '#f87171', fontSize: 13 }}>{erreur}</div>}

      {enCours && !live && <section style={carte}><p style={{ margin: 0, fontSize: 14 }}>Enregistrement en cours. Les résultats s’affichent à l’arrêt.</p></section>}

      {enCours && live && (
        <>
          <section style={carte}>
            <h2 style={titre}>Note courante</h2>
            <div style={{ fontSize: 34, fontWeight: 700, minHeight: 44 }}>{trame?.presence && lu ? lu.nom : '—'}</div>
            <div style={{ fontSize: 13 }}>
              f0 {trame?.f0Hz ? `${trame.f0Hz.toFixed(2)} Hz` : '—'} · {lu ? `${lu.cents >= 0 ? '+' : ''}${lu.cents.toFixed(1)} ¢` : '—'} · σ {trame && Number.isFinite(trame.sigmaCents) ? `${trame.sigmaCents.toFixed(2)} ¢` : '∞'} · source {trame?.source ?? '—'}
            </div>
            <table style={{ fontSize: 12, marginTop: 8, borderCollapse: 'collapse' }}>
              <tbody>
                <tr><td style={{ paddingRight: 12 }}>MPM sur résidu</td><td>{trame?.mpmHz ? `${trame.mpmHz.toFixed(2)} Hz` : '—'}</td></tr>
                <tr><td>Modèle conjoint</td><td>{trame?.modeleHz ? `${trame.modeleHz.toFixed(2)} Hz` : '—'}</td></tr>
                <tr><td>Fusion</td><td>{trame?.f0Hz ? `${trame.f0Hz.toFixed(2)} Hz` : '—'}</td></tr>
              </tbody>
            </table>
          </section>
          <section style={carte}>
            <h2 style={titre}>Stroboscope (un anneau par voix)</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{etats.length ? etats.map(e => <Anneau key={e.voix} e={e} />) : <span style={{ fontSize: 12 }}>En attente de l’accord…</span>}</div>
          </section>
        </>
      )}

      {(enCours || statut === 'fini') && (
        <section style={carte}>
          <h2 style={titre}>Niveaux et charge</h2>
          <div style={{ fontSize: 12, lineHeight: 1.7 }}>
            Niveau micro (rms) : {rmsMicro.toExponential(2)}<br />
            Résidu (rms) : {trame ? trame.rmsResidu.toExponential(2) : '—'}<br />
            Mise à jour du Worker, 95e centile : {f(p95(temps), 0)} ms ({temps.length} mises à jour)<br />
            Coupures audio : <b style={{ color: coupures ? '#f87171' : undefined }}>{coupures}</b>
          </div>
        </section>
      )}

      {statut === 'fini' && resultat && (
        <>
          <section style={carte}>
            <h2 style={titre}>Notes segmentées ({resultat.notes.length})</h2>
            {resultat.notes.length === 0 ? <p style={{ fontSize: 12, margin: 0 }}>Aucune note détectée.</p> : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ fontSize: 12, borderCollapse: 'collapse', width: '100%' }}>
                  <thead><tr style={{ textAlign: 'left', color: 'var(--text-muted, #6b7280)' }}><th>Début</th><th>Durée</th><th>Note</th><th>f0</th><th>¢</th><th>σ</th></tr></thead>
                  <tbody>{resultat.notes.map((n: NoteFinale, i) => {
                    const nn = nomNote(n.f0Hz, diapason)
                    return <tr key={i}><td>{n.tOn.toFixed(1)} s</td><td>{(n.tOff - n.tOn).toFixed(2)} s</td><td>{nn?.nom}</td><td>{n.f0Hz.toFixed(2)}</td><td>{n.centsTempere >= 0 ? '+' : ''}{n.centsTempere.toFixed(1)}</td><td>{Number.isFinite(n.sigmaCents) ? n.sigmaCents.toFixed(2) : '∞'}</td></tr>
                  })}</tbody>
                </table>
              </div>
            )}
          </section>
          <section style={carte}>
            <h2 style={titre}>Enregistrement</h2>
            <label style={{ ...champ, marginBottom: 8 }}>verite.json (élève synthétique, optionnel)
              <input type="file" accept="application/json" onChange={async e => setVerite(e.target.files?.[0] ? await e.target.files[0].text() : null)} style={{ minHeight: 44 }} />
            </label>
            <button style={bouton(true)} onClick={exporter}>Télécharger les 5 fichiers</button>
            <p style={{ fontSize: 11, color: 'var(--text-muted, #6b7280)', margin: '8px 0 0' }}>micro.wav, sortie.wav, planning.json, meta.json{verite ? ', verite.json' : ' (verite.json si fourni)'}. Le navigateur peut demander d’autoriser les téléchargements multiples.</p>
          </section>
        </>
      )}
    </div>
  )
}
