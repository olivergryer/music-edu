// ─── Jauge de la journée ─────────────────────────────────────────────────────
// Partagée par le Hub, Rythme et Théorie. 10 points valident la journée, tous
// modules confondus (barème dans progressLogic.pointsSession). Au-delà, le
// curseur repart de zéro et un multiplicateur compte les journées pleines :
// 15 points → curseur à 5, ×1 ; 25 points → curseur à 5, ×2.
// En rattrapage de série, l'objectif devient 30, 80 ou 150 points et la jauge
// les affiche tels quels.

import { curseurJauge, type StreakRepair } from '../hooks/progressLogic'
import { COMMUN } from '../content/commun'
import TropheeIcon from './TropheeIcon'

const T = COMMUN.jauge
const VERT = '#34d399'
const AMBRE = '#fbbf24'

interface Props {
  points: number
  /** Points d'une journée (POINTS_JOURNEE). */
  journee: number
  rattrapage: StreakRepair | null
  /** Rappel du barème propre à l'endroit d'affichage. */
  bareme: string
  /** Dégradé de la barre en cours de remplissage. */
  couleurs: [string, string]
  marginBottom?: number
}

export default function JaugeJournee({ points, journee, rattrapage, bareme, couleurs, marginBottom = 12 }: Props) {
  const enRattrapage = rattrapage !== null && !rattrapage.done
  const reparee = rattrapage?.done === true
  const validee = points >= journee

  let titre: string
  let compteur: string
  let multiplicateur = 0
  let remplissage: number
  let couleurCompteur: string
  let detail: string

  if (enRattrapage) {
    titre = T.rattrapage
    compteur = `${points}/${rattrapage.target}`
    remplissage = Math.min(1, points / rattrapage.target)
    couleurCompteur = AMBRE
    detail = T.resteRattrapage(rattrapage.target - points, rattrapage.previous)
  } else {
    const pos = curseurJauge(points, journee)
    const curseur = pos.curseur
    multiplicateur = pos.multiplicateur
    titre = reparee ? T.reparee : validee ? T.validee : T.titre
    compteur = `${curseur}/${journee}`
    remplissage = curseur / journee
    couleurCompteur = validee ? VERT : couleurs[0]
    detail = reparee
      ? T.detailReparee(rattrapage.previous + rattrapage.missed + 1)
      : validee ? T.detailValidee : `${T.reste(journee - points)} ${bareme}`
  }

  const fond = enRattrapage
    ? `linear-gradient(90deg,${AMBRE},#f97316)`
    : validee ? VERT : `linear-gradient(90deg,${couleurs[0]},${couleurs[1]})`

  return (
    <div className="w-full rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border-c)', padding: '11px 16px', marginBottom }}>
      <div className="flex justify-between items-center mb-1.5">
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)' }}>{titre}</span>
        <span className="flex items-center gap-1.5" style={{ fontSize: 11, fontWeight: 800, color: couleurCompteur }}>
          {compteur}
          {multiplicateur > 0 && (
            <span
              className="flex items-center gap-0.5 rounded-full"
              style={{ background: 'rgba(52,211,153,0.14)', color: VERT, padding: '1px 7px 1px 5px' }}
            >
              <TropheeIcon id="flamme" size={12} strokeWidth={2} />
              ×{multiplicateur}
            </span>
          )}
        </span>
      </div>
      <div className="w-full h-[5px] rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${remplissage * 100}%`,
            background: fond,
            transition: 'width 0.45s ease-out, background 0.3s',
          }}
        />
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 5 }}>{detail}</div>
    </div>
  )
}
