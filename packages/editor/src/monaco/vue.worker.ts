import {
  createTypeScriptWorkerLanguageService,
  type LanguageServiceEnvironment,
} from '@volar/monaco/worker'
import { createVueLanguagePlugin, getDefaultCompilerOptions } from '@vue/language-core'
import { createVueLanguageServicePlugins } from '@vue/language-service'
import type * as monaco from 'monaco-editor-core'
// @ts-expect-error — no types for the worker entry
import * as worker from 'monaco-editor-core/esm/vs/editor/editor.worker'
import * as ts from 'typescript'
import { create as createTypeScriptDirectiveCommentPlugin } from 'volar-service-typescript/lib/plugins/directiveComment'
import { create as createTypeScriptSemanticPlugin } from 'volar-service-typescript/lib/plugins/semantic'
import { URI } from 'vscode-uri'
import { createOfflineFs } from './fs'

/**
 * The Vue language service, after `@vue/repl`'s `src/monaco/vue.worker.ts`.
 *
 * TypeScript and every `.d.ts` are bundled (`fs.ts`) rather than fetched from jsdelivr, so
 * the editor types work offline and the worker can start synchronously — no `init`
 * message, no CDN version negotiation.
 */

const asFileName = (uri: URI) => uri.path
const asUri = (fileName: string): URI => URI.file(fileName)

const compilerOptions: ts.CompilerOptions = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  // No explicit `lib`: TypeScript then asks the host for the default lib, which resolves to
  // `/node_modules/typescript/lib/lib.esnext.full.d.ts` in the bundled fs (DOM included).
  // Naming libs here would need the file-name form (`lib.esnext.d.ts`), and getting it wrong
  // silently leaves the program without `Math`, `Array`, …
  jsx: ts.JsxEmit.Preserve,
  strict: true,
  allowJs: true,
  skipLibCheck: true,
  noEmit: true,
}

const vueCompilerOptions = {
  // `typesRoot` defaults to a `__dirname`-relative path that does not exist in a browser
  // bundle; the package-relative form resolves through the virtual /node_modules.
  ...getDefaultCompilerOptions(99, 'vue', false, '@vue/language-core/types'),
  // Mark unknown props on library components (design: the marker is the point of Volar
  // here) but not unknown *components* — snippets are registered at runtime, so every
  // `<temp>` in a template would be flagged.
  checkUnknownProps: true,
}

worker.initialize((ctx: monaco.worker.IWorkerContext) => {
  const env: LanguageServiceEnvironment = {
    workspaceFolders: [URI.file('/')],
    fs: createOfflineFs(),
  }

  return createTypeScriptWorkerLanguageService({
    typescript: ts,
    compilerOptions,
    workerContext: ctx,
    env,
    uriConverter: { asFileName, asUri },
    languagePlugins: [createVueLanguagePlugin(ts, compilerOptions, vueCompilerOptions, asFileName)],
    languageServicePlugins: [
      createTypeScriptSemanticPlugin(ts),
      createTypeScriptDirectiveCommentPlugin(),
      // No `Requests` client: those requests are served by the tsserver plugin in a real
      // editor. `createVueLanguageServicePlugins` falls back to no-ops, which costs the
      // HTML-side tag/attribute lists — the type-checked ones come from the virtual code.
      //
      // The pug variant is dropped: `volar-service-pug` does not bundle (its pug parser is
      // Node-only), so Vite stubs it out and the plugin throws while the service is built,
      // taking every other plugin with it. Templates here are HTML.
      ...createVueLanguageServicePlugins(ts).filter((p) => p.name !== 'vue-template (jade)'),
    ],
  })
})
