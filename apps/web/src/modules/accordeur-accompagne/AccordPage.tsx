// ─── Écran « Accord » : zoom d'un slot (brief UI v1, § 6) ─────────────────────────────
// Réglage de l'accord et de chacun de ses sons sur une horloge (ou une échelle horizontale), avec
// l'élève mesuré en direct. « Tenir l'accord » joue l'accord de l'entrée sans fin ; tous les réglages
// s'entendent pendant qu'il sonne (volume, cents, muet : en 30 ms ; structure : à la frontière suivante).

import { useCallback, useEffect, useRef, useState } from 'react'
import { romainChiffre } from '../harmonie/chiffrage.ts'
import type { Degre, Mode, Renversement } from '../harmonie/types.ts'
import { bilanDe } from './bilan.ts'
import { couleurEcart, formaterEcart } from './couleurs.ts'
import GrapheAccord, { type EleveSurGraphe, type SonGraphe } from './GrapheAccord.tsx'
import { noteEcrite, nomCourtEcrit, tonaliteEcrite } from './notation.ts'
import {
  NOMS_TONIQUES, entreeDuSlot, estExplicite, indiceEntreeDuSlot, modifierSlot, nbSlots, positionMesureTemps, supprimerEntree, tonalite,
  type AccordageSon, type EntreeSlot, type Formule, type Phrase, type QualiteAccord, type ReglageSon, type Role,
} from './phrase.ts'
import {
  QUALITES, avecDegre, avecNombreDeSons, avecQualite, avecRenversement, avecTonalite, chiffrerEntree, estHorsTonalite, libelleRenversement,
  nbSons, qualiteDiatonique, qualitesProposees,
} from './qualites.ts'
import { centsAccordage, realiserPhrase, sonsDeLEntree } from './realisation.ts'
import { ecartBordure, type Referentiel } from './references.ts'
import { echoEffectif, type ReglagesAccordeur, type ReglagesPage, type VueAccord } from './reglagesLocaux.ts'
import type { ModeAffichage } from './protocole.ts'
import { etatAnneauDuRole } from './anneaux.ts'
import { ORANGE, carte, pastille, rangee, titreSection } from './stylesAcc.ts'
import type { useSession } from './useSession.ts'

type Session = ReturnType<typeof useSession>

const LIBELLE_ROLE: Record<Role, string> = { F: 'Fondamentale', '3': 'Tierce', '5': 'Quinte', '7': 'Septième' }
const FORMULES: Formule[] = ['tenu', 'blanche', 'noire', 'croche']
const ACCORDAGES: [AccordageSon, string][] = [['tempere', 'Tempéré'], ['juste', 'Juste'], ['utilisateur', 'Utilisateur']]
const ROLES: Role[] = ['F', '3', '5', '7']

interface Props {
  phrase: Phrase
  slot: number
  onPhrase: (p: Phrase, mention?: string | null) => void
  onSlot: (k: number) => void
  onFermer: () => void
  session: Session
  reg: ReglagesAccordeur
  pageReg: ReglagesPage
  mode: ModeAffichage
  onVue: (v: VueAccord) => void
  mention: string | null
}

