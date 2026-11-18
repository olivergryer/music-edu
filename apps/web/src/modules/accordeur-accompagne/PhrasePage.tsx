// ─── Page « Accordeur accompagné » — écran Phrase (/accordeur/accompagne) ──────────────
// Un accompagnement en slots (un par temps), l'échelle du mode et une portée qui se remplit des notes
// jouées par l'élève, colorées selon l'écart à l'accord entendu. Toucher un slot ouvre l'écran Accord.
// Rendu : couches à 60 i/s (tête de lecture, slot audible, anneaux) en rAF sur des nœuds DOM/SVG ;
// l'état React ne porte que la structure (phrase, slot audible, notes à 10 Hz).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ThemeToggleInline } from '../../ThemeContext'
import AccordPage from './AccordPage.tsx'
import { etatAnneauDuRole } from './anneaux.ts'
import BandeSlots from './BandeSlots.tsx'
import BarreTransport from './BarreTransport.tsx'
import Bilan from './Bilan.tsx'
import { couleurEcart } from './couleurs.ts'
import EchelleMode, { type JeuSurEchelle } from './EchelleMode.tsx'
import { tonaliteEcrite } from './notation.ts'
import { BandeauIPhone, BulleNote, EcranInstallation, FeuilleReglages, MenuPhrases } from './PanneauxPhrase.tsx'
import {
  PHRASES_FOURNIES, ajouterMesure, chargerPhraseCourante, chargerPhrases, entreeDuSlot, nbSlots, phraseDepuisURL, phraseVersURL, phraseVide,
  sauverPhraseCourante, sauverPhrases, type Phrase,
} from './phrase.ts'
import { tempsMusical } from './planningPhrase.ts'
import PorteeLive, { HAUTEUR_PORTEE, calculerTetes, largeurPrefixe, type TeteAffichee } from './PorteeLive.tsx'
import { realiserPhrase } from './realisation.ts'
import { ecrire, estIPhone, lireReglagesAccordeur, lireReglagesPage, type ReglagesPage } from './reglagesLocaux.ts'
import { NEUTRE, ORANGE, carte, pastille } from './stylesAcc.ts'
import { useRaf } from './useRaf.ts'
import { useSession } from './useSession.ts'

const LS = 54          // largeur d'un slot (un temps), en px

const nouvelId = () => `phrase-${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`

