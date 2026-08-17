import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

const dir = path.dirname(fileURLToPath(import.meta.url))

// Dev harness for the inspector panes (WP2). Not shipped: it fakes the Monaco side with a
// textarea so the panes can be exercised without WP1.
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  root: dir,
  resolve: {
    alias: { sprint: path.resolve(dir, '../../core/src/template/sprint-module.ts') },
  },
  server: { port: 5176 },
})
