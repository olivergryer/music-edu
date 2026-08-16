// Recalcule les profils par défaut de l'accordeur à partir des sessions de
// calibration stockées dans Firestore.
//
// Méthode : pour chaque profil (legato/detache/rapide) et chaque paramètre, on
// intersecte les plages acceptables de TOUS les exercices du groupe sur TOUTES
// les sessions retenues, et on se place au centre de l'intersection (marge max).
// → à ré-exécuter à chaque ajout de sessions / instruments.
//
// Usage :
//   node test-protocol/calibrate-defaults.ts                 → toutes les sessions
//   node test-protocol/calibrate-defaults.ts --instrument clarinette
//   node test-protocol/calibrate-defaults.ts --email x@y.z
//
// Prérequis : test-protocol/service-account.json (comme le protocole de test).

import { getAuth } from 'firebase-admin/auth'
import { db } from './firebaseAdmin.ts'
import {
  aggregateProfilesFromSessions, PARAM_KEYS,
} from '../src/calibrationUtils.js'

const args = process.argv.slice(2)
const argVal = (flag: string) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null }
const instrumentFilter = argVal('--instrument')
const emailFilter      = argVal('--email')

const PARAM_FMT: Record<string, (v: number) => string> = {
  clarityThreshold:  v => v.toFixed(3),
  gateLevel:         v => v.toFixed(4),
  silenceDurationMs: v => String(v),
  noteJumpCents:     v => String(v),
  minNoteDurationMs: v => String(v),
  reattackDropRatio: v => v.toFixed(2),
}
const PARAM_LABEL: Record<string, string> = {
  clarityThreshold: 'clarté', gateLevel: 'gate', silenceDurationMs: 'silence',
  noteJumpCents: 'saut', minNoteDurationMs: 'dMin', reattackDropRatio: 'reattack',
}

// ─── Collecte des sessions ────────────────────────────────────────────────────
const snap = await db.collectionGroup('calibrations').get()
const sessions: any[] = []
for (const d of snap.docs) {
  const s: any = d.data()
  const uid = d.ref.parent.parent?.id ?? '?'
  let email = '?'
  try { email = (await getAuth().getUser(uid)).email ?? '?' } catch {}
  if (instrumentFilter && s.instrument !== instrumentFilter) continue
  if (emailFilter && email !== emailFilter) continue
  sessions.push({ ...s, _email: email })
}

console.log(`Sessions retenues : ${sessions.length}` +
  (instrumentFilter ? ` (instrument=${instrumentFilter})` : '') +
  (emailFilter ? ` (email=${emailFilter})` : ''))
for (const s of sessions) {
  const date = s.createdAt?.toDate?.().toISOString?.().slice(0, 10) ?? '—'
  console.log(`  · "${s.nom}"  ${date}  ${s.instrument}/${s.transpoKey ?? '?'}  <${s._email}>`)
}
if (sessions.length === 0) { console.log('Rien à agréger.'); process.exit(0) }

// ─── Agrégation ───────────────────────────────────────────────────────────────
const profiles = aggregateProfilesFromSessions(sessions)

console.log('\n' + '='.repeat(72))
for (const profile of ['legato', 'detache', 'rapide']) {
  const p: any = profiles[profile]
  console.log(`\n▸ ${profile.toUpperCase()}${p.conflicts.length ? `   ⚠ conflits: ${p.conflicts.join(', ')}` : ''}`)
  for (const key of PARAM_KEYS) {
    const d = p.details[key]
    const inter = d.inter ? `[${PARAM_FMT[key](d.inter.min)} … ${PARAM_FMT[key](d.inter.max)}]` : '(vide)'
    console.log(`   ${PARAM_LABEL[key].padEnd(8)} = ${PARAM_FMT[key](p[key]).padStart(8)}   ${String(d.n).padStart(2)} plages  inter ${inter}  ${d.source === 'intersection' ? '' : '← ' + d.source}`)
  }
}

// ─── Bloc prêt à coller dans AccordeurPage.jsx (_ACC_PROFILES_DEFAULTS) ────────
const line = (name: string) => {
  const p: any = profiles[name]
  const body = PARAM_KEYS.map(k => `${k}: ${PARAM_FMT[k](p[k])}`).join(', ')
  return `  ${name.padEnd(8)}: { ${body} },`
}
console.log('\n' + '='.repeat(72))
console.log('// À coller dans _ACC_PROFILES_DEFAULTS (AccordeurPage.jsx) :')
console.log('const _ACC_PROFILES_DEFAULTS = {')
console.log(line('legato'))
console.log(line('detache'))
console.log(line('rapide'))
console.log('}')
process.exit(0)