export default function AccordPage({ phrase, slot, onPhrase, onSlot, onFermer, session, reg, pageReg, mode, onVue, mention }: Props) {
  const entree = entreeDuSlot(phrase, slot)
  const indice = indiceEntreeDuSlot(phrase, slot)
  const explicite = estExplicite(phrase, slot)
  const real = realiserPhrase(phrase).get(indice)!
  const sons = sonsDeLEntree(entree, real, reg.diapason, reg.tempUser)
  const ecrite = tonaliteEcrite(entree.tonalite, reg.transpo)
  const hors = estHorsTonalite(entree)
  const nb = nbSons(entree.qualite)
  const [tient, setTient] = useState(false)
  const pos = positionMesureTemps(phrase, slot)
  const mode0: Mode = entree.tonalite.mode

  // état de lecture : « Tenir l'accord » s'arrête si la session s'arrête ou si l'on change de slot
  useEffect(() => { if (session.etat === 'repos') setTient(false) }, [session.etat])
  const slotPrec = useRef(slot)
  useEffect(() => {
    if (slotPrec.current !== slot && tient) { void session.arreter(); setTient(false) }
    slotPrec.current = slot
  }, [slot, tient, session])

  // envois au moteur : au plus un toutes les 100 ms par session, valeurs fusionnées par rôle
  const envois = useRef<Map<Role, ReglageSon>>(new Map())
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null)
  const vider = useCallback(() => {
    minuteur.current = null
    for (const [role, patch] of envois.current) session.reglerSon(0, role, patch)
    envois.current.clear()
  }, [session])
  const envoyer = useCallback((role: Role, patch: ReglageSon) => {
    envois.current.set(role, { ...(envois.current.get(role) ?? {}), ...patch })
    if (!minuteur.current) minuteur.current = setTimeout(vider, 100)
  }, [vider])
  useEffect(() => () => { if (minuteur.current) clearTimeout(minuteur.current) }, [])

  const modifier = (fn: (e: EntreeSlot) => EntreeSlot, structurel: boolean): EntreeSlot => {
    const { phrase: p2, creee } = modifierSlot(phrase, slot, fn)
    onPhrase(p2, creee ? `Nouvelle entrée au temps ${pos.mesure}.${pos.temps}` : null)
    const nouvelle = p2.entrees[slot]
    if (tient && structurel) session.changerAccordTenu(nouvelle)
    return nouvelle
  }

  const regler = (role: Role, patch: ReglageSon) => {
    const nouvelle = modifier(e => ({ ...e, sons: { ...e.sons, [role]: { ...e.sons[role], ...patch } } }), false)
    if (tient) {
      const s = sonsDeLEntree(nouvelle, real, reg.diapason, reg.tempUser).find(x => x.role === role)
      envoyer(role, { ...patch, ...(patch.cents !== undefined && s ? { cents: s.cents } : {}) })
    }
  }

  const changerAccordage = (a: AccordageSon) => {
    const nouvelle = modifier(e => ({ ...e, accordage: a }), false)
    if (tient) for (const s of sonsDeLEntree(nouvelle, real, reg.diapason, reg.tempUser)) envoyer(s.role, { cents: s.cents })
  }
  const reinitialiser = () => {
    const nouvelle = modifier(e => {
      const sons2: EntreeSlot['sons'] = {}
      for (const r of ROLES) { const s = e.sons[r]; if (s) { const { cents: _c, ...reste } = s; if (Object.keys(reste).length) sons2[r] = reste } }
      return { ...e, sons: sons2 }
    }, false)
    if (tient) for (const s of sonsDeLEntree(nouvelle, real, reg.diapason, reg.tempUser)) envoyer(s.role, { cents: s.cents })
  }

  const basculerTenue = async () => {
    if (tient) { await session.arreter(); setTient(false); return }
    setTient(true)
    session.effacer()
    await session.demarrer({ phrase, departSlot: indice, mode, tenir: true })
  }

  // ── données du graphe ──
  const sonsGraphe: SonGraphe[] = sons.map(s => ({
    role: s.role, nom: noteEcrite(s.midi, ecrite).nom, intervalle: s.intervalle, cents: s.cents,
    centsJuste: centsAccordage('juste', entree.qualite, s.intervalle), volume: s.volume, muet: s.muet, doublee: s.doublee,
    couleurBordure: couleurEcart(ecartBordure(s.cents, reg.ref as Referentiel, entree.qualite, s.intervalle, reg.tempUser), reg.seuil),
    libelleRole: LIBELLE_ROLE[s.role],
  }))
  const fond = sons.find(s => s.role === 'F')
  const visible = session.etat === 'joue' && mode === 'live'
  const n = session.noteEnCours
  const eleve: EleveSurGraphe | null = visible && n && fond && n.entree === 0 ? {
    pcCents: ((1200 * Math.log2(n.f0Hz / fond.hz)) % 1200 + 1200) % 1200,
    couleur: n.type === 'son' ? couleurEcart(n.ecart, reg.seuil) : null, role: n.role, ecart: n.ecart, sigma: n.sigma,
  } : null
  const lireAnneau = (role: Role) => etatAnneauDuRole(session.ppRef.current?.planning ?? null, session.tempsCourant(), session.strobeRef.current, role)

  const bilanSons = !tient && session.notesFinales && session.notesFinales.length ? bilanDe(session.notesFinales, reg.seuil) : null
  const diatoniqueDuDegre = qualiteDiatonique(mode0, entree.degre, nb)

  return (
    <div role="dialog" aria-modal="true" aria-label="Accord" className="bg-app text-app" style={{
      position: 'fixed', inset: 0, zIndex: 40, overflowY: 'auto', animation: 'accZoom 200ms ease-out', fontFamily: "'Poppins','Inter',sans-serif",
    }}>
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '10px 14px 40px' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <button style={pastille(false, { padding: 0, width: 44 })} onClick={() => onSlot(slot - 1)} disabled={slot <= 0} aria-label="Temps précédent">‹</button>
          <div style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Mesure {pos.mesure} · temps {pos.temps}{!explicite && ` · hérité du temps ${positionMesureTemps(phrase, indice).mesure}.${positionMesureTemps(phrase, indice).temps}`}</div>
            <div style={{ fontSize: 17, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {nomCourtEcrit(entree, reg.transpo)} · {chiffrerEntree(entree)} · {QUALITES[entree.qualite].label}
              {hors && <span style={{ marginLeft: 8, fontSize: 11, border: '1px solid var(--text-muted)', borderRadius: 4, padding: '1px 5px', color: 'var(--text-muted)', fontWeight: 400 }}>hors tonalité</span>}
            </div>
          </div>
          <button style={pastille(false, { padding: 0, width: 44 })} onClick={() => onSlot(slot + 1)} disabled={slot >= nbSlots(phrase) - 1} aria-label="Temps suivant">›</button>
          <button style={pastille(false, { padding: 0, width: 44 })} onClick={() => { if (tient) void session.arreter(); onFermer() }} aria-label="Fermer l’accord">✕</button>
        </header>
        {mention && <p role="status" style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>{mention}</p>}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 460px', minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => void basculerTenue()} style={pastille(true, { background: tient ? 'transparent' : ORANGE, color: tient ? ORANGE : '#0D1026', border: `1.5px solid ${ORANGE}` })} aria-pressed={tient}>
                {tient ? '■ Arrêter' : '▶ Tenir l’accord'}
              </button>
              <div role="group" aria-label="Vue">
                <button style={pastille(pageReg.vueAccord === 'horloge')} onClick={() => onVue('horloge')}>Horloge</button>{' '}
                <button style={pastille(pageReg.vueAccord === 'echelle')} onClick={() => onVue('echelle')}>Échelle</button>
              </div>
              {session.erreur && <span role="alert" style={{ fontSize: 12, color: '#f87171' }}>{session.erreur === 'micro-refuse' ? 'Micro refusé : autorise-le dans les réglages du navigateur.' : session.erreur === 'micro-absent' ? 'Aucun micro détecté : l’accord sonne, sans mesure.' : session.erreur}</span>}
              {tient && echoEffectif(pageReg.echo) === 'activee' && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>annulation d’écho activée</span>}
            </div>
            <div style={carte}>
              <GrapheAccord sons={sonsGraphe} vue={pageReg.vueAccord} eleve={eleve} lireAnneau={lireAnneau} onChange={regler} />
              {visible && n && <p style={{ margin: '4px 0 0', fontSize: 13 }}>
                {n.type === 'son' ? `Contre ${LIBELLE_ROLE[n.role!].toLowerCase()} : ` : 'Note étrangère : '}{formaterEcart(n.ecart)}{Number.isFinite(n.sigma) ? ` · σ ${n.sigma.toFixed(1).replace('.', ',')} ¢` : ' · ≈ juste'}
              </p>}
              {session.etat === 'joue' && mode === 'fin' && <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>Mode Fin : les mesures s’affichent à l’arrêt.</p>}
            </div>
            {bilanSons && (
              <section style={{ ...carte, marginTop: 8 }} aria-label="Mini-bilan">
                <h3 style={{ margin: '0 0 4px', fontSize: 14 }}>Mini-bilan</h3>
                {bilanSons.lignes.map(l => <p key={l.poste} style={{ margin: '2px 0', fontSize: 13 }}>{l.phrase} · σ {l.sigmaIntra.toFixed(1).replace('.', ',')} ¢</p>)}
              </section>
            )}
          </div>

          <div style={{ flex: '1 1 300px', minWidth: 0 }}>
            <p style={{ ...titreSection, marginTop: 0 }}>Tonalité</p>
            <div style={rangee}>
              <select aria-label="Tonique" value={entree.tonalite.nomTonique} onChange={e => modifier(en => avecTonalite(en, tonalite(e.target.value, en.tonalite.mode)), true)}
                style={{ minHeight: 44, borderRadius: 10, padding: '0 8px', background: 'var(--bg)', color: 'var(--text)', border: '1.5px solid var(--border-strong, var(--border-c))', fontSize: 14 }}>
                {NOMS_TONIQUES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              {(['majeur', 'mineur'] as Mode[]).map(m => <button key={m} style={pastille(entree.tonalite.mode === m)} onClick={() => modifier(en => avecTonalite(en, tonalite(en.tonalite.nomTonique, m)), true)}>{m === 'majeur' ? 'Majeur' : 'Mineur'}</button>)}
            </div>

            <p style={titreSection}>Degré</p>
            <div style={rangee}>
              {([1, 2, 3, 4, 5, 6, 7] as Degre[]).map(d => (
                <button key={d} style={pastille(entree.degre === d)} onClick={() => modifier(en => avecDegre(en, d), true)} aria-pressed={entree.degre === d}>{romainChiffre(d, mode0)}</button>
              ))}
            </div>

            <p style={titreSection}>Nombre de sons</p>
            <div style={rangee}>
              {([3, 4] as const).map(k => <button key={k} style={pastille(nb === k)} onClick={() => modifier(en => avecNombreDeSons(en, k), true)} aria-pressed={nb === k}>{k} sons</button>)}
            </div>

            <p style={titreSection}>Qualité</p>
            <div style={rangee}>
              {qualitesProposees(nb).map((q: QualiteAccord) => (
                <button key={q} style={pastille(entree.qualite === q)} onClick={() => modifier(en => avecQualite(en, q), true)} aria-pressed={entree.qualite === q}>
                  {QUALITES[q].label}{diatoniqueDuDegre === q ? ' •' : ''}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>• qualité diatonique du degré</p>

            <p style={titreSection}>Renversement</p>
            <div style={rangee}>
              {Array.from({ length: nb }, (_, r) => (
                <button key={r} style={pastille(entree.renversement === r)} onClick={() => modifier(en => avecRenversement(en, r as Renversement), true)} aria-pressed={entree.renversement === r}>{libelleRenversement(entree, r as Renversement)}</button>
              ))}
            </div>

            <p style={titreSection}>Formule</p>
            <div style={rangee}>
              {FORMULES.map(f => <button key={f} style={pastille(entree.formule === f)} onClick={() => modifier(en => ({ ...en, formule: f }), false)} aria-pressed={entree.formule === f}>{f}</button>)}
            </div>

            <p style={titreSection}>Accordage</p>
            <div style={rangee}>
              {ACCORDAGES.map(([a, l]) => <button key={a} style={pastille(entree.accordage === a)} onClick={() => changerAccordage(a)} aria-pressed={entree.accordage === a}>{l}</button>)}
              <button style={pastille(false)} onClick={reinitialiser}>Réinitialiser</button>
            </div>

            {explicite && slot !== 0 && (
              <button style={pastille(false, { marginTop: 14, borderColor: '#f87171', color: '#f87171' })} onClick={() => { onPhrase(supprimerEntree(phrase, slot), null) }}>Supprimer l’entrée</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
