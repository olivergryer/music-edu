// Petits panneaux de la page Phrase : installation / aide, menu des phrases, réglages, bandeau iPhone, bulle de note.
import { useState, type ReactNode } from 'react'
import { evenementAu } from './anneaux.ts'
import { voixSonnantes } from './dsp/synthese.ts'
import type { Planning } from './dsp/types.ts'
import type { NoteAnnotee } from './annotation.ts'
import { couleurEcart, formaterEcart } from './couleurs.ts'
import { noteEcrite, tonaliteEcrite } from './notation.ts'
import { nomCourt } from './qualites.ts'
import type { Phrase } from './phrase.ts'
import type { PolitiqueEcho, ReglagesAccordeur, ReglagesPage } from './reglagesLocaux.ts'
import { SectionNouveau, SectionSegmentation } from './ReglagesSegmentation.tsx'
import type { EtatNouveau } from './useReglagesNouveau.ts'
import type { EtatSegmentation } from './useReglagesSegmentation.ts'
import { ORANGE, carte, pastille, rangee, titreSection } from './stylesAcc.ts'

const voile: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }
const fenetre: React.CSSProperties = { background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border-c)', borderRadius: 16, padding: 16, maxWidth: 440, width: '100%', maxHeight: '86vh', overflowY: 'auto' }

function Fenetre({ titre, onFermer, enfants }: { titre: string; onFermer: () => void; enfants: ReactNode }) {
  return (
    <div style={voile} onClick={onFermer}>
      <div role="dialog" aria-modal="true" aria-label={titre} style={fenetre} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h2 style={{ fontSize: 17, margin: 0 }}>{titre}</h2>
          <button style={pastille(false, { padding: 0, width: 44 })} onClick={onFermer} aria-label="Fermer">✕</button>
        </div>
        {enfants}
      </div>
    </div>
  )
}

export function BandeauIPhone() {
  return (
    <p role="note" style={{ ...carte, margin: '0 0 8px', fontSize: 12, color: 'var(--text-muted)' }}>
      Sur iPhone, le son peut sortir par l’écouteur quand le micro est ouvert (bug iOS). Branche une enceinte ou un casque filaire.
    </p>
  )
}

export function EcranInstallation({ onFermer, aide }: { onFermer: () => void; aide?: boolean }) {
  const points = [
    'Place l’appareil à environ 1 m de ton instrument, le micro tourné vers lui.',
    'Règle le volume sur une valeur moyenne : l’accompagnement doit rester audible sans couvrir ton jeu.',
    'N’utilise pas de Bluetooth : le décalage du son fausserait la mesure.',
    'Joue librement avec l’accompagnement : tout instrument à son entretenu convient (vents, cuivres, cordes frottées, voix).',
  ]
  return (
    <Fenetre titre={aide ? 'Aide' : 'Avant de commencer'} onFermer={onFermer} enfants={
      <>
        <ul style={{ paddingLeft: 18, fontSize: 14, lineHeight: 1.5, margin: '4px 0 8px' }}>{points.map(p => <li key={p}>{p}</li>)}</ul>
        {aide && (
          <>
            <p style={titreSection}>Lire l’écran</p>
            <ul style={{ paddingLeft: 18, fontSize: 13, lineHeight: 1.5, margin: 0 }}>
              <li><b>Vert</b> : juste. <b style={{ color: '#3b82f6' }}>Bleu</b> : trop bas. <b style={{ color: '#ea580c' }}>Orange foncé</b> : trop haut. Plus la couleur est foncée, plus l’écart est grand.</li>
              <li>Anneau de tirets : les battements entre toi et l’accord. Il tourne vers la droite si tu es trop haut, vers la gauche si tu es trop bas ; il s’arrête quand c’est juste.</li>
              <li>Halo autour d’un son : l’incertitude de la mesure ; il se resserre pendant que tu tiens la note.</li>
              <li>Toucher un slot ouvre l’accord : glisse une sphère à droite ou à gauche pour changer l’intonation, en haut ou en bas pour le volume, touche-la pour la couper.</li>
              <li>Mode <b>Live</b> : tout s’affiche en jouant. Mode <b>Fin</b> : seules les mesures apparaissent à l’arrêt, pour t’accorder à l’oreille.</li>
            </ul>
          </>
        )}
        <button style={pastille(true, { background: ORANGE, color: '#0D1026', border: 'none', width: '100%', marginTop: 12 })} onClick={onFermer}>Compris</button>
      </>
    } />
  )
}

