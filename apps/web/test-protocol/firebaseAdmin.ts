// Init Firebase Admin SDK pour le protocole de test.
// Service account JSON local, non commité.

import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SERVICE_ACCOUNT_PATH = join(__dirname, 'service-account.json')

if (getApps().length === 0) {
  const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf-8'))
  initializeApp({ credential: cert(serviceAccount) })
}

export const db = getFirestore()

export const TEST_USER_PREFIX = 'test-protocol-'

export function testUserId(profileId: number | string): string {
  return `${TEST_USER_PREFIX}${profileId}`
}