export default function PhrasePage() {
  const reg = useMemo(() => lireReglagesAccordeur(), [])
  const [pageReg, setPageReg] = useState<ReglagesPage>(lireReglagesPage)
  const majPage = useCallback((p: Partial<ReglagesPage>) => {
    setPageReg(r => {
      const n = { ...r, ...p }
      ecrire('acc_cle', n.cle); ecrire('acc_affichage', n.affichage); ecrire('acc_vue_accord', n.vueAccord); ecrire('acc_echo', n.echo); ecrire('acc_install_vu', n.installVu ? '1' : '0')
      return n
    })
  }, [])

  const [params, setParams] = useSearchParams()
  const [perso, setPerso] = useState<Phrase[]>(chargerPhrases)
  const [courante, setCourante] = useState<string>(() => chargerPhraseCourante() ?? PHRASES_FOURNIES[0].id)
  const toutes = useMemo(() => [...PHRASES_FOURNIES, ...perso], [perso])
  const phrase = toutes.find(p => p.id === courante) ?? PHRASES_FOURNIES[0]
  const lectureSeule = PHRASES_FOURNIES.some(p => p.id === phrase.id)

  const enregistrer = useCallback((liste: Phrase[]) => { setPerso(liste); sauverPhrases(liste) }, [])

  // phrase reçue par lien : ?p=…
  useEffect(() => {
    const p = params.get('p')
    if (!p) return
    const recue = phraseDepuisURL(p)
    if (recue) {
      const copie = { ...recue, id: nouvelId(), nom: recue.nom }
      enregistrer([...perso, copie]); setCourante(copie.id); sauverPhraseCourante(copie.id)
    }
    setParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Toute modification d'une phrase fournie crée d'abord une copie personnelle. */
  const changer = useCallback((p: Phrase) => {
    if (PHRASES_FOURNIES.some(f => f.id === p.id)) {
      const copie = { ...p, id: nouvelId(), nom: `${p.nom} (copie)` }
      enregistrer([...perso, copie]); setCourante(copie.id); sauverPhraseCourante(copie.id)
    } else enregistrer(perso.map(x => (x.id === p.id ? p : x)))
  }, [perso, enregistrer])

  const session = useSession(reg, pageReg.echo)
  const [slotOuvert, setSlotOuvert] = useState<number | null>(null)
  const [slotSel, setSlotSel] = useState<number | null>(null)
  const [mention, setMention] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)
  const [reglages, setReglages] = useState(false)
  const [aide, setAide] = useState(false)
  const [messageMenu, setMessageMenu] = useState<string | null>(null)
  const [bulle, setBulle] = useState<TeteAffichee | null>(null)
  const [slotAudible, setSlotAudible] = useState(0)
  const [tourVu, setTourVu] = useState(0)
  const [lastDeb, setLastDeb] = useState(0)
  void lastDeb

  const X0 = largeurPrefixe(phrase, reg.transpo)
  const n = nbSlots(phrase)
  const joue = session.etat === 'joue'

  // ── notes affichées ──
  const notesAff = joue ? (pageReg.affichage === 'live' ? session.notesLive : []) : (session.notesFinales ?? [])
  const pp = session.ppRef.current
  const tetes = useMemo(
    () => (pp ? calculerTetes(notesAff, phrase, pp, pageReg.cle, reg.transpo, reg.seuil, X0, LS) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notesAff, phrase, session.version, pageReg.cle, reg.transpo, reg.seuil, X0],
  )
  const tetesVues = tetes.filter(t => t.tour === tourVu)
  const tetesAnciennes = joue ? tetes.filter(t => t.tour === tourVu - 1) : []

  // à l'arrêt : la portée montre le dernier tour complet
  useEffect(() => {
    if (!joue && tetes.length) setTourVu(Math.max(...tetes.map(t => t.tour)))
  }, [joue, tetes])

  // ── couche 60 i/s : tête de lecture, slot audible, défilement, tour de boucle ──
  const defil = useRef<HTMLDivElement>(null)
  const tete = useRef<HTMLDivElement>(null)
  const cellules = useRef<(HTMLButtonElement | null)[]>([])
  const anciennes = useRef<Map<string, { el: SVGGElement; beat: number }>>(new Map())
  const etat = useRef({ slot: -1, tour: 0, arret: false })
  const registrerSlot = useCallback((k: number, el: HTMLButtonElement | null) => { cellules.current[k] = el }, [])
  const registrerAncienne = useCallback((cle: string, el: SVGGElement | null, beat: number) => {
    if (el) anciennes.current.set(cle, { el, beat }); else anciennes.current.delete(cle)
  }, [])

  useRaf(() => {
    const planning = session.ppRef.current
    const t = session.tempsAudible()
    const h = tete.current
    if (!planning || t === null || !h) return
    const m = tempsMusical(planning, t)
    if (m < 0) { h.style.opacity = '0'; return }
    const tour = Math.floor(m / n), beat = m - tour * n
    h.style.opacity = '1'
    h.style.transform = `translateX(${X0 + beat * LS}px)`
    const k = Math.min(n - 1, Math.floor(beat))
    if (k !== etat.current.slot) {
      const prec = cellules.current[etat.current.slot]
      if (prec) prec.style.background = 'var(--bg)'
      const cur = cellules.current[k]
      if (cur) cur.style.background = NEUTRE
      etat.current.slot = k
      setSlotAudible(k)
    }
    if (tour !== etat.current.tour) { etat.current.tour = tour; setTourVu(tour) }
    anciennes.current.forEach(a => { a.el.style.display = a.beat < beat ? 'none' : '' })
    const c = defil.current
    if (c) { const cible = Math.max(0, X0 + beat * LS - c.clientWidth / 3); if (Math.abs(c.scrollLeft - cible) > 2) c.scrollLeft = cible }
    if (!phrase.boucle && m >= n + 0.4 && !etat.current.arret) { etat.current.arret = true; void session.arreter() }
  }, joue)

  useEffect(() => {
    if (joue) { etat.current = { slot: -1, tour: 0, arret: false }; setTourVu(0) }
    else {
      const prec = cellules.current[etat.current.slot]
      if (prec) prec.style.background = 'var(--bg)'
      if (tete.current) tete.current.style.opacity = '0'
      setSlotAudible(0)
    }
  }, [joue])

  // ── transport ──
  const jouer = () => {
    setBulle(null); setMention(null)
    void session.demarrer({ phrase, departSlot: slotSel ?? 0, avecDecompte: phrase.decompte === 1, mode: pageReg.affichage })
  }
  const arreter = () => { void session.arreter() }

  const ouvrirSlot = async (k: number) => {
    if (session.etat !== 'repos') await session.arreter()
    setSlotSel(k); setSlotOuvert(k); setMention(null); setBulle(null)
  }

  // ── échelle du mode (zone 1) ──
  const entreeAud = entreeDuSlot(phrase, Math.min(slotAudible, n - 1))
  const ecriteAud = tonaliteEcrite(entreeAud.tonalite, reg.transpo)
  const real = useMemo(() => realiserPhrase(phrase), [phrase])
  const indiceAud = (() => { let c = 0; for (const i of Object.keys(phrase.entrees).map(Number).sort((a, b) => a - b)) if (i <= slotAudible) c = i; return c })()
  const sonsAccord = (real.get(indiceAud)?.voix ?? []).map(v => (((v.midi - entreeAud.tonalite.tonique) % 12) + 12) % 12)
  const nomTonalite = `${ecriteAud.nomTonique} ${ecriteAud.mode === 'majeur' ? 'majeur' : 'mineur'}`
  const live = joue && pageReg.affichage === 'live'
  const derniere = live ? session.notesLive[session.notesLive.length - 1] : undefined
  const jeux: JeuSurEchelle[] = !live ? [] : session.noteEnCours
    ? [{ place: session.noteEnCours.place, couleur: couleurEcart(session.noteEnCours.ecart, reg.seuil), vivant: true }]
    : derniere ? [{ place: derniere.place, couleur: couleurEcart(derniere.ecart, reg.seuil), vivant: false }] : []
  const nc = session.noteEnCours
  const anneau = live && nc && nc.type === 'son' && nc.role && 'degre' in nc.place
    ? { degre: nc.place.degre, lire: () => etatAnneauDuRole(session.ppRef.current?.planning ?? null, session.tempsCourant(), session.strobeRef.current, nc.role!) }
    : null

  // ── menu des phrases ──
  const dupliquer = () => {
    const copie = { ...phrase, id: nouvelId(), nom: `${phrase.nom} (copie)` }
    enregistrer([...perso, copie]); setCourante(copie.id); sauverPhraseCourante(copie.id); setMessageMenu('Copie créée.')
  }
  const partager = async () => {
    const url = `${window.location.origin}${window.location.pathname}?p=${phraseVersURL(phrase)}`
    try { await navigator.clipboard.writeText(url); setMessageMenu('Lien copié.') } catch { setMessageMenu(url) }
  }

  const iphone = estIPhone()
  const refusMicro = session.erreur === 'micro-refuse'
  const sansMicro = session.erreur === 'micro-absent'
  const autreErreur = session.erreur && !refusMicro && !sansMicro ? session.erreur : null

  return (
    <div className="bg-app text-app" style={{ minHeight: '100vh', paddingBottom: 150, fontFamily: "'Poppins','Inter',sans-serif" }}>
      <style>{`@keyframes accZoom{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:none}} @media (prefers-reduced-motion: reduce){[role=dialog]{animation:none!important}}`}</style>
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '10px 12px' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Link to="/accordeur" className="bg-surface border border-app" style={{ borderRadius: 8, padding: '8px 10px', fontSize: 12, fontWeight: 700, textDecoration: 'none', color: 'var(--text)', minHeight: 44, display: 'flex', alignItems: 'center' }}>← Accordeur</Link>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontFamily: "'Righteous','Inter',sans-serif", fontSize: 20, margin: 0, color: ORANGE }}>Accordeur accompagné</h1>
            <button onClick={() => { setMenu(true); setMessageMenu(null) }} style={{ ...pastille(false), minHeight: 44, padding: '0 6px', border: 'none', fontSize: 13, color: 'var(--text-muted)', maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} aria-label="Choisir une phrase">
              {phrase.nom}{lectureSeule ? '' : ' ✎'} ▾
            </button>
          </div>
          <ThemeToggleInline />
          <button style={pastille(false, { padding: 0, width: 44 })} onClick={() => setAide(true)} aria-label="Aide">?</button>
          <button style={pastille(false, { padding: 0, width: 44 })} onClick={() => setReglages(true)} aria-label="Réglages">⚙</button>
        </header>

        {iphone && <BandeauIPhone />}
        {refusMicro && (
          <p role="alert" style={{ ...carte, fontSize: 13, margin: '0 0 8px' }}>
            Le micro est bloqué : autorise-le dans les réglages du navigateur pour mesurer ton jeu. <button style={pastille(true, { marginLeft: 6 })} onClick={jouer}>Réessayer</button>
          </p>
        )}
        {sansMicro && <p role="status" style={{ ...carte, fontSize: 13, margin: '0 0 8px' }}>Aucun micro détecté : la phrase se joue quand même, sans mesure.</p>}
        {autreErreur && <p role="alert" style={{ ...carte, fontSize: 13, margin: '0 0 8px', color: '#f87171' }}>{autreErreur}</p>}

        <section style={{ ...carte, marginBottom: 8 }} aria-label="Échelle du mode">
          <EchelleMode ecrite={ecriteAud} mode={entreeAud.tonalite.mode} sonsAccord={sonsAccord} jeux={jeux} anneau={anneau} nomTonalite={nomTonalite} />
        </section>

        <section style={{ ...carte, padding: 0, overflow: 'hidden' }} aria-label="Portée et slots">
          <div ref={defil} style={{ overflowX: 'auto', overflowY: 'hidden', position: 'relative' }}>
            <div style={{ position: 'relative', width: X0 + n * LS + 100, minHeight: HAUTEUR_PORTEE + 130 }}>
              <PorteeLive
                phrase={phrase} transpo={reg.transpo} cle={pageReg.cle} seuil={reg.seuil} X0={X0} LS={LS}
                tetes={tetesVues} tetesAnciennes={tetesAnciennes} registrerAncienne={registrerAncienne}
                onNote={joue ? undefined : t => setBulle(b => (b === t ? null : t))}
              />
              <BandeSlots phrase={phrase} transpo={reg.transpo} X0={X0} LS={LS} onOuvrir={k => void ouvrirSlot(k)} onAjouterMesure={() => changer(ajouterMesure(phrase))} registrer={registrerSlot} />
              <div ref={tete} aria-hidden="true" style={{ position: 'absolute', left: 0, top: 6, width: 2, height: HAUTEUR_PORTEE + 124, background: 'var(--text)', opacity: 0, pointerEvents: 'none', willChange: 'transform' }} />
            </div>
          </div>
        </section>

        {bulle && !joue && (
          <BulleNote note={bulle.note} transpo={reg.transpo} planning={session.ppRef.current?.planning ?? null} phrase={phrase} seuil={reg.seuil} onFermer={() => setBulle(null)} />
        )}

        {session.etat === 'analyse' && <p role="status" style={{ ...carte, marginTop: 8, fontSize: 13 }}>Passe finale en cours : les valeurs définitives remplacent les provisoires…</p>}
        {!joue && session.notesFinales && session.etat === 'repos' && (
          <div style={{ marginTop: 8 }}>
            <Bilan
              notes={session.notesFinales} seuil={reg.seuil} ecrite={tonaliteEcrite(phrase.entrees[0].tonalite, reg.transpo)} mode={phrase.entrees[0].tonalite.mode}
              sonsAccord={(real.get(0)?.voix ?? []).map(v => (((v.midi - phrase.entrees[0].tonalite.tonique) % 12) + 12) % 12)}
              nomTonalite={`${tonaliteEcrite(phrase.entrees[0].tonalite, reg.transpo).nomTonique}`}
              onRejouer={jouer} onEffacer={session.effacer}
            />
          </div>
        )}
        {!joue && slotSel !== null && slotSel > 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '8px 2px' }}>▶ part du temps {slotSel + 1} (dernier slot ouvert).</p>}
      </div>

      <BarreTransport
        etat={session.etat} onJouer={jouer} onArreter={arreter}
        tempo={phrase.tempo} onTempo={t => changer({ ...phrase, tempo: t })}
        mode={pageReg.affichage} onMode={m => { if (!joue) majPage({ affichage: m }) }}
        boucle={phrase.boucle} onBoucle={b => changer({ ...phrase, boucle: b })}
        decompte={phrase.decompte === 1} onDecompte={d => changer({ ...phrase, decompte: d ? 1 : 0 })}
        volume={phrase.volume} onVolume={v => { changer({ ...phrase, volume: v }); session.definirVolume(v) }}
      />

      {slotOuvert !== null && (
        <AccordPage
          phrase={phrase} slot={slotOuvert} session={session} reg={reg} pageReg={pageReg} mode={pageReg.affichage} mention={mention}
          onPhrase={(p, m) => { changer(p); setMention(m ?? null) }}
          onSlot={k => { setSlotOuvert(Math.max(0, Math.min(n - 1, k))); setSlotSel(Math.max(0, Math.min(n - 1, k))); setMention(null) }}
          onFermer={() => setSlotOuvert(null)}
          onVue={v => majPage({ vueAccord: v })}
        />
      )}
      {menu && (
        <MenuPhrases
          fournies={PHRASES_FOURNIES} perso={perso} courante={phrase.id} lectureSeule={lectureSeule} message={messageMenu}
          onChoisir={id => { setCourante(id); sauverPhraseCourante(id); setMenu(false); setSlotSel(null) }}
          onNouvelle={() => { const p = phraseVide(); enregistrer([...perso, p]); setCourante(p.id); sauverPhraseCourante(p.id); setMenu(false) }}
          onDupliquer={dupliquer}
          onRenommer={() => { const nom = window.prompt('Nom de la phrase', phrase.nom); if (nom && nom.trim()) changer({ ...phrase, nom: nom.trim() }) }}
          onSupprimer={() => { if (window.confirm(`Supprimer « ${phrase.nom} » ?`)) { enregistrer(perso.filter(x => x.id !== phrase.id)); setCourante(PHRASES_FOURNIES[0].id); sauverPhraseCourante(PHRASES_FOURNIES[0].id); setMenu(false) } }}
          onPartager={() => void partager()}
          onFermer={() => setMenu(false)}
        />
      )}
      {reglages && <FeuilleReglages reg={reg} pageReg={pageReg} onChange={majPage} latenceMs={session.latenceMs} onFermer={() => setReglages(false)} onAide={() => { setReglages(false); setAide(true) }} />}
      {(aide || !pageReg.installVu) && <EcranInstallation aide={aide} onFermer={() => { setAide(false); majPage({ installVu: true }) }} />}
    </div>
  )
}
