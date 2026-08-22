import {
  createTypeScriptWorkerLanguageService,
  type LanguageServiceEnvironment,
} from '@volar/monaco/worker'
import { createVueLanguagePlugin, getDefaultCompilerOptions, VueVirtualCode, type Language } from '@vue/language-core'
import { createVueLanguageServicePlugins, type LanguageService } from '@vue/language-service'
import { postprocessLanguageService } from '@vue/typescript-plugin/lib/common'
import { getComponentDirectives } from '@vue/typescript-plugin/lib/requests/getComponentDirectives'
import { getComponentMeta } from '@vue/typescript-plugin/lib/requests/getComponentMeta'
import { getComponentNames } from '@vue/typescript-plugin/lib/requests/getComponentNames'
import { getComponentProps } from '@vue/typescript-plugin/lib/requests/getComponentProps'
import { getComponentSlots } from '@vue/typescript-plugin/lib/requests/getComponentSlots'
import { getElementAttrs } from '@vue/typescript-plugin/lib/requests/getElementAttrs'
import { getElementNames } from '@vue/typescript-plugin/lib/requests/getElementNames'
import { isRefAtPosition } from '@vue/typescript-plugin/lib/requests/isRefAtPosition'
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
  // Mark unknown props on library components and on snippets (`snippets.ts` registers those in
  // `GlobalComponents`) — the marker is the point of Volar here. Unknown *components* stay
  // unchecked: half-typed tag names would flash an error on every keystroke.
  checkUnknownProps: true,
}

worker.initialize((ctx: monaco.worker.IWorkerContext) => {
  const env: LanguageServiceEnvironment = {
    workspaceFolders: [URI.file('/')],
    fs: createOfflineFs(),
  }

  // The requests below are what the tsserver plugin answers in a real editor; here they run
  // against the worker's own program. Without them the template completion knows only Vue's
  // built-ins (KeepAlive, Transition, …) — with them: HTML tags, our components, their props.
  const getLanguageService = () => (workerService as unknown as { languageService: LanguageService }).languageService
  const getProgram = () => (getLanguageService().context.inject('typescript/languageService') as ts.LanguageService).getProgram()!
  const getTsService = () => getLanguageService().context.inject('typescript/languageService') as ts.LanguageService
  // The requests are typed for string script ids; ours are URIs (same object, different key type).
  const language = () => getLanguageService().context.language as unknown as Language<string>
  const getVirtualCode = (fileName: string) => {
    const sourceScript = getLanguageService().context.language.scripts.get(asUri(fileName))
    const virtualCode = sourceScript?.generated?.root
    if (!sourceScript || !(virtualCode instanceof VueVirtualCode)) throw new Error(`no virtual code for ${fileName}`)
    return { sourceScript, virtualCode }
  }
  // Requests we do not serve (auto-import, extract, highlights…) answer "nothing" — throwing
  // here would take the whole completion list down with them.
  const notImplemented = () => undefined

  const semanticPlugin = createTypeScriptSemanticPlugin(ts)
  const { create } = semanticPlugin
  semanticPlugin.create = (context) => {
    const created = create(context)
    const ls = created.provide['typescript/languageService']() as ts.LanguageService
    // Vue-aware completions/quick-info on top of the raw TS service (3.3's name for the proxy).
    const proxy = postprocessLanguageService(
      ts,
      new Proxy({}, { get: (_t, prop, r) => Reflect.get(context.language, prop, r) }) as unknown as Language<URI>,
      ls,
      vueCompilerOptions,
      asUri,
    )
    ls.getCompletionsAtPosition = proxy.getCompletionsAtPosition
    ls.getCompletionEntryDetails = proxy.getCompletionEntryDetails
    ls.getCodeFixesAtPosition = proxy.getCodeFixesAtPosition
    ls.getDefinitionAndBoundSpan = proxy.getDefinitionAndBoundSpan
    ls.getQuickInfoAtPosition = proxy.getQuickInfoAtPosition
    return created
  }

  const vuePlugins = createVueLanguageServicePlugins(ts, {
    getComponentDirectives: (fileName) => getComponentDirectives(ts, getProgram(), fileName),
    getComponentMeta: (fileName, tag) => {
      const { virtualCode } = getVirtualCode(fileName)
      const program = getProgram()
      const sourceFile = program.getSourceFile(fileName)
      if (!sourceFile) return undefined
      const lang = getLanguageService().context.language
      return getComponentMeta(ts, program, lang as never, (f) => lang.scripts.get(asUri(f)) as never, sourceFile, virtualCode, tag)
    },
    getComponentNames: (fileName) => getComponentNames(ts, getProgram(), getVirtualCode(fileName).virtualCode),
    getComponentProps: (fileName, position) => {
      const { sourceScript, virtualCode } = getVirtualCode(fileName)
      return getComponentProps(ts, getTsService(), getProgram(), language(), sourceScript as never, virtualCode, position)
    },
    getComponentSlots: (fileName) => getComponentSlots(ts, getProgram(), getVirtualCode(fileName).virtualCode),
    getElementAttrs: (fileName, tag) => getElementAttrs(ts, getProgram(), fileName, tag),
    getElementNames: (fileName) => getElementNames(ts, getProgram(), fileName),
    isRefAtPosition: (fileName, position) => {
      const { sourceScript, virtualCode } = getVirtualCode(fileName)
      return isRefAtPosition(ts, language(), getProgram(), sourceScript as never, virtualCode, position)
    },
    getQuickInfoAtPosition: async () => undefined, // hover is off in the editor
    collectExtractProps: notImplemented,
    getImportPathForFile: notImplemented,
    getDocumentHighlights: notImplemented,
    getEncodedSemanticClassifications: notImplemented,
    resolveModuleName: notImplemented,
    getAutoImportSuggestions: notImplemented,
    resolveAutoImportCompletionEntry: notImplemented,
  })
  // The pug variant is dropped: `volar-service-pug` does not bundle (its pug parser is Node-only),
  // so Vite stubs it out and the plugin throws while the service is built, taking every other
  // plugin with it. Templates here are HTML. The rest are editor features we do not surface.
  const skip = new Set(['vue-template (jade)', 'vue-extract-file', 'vue-document-drop', 'vue-document-highlights', 'typescript-semantic-tokens'])

  const workerService = createTypeScriptWorkerLanguageService({
    typescript: ts,
    compilerOptions,
    workerContext: ctx,
    env,
    uriConverter: { asFileName, asUri },
    languagePlugins: [createVueLanguagePlugin(ts, compilerOptions, vueCompilerOptions, asFileName)],
    languageServicePlugins: [semanticPlugin, createTypeScriptDirectiveCommentPlugin(), ...vuePlugins.filter((p) => !skip.has(p.name!))],
  })
  return workerService
})
