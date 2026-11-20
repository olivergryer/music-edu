// ─── Réglages de segmentation de l'ancien moteur (repris de l'Accordeur) ───────────────
import type { ReglagesSegmentation as Reglages } from '../../profilsSegmentation.ts'
import { LIBELLES_PROFILS, NOMS_PROFILS } from '../../profilsSegmentation.ts'
import { appliquerPreregalage, CHAMPS_NOUVEAU, PREREGLAGES_NOUVEAU, preregalageActif, type ChampNouveau, type GroupeNouveau } from './reglagesNouveau.ts'
import type { EtatNouveau } from './useReglagesNouveau.ts'
import type { EtatSegmentation } from './useReglagesSegmentation.ts'
import { ORANGE, pastille, rangee, titreSection } from './stylesAcc.ts'

const champNombre: React.CSSProperties = {
  width: '100%', minHeight: 44, boxSizing: 'border-box', background: 'var(--bg)', color: 'var(--text)',
  border: '1px solid var(--border-c)', borderRadius: 8, padding: '0 8px', fontSize: 15, fontWeight: 700, fontFamily: 'inherit',
}
const note: React.CSSProperties = { fontSize: 10, color: 'var(--text-muted)', margin: '2px 0 0' }

function Nombre({ label, unite, valeur, min, max, pas, entier, onChange }: {
  label: string; unite: string; valeur: number; min: number; max: number; pas: number; entier: boolean; onChange: (v: number) => void
}) {
  return (
    <label style={{ flex: 1, fontSize: 12, color: 'var(--text-muted)' }}>
      {label}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
        <input type="number" inputMode="decimal" min={min} max={max} step={pas} value={valeur} style={champNombre}
          onChange={e => { const v = entier ? parseInt(e.target.value, 10) : parseFloat(e.target.value); if (Number.isFinite(v)) onChange(v) }} />
        {unite && <span style={{ fontSize: 12 }}>{unite}</span>}
      </div>
    </label>
  )
}

function Curseur({ label, valeur, min, max, pas, texte, aide, onChange }: {
  label: string; valeur: number; min: number; max: number; pas: number; texte: string; aide: string; onChange: (v: number) => void
}) {
  return (
    <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
      {label}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="range" min={min} max={max} step={pas} value={valeur} onChange={e => onChange(parseFloat(e.target.value))}
          style={{ flex: 1, minHeight: 44, accentColor: ORANGE }} />
        <span style={{ minWidth: 52, textAlign: 'right', fontWeight: 700, color: 'var(--text)' }}>{texte}</span>
      </div>
      <p style={note}>{aide}</p>
    </label>
  )
}

export function SectionSegmentation({ seg }: { seg: EtatSegmentation }) {
  const r: Reglages = seg.reglages
  const virgule = (x: number, d: number): string => x.toFixed(d).replace('.', ',')
  return (
    <>
      <p style={titreSection}>Détection de l’ancien moteur</p>
      <div style={rangee} role="group" aria-label="Profil de détection">
        {NOMS_PROFILS.map(n => <button key={n} style={pastille(seg.profil === n)} aria-pressed={seg.profil === n} onClick={() => seg.appliquerProfil(n)}>{LIBELLES_PROFILS[n]}</button>)}
        <button style={pastille(seg.profil === 'custom')} aria-pressed={seg.profil === 'custom'} onClick={() => seg.appliquerProfil('custom')}>Personnalisé</button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <Nombre label="Silence" unite="ms" valeur={r.silenceDurationMs} min={20} max={300} pas={5} entier onChange={v => seg.modifier('silenceDurationMs', v)} />
        <Nombre label="Saut note" unite="¢" valeur={r.noteJumpCents} min={20} max={200} pas={5} entier onChange={v => seg.modifier('noteJumpCents', v)} />
        <Nombre label="Gate RMS" unite="" valeur={r.gateLevel} min={0} max={0.15} pas={0.005} entier={false} onChange={v => seg.modifier('gateLevel', v)} />
      </div>
      <Curseur label="Seuil clarté" valeur={r.clarityThreshold} min={0.5} max={1} pas={0.01} texte={virgule(r.clarityThreshold, 2)}
        aide="Haut = moins de faux positifs" onChange={v => seg.modifier('clarityThreshold', v)} />
      <Curseur label="Durée min" valeur={r.minNoteDurationMs} min={30} max={300} pas={5} texte={`${r.minNoteDurationMs} ms`}
        aide="Notes plus courtes ignorées" onChange={v => seg.modifier('minNoteDurationMs', Math.round(v))} />
      <Curseur label="Ré-attaque (notes répétées)" valeur={r.reattackDropRatio} min={0} max={0.9} pas={0.05} texte={virgule(r.reattackDropRatio, 2)}
        aide="0 = off · coupe sur creux d’amplitude (même hauteur)" onChange={v => seg.modifier('reattackDropRatio', v)} />
      <button style={pastille(false, { marginTop: 10, width: '100%', fontSize: 12 })} onClick={seg.retourDefaut}>↺ Retour au calibrage par défaut</button>
      <p style={note}>Restaure les réglages d’usine et supprime les profils calibrés. Ces réglages sont communs avec l’Accordeur. Le recalcul est automatique.</p>
    </>
  )
}

