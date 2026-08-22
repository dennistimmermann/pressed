import * as volar from '@volar/monaco'
import type { WorkerLanguageService } from '@volar/monaco/worker'
import { editor, languages, Uri } from 'monaco-editor-core'
import editorWorker from 'monaco-editor-core/esm/vs/editor/editor.worker?worker'
import { vueLanguageConfig, vueTokens } from './grammar'
import VueWorker from './vue.worker?worker'

/**
 * Monaco + Volar wiring, after `@vue/repl`'s `src/monaco/env.ts`. Two differences: the
 * types are bundled instead of fetched from a CDN (see `fs.ts`), so the worker needs no
 * init handshake, and there is one language (`vue`) because there is one file.
 */

let registered = false

function register() {
  if (registered) return
  registered = true
  ;(self as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = {
    getWorker(_id: string, label: string) {
      return label === 'vue' ? new VueWorker() : new editorWorker()
    },
  }
  languages.register({ id: 'vue', extensions: ['.vue'] })
  languages.setLanguageConfiguration('vue', vueLanguageConfig)
  languages.setMonarchTokensProvider('vue', vueTokens)
}

/**
 * Start the Vue language service worker and hook it up to Monaco.
 * `getSyncUris` decides which models the worker sees — the edited file plus the generated
 * environment (`sprint-env.d.ts`, the library `.vue` sources).
 */
export function startLanguageService(getSyncUris: () => Uri[]) {
  register()
  const worker = editor.createWebWorker<WorkerLanguageService>({
    moduleId: 'vs/language/vue/vueWorker',
    label: 'vue',
    createData: {},
  })

  const markers = volar.activateMarkers(worker, ['vue'], 'vue', getSyncUris, editor)
  const autoInsertion = volar.activateAutoInsertion(worker, ['vue'], getSyncUris, editor)
  const providers = volar.registerProviders(worker, ['vue'], getSyncUris, languages)

  return {
    worker,
    async dispose() {
      markers.dispose()
      autoInsertion.dispose()
      ;(await providers).dispose()
      worker.dispose()
    },
  }
}

export function getOrCreateModel(uri: Uri, language: string, value: string) {
  const model = editor.getModel(uri)
  if (model) {
    if (model.getValue() !== value) model.setValue(value)
    return model
  }
  return editor.createModel(value, language, uri)
}
