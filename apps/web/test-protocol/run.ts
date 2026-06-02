// Orchestrateur du protocole de test.
//
// Usage :
//   npm run test:protocol             → exécute et génère les rapports
//   npm run test:protocol -- --cleanup → supprime tous les utilisateurs test après le run
//
// Prérequis :
//   - apps/web/test-protocol/service-account.json (non commité, à télécharger depuis Firebase Console)

import { db, testUserId, TEST_USER_PREFIX } from './firebaseAdmin.ts'
import { PROFILES, DAYS } from './profiles.ts'
import {
  ensureReportsDir, writePlan, writeDayReport, writeFinalReport,
  compareState, type DayProfileResult,
} from './reports.ts'
import {
  applySession, DEFAULT_STATE, mergeWithDefaults,
  type ProgressState,
} from '../src/hooks/progressLogic.ts'

const cleanup = process.argv.includes('--cleanup')

// ─── Helpers Firestore ────────────────────────────────────────────────────────

async function resetUser(uid: string) {
  // Supprime progress/data
  await db.collection('users').doc(uid).collection('progress').doc('data').delete().catch(() => {})
  // Supprime history/*
  const historySnap = await db.collection('users').doc(uid).collection('history').get()
  await Promise.all(historySnap.docs.map(d => d.ref.delete()))
}

async function writeProgress(uid: string, state: ProgressState) {
  await db.collection('users').doc(uid).collection('progress').doc('data').set(state)
}

async function appendHistory(uid: string, entry: { date: string; module: string; xp: number; medal: string }) {
  await db.collection('users').doc(uid).collection('history').add({
    ...entry,
    createdAt: new Date(),
  })
}

async function readProgress(uid: string): Promise<ProgressState> {
  const snap = await db.collection('users').doc(uid).collection('progress').doc('data').get()
  return snap.exists ? mergeWithDefaults(snap.data() as Record<string, unknown>) : { ...DEFAULT_STATE }
}

async function deleteTestUsers() {
  console.log('\n🧹 Nettoyage des utilisateurs test...')
  const usersSnap = await db.collection('users').get()
  let count = 0
  for (const doc of usersSnap.docs) {
    if (doc.id.startsWith(TEST_USER_PREFIX)) {
      await resetUser(doc.id)
      await doc.ref.delete()
      count++
    }
  }
  console.log(`   Supprimé : ${count} utilisateur(s)`)
}

// ─── Exécution ────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Protocole de test des comptes utilisateurs')
  console.log(`   ${PROFILES.length} profils × ${DAYS.length} jours`)
  console.log('')

  ensureReportsDir()
  writePlan(PROFILES, DAYS)
  console.log('📋 PLAN.md généré')

  // Reset des utilisateurs test
  for (const p of PROFILES) {
    await resetUser(testUserId(p.id))
  }
  console.log('🧼 Utilisateurs test resetés')

  // État local par profil (mémoire, pour passer à applySession)
  const localStates: Record<number, ProgressState> = {}
  for (const p of PROFILES) {
    localStates[p.id] = { ...DEFAULT_STATE }
  }

  const allResults: DayProfileResult[][] = []

  for (let dIdx = 0; dIdx < DAYS.length; dIdx++) {
    const dayNum = dIdx + 1
    const dateStr = DAYS[dIdx]
    const dayResults: DayProfileResult[] = []

    for (const profile of PROFILES) {
      const profileDay = profile.days.find(d => d.day === dayNum)
      if (!profileDay) continue
      const uid = testUserId(profile.id)

      // 1. Applique chaque action en mémoire + écrit history dans Firestore
      for (const action of profileDay.actions) {
        const result = applySession(localStates[profile.id], action, dateStr)
        localStates[profile.id] = result.newState
        await appendHistory(uid, result.historyEntry)
      }

      // 2. Persiste l'état final du jour dans Firestore
      await writeProgress(uid, localStates[profile.id])

      // 3. Lit l'état depuis Firestore (vérifie la persistence)
      const actual = await readProgress(uid)

      // 4. Compare
      const checks = compareState(profileDay.predicted, actual)
      const allPassed = checks.every(c => c.pass)
      dayResults.push({ profile, day: profileDay, actual, checks, allPassed })
    }

    writeDayReport(dayNum, dateStr, dayResults)
    const passCount = dayResults.filter(r => r.allPassed).length
    console.log(`📅 Jour ${dayNum} (${dateStr}) : ${passCount}/${dayResults.length} profils ✅`)
    allResults.push(dayResults)
  }

  writeFinalReport(allResults, PROFILES, DAYS)
  console.log('')
  const totalChecks = allResults.flat().reduce((s, r) => s + r.checks.length, 0)
  const totalPassed = allResults.flat().reduce((s, r) => s + r.checks.filter(c => c.pass).length, 0)
  console.log(`🏁 ${totalPassed}/${totalChecks} vérifications passées`)
  console.log('📄 Rapports : docs/test-protocol/')

  if (cleanup) {
    await deleteTestUsers()
  } else {
    console.log('\n💡 Pour nettoyer les utilisateurs test : npm run test:protocol -- --cleanup')
  }

  process.exit(totalPassed === totalChecks ? 0 : 1)
}

main().catch(err => {
  console.error('❌ Erreur :', err)
  process.exit(1)
})