function ChampDecrit({ champ, valeur, onChange }: { champ: ChampNouveau; valeur: number; onChange: (v: number) => void }) {
  if (champ.choix) {
    return (
      <div style={{ marginTop: 10 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{champ.label}</span>
        <div style={{ ...rangee, marginTop: 4 }} role="group" aria-label={champ.label}>
          {champ.choix.map(c => <button key={c.valeur} style={pastille(valeur === c.valeur)} aria-pressed={valeur === c.valeur} onClick={() => onChange(c.valeur)}>{c.label}</button>)}
        </div>
        <p style={{ ...note, fontSize: 11, lineHeight: 1.4 }}>{champ.aide}</p>
      </div>
    )
  }
  return (
    <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
      {champ.label}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="range" min={champ.min} max={champ.max} step={champ.pas} value={valeur}
          onChange={e => onChange(parseFloat(e.target.value))} style={{ flex: 1, minHeight: 44, accentColor: ORANGE }} />
        <span style={{ minWidth: 64, textAlign: 'right', fontWeight: 700, color: 'var(--text)' }}>
          {valeur.toFixed(champ.decimales).replace('.', ',')}{champ.unite ? ` ${champ.unite}` : ''}
        </span>
      </div>
      <p style={{ ...note, fontSize: 11, lineHeight: 1.4 }}>{champ.aide}</p>
    </label>
  )
}

const TITRES_GROUPES: Record<GroupeNouveau, { titre: string; sous: string }> = {
  trame: { titre: 'Détection trame par trame', sous: 'Recalcul complet de la prise : compte quelques secondes pour une phrase d’une minute.' },
  segmentation: { titre: 'Découpe en notes', sous: 'Recalcul rapide : les trames déjà calculées sont réutilisées.' },
}

export function SectionNouveau({ nouveau }: { nouveau: EtatNouveau }) {
  return (
    <>
      <p style={titreSection}>Réglages du nouveau moteur</p>
      <p style={{ ...note, fontSize: 11 }}>
        Le nouveau moteur retire l’accompagnement du micro avant de mesurer ton jeu. Le recalcul de la dernière prise est automatique
        quand tu changes une valeur (la prise en cours de jeu garde les valeurs du départ).
      </p>
      <div style={{ ...rangee, marginTop: 8 }} role="group" aria-label="Préréglage du nouveau moteur">
        {PREREGLAGES_NOUVEAU.map(p => {
          const actif = preregalageActif(nouveau.reglages) === p.id
          return <button key={p.id} style={pastille(actif)} aria-pressed={actif} onClick={() => nouveau.remplacer(appliquerPreregalage(p))}>{p.label}</button>
        })}
      </div>
      <p style={{ ...note, fontSize: 11, lineHeight: 1.4 }}>
        {PREREGLAGES_NOUVEAU.find(p => p.id === preregalageActif(nouveau.reglages))?.aide ?? 'Réglage personnalisé : tu as modifié au moins une valeur d’un préréglage.'}
      </p>
      {(['trame', 'segmentation'] as const).map(g => (
        <div key={g}>
          <p style={{ ...titreSection, color: 'var(--text)' }}>{TITRES_GROUPES[g].titre}</p>
          <p style={note}>{TITRES_GROUPES[g].sous}</p>
          {CHAMPS_NOUVEAU.filter(c => c.groupe === g).map(c => (
            <ChampDecrit key={c.cle} champ={c} valeur={nouveau.reglages[c.cle]} onChange={v => nouveau.modifier(c.cle, v)} />
          ))}
        </div>
      ))}
      <button style={pastille(false, { marginTop: 10, width: '100%', fontSize: 12 })} onClick={nouveau.retourDefaut}>↺ Valeurs par défaut du nouveau moteur</button>
    </>
  )
}
