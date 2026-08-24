import { expect, test, vi } from 'vitest'
import { parseMeta } from '@pressed/core/template/meta.ts'

// Only the repository's IO is mocked — the pure helpers (withMetaName, templateName, bundled
// examples, findTemplate) stay real, so these tests exercise the real reconcile logic.
vi.mock('./templates', async (importOriginal) => {
  const real = await importOriginal<typeof import('./templates')>()
  return {
    ...real,
    deleteTemplate: vi.fn(async () => {}),
    renameTemplate: vi.fn(async () => {}),
    newTemplate: vi.fn(async (source: string, _name?: string, assets = {}) => ({ id: 'fresh', source, assets, updatedAt: 1 })),
    refreshTemplates: vi.fn(async () => {}),
    saveTemplate: vi.fn(async (id: string, source: string, assets = {}) => ({ id, source, assets, updatedAt: 1 })),
  }
})

import { deleteTemplate, editor, renameTemplate, save, saveAs } from './editor'
import { bundled, newTemplate, saveTemplate } from './templates'

const assets = { logo: { mime: 'image/png', base64: 'aGk=' } }
const sourceNamed = (name: string) =>
  `<meta>\n{ "name": ${JSON.stringify(name)}, "size": { "width": 50, "height": 30 } }\n</meta>\n<template><b/></template>\n`

test('saving a bundled template as a copy keeps its assets (COR-02)', async () => {
  editor.templateId = bundled[0].id
  editor.source = sourceNamed('Mine')
  editor.assets = { ...assets }
  await save()
  expect(vi.mocked(newTemplate).mock.calls.at(-1)![2]).toEqual(assets)
})

test('Save As keeps the assets (COR-02)', async () => {
  editor.templateId = bundled[0].id
  editor.source = sourceNamed('Mine')
  editor.assets = { ...assets }
  await saveAs('My copy')
  expect(vi.mocked(newTemplate).mock.calls.at(-1)![2]).toEqual(assets)
})

test('renaming the active template renames the open buffer too (COR-01)', async () => {
  editor.templateId = 'mine-1'
  editor.source = sourceNamed('Old') + '<!-- unsaved edit -->'
  editor.savedSource = sourceNamed('Old')
  await renameTemplate('mine-1', 'New')
  expect(parseMeta(editor.source).meta.name).toBe('New')
  expect(parseMeta(editor.savedSource).meta.name).toBe('New')
  expect(editor.source).toContain('unsaved edit') // the rename must not eat unsaved work
  expect(editor.source).not.toBe(editor.savedSource) // still dirty
})

test('renaming another template leaves the buffer alone (COR-01)', async () => {
  editor.templateId = 'mine-1'
  editor.source = sourceNamed('Mine')
  editor.savedSource = editor.source
  await renameTemplate('mine-2', 'Other')
  expect(parseMeta(editor.source).meta.name).toBe('Mine')
})

test('a save after a rename keeps the new name (COR-01)', async () => {
  editor.templateId = 'mine-1'
  editor.source = sourceNamed('Old')
  editor.savedSource = editor.source
  await renameTemplate('mine-1', 'New')
  await save()
  const saved = vi.mocked(saveTemplate).mock.calls.at(-1)![1]
  expect(parseMeta(saved).meta.name).toBe('New')
})

test('deleting the active template falls back instead of dangling (COR-01)', async () => {
  editor.templateId = 'mine-1'
  editor.source = sourceNamed('Mine')
  editor.savedSource = editor.source
  await deleteTemplate('mine-1')
  const fallback = bundled.find((t) => t.id === 'Grocery 40x30') ?? bundled[0]
  expect(editor.templateId).toBe(fallback.id)
  expect(editor.source).toBe(fallback.source) // the next ⌘S cannot recreate the deleted record
})

test('deleting another template leaves the buffer alone (COR-01)', async () => {
  editor.templateId = 'mine-1'
  editor.source = sourceNamed('Mine')
  editor.savedSource = editor.source
  await deleteTemplate('mine-2')
  expect(editor.templateId).toBe('mine-1')
})
