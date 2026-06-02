// Génération des rapports markdown : PLAN.md, day-N.md, FINAL.md.

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Profile, ProfileDay } from './profiles.ts'
import type { ProgressState } from '../src/hooks/progressLogic.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
// Rapports : <repo>/docs/test-protocol/
export const REPORTS_DIR = join(__dirname, '../../../docs/test-protocol')

export function ensureReportsDir() {
  mkdirSync(REPORTS_DIR, { recursive: true })
}

export function writePlan(profiles: Profile[], days: string[]) {
  const lines: string[] = []
  lines.push('# PLAN — Protocole de test des comptes utilisateurs')
  lines.push('')
  lines.push(`Période simulée : **${days[0]} → ${days[days.length-1]}** (7 jours)`)
  lines.push('')
  lines.push(`Profils testés : **${profiles.length}**`)
  lines.push('')
  lines.push('## Aperçu')
  lines.push('')
  lines.push('| # | Profil | Edge case testé |')
  lines.push('|---|--------|-----------------|')
  for (const p of profiles) lines.push(`| ${p.id} | ${p.name} | ${p.description} |`)
  lines.push('')
  lines.push('## Planning détaillé par profil')
  for (const p of profiles) {
    lines.push('')
    lines.push(`### Profil ${p.id} — ${p.name}`)
    lines.push('')
    lines.push(`*${p.description}*`)
    lines.push('')
    lines.push('| Jour | Date | Actions | XP prévu | Streak prévu | Trophées prévus |')
    lines.push('|------|------|---------|----------|--------------|-----------------|')
    for (const d of p.days) {
      const actionsLabel = d.actions.length === 0
        ? '_(aucune)_'
        : summarizeActions(d.actions)
      const trophiesLabel = d.predicted.trophies.length === 0 ? '—' : d.predicted.trophies.join(', ')
      lines.push(`| ${d.day} | ${days[d.day-1]} | ${actionsLabel} | ${d.predicted.xp} | ${d.predicted.streak.current} | ${trophiesLabel} |`)
    }
  }
  writeFileSync(join(REPORTS_DIR, 'PLAN.md'), lines.join('\n'))
}

function summarizeActions(actions: { module: string; xpEarned: number; meta?: { individual?: boolean; perfectSeries?: boolean } }[]): string {
  const counts: Record<string, number> = {}
  for (const a of actions) {
    const kind = a.module === 'rythme' && a.meta?.individual ? 'rythme indiv'
              : a.module === 'rythme' && a.meta?.perfectSeries ? 'rythme parfaite'
              : a.module
    counts[kind] = (counts[kind] ?? 0) + 1
  }
  return Object.entries(counts).map(([k, n]) => `${n}× ${k}`).join(', ')
}

// ─── Comparaison prédit vs réel ───────────────────────────────────────────────

export interface FieldCheck {
  field: string
  predicted: string
  actual: string
  pass: boolean
}

export interface DayProfileResult {
  profile: Profile
  day: ProfileDay
  actual: ProgressState
  checks: FieldCheck[]
  allPassed: boolean
}

export function compareState(predicted: ProfileDay['predicted'], actual: ProgressState): FieldCheck[] {
  const j = (v: unknown) => JSON.stringify(v)
  const sortedTrophies = (arr: string[]) => [...arr].sort()
  return [
    { field: 'xp',                          predicted: j(predicted.xp),                  actual: j(actual.xp),                  pass: predicted.xp === actual.xp },
    { field: 'streak.current',              predicted: j(predicted.streak.current),      actual: j(actual.streak.current),      pass: predicted.streak.current === actual.streak.current },
    { field: 'streak.longest',              predicted: j(predicted.streak.longest),      actual: j(actual.streak.longest),      pass: predicted.streak.longest === actual.streak.longest },
    { field: 'streak.lastDate',             predicted: j(predicted.streak.lastDate),     actual: j(actual.streak.lastDate),     pass: predicted.streak.lastDate === actual.streak.lastDate },
    { field: 'rythme.seriesPlayed',         predicted: j(predicted.modules.rythme.seriesPlayed),      actual: j(actual.modules.rythme.seriesPlayed),      pass: predicted.modules.rythme.seriesPlayed === actual.modules.rythme.seriesPlayed },
    { field: 'rythme.exercisesPlayed',      predicted: j(predicted.modules.rythme.exercisesPlayed),   actual: j(actual.modules.rythme.exercisesPlayed),   pass: predicted.modules.rythme.exercisesPlayed === actual.modules.rythme.exercisesPlayed },
    { field: 'rythme.xpTotal',              predicted: j(predicted.modules.rythme.xpTotal),           actual: j(actual.modules.rythme.xpTotal),           pass: predicted.modules.rythme.xpTotal === actual.modules.rythme.xpTotal },
    { field: 'theorie.sessionsPlayed',      predicted: j(predicted.modules.theorie.sessionsPlayed),   actual: j(actual.modules.theorie.sessionsPlayed),   pass: predicted.modules.theorie.sessionsPlayed === actual.modules.theorie.sessionsPlayed },
    { field: 'theorie.xpTotal',             predicted: j(predicted.modules.theorie.xpTotal),          actual: j(actual.modules.theorie.xpTotal),          pass: predicted.modules.theorie.xpTotal === actual.modules.theorie.xpTotal },
    { field: 'accordeur.sessionsPlayed',    predicted: j(predicted.modules.accordeur.sessionsPlayed), actual: j(actual.modules.accordeur.sessionsPlayed), pass: predicted.modules.accordeur.sessionsPlayed === actual.modules.accordeur.sessionsPlayed },
    { field: 'accordeur.xpTotal',           predicted: j(predicted.modules.accordeur.xpTotal),        actual: j(actual.modules.accordeur.xpTotal),        pass: predicted.modules.accordeur.xpTotal === actual.modules.accordeur.xpTotal },
    { field: 'dailyRythmeIndiv.date',       predicted: j(predicted.dailyRythmeIndiv.date),            actual: j(actual.dailyRythmeIndiv.date),            pass: predicted.dailyRythmeIndiv.date === actual.dailyRythmeIndiv.date },
    { field: 'dailyRythmeIndiv.count',      predicted: j(predicted.dailyRythmeIndiv.count),           actual: j(actual.dailyRythmeIndiv.count),           pass: predicted.dailyRythmeIndiv.count === actual.dailyRythmeIndiv.count },
    { field: 'highestRankIdx',              predicted: j(predicted.highestRankIdx),                   actual: j(actual.highestRankIdx),                   pass: predicted.highestRankIdx === actual.highestRankIdx },
    { field: 'trophies',                    predicted: j(sortedTrophies(predicted.trophies)),         actual: j(sortedTrophies(actual.trophies)),         pass: j(sortedTrophies(predicted.trophies)) === j(sortedTrophies(actual.trophies)) },
  ]
}

