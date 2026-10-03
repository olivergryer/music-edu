// ─── Carte d'un compte dans une liste de tableau de bord ─────────────────────
//
// Partagée par « Mes élèves » et par le panneau d'administration, pour que les
// deux listes soient strictement identiques — mêmes statistiques, même dernière
// session, même lien vers la vue individuelle. Le panneau admin ajoute seulement
// une ligne de métadonnées sous la carte, via `complement`.

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { getRank, rankLabel, displayStreak, todayStr } from '../hooks/useProgressFirebase'
import { MODULE_IDS, moduleColor, type ModuleId } from '../lib/modules'

export interface EleveProgress {
  xp: number
  streak: { current: number; longest: number; lastDate: string | null }
  modules: {
    rythme: { seriesPlayed: number; xpTotal: number }
    theorie: { sessionsPlayed: number; xpTotal: number }
    accordeur: { sessionsPlayed: number; xpTotal: number }
    notes: { sessionsPlayed: number; xpTotal: number }
  }
}

export interface LastSession {
  date: string
  module: string
  xp: number
  medal: string
}

export interface EleveData {
  uid: string
  displayName: string
  progress: EleveProgress | null
  lastSession: LastSession | null
}

export const MODULE_ICONS: Record<string, string> = {
  rythme: '🥁', theorie: '🎼', accordeur: '🎵', notes: '🎼',
}

export const DEFAULT_PROGRESS: EleveProgress = {
  xp: 0,
  streak: { current: 0, longest: 0, lastDate: null },
  modules: {
    rythme: { seriesPlayed: 0, xpTotal: 0 },
    theorie: { sessionsPlayed: 0, xpTotal: 0 },
    accordeur: { sessionsPlayed: 0, xpTotal: 0 },
    notes: { sessionsPlayed: 0, xpTotal: 0 },
  },
}

// Compteur legacy affiché par module (forme hétérogène du doc gamification global).
// Fallback 0/« — » pour un module sans compteur legacy. Itérable sur MODULE_IDS.
export function profModuleStat(id: ModuleId, mods: EleveProgress['modules']): { count: number; unit: string } {
  const m = (mods as Record<string, { seriesPlayed?: number; sessionsPlayed?: number }>)[id]
  if (!m) return { count: 0, unit: '—' }
  if (m.seriesPlayed !== undefined) return { count: m.seriesPlayed, unit: 'séries' }
  if (m.sessionsPlayed !== undefined) return { count: m.sessionsPlayed, unit: 'sessions' }
  return { count: 0, unit: '—' }
}

interface Props {
  eleve: EleveData
  /** Badges affichés à côté du nom (rôle, code prof, marque « test »…). */
  badges?: ReactNode
  /** Ligne de métadonnées ajoutée en bas de carte (administration). */
  complement?: ReactNode
  /** Carte estompée — utilisé pour les comptes du protocole de test. */
  attenue?: boolean
}

export default function CarteEleve({ eleve, badges, complement, attenue }: Props) {
  const prog = eleve.progress ?? DEFAULT_PROGRESS
  const rank = getRank(prog.xp)
  const streak = displayStreak(prog.streak, todayStr())

  return (
    <Link
      to={`/dashboard/prof/eleve/${eleve.uid}`}
      className="block bg-surface border border-app rounded-2xl px-5 py-4 mb-3 no-underline text-app hover:bg-surface-2 transition-colors cursor-pointer"
      style={attenue ? { opacity: 0.55 } : undefined}
    >
      <div className="flex justify-between items-center gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="text-base font-bold text-app">{eleve.displayName}</span>
          {badges}
        </div>
        <div className="flex gap-2.5 items-center shrink-0">
          <span className="text-xs font-bold" style={{ color: '#8B5CF6' }}>{rankLabel(rank)}</span>
          <span className="text-xs text-app-muted">{prog.xp} XP</span>
          <span className="text-xs" style={{ color: streak > 0 ? '#FF8B3D' : 'var(--text-muted)' }}>
            {streak}j
          </span>
        </div>
      </div>

      <div className="flex gap-2 mb-2.5">
        {MODULE_IDS.map(k => {
          const { count, unit } = profModuleStat(k, prog.modules)
          return (
            <div key={k} className="flex-1 bg-surface-2 rounded-lg p-2 text-center">
              <div className="text-sm">{MODULE_ICONS[k]}</div>
              <div className="text-sm font-bold text-app">{count}</div>
              <div className="text-[9px] text-app-muted">{unit}</div>
            </div>
          )
        })}
      </div>

      {eleve.lastSession ? (
        <div className="flex items-center gap-2 bg-surface-2 rounded-lg px-2.5 py-1.5">
          <span className="text-sm">{eleve.lastSession.medal}</span>
          <span className="text-xs text-app-muted">
            {MODULE_ICONS[eleve.lastSession.module] ?? ''} {eleve.lastSession.module}
          </span>
          <span className="text-xs font-bold ml-auto" style={{ color: moduleColor(eleve.lastSession.module) }}>
            +{eleve.lastSession.xp} XP
          </span>
          <span className="text-[10px] text-app-muted">{eleve.lastSession.date}</span>
        </div>
      ) : (
        <div className="text-xs text-app-muted italic">Aucune session enregistrée.</div>
      )}

      {complement}
    </Link>
  )
}
