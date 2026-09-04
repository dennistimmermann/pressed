import { reactive, toRaw } from 'vue'
import { parseMeta } from '@pressed/core/template/meta.ts'
import type { Assets } from '@pressed/core'
import { tx } from './db'

export type TemplateRecord = { id: string; source: string; assets: Assets; updatedAt: number }

/**
 * Templates live in IndexedDB, not localStorage: a bundled font blows the ~5 MB quota
 * immediately (design §6). The database itself is opened in `db.ts` — one opener for all stores.
 */
export const templateStore = {
  list: () => tx<TemplateRecord[]>('templates', 'readonly', (s) => s.getAll()),
  get: (id: string) => tx<TemplateRecord | undefined>('templates', 'readonly', (s) => s.get(id)),
  async put(record: Omit<TemplateRecord, 'updatedAt'>) {
    // IndexedDB structured-clones the value: Vue proxies (assets from the reactive store) must be unwrapped first.
    const full = { ...record, assets: toRaw(record.assets), updatedAt: Date.now() }
    await tx('templates', 'readwrite', (s) => s.put(full))
    return full
  },
  delete: (id: string) => tx('templates', 'readwrite', (s) => s.delete(id)),
}

/** Bundled examples: real .vue files in src/templates, read as text so they are just sources. */
const bundledSources = import.meta.glob('../templates/*.vue', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

export const bundled: TemplateRecord[] = Object.entries(bundledSources).map(([path, source]) => ({
  id: path.replace(/^.*\/|\.vue$/g, ''),
  source,
  assets: {},
  updatedAt: 0,
}))

export const templates = reactive({ mine: [] as TemplateRecord[], bundled })

export async function refreshTemplates() {
  templates.mine = await templateStore.list()
}

/** Bundled templates are read-only: editing one saves a copy under a new id. */
export const isBundled = (id: string) => bundled.some((t) => t.id === id)
export const findTemplate = (id: string | null) =>
  [...templates.mine, ...bundled].find((t) => t.id === id)

export const templateName = (t: TemplateRecord) => parseMeta(t.source).meta.name || t.id

/** `<meta>` is the source of truth for the name (spec §4.1), so renaming rewrites the file. */
export function withMetaName(source: string, name: string): string {
  const block = /<meta\b[^>]*>([\s\S]*?)<\/meta\s*>/i.exec(source)
  const json = JSON.stringify(name)
  if (block && /"name"\s*:\s*"(?:[^"\\]|\\.)*"/.test(block[1]))
    return source.slice(0, block.index) +
      block[0].replace(/"name"\s*:\s*"(?:[^"\\]|\\.)*"/, `"name": ${json}`) +
      source.slice(block.index + block[0].length)
  const meta = parseMeta(source).meta
  const fresh = `<meta>\n${JSON.stringify({ ...meta, name }, null, 2)}\n</meta>\n\n`
  return block ? source.slice(0, block.index) + fresh.trim() + source.slice(block.index + block[0].length) : fresh + source
}

const NEW_TEMPLATE = `<meta>
{ "name": "New template", "size": { "width": 50, "height": 30 }, "gap": 2 }
</meta>

<template>
  <div class="title">{{ row.name }}</div>
</template>

<style>
.label { font-family: system-ui, sans-serif; padding: 2.5mm; color: #000 }
.title { font-size: 12pt; font-weight: 700 }
</style>
`

/** Every write goes through here so the in-memory list never drifts from IndexedDB. */
async function save(record: Omit<TemplateRecord, 'updatedAt'>) {
  const full = await templateStore.put(record)
  await refreshTemplates()
  return full
}

export const saveTemplate = (id: string, source: string, assets: Assets = {}) => save({ id, source, assets })

export function newTemplate(source = NEW_TEMPLATE, name?: string, assets: Assets = {}) {
  return save({ id: crypto.randomUUID(), source: name ? withMetaName(source, name) : source, assets })
}

export async function duplicateTemplate(id: string) {
  const t = findTemplate(id)
  if (!t) return
  return newTemplate(t.source, `${templateName(t)} copy`, t.assets)
}

export async function renameTemplate(id: string, name: string) {
  const t = findTemplate(id)
  if (!t || isBundled(id)) return
  return save({ id, source: withMetaName(t.source, name), assets: t.assets })
}

export async function deleteTemplate(id: string) {
  await templateStore.delete(id)
  await refreshTemplates()
}

/** Hand the user a file. The only way out of the browser without a backend. */
export function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
  Object.assign(document.createElement('a'), { href: url, download: filename }).click()
  URL.revokeObjectURL(url)
}

/** Export is a plain `.vue` file. ponytail: `.zip` (with assets) when a template has any. */
export function exportTemplate(id: string) {
  const t = findTemplate(id)
  if (t) download(`${templateName(t)}.vue`, t.source)
}

/** ponytail: `.vue` only. `.zip` (template + assets) when assets exist in the UI. */
export async function importTemplates(files: File[]) {
  for (const file of files.filter((f) => f.name.endsWith('.vue'))) {
    const source = await file.text()
    await newTemplate(source, parseMeta(source).meta.name || file.name.replace(/\.vue$/, ''))
  }
}
