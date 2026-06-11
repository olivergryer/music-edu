// Incrémente la version de l'app (apps/web/version.json).
// Usage :
//   node scripts/bump-version.mjs          → bump patch  (0.7.1 → 0.7.2)
//   node scripts/bump-version.mjs minor    → bump minor  (0.7.x → 0.8.0)
//   node scripts/bump-version.mjs major    → bump major  (0.x.y → 1.0.0)
//
// À lancer juste avant de promouvoir dev → main (voir CLAUDE.md « Workflow »).

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const versionPath = join(__dirname, '..', 'version.json')

const v = JSON.parse(readFileSync(versionPath, 'utf8'))
const level = process.argv[2] || 'patch'

if (level === 'major') {
  v.major += 1
  v.minor = 0
  v.patch = 0
} else if (level === 'minor') {
  v.minor += 1
  v.patch = 0
} else {
  v.patch += 1
}

writeFileSync(versionPath, JSON.stringify(v, null, 2) + '\n')

const str = `${v.major}.${v.minor}.${v.patch}`
console.log(`Version → v${str}`)
