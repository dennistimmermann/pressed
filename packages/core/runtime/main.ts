/**
 * The runtime frame: compiles and renders untrusted template code.
 *
 * It is loaded as `<iframe sandbox="allow-scripts" src="/runtime.html">`, so it runs on a
 * null origin — template code cannot reach the app's storage, printer or DOM (spec §4.3).
 * The only interface is postMessage, and everything here is wrapped in try/catch: a broken
 * template must come back as an error row, never as a dead frame.
 */
import { compileTemplate } from '../src/template/loader'
import { render } from '../src/template/render'
import { componentSchemas } from '../src/template/schemas'
import type { Assets } from '../src/template/render'
import type { ComponentSchema, Message, Meta, Row } from '../src/types'
import { DEFAULT_META } from '../src/types'

type RenderRequest = {
  type: 'render'
  id: number
  source: string
  assets?: Assets
  rows?: Row[]
  inspector?: boolean
}

type Result = {
  type: 'result'
  id: number
  meta: Meta
  css: string
  html: string[]
  errors: Message[]
  components: ComponentSchema[]
}

async function handleRender(req: RenderRequest): Promise<Result> {
  const errors: Message[] = []
  let meta = DEFAULT_META
  let css = ''
  const html: string[] = []
  let components: ComponentSchema[] = []

  try {
    const compiled = compileTemplate(req.source, { inspector: req.inspector })
    meta = compiled.meta
    errors.push(...compiled.errors)
    try {
      components = componentSchemas(compiled)
    } catch (e) {
      errors.push({ kind: 'compile', message: `component schemas: ${message(e)}`, file: 'main' })
    }
    const rows = req.rows?.length ? req.rows : [{}]
    for (const [index, row] of rows.entries()) {
      const out = await render(compiled, row, req.assets ?? {})
      css = out.css
      html.push(out.html)
      for (const w of out.warnings) errors.push({ ...w, row: index })
    }
  } catch (e) {
    errors.push({ kind: 'compile', message: message(e), file: 'main' })
  }
  return { type: 'result', id: req.id, meta, css, html, errors, components }
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

// `*` as target origin: the parent is a normal origin, we are `null`; nothing secret travels here.
const reply = (data: unknown) => parent.postMessage(data, '*')

addEventListener('message', async (event: MessageEvent) => {
  const data = event.data as { type?: string; id?: number }
  if (data?.type === 'ping') return reply({ type: 'ready' })
  if (data?.type !== 'render') return
  try {
    reply(await handleRender(data as RenderRequest))
  } catch (e) {
    reply({ type: 'result', id: data.id, meta: DEFAULT_META, css: '', html: [], components: [], errors: [{ kind: 'compile', message: message(e), file: 'main' }] })
  }
})

reply({ type: 'ready' })
