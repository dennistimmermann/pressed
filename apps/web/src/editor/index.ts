// @/editor — a Vue SFC editor with a typed context object, a component palette and a
// props inspector, previewing through a sandboxed runtime frame. Label-agnostic: no mm,
// no printers, no "label" (spec §9c).

export type { EditorHandle } from './editor-handle'
export * from './types'
export { createRuntimeClient, debounce, RenderSuperseded } from './runtime-client'
export type { RuntimeClient } from './runtime-client'

// One tab per block (design README-tabs): the model the strip and the editor both read.
export { tabsModel, tabAt, tabKey, blockOf, insertBlock } from './tabs'
export type { TabsModel, TabRef, TabBlock, SnippetScope, BlockKind, Badge } from './tabs'

// Panes — WP1/WP2 fill these in; the stubs keep host imports resolvable.
export { default as SfcEditor } from './SfcEditor.vue'
export { default as FileStrip } from './FileStrip.vue'
export { default as BlockTabs } from './BlockTabs.vue'
export { default as ScopeRow } from './ScopeRow.vue'
export { default as LabelSetup } from './LabelSetup.vue'
export { default as InspectorPane } from './InspectorPane.vue'
export { default as StatusPane } from './StatusPane.vue'
export { default as PreviewPane } from './PreviewPane.vue'
export { default as ManageTemplates } from './ManageTemplates.vue'
export { default as LayersPane } from './LayersPane.vue'

// Source analysis at the caret: the host needs it to feed the Inspector.
export { elementAt, cursorContext, attributeEdit, insertAt, insertVar } from './ast'
export type { ElementInfo, PropInfo, CursorContext, Edit, Loc } from './ast'
// Codeless structure editing: each primitive is pure `(source, element) → edits + where it landed`.
export {
  parentOf, siblingsOf, elementTree, countMatching, matchingElements, moveElement, indentElement, outdentElement,
  wrapElement, unwrapElement, duplicateElement, deleteElement, setText, reparentElement,
} from './ast'
export type { LayerNode, StructureEdit } from './ast'
export { isHtmlTag } from './inspector/insert'
export { ruleAt, parseRule, setDeclaration, setDeclarations, parseLength, rulesIn, findRule } from './css'
export type { Rule, Declaration, StyleTarget } from './css'
