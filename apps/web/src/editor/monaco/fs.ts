import type { FileStat, FileSystem } from '@volar/monaco/worker'
import type { URI } from 'vscode-uri'

/**
 * The language service's `/node_modules` — served from this repo's real one, bundled by
 * Vite, so the editor types work offline (no jsdelivr round-trip like `@vue/repl` does).
 *
 * Lazy on purpose: the glob is not `eager`, so each `.d.ts` is a separate chunk that is
 * only fetched when TypeScript actually asks for it. Volar's `createSys` is built for an
 * async fs — it returns "not there yet" and re-runs when the read resolves.
 */
const raw = import.meta.glob<string>(
  [
    // Paths are relative to this file; `../../../../..` is the repo root.
    '../../../../../node_modules/typescript/lib/lib.*.d.ts',
    '../../../../../node_modules/@vue/language-core/types/*.d.ts',
    '../../../../../node_modules/vue/dist/*.d.*ts',
    // `vue/jsx-runtime` is where the codegen reads `JSX.IntrinsicElements` — the HTML tag list.
    '../../../../../node_modules/vue/jsx-runtime/{index.d.ts,package.json}',
    '../../../../../node_modules/vue/jsx.d.ts',
    '../../../../../node_modules/@vue/{runtime-core,runtime-dom,reactivity,shared}/dist/*.d.ts',
    '../../../../../node_modules/csstype/index.d.ts',
    '../../../../../node_modules/{vue,csstype}/package.json',
    '../../../../../node_modules/@vue/{language-core,runtime-core,runtime-dom,reactivity,shared}/package.json',
  ],
  { query: '?raw', import: 'default' },
)

const files = new Map<string, () => Promise<string>>()
for (const [path, load] of Object.entries(raw)) {
  files.set(path.slice(path.indexOf('/node_modules/')), load)
}

// `sprint` has no package on disk — the module's *contents* are generated per context type
// and registered as a Monaco model; only this stub is needed to make it resolve.
const sprintPkg = JSON.stringify({ name: 'sprint', version: '0.0.0', types: 'index.d.ts' })
files.set('/node_modules/sprint/package.json', () => Promise.resolve(sprintPkg))

const dirs = new Set<string>()
for (const path of files.keys()) {
  for (let at = path.lastIndexOf('/'); at > 0; at = path.lastIndexOf('/', at - 1)) {
    dirs.add(path.slice(0, at))
  }
}

const cache = new Map<string, Promise<string>>()

export function createOfflineFs(): FileSystem {
  return {
    stat(uri: URI): FileStat | undefined {
      if (files.has(uri.path)) return { type: 1 /* File */, ctime: 0, mtime: 0, size: 1 }
      if (dirs.has(uri.path)) return { type: 2 /* Directory */, ctime: 0, mtime: 0, size: 0 }
      return undefined
    },
    readDirectory(uri: URI): [string, 1 | 2][] {
      const prefix = uri.path.replace(/\/$/, '') + '/'
      const entries = new Map<string, 1 | 2>()
      for (const path of files.keys()) {
        if (!path.startsWith(prefix)) continue
        const rest = path.slice(prefix.length)
        const slash = rest.indexOf('/')
        entries.set(slash < 0 ? rest : rest.slice(0, slash), slash < 0 ? 1 : 2)
      }
      return [...entries]
    },
    readFile(uri: URI) {
      const load = files.get(uri.path)
      if (!load) return undefined
      let text = cache.get(uri.path)
      if (!text) cache.set(uri.path, (text = load()))
      return text
    },
  }
}
