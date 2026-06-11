import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { execSync } from 'child_process'
import { readFileSync } from 'node:fs'

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

export default defineConfig({
  plugins: [tailwindcss(), react(), pwaEnvPlugin],
  define: {
    __BUILD_DATE__: JSON.stringify(buildDate),
    __APP_VERSION__: JSON.stringify(appVersion),
  },
})
