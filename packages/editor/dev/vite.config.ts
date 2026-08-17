import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const dir = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(dir, '../../..')

/**
 * Throwaway harness for WP1: the editor panes with the bundled example template, without
 * apps/web. `npm run dev -w @sprint/editor` → http://localhost:5175.
 */
export default defineConfig({
  root: dir,
  plugins: [vue()],
  resolve: {
    // Templates and the built-in library import from 'sprint'; the runtime frame provides
    // the same module at runtime. Same alias apps/web uses.
    alias: { sprint: path.resolve(repo, 'packages/core/src/template/sprint-module.ts') },
  },
  // The runtime frame is sandboxed without `allow-same-origin`, so its document has a null
  // origin and every module script it loads is a cross-origin fetch (copied from apps/web).
  server: { port: 5175, headers: { 'Access-Control-Allow-Origin': '*' }, fs: { allow: [repo] } },
  build: {
    rollupOptions: {
      input: { main: path.resolve(dir, 'index.html'), runtime: path.resolve(dir, 'runtime.html') },
    },
  },
})
