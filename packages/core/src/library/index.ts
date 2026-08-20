/**
 * The built-in components as source text (spec §4.1): the runtime frame compiles them with the
 * very same loader that compiles user snippets, so a snippet and a library component are the
 * same thing. Source text is the *only* form — nothing imports the compiled SFCs, and a static
 * `.vue` import would make this module unloadable outside a bundler.
 *
 * Two ways to read the same four files. Vite replaces the `import.meta.glob` call at build time;
 * plain Node (the render test, the planned spoolserver) has no such thing and reads them off
 * disk instead — which kills the esbuild shim both render spikes had to carry. `node:fs` is
 * reached through `process.getBuiltinModule` and the directory through `import.meta.dirname`
 * because both are plain `undefined` in a bundle: a top-level `import 'node:fs'` would follow
 * this module into the browser, and `new URL('.', import.meta.url)` makes Rolldown inline the
 * whole module as a `data:` URL. Node picks its branch at run time, so `npm test` exercises it.
 */
type NodeFs = { readdirSync(dir: string): string[]; readFileSync(file: string, encoding: 'utf8'): string }
const fs = (globalThis as { process?: { getBuiltinModule?(id: string): NodeFs } }).process?.getBuiltinModule?.('node:fs')

const here = (import.meta as { dirname?: string }).dirname
const raw: Record<string, string> = fs && here
  ? Object.fromEntries(
      fs.readdirSync(here).filter((f) => f.endsWith('.vue')).map((f) => [f, fs.readFileSync(`${here}/${f}`, 'utf8')]),
    )
  : import.meta.glob('./*.vue', { query: '?raw', import: 'default', eager: true })

export const librarySources: Record<string, string> = Object.fromEntries(
  Object.entries(raw).map(([path, source]) => [path.replace(/^\.\/|\.vue$/g, ''), source]),
)

export const LIBRARY_NAMES = Object.keys(librarySources)
