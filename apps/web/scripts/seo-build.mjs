// Génération des métadonnées de référencement — exécuté APRÈS `vite build`.
//
// Pourquoi un post-traitement plutôt qu'un rendu côté serveur : Tessitura est
// une SPA, donc un seul index.html pour toutes les routes. Un robot qui demande
// /rythme recevrait le <title> de l'accueil. On écrit donc un fichier HTML par
// page indexable, identique au bundle près du bloc entre marqueurs SEO. Vercel
// sert le statique en priorité (cleanUrls), React prend le relais ensuite ;
// l'utilisateur ne voit aucune différence.
//
// Node pur, aucune dépendance.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SITE_URL } from '../seo/site.mjs'
import { ROUTES } from '../seo/routes.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST = resolve(__dirname, '..', 'dist')
const DEBUT = '<!--SEO:START-->'
const FIN = '<!--SEO:END-->'
const OG_IMAGE = `${SITE_URL}/og/og-default.png`

// Les builds de prévisualisation (branche `dev`) portent déjà un titre préfixé
// par vite.config.js ; on le conserve pour ne pas confondre les deux déploiements.
const estBuildDev = process.env.VERCEL_GIT_COMMIT_REF === 'dev'

/** Échappement pour un contenu d'attribut HTML. */
function attr(valeur) {
  return String(valeur)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Échappement pour du texte hors attribut (contenu de <title>). */
function texte(valeur) {
  return String(valeur)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// JSON-LD : le contenu d'un <script> ne peut pas contenir « </ », qui fermerait
// la balise. On neutralise donc le seul caractère dangereux.
function jsonLd(objet) {
  return JSON.stringify(objet, null, 2).replace(/</g, '\\u003c')
}

const SCHEMA_ACCUEIL = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Tessitura',
  url: `${SITE_URL}/`,
  description: ROUTES[0].description,
  applicationCategory: 'EducationalApplication',
  operatingSystem: 'Web',
  inLanguage: 'fr',
  isAccessibleForFree: true,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
  audience: { '@type': 'EducationalAudience', educationalRole: 'student' },
}

function blocSeo({ path, title, description }) {
  const url = `${SITE_URL}${path === '/' ? '/' : path}`
  const titreAffiche = estBuildDev ? `DEV · ${title}` : title
  const lignes = [
    `<title>${texte(titreAffiche)}</title>`,
    `<meta name="description" content="${attr(description)}" />`,
    `<link rel="canonical" href="${attr(url)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Tessitura" />`,
    `<meta property="og:locale" content="fr_FR" />`,
    `<meta property="og:title" content="${attr(title)}" />`,
    `<meta property="og:description" content="${attr(description)}" />`,
    `<meta property="og:url" content="${attr(url)}" />`,
    `<meta property="og:image" content="${attr(OG_IMAGE)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${attr('Tessitura — exercices de musique en ligne')}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${attr(title)}" />`,
    `<meta name="twitter:description" content="${attr(description)}" />`,
    `<meta name="twitter:image" content="${attr(OG_IMAGE)}" />`,
  ]
  if (path === '/') {
    lignes.push(`<script type="application/ld+json">${jsonLd(SCHEMA_ACCUEIL)}</script>`)
  }
  return lignes.map(l => `    ${l}`).join('\n')
}

function sitemap(dateIso) {
  const urls = ROUTES.map(({ path }) => [
    '  <url>',
    `    <loc>${SITE_URL}${path === '/' ? '/' : path}</loc>`,
    `    <lastmod>${dateIso}</lastmod>`,
    '  </url>',
  ].join('\n')).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

// ─── Exécution ───────────────────────────────────────────────────────────────

const indexPath = join(DIST, 'index.html')
const gabarit = readFileSync(indexPath, 'utf8')

const debut = gabarit.indexOf(DEBUT)
const fin = gabarit.indexOf(FIN)
if (debut === -1 || fin === -1) {
  // Sans les marqueurs, toutes les pages sortiraient avec le titre de l'accueil.
  // Échouer bruyamment vaut mieux qu'un référencement silencieusement cassé.
  throw new Error(`seo-build : marqueurs ${DEBUT} / ${FIN} introuvables dans dist/index.html`)
}
const avant = gabarit.slice(0, debut + DEBUT.length)
const apres = gabarit.slice(fin)

let ecrites = 0
for (const route of ROUTES) {
  const html = `${avant}\n${blocSeo(route)}\n    ${apres}`
  if (route.path === '/') {
    writeFileSync(indexPath, html)
  } else {
    const cible = join(DIST, `${route.path.replace(/^\//, '')}.html`)
    mkdirSync(dirname(cible), { recursive: true })
    writeFileSync(cible, html)
  }
  ecrites++
}

const dateIso = new Date().toISOString().slice(0, 10)
writeFileSync(join(DIST, 'sitemap.xml'), sitemap(dateIso))

console.log(`SEO : ${ecrites} page(s) écrite(s), sitemap.xml daté du ${dateIso}.`)
