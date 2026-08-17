// @sprint/editor — a Vue SFC editor with a typed context object, a component palette and a
// props inspector, previewing through a sandboxed runtime frame. Label-agnostic: no mm,
// no printers, no "label" (spec §9c).

export type { EditorHandle } from './editor-handle'
export * from './types'
export { createRuntimeClient, debounce, RenderSuperseded } from './runtime-client'
export type { RuntimeClient } from './runtime-client'

// The editor's `<meta>`/`<snippet>` fold regions — the ids a host persists (design §3.3).
export { foldRegions } from './monaco/folding'
export type { FoldRegion } from './monaco/folding'

// Panes — WP1/WP2 fill these in; the stubs keep host imports resolvable.
export { default as SfcEditor } from './SfcEditor.vue'
export { default as FileStrip } from './FileStrip.vue'
export { default as StatusPane } from './StatusPane.vue'
export { default as PreviewPane } from './PreviewPane.vue'
export { default as ComponentsPane } from './ComponentsPane.vue'
export { default as VariablesPane } from './VariablesPane.vue'
export { default as PropertyEditor } from './PropertyEditor.vue'
export { default as ManageTemplates } from './ManageTemplates.vue'

// Source analysis at the caret (WP2): the host needs it to feed PropertyEditor.
export { elementAt, cursorContext, attributeEdit, insertAt, insertVar } from './ast'
export type { ElementInfo, PropInfo, CursorContext, Edit, Loc } from './ast'
