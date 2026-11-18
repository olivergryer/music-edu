// ─── Bande des slots (brief UI v1, § 5.4) ────────────────────────────────────────────
// Un slot par temps, regroupés par mesure, alignés sur la portée (x = X0 + k × largeur d'un slot).
// Entrée explicite : bordure pleine ; slot auto-rempli : pointillés et texte atténué. Le slot audible
// est surligné en neutre (jamais en orange : l'orange signifierait « trop haut »).

import type { ReactNode } from 'react'
import { nomCourtEcrit } from './notation.ts'
import { estExplicite, entreeDuSlot, indiceEntreeDuSlot, nbSlots, positionMesureTemps, type Phrase } from './phrase.ts'
import { chiffrerEntree, estHorsTonalite } from './qualites.ts'

export const HAUTEUR_SLOT = 86
const MODES: Record<string, string> = { majeur: 'M', mineur: 'm' }

interface Props {
  phrase: Phrase
  transpo: string
  X0: number
  LS: number
  onOuvrir: (k: number) => void
  onAjouterMesure: () => void
  /** Références DOM des cellules, pour surligner le slot audible sans état React par image. */
  registrer: (k: number, el: HTMLButtonElement | null) => void
  fin?: ReactNode
}

export default function BandeSlots({ phrase, transpo, X0, LS, onOuvrir, onAjouterMesure, registrer }: Props) {
  const n = nbSlots(phrase)
  const largeur = X0 + n * LS + 24
  let tonalitePrec = ''
  return (
    <div style={{ position: 'relative', width: largeur + 70, height: HAUTEUR_SLOT + 44 }}>
      {Array.from({ length: n }, (_, k) => {
        const e = entreeDuSlot(phrase, k)
        const explicite = estExplicite(phrase, k)
        const cleTonalite = `${e.tonalite.nomTonique}-${e.tonalite.mode}`
        const afficherTonalite = k === 0 || (explicite && cleTonalite !== tonalitePrec)
        tonalitePrec = cleTonalite
        const { mesure, temps } = positionMesureTemps(phrase, k)
        const hors = estHorsTonalite(e)
        const origine = indiceEntreeDuSlot(phrase, k)
        const muet = explicite ? 'var(--text)' : 'var(--text-muted)'
        return (
          <div key={k} style={{ position: 'absolute', left: X0 + k * LS + 3, top: 0, width: LS - 6 }}>
            <div style={{ height: 18, fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              {afficherTonalite ? `${e.tonalite.nomTonique} ${MODES[e.tonalite.mode]}` : ''}
            </div>
            <button
              ref={el => registrer(k, el)}
              onClick={() => onOuvrir(k)}
              aria-label={`Mesure ${mesure}, temps ${temps}. ${chiffrerEntree(e)}, ${nomCourtEcrit(e, transpo)}${explicite ? '' : `, hérité du temps ${origine}`}${hors ? ', hors tonalité' : ''}. Ouvrir l’accord.`}
              style={{
                width: '100%', height: HAUTEUR_SLOT, minHeight: 44, padding: '4px 2px', borderRadius: 8, cursor: 'pointer', background: 'var(--bg)', color: muet,
                border: `${explicite ? 1.5 : 1}px ${explicite ? 'solid' : 'dashed'} var(--border-strong, var(--border-c))`,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, fontFamily: 'inherit', overflow: 'hidden',
              }}
            >
              <span style={{ fontSize: 13, fontWeight: explicite ? 700 : 400, lineHeight: 1.15 }}>{chiffrerEntree(e)}</span>
              <span style={{ fontSize: 12, lineHeight: 1.15 }}>{nomCourtEcrit(e, transpo)}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.15 }}>{e.formule}</span>
              {hors && <span style={{ fontSize: 9, border: '1px solid var(--text-muted)', borderRadius: 4, padding: '0 3px', color: 'var(--text-muted)' }}>hors tonalité</span>}
            </button>
            <div style={{ height: 22, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', paddingTop: 4 }}>{temps}</div>
          </div>
        )
      })}
      <button onClick={onAjouterMesure} aria-label="Ajouter une mesure" style={{
        position: 'absolute', left: X0 + n * LS + 6, top: 18, width: 52, height: HAUTEUR_SLOT, minHeight: 44, borderRadius: 8, cursor: 'pointer',
        border: '1.5px dashed var(--border-strong, var(--border-c))', background: 'transparent', color: 'var(--text)', fontSize: 12, fontFamily: 'inherit',
      }}>+ mesure</button>
    </div>
  )
}
