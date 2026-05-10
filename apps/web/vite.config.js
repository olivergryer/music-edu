import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { execSync } from 'child_process'

let buildDate = ''
try {
  buildDate = execSync('git log -1 --format=%cI').toString().trim()
} catch {}

export default defineConfig({
  plugins: [tailwindcss(), react()],
  define: {
    __BUILD_DATE__: JSON.stringify(buildDate),
  },
})
