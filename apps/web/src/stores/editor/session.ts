import { ref, toRaw } from 'vue'
import { blockOf, tabsModel } from '@/editor/tabs.ts'
import { settings } from '../settings'
import {
  bundled, deleteTemplate as repoDelete, findTemplate, isBundled, newTemplate,
  refreshTemplates, renameTemplate as repoRename, saveTemplate, templateName, withMetaName,
} from '../templates'
import { dirty, editor } from './state'
import { render } from './render'

export async function initEditor() {
  await refreshTemplates()
  // First run opens the bundled spool example (design §3.7).
  const first = bundled.find((t) => t.id === 'Grocery 40x30') ?? bundled[0]
  load(findTemplate(settings.lastTemplateId)?.id ?? first.id)
}

export function load(id: string) {
  const record = findTemplate(id)
  if (!record) return
  editor.templateId = id
  editor.source = record.source
  editor.savedSource = record.source
  editor.assets = record.assets
  editor.savedAt = record.updatedAt || null
  // A different file has different blocks: pick up where this one was left, forget the old
  // carets. A remembered scope/block that no longer exists falls back to the file's template.
  const remembered = settings.tabByTemplate[id]
  editor.activeTab = remembered && blockOf(tabsModel(record.source), remembered) ? { ...remembered } : { scope: null, kind: 'template' }
  editor.caretByTab = {}
  settings.lastTemplateId = id
  // A different label is a different fit: zoom never carries across labels of different size
  // (F21, atlas 35). Here rather than in the canvas, because the template can be switched from
  // the Data view — with the Editor unmounted, there is no canvas to notice.
  settings.zoomCanvas = 'fit'
  settings.zoomPreview = 'fit'
  void render()
}

/**
 * ⌘S. Bundled examples are files in the app bundle, so saving one saves a copy you own —
 * that is what "edit the example" has to mean without a writable bundle.
 */
export async function save() {
  if (!editor.templateId) return
  const record = isBundled(editor.templateId)
    ? await newTemplate(editor.source, templateName(findTemplate(editor.templateId)!), toRaw(editor.assets))
    : await saveTemplate(editor.templateId, editor.source, editor.assets)
  editor.templateId = record.id
  editor.savedSource = record.source
  editor.savedAt = record.updatedAt
  settings.lastTemplateId = record.id
}

export async function saveAs(name: string) {
  const record = await newTemplate(editor.source, name, toRaw(editor.assets))
  load(record.id)
}

// ---------------------------------------------------------------- template commands (COR-01)
// Repository mutations that concern the open buffer reconcile it here, so no view has to
// remember which operation also needs editor bookkeeping.

/** Rename in the repo *and* in the open buffer — a later ⌘S must not resurrect the old name. */
export async function renameTemplate(id: string, name: string) {
  await repoRename(id, name)
  if (id !== editor.templateId) return
  editor.source = withMetaName(editor.source, name)
  editor.savedSource = withMetaName(editor.savedSource, name)
}

/** Delete in the repo; a deleted active template falls back like first boot — a dangling
    `templateId` would let the next ⌘S quietly recreate the record. */
export async function deleteTemplate(id: string) {
  await repoDelete(id)
  if (id !== editor.templateId) return
  const first = bundled.find((t) => t.id === 'Grocery 40x30') ?? bundled[0]
  load(first.id)
}

/** The one dirty-guarded way to switch templates, from any view (design §4). */
export const pendingId = ref<string | null>(null)
export const saveAsName = ref<string | null>(null)

export function requestLoad(id: string) {
  if (id === editor.templateId) return
  if (dirty.value) return (pendingId.value = id)
  load(id)
}

export function confirmDiscard() {
  const id = pendingId.value
  pendingId.value = null
  if (id) load(id)
}

export async function confirmSaveAs() {
  const name = saveAsName.value?.trim()
  if (!name) return
  saveAsName.value = null
  await saveAs(name)
  confirmDiscard()
}
