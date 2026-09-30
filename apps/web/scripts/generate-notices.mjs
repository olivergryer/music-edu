// Avis de licence des dépendances — produit dist/THIRD_PARTY_NOTICES.txt.
//
// Ce que la loi demande : MIT impose de joindre sa notice de copyright et le
// texte de la licence à toute redistribution ; Apache 2.0 impose en plus de
// transmettre le fichier NOTICE quand il existe. Un bundle Vite embarque ces
// dépendances sans leurs fichiers de licence : ce script les rassemble.
//
// Parcours en largeur du graphe des dépendances de PRODUCTION uniquement, à
// partir des `dependencies` de apps/web. Les devDependencies (Vite, ESLint…)
// ne sont pas redistribuées, donc pas concernées.
//
// Node pur, aucune dépendance.

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RACINE_APP = resolve(__dirname, '..')
const DIST = join(RACINE_APP, 'dist')

// npm remonte les paquets à la racine du monorepo : il faut chercher aux deux
// endroits, sinon presque tout est introuvable.
const RACINES_MODULES = [
  join(RACINE_APP, 'node_modules'),
  resolve(RACINE_APP, '..', '..', 'node_modules'),
]

const NOMS_LICENCE = ['LICENSE', 'LICENCE', 'LICENSE.md', 'LICENSE.txt', 'COPYING']
const NOMS_NOTICE = ['NOTICE', 'NOTICE.txt', 'NOTICE.md']

function dossierDuPaquet(nom) {
  for (const racine of RACINES_MODULES) {
    const chemin = join(racine, nom)
    if (existsSync(join(chemin, 'package.json'))) return chemin
  }
  return null
}

/** Premier fichier existant parmi `candidats`, recherche insensible à la casse. */
function lireFichier(dossier, candidats) {
  let entrees
  try { entrees = readdirSync(dossier) } catch { return null }
  for (const candidat of candidats) {
    const trouve = entrees.find(e => e.toLowerCase() === candidat.toLowerCase())
    if (trouve) {
      try { return readFileSync(join(dossier, trouve), 'utf8').trim() } catch { /* illisible */ }
    }
  }
  return null
}

function licenceDeclaree(pkg) {
  if (typeof pkg.license === 'string') return pkg.license
  if (pkg.license?.type) return pkg.license.type
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map(l => l.type ?? l).join(', ')
  return 'non déclarée'
}

// ─── Parcours du graphe ──────────────────────────────────────────────────────

const racine = JSON.parse(readFileSync(join(RACINE_APP, 'package.json'), 'utf8'))
const aVisiter = Object.keys(racine.dependencies ?? {})
const vus = new Set()
const paquets = []
const introuvables = []

while (aVisiter.length > 0) {
  const nom = aVisiter.shift()
  if (vus.has(nom)) continue
  vus.add(nom)

  const dossier = dossierDuPaquet(nom)
  if (!dossier) { introuvables.push(nom); continue }

  const pkg = JSON.parse(readFileSync(join(dossier, 'package.json'), 'utf8'))
  paquets.push({
    nom,
    version: pkg.version ?? '?',
    licence: licenceDeclaree(pkg),
    lien: typeof pkg.repository === 'string' ? pkg.repository : (pkg.repository?.url ?? pkg.homepage ?? ''),
    texte: lireFichier(dossier, NOMS_LICENCE),
    notice: lireFichier(dossier, NOMS_NOTICE),
  })

  aVisiter.push(...Object.keys(pkg.dependencies ?? {}))
}

paquets.sort((a, b) => a.nom.localeCompare(b.nom))

// ─── Rendu ───────────────────────────────────────────────────────────────────

const separateur = '\n' + '─'.repeat(78) + '\n'
const morceaux = [
  'AVIS RELATIFS AUX LOGICIELS TIERS',
  '',
  'Tessitura intègre les bibliothèques libres listées ci-dessous.',
  'Chaque bibliothèque reste la propriété de ses auteurs et reste régie par sa',
  'propre licence, dont le texte intégral est reproduit ici.',
  '',
  `Fichier produit automatiquement par scripts/generate-notices.mjs — ${paquets.length} paquets.`,
  '',
  'SOMMAIRE',
  ...paquets.map(p => `  - ${p.nom}@${p.version} — ${p.licence}`),
]

if (introuvables.length > 0) {
  // Une dépendance non résolue est un trou dans les avis, pas un détail :
  // elle doit se voir dans le fichier livré comme dans la sortie du build.
  morceaux.push('', 'PAQUETS NON RÉSOLUS (à vérifier — lancer `npm install`) :',
    ...introuvables.map(n => `  - ${n}`))
}

for (const p of paquets) {
  morceaux.push(separateur, `${p.nom}@${p.version}`, `Licence déclarée : ${p.licence}`)
  if (p.lien) morceaux.push(`Source : ${p.lien.replace(/^git\+/, '').replace(/\.git$/, '')}`)
  morceaux.push('')
  morceaux.push(p.texte ?? '(aucun fichier de licence trouvé dans le paquet publié)')
  if (p.notice) morceaux.push('', '--- NOTICE ---', p.notice)
}

// Les polices ne sont pas des paquets npm : elles sont dans public/fonts/ et
// leurs OFL y sont livrés tels quels. On les rappelle ici pour que le fichier
// soit le point d'entrée unique des obligations de licence.
morceaux.push(separateur,
  'POLICES DE CARACTÈRES',
  '',
  'Inter — SIL Open Font License 1.1 — texte intégral : /fonts/OFL-Inter.txt',
  'Righteous — SIL Open Font License 1.1 — texte intégral : /fonts/OFL-Righteous.txt',
  '')

if (!existsSync(DIST)) {
  throw new Error('generate-notices : dist/ absent — lancer `vite build` d’abord.')
}
writeFileSync(join(DIST, 'THIRD_PARTY_NOTICES.txt'), morceaux.join('\n'))

console.log(
  `Avis de licence : ${paquets.length} paquets`
  + (introuvables.length ? `, ${introuvables.length} NON RÉSOLU(S) : ${introuvables.join(', ')}` : '')
  + '.',
)