export function writeDayReport(day: number, date: string, results: DayProfileResult[]) {
  const lines: string[] = []
  lines.push(`# Jour ${day} — ${date}`)
  lines.push('')
  const passCount = results.filter(r => r.allPassed).length
  lines.push(`**Résumé** : ${passCount}/${results.length} profils ✅`)
  lines.push('')
  for (const r of results) {
    const status = r.allPassed ? '✅' : '❌'
    lines.push(`## ${status} Profil ${r.profile.id} — ${r.profile.name}`)
    lines.push('')
    lines.push(`**Actions** : ${r.day.actions.length === 0 ? '_(aucune)_' : summarizeActions(r.day.actions)}`)
    lines.push('')
    lines.push('| Champ | Prédit | Réel | Statut |')
    lines.push('|-------|--------|------|--------|')
    for (const c of r.checks) {
      lines.push(`| ${c.field} | \`${c.predicted}\` | \`${c.actual}\` | ${c.pass ? '✅' : '❌'} |`)
    }
    lines.push('')
  }
  writeFileSync(join(REPORTS_DIR, `day-${day}.md`), lines.join('\n'))
}

export function writeFinalReport(allResults: DayProfileResult[][], profiles: Profile[], days: string[]) {
  const lines: string[] = []
  lines.push('# Rapport final — Protocole de test')
  lines.push('')
  const totalChecks = allResults.flat().reduce((s, r) => s + r.checks.length, 0)
  const totalPassed = allResults.flat().reduce((s, r) => s + r.checks.filter(c => c.pass).length, 0)
  const failProfiles = allResults.flat().filter(r => !r.allPassed)
  lines.push(`**Vérifications totales** : ${totalPassed}/${totalChecks}`)
  lines.push(`**Profil×jour FAIL** : ${failProfiles.length}`)
  lines.push('')
  lines.push('## Matrice 10 profils × 7 jours')
  lines.push('')
  lines.push('| Profil | ' + days.map((_, i) => `J${i+1}`).join(' | ') + ' |')
  lines.push('|--------|' + days.map(() => '----').join('|') + '|')
  for (const p of profiles) {
    const row = [p.name]
    for (let d = 1; d <= days.length; d++) {
      const r = allResults[d-1].find(x => x.profile.id === p.id)
      row.push(r ? (r.allPassed ? '✅' : '❌') : '—')
    }
    lines.push('| ' + row.join(' | ') + ' |')
  }
  if (failProfiles.length > 0) {
    lines.push('')
    lines.push('## Détail des échecs')
    for (const r of failProfiles) {
      lines.push('')
      lines.push(`### Profil ${r.profile.id} — ${r.profile.name} — Jour ${r.day.day}`)
      lines.push('')
      for (const c of r.checks.filter(c => !c.pass)) {
        lines.push(`- **${c.field}** : prédit \`${c.predicted}\`, réel \`${c.actual}\``)
      }
    }
  } else {
    lines.push('')
    lines.push('🎉 **Tous les profils × jours sont conformes aux prédictions.**')
  }
  writeFileSync(join(REPORTS_DIR, 'FINAL.md'), lines.join('\n'))
}
