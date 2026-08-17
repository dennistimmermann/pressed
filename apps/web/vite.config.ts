import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

const dir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(dir, './src'),
      // Templates and the built-in library import from 'sprint'; the runtime frame provides
      // the same module at runtime. One file, both worlds.
      sprint: path.resolve(dir, '../../packages/core/src/template/sprint-module.ts'),
    },
  },
  // The runtime frame is `sandbox="allow-scripts"` without `allow-same-origin`, so its
  // document has an opaque (null) origin — every module script it loads is then a
  // cross-origin fetch and needs CORS. Static hosts must send the same header for
  // /runtime.html and its assets, or the frame stays blank.
  server: { headers: { 'Access-Control-Allow-Origin': '*' } },
  preview: { headers: { 'Access-Control-Allow-Origin': '*' } },
  build: {
    // Multi-page: the runtime frame is its own document so it can be sandboxed (null origin).
    rollupOptions: { input: { main: path.resolve(dir, 'index.html'), runtime: path.resolve(dir, 'runtime.html') } },
  },
})
