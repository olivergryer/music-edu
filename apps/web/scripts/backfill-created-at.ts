// Rattrapage des dates de création des comptes.
//
// `users/{uid}` ne stockait aucune date : seul Firebase Auth connaît la date de
// création d'un compte, et ce champ n'est lisible que par le SDK Admin — jamais
// depuis le navigateur. Ce script la recopie dans Firestore pour que l'interface
// d'administration puisse l'afficher.
//
// Depuis la correction de RegisterPage, les nouveaux comptes écrivent `createdAt`
// eux-mêmes. Ce script ne sert donc qu'une fois, pour les comptes antérieurs —
// mais il est idempotent et peut être relancé sans dommage.
//
// Les comptes du protocole de test n'ont pas de compte Auth : ils n'ont donc pas
// de date de création, et sont ignorés.
//
// Usage, depuis apps/web/ :
//   node --experimental-strip-types scripts/backfill-created-at.ts          (simulation)
//   node --experimental-strip-types scripts/backfill-created-at.ts --ecrire (écriture réelle)

import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CLE = join(__dirname, '..', 'test-protocol', 'service-account.json')

// Simulation par défaut : un script qui écrit en production dès le premier appel
// est un script qu'on lance par accident.
const ECRIRE = process.argv.includes('--ecrire')

if (getApps().length === 0) {
  initializeApp({ credential: cert(JSON.parse(readFileSync(CLE, 'utf-8'))) })
}
const auth = getAuth()
const db = getFirestore()

let traites = 0
let ecrits = 0
let dejaPresents = 0
let sansDocument = 0

// listUsers pagine par 1000 ; la boucle couvre le cas où le projet grandirait.
let pageToken: string | undefined
do {
  const page = await auth.listUsers(1000, pageToken)
  pageToken = page.pageToken

  for (const u of page.users) {
    traites++
    const ref = db.collection('users').doc(u.uid)
    const snap = await ref.get()

    if (!snap.exists) {
      // Compte d'authentification sans profil : inscription interrompue entre la
      // création du compte et l'écriture du document. Rien à rattraper.
      sansDocument++
      console.log(`  ⊘ ${u.uid} — aucun document users/`)
      continue
    }
    if (snap.data()?.createdAt) {
      dejaPresents++
      continue
    }

    const date = new Date(u.metadata.creationTime)
    console.log(`  → ${u.uid.padEnd(30)} ${(snap.data()?.displayName ?? '—').padEnd(20)} ${date.toISOString().slice(0, 10)}`)
    if (ECRIRE) {
      await ref.update({ createdAt: Timestamp.fromDate(date) })
      ecrits++
    }
  }
} while (pageToken)

console.log(
  `\n${traites} comptes examinés · ${dejaPresents} déjà datés · ${sansDocument} sans document`
  + (ECRIRE
    ? `\n${ecrits} date(s) écrite(s).`
    : `\nSIMULATION — relancer avec --ecrire pour appliquer.`),
)
process.exit(0)
