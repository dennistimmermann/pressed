import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

// One vitest run for the whole monorepo. Node environment: core is DOM-free by contract.
// plugin-vue + the `sprint` alias are here so the library's .vue files can be imported
// directly — the same two lines apps/web's vite config needs.
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { sprint: fileURLToPath(new URL('./packages/core/src/template/sprint-module.ts', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts'],
  },
})
