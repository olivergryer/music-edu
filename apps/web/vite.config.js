import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { execSync } from 'child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

let buildDate = ''
try {
  buildDate = execSync('git log -1 --format=%cI').toString().trim()
} catch {}

let appVersion = ''
try {
  const v = JSON.parse(readFileSync(new URL('./version.json', import.meta.url), 'utf8'))
  appVersion = `${v.major}.${v.minor}.${v.patch}`
} catch {}

// Seule la branche `dev` (Vercel) reçoit le manifest + icône DEV.
const isDevBuild = process.env.VERCEL_GIT_COMMIT_REF === 'dev'

const pwaEnvPlugin = {
  name: 'pwa-env-swap',
  transformIndexHtml(html) {
    if (!isDevBuild) return html
    return html
      .replace('href="/manifest.json"', 'href="/manifest.dev.json"')
      .replace(/href="\/apple-touch-icon[^"]*\.png"/g, 'href="/icon-dev.svg"')
      .replace('<title>Tessitura</title>', '<title>Tessitura DEV</title>')
      .replace(/content="Tessitura"/g, 'content="Tessitura DEV"')
  },
}

// Liste des fichiers produits par le build, écrite dans dist/sw-manifest.json.
// Indispensable depuis le découpage du bundle : les routes sont chargées à la
// demande, donc un module jamais ouvert en ligne n'aurait pas son chunk en
// cache et échouerait en mode avion. Les noms étant hachés à chaque build, la
// liste ne peut être connue qu'ici. Le service worker la lit et précache tout.
const swManifestPlugin = {
  name: 'sw-precache-manifest',
  apply: 'build',
  writeBundle(options, bundle) {
    const fichiers = Object.keys(bundle)
      .filter(f => /\.(js|css|woff2?|svg)$/.test(f))
      .map(f => `/${f}`)
    writeFileSync(
      resolve(options.dir, 'sw-manifest.json'),
      JSON.stringify(fichiers),
    )
  },
}

export default defineConfig({
  plugins: [tailwindcss(), react(), pwaEnvPlugin, swManifestPlugin],
  define: {
    __BUILD_DATE__: JSON.stringify(buildDate),
    __APP_VERSION__: JSON.stringify(appVersion),
  },
})
