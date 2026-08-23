import { defineConfig } from 'vitest/config'

// One vitest run for the whole monorepo. Node environment: core is DOM-free by contract, and
// `library/index.ts` reads its .vue files off disk rather than through Vite here — which is
// why no plugin-vue and no `pressed` alias are needed to run the real compiler in a test.
export default defineConfig({
  test: {
    environment: 'node',
    // `packages/renderer` has no `src/**` in TypeScript — its src is the Rust crate.
    include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts'],
  },
})