interface MenuProps {
  fournies: readonly Phrase[]
  perso: Phrase[]
  courante: string
  onChoisir: (id: string) => void
  onNouvelle: () => void
  onDupliquer: () => void
  onRenommer: () => void
  onSupprimer: () => void
  onPartager: () => void
  lectureSeule: boolean
  message: string | null
  onFermer: () => void
}

export function MenuPhrases(p: MenuProps) {
  const ligne = (ph: Phrase, tag?: string) => (
    <button key={ph.id} onClick={() => p.onChoisir(ph.id)} style={pastille(ph.id === p.courante, { width: '100%', textAlign: 'left', marginBottom: 4 })}>
      {ph.nom}{tag && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>{tag}</span>}
    </button>
  )
  return (
    <Fenetre titre="Phrases" onFermer={p.onFermer} enfants={
      <>
        <p style={{ ...titreSection, marginTop: 0 }}>Fournies (lecture seule)</p>
        {p.fournies.map(x => ligne(x, 'lecture seule'))}
        <p style={titreSection}>Mes phrases</p>
        {p.perso.length ? p.perso.map(x => ligne(x)) : <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 6px' }}>Aucune pour l’instant : modifie une phrase fournie pour en créer une copie.</p>}
        <div style={{ ...rangee, marginTop: 10 }}>
          <button style={pastille(false)} onClick={p.onNouvelle}>Nouvelle</button>
          <button style={pastille(false)} onClick={p.onDupliquer}>Dupliquer</button>
          <button style={pastille(false)} onClick={p.onRenommer} disabled={p.lectureSeule}>Renommer</button>
          <button style={pastille(false)} onClick={p.onPartager}>Partager le lien</button>
          <button style={pastille(false, { color: '#f87171', borderColor: '#f87171' })} onClick={p.onSupprimer} disabled={p.lectureSeule}>Supprimer</button>
        </div>
        {p.message && <p role="status" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.message}</p>}
      </>
    } />
  )
}

interface ReglProps {
  reg: ReglagesAccordeur
  pageReg: ReglagesPage
  onChange: (p: Partial<ReglagesPage>) => void
  latenceMs: number | null
  seg: EtatSegmentation
  nouveau: EtatNouveau
  onFermer: () => void
  onAide: () => void
}

export function FeuilleReglages({ reg, pageReg, onChange, latenceMs, seg, nouveau, onFermer, onAide }: ReglProps) {
  const echo: [PolitiqueEcho, string][] = [['auto', 'Auto'], ['activee', 'Activée'], ['desactivee', 'Désactivée']]
  return (
    <Fenetre titre="Réglages" onFermer={onFermer} enfants={
      <>
        <p style={{ ...titreSection, marginTop: 0 }}>Clef de la portée</p>
        <div style={rangee}>
          <button style={pastille(pageReg.cle === 'sol')} onClick={() => onChange({ cle: 'sol' })}>Sol</button>
          <button style={pastille(pageReg.cle === 'fa')} onClick={() => onChange({ cle: 'fa' })}>Fa</button>
        </div>
        <p style={titreSection}>Annulation d’écho du micro</p>
        <div style={rangee}>{echo.map(([k, l]) => <button key={k} style={pastille(pageReg.echo === k)} onClick={() => onChange({ echo: k })}>{l}</button>)}</div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>Auto : activée sur iPhone et iPad, désactivée ailleurs. Activée sur ordinateur, elle peut effacer ton jeu.</p>
        <SectionSegmentation seg={seg} />
        <SectionNouveau nouveau={nouveau} />
        <p style={titreSection}>Réglages de l’Accordeur (partagés)</p>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
          <li>Diapason : {reg.diapason} Hz</li>
          <li>Instrument transpositeur : {reg.transpo}</li>
          <li>Référentiel : {reg.ref === 'tempere' ? 'tempéré' : reg.ref === 'utilisateur' ? 'utilisateur' : '5-limite (juste)'}</li>
          <li>Seuil « juste » : {reg.seuil} ¢</li>
        </ul>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>Ces réglages se changent dans l’Accordeur.</p>
        {latenceMs !== null && <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Latence de boucle mesurée : {latenceMs.toFixed(0)} ms.</p>}
        <button style={pastille(false, { marginTop: 10 })} onClick={onAide}>Aide et installation</button>
      </>
    } />
  )
}

