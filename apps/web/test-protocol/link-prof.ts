import { db, testUserId } from './firebaseAdmin.ts'
import { PROFILES } from './profiles.ts'

const CODE = 'TSXV-54'

async function main() {
  const codeSnap = await db.collection('teacherCodes').doc(CODE).get()
  if (!codeSnap.exists) {
    console.error(`Code ${CODE} introuvable`)
    process.exit(1)
  }
  const { uid: profUid, displayName: profName } = codeSnap.data() as { uid: string; displayName: string }
  console.log(`Prof : ${profName} (uid=${profUid})`)

  let count = 0
  for (const p of PROFILES) {
    const uid = testUserId(p.id)
    const displayName = `[Test ${p.id}] ${p.name}`
    await db.collection('users').doc(uid).set({
      role: 'eleve',
      displayName,
      profIds: [profUid],
      profCodes: [CODE],
      profNames: { [CODE]: profName },
    }, { merge: true })
    count++
    console.log(`  → ${uid} (${displayName}) lié`)
  }
  console.log(`${count} élèves liés à ${CODE}`)
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
