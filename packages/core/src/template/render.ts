import * as vue from 'vue'
import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import QRCode from 'qrcode'
import * as sprintModule from './pressed-module'
import type { CompiledTemplate } from './loader'
import type { Message, Row } from '../types'

export type Asset = { mime: string; base64: string }
export type Assets = Record<string, Asset>

export type EvaluatedTemplate = {
  main: vue.Component
  components: Record<string, vue.Component>
  libraryNames: string[]
}

/**
 * Evaluate the compiled module text. `new Function` is the whole sandbox story here on
 * purpose: the *real* isolation is the null-origin runtime frame (spec §4.3); this only
 * turns module text into objects.
 */
export function evaluate(compiled: CompiledTemplate): EvaluatedTemplate {
  const modules = { vue, pressed: { ...sprintModule }, qrcode: QRCode }
  return new Function('__modules__', compiled.code)(modules) as EvaluatedTemplate
}

/** Render one row to an HTML fragment plus the template CSS, with `asset:` URLs resolved. */
export async function render(
  compiled: CompiledTemplate,
  row: Row,
  assets: Assets = {},
): Promise<{ html: string; css: string; warnings: Message[] }> {
  const warnings: Message[] = []
  let html = ''
  try {
    const { main, components } = evaluate(compiled)
    const app = createSSRApp(main)
    // `row` twice on purpose: as a template global (no import needed in the markup) and
    // as an injection so `import { useRow } from 'pressed'` works in <script setup>.
    app.config.globalProperties.row = row
    app.provide('row', row)
    app.config.warnHandler = () => {}
    for (const [name, component] of Object.entries(components)) app.component(name, component)
    html = await renderToString(app)
  } catch (e) {
    warnings.push({ kind: 'render', message: e instanceof Error ? e.message : String(e), file: 'main' })
  }
  return {
    html: rewriteAssets(html, assets, warnings),
    css: rewriteAssets(compiled.css, assets, warnings),
    warnings,
  }
}

const ASSET_RE = /asset:([\w.\-/]+)/g

/** `asset:logo.svg` → `data:image/svg+xml;base64,…`; data URLs are the only thing the raster path keeps. */
export function rewriteAssets(text: string, assets: Assets, warnings: Message[]): string {
  return text.replace(ASSET_RE, (whole, name: string) => {
    const asset = assets[name]
    if (!asset) {
      warnings.push({ kind: 'render', message: `unknown asset ${JSON.stringify(name)}`, file: 'main' })
      return whole
    }
    return `data:${asset.mime};base64,${asset.base64}`
  })
}