const Chevron = ({ gauche }: { gauche?: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={gauche ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
  </svg>
)

export interface ActionsNote {
  index: number; total: number
  onPrecedent: () => void; onSuivant: () => void
  onSupprimer: () => void
  /** Accords voisins (entrées de phrase) auxquels on peut rattacher la note ; null = pas d'accord de ce côté. */
  avant: number | null; apres: number | null
  onRattacher: (entree: number) => void
  nbCorrections: number; onReinitialiser: () => void
}

/** Bulle d'une note après l'arrêt : nom écrit, écart, σ, rôle, battements ; navigation et corrections. */
export function BulleNote({ note, transpo, planning, phrase, seuil, actions, onFermer }: {
  note: NoteAnnotee; transpo: string; planning: Planning | null; phrase: Phrase; seuil: number; actions: ActionsNote; onFermer: () => void
}) {
  const e = phrase.entrees[note.entree] ?? phrase.entrees[0]
  const nom = noteEcrite(note.midi, tonaliteEcrite(e.tonalite, transpo))
  const ev = planning ? evenementAu(planning, 0.5 * (note.tOn + note.tOff)) : null
  const sonn = ev ? voixSonnantes(ev) : []
  const noms: Record<string, string> = { F: 'fondamentale', '3': 'tierce', '5': 'quinte', '7': 'septième' }
  const nomAccord = (i: number | null): string => (i !== null && phrase.entrees[i] ? nomCourt(phrase.entrees[i]) : '—')
  return (
    <section role="dialog" aria-label="Détail de la note" style={{ ...carte, margin: '8px 0', borderColor: couleurEcart(note.ecart, seuil) }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
        <button style={pastille(false, { padding: 0, width: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' })} onClick={actions.onPrecedent} disabled={actions.index <= 0} aria-label="Note précédente"><Chevron gauche /></button>
        <strong style={{ fontSize: 15, textAlign: 'center', flex: 1 }}>
          {nom.nom}{nom.octave} · {formaterEcart(note.ecart)}
          <span style={{ display: 'block', fontSize: 11, fontWeight: 400, color: 'var(--text-muted)' }}>note {actions.index + 1} sur {actions.total} · accord {nomAccord(note.entree)}</span>
        </strong>
        <button style={pastille(false, { padding: 0, width: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' })} onClick={actions.onSuivant} disabled={actions.index >= actions.total - 1} aria-label="Note suivante"><Chevron /></button>
        <button style={pastille(false, { padding: 0, width: 44 })} onClick={onFermer} aria-label="Fermer le détail">✕</button>
      </div>
      <p style={{ margin: '2px 0', fontSize: 13 }}>
        {note.type === 'son' ? `Contre la ${noms[note.role ?? 'F'] ?? 'note'} de l’accord` : 'Note étrangère à l’accord'}
        {Number.isFinite(note.sigma) ? ` · σ ${note.sigma.toFixed(1).replace('.', ',')} ¢` : ' · ≈ juste'}
        {note.coupeAvant || note.coupeApres ? ' · note tenue à travers un changement d’accord' : ''}
      </p>
      {note.battements.length > 0 && (
        <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--text-muted)' }}>
          {note.battements.map((b, i) => (
            <li key={i}>
              avec la {noms[sonn[b.voix]?.role ?? ''] ?? `voix ${b.voix + 1}`} : {Math.abs(b.deltaHz).toFixed(1).replace('.', ',')} Hz {b.deltaHz > 0 ? '(trop haut)' : b.deltaHz < 0 ? '(trop bas)' : ''}{b.resolu ? '' : ' (non résolu)'}
            </li>
          ))}
        </ul>
      )}
      <p style={{ ...titreSection, marginTop: 8 }}>Corriger cette note</p>
      <div style={rangee}>
        <button style={pastille(false)} disabled={actions.avant === null} onClick={() => actions.avant !== null && actions.onRattacher(actions.avant)}>Accord d’avant ({nomAccord(actions.avant)})</button>
        <button style={pastille(false)} disabled={actions.apres === null} onClick={() => actions.apres !== null && actions.onRattacher(actions.apres)}>Accord d’après ({nomAccord(actions.apres)})</button>
        <button style={pastille(false, { color: '#f87171', borderColor: '#f87171' })} onClick={actions.onSupprimer}>Supprimer la note</button>
      </div>
      {actions.nbCorrections > 0 && (
        <button style={pastille(false, { marginTop: 6, fontSize: 12 })} onClick={actions.onReinitialiser}>Annuler les {actions.nbCorrections} correction{actions.nbCorrections > 1 ? 's' : ''}</button>
      )}
    </section>
  )
}
